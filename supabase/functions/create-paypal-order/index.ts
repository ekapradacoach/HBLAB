// supabase/functions/create-paypal-order/index.ts
//
// Etapa X.29 — Edge Function: crear una order de PayPal con el server-side
// secret (PAYPAL_CLIENT_SECRET) y devolver el order_id al frontend.
//
// El frontend (`checkout.html` rama USD) la llama desde el callback `createOrder`
// del PayPal Buttons SDK. El secret NUNCA llega al cliente — la Edge Function
// hace OAuth contra /v1/oauth2/token y luego POST /v2/checkout/orders con el
// access token.
//
// Tras la aprobación del comprador (popup PayPal), `onApprove` del SDK captura
// la order con `actions.order.capture()` (no requiere secret — usa la sesión
// del comprador). El webhook PAYMENT.CAPTURE.COMPLETED dispara process-payment
// (Etapa X.28) que registra el acceso en user_courses + manda emails.
//
// Despliegue manual: Supabase Dashboard → Edge Functions → New function →
// `create-paypal-order` → Via Editor → pegar este archivo → Deploy.
// Secrets requeridos: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV (opcional).
// `verify_jwt = false` — la página de checkout es pública.

// @ts-ignore — Deno std
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore — supabase-js para Deno
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Helpers ───────────────────────────────────────────────
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin':  '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
const errOut = (msg: string, status = 400) => json({ error: msg }, status);

// ── PayPal env / API base ─────────────────────────────────
const _paypalEnv: 'sandbox' | 'live' = (Deno.env.get('PAYPAL_ENV') === 'sandbox') ? 'sandbox' : 'live';
const PAYPAL_API_BASE = _paypalEnv === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

// ── OAuth helper (espejo del de process-payment) ──────────
async function getPayPalAccessToken(): Promise<{ token: string | null; error?: string }> {
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const secret   = Deno.env.get('PAYPAL_CLIENT_SECRET');
  if (!clientId || !secret) {
    return { token: null, error: 'PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET no configurados en env' };
  }
  const basic = btoa(`${clientId}:${secret}`);
  try {
    const r = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type':  'application/x-www-form-urlencoded',
        'Accept':        'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    if (!r.ok) {
      const txt = await r.text();
      return { token: null, error: `OAuth HTTP ${r.status}: ${txt}` };
    }
    const data = await r.json();
    return { token: data?.access_token || null, error: data?.access_token ? undefined : 'sin access_token en response' };
  } catch (e: any) {
    return { token: null, error: 'OAuth excepción: ' + (e?.message || String(e)) };
  }
}

// ── Handler ───────────────────────────────────────────────
interface CreateOrderRequest {
  course_id?:       string;
  amount?:          number | string;
  nombre?:          string;
  apellido?:        string;
  email?:           string;
  coupon_code?:     string | null;
  turnstile_token?: string;        // Cloudflare Turnstile (Etapa X.32)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST')    return errOut('Método no permitido. Usar POST.', 405);

  // ── 1) Parsear body ───────────────────────────────────
  let body: CreateOrderRequest;
  try {
    body = await req.json();
  } catch {
    return errOut('Body inválido: se esperaba JSON.');
  }

  const courseId   = (body.course_id || '').trim();
  const amount     = Number(body.amount || 0);
  const nombre     = (body.nombre   || '').trim();
  const apellido   = (body.apellido || '').trim();
  const email      = (body.email    || '').trim().toLowerCase();
  const couponCode = body.coupon_code || null;

  // ── 2) Validaciones ───────────────────────────────────
  if (!courseId)         return errOut('course_id es obligatorio.');
  if (!email)            return errOut('email es obligatorio.');
  if (!(amount > 0))     return errOut('amount debe ser un número mayor a 0.');
  if (amount > 999999)   return errOut('amount fuera de rango.');

  // ── 2.1) Verificar Cloudflare Turnstile (Etapa X.32) ──
  // Defensa anti-bot. Espejo de la verificación en create-preference.
  const turnstileToken = (body.turnstile_token || '').trim();
  if (!turnstileToken) return errOut('Verificación de seguridad requerida.', 400);
  try {
    const tsRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(Deno.env.get('TURNSTILE_SECRET_KEY') || '')}&response=${encodeURIComponent(turnstileToken)}`,
    });
    const tsData = await tsRes.json();
    if (!tsData?.success) {
      console.warn('create-paypal-order: turnstile failed', tsData);
      return errOut('Verificación de seguridad fallida.', 400);
    }
  } catch (e: any) {
    console.error('create-paypal-order: turnstile exception', e);
    return errOut('Error verificando captcha: ' + (e?.message || String(e)), 502);
  }

  // ── 2.5) Validar precio server-side contra `courses.price_usd` ──
  // No confiamos en el `amount` del cliente. Reconstruimos el precio desde
  // la BD (con service role para bypassear RLS) y validamos que coincida.
  // Si hay coupon_code, calculamos el descuento server-side igual que en
  // create-preference (paridad de lógica entre los dos endpoints).
  const SUPABASE_URL          = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.error('create-paypal-order: faltan SUPABASE_URL/SERVICE_ROLE');
    return errOut('Configuración del servidor incompleta (Supabase).', 500);
  }
  const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: course, error: courseErr } = await sbAdmin
    .from('courses')
    .select('id, price_usd, is_active')
    .eq('id', courseId)
    .eq('is_active', true)
    .maybeSingle();
  if (courseErr) {
    console.error('create-paypal-order: course lookup error:', courseErr);
    return errOut('Error consultando el curso: ' + courseErr.message, 500);
  }
  if (!course) return errOut('Curso no encontrado o inactivo.', 404);

  const basePriceUsd = Number(course.price_usd || 0);
  if (!(basePriceUsd > 0)) {
    console.error('create-paypal-order: course sin price_usd válido', course);
    return errOut('Curso sin precio USD configurado.', 500);
  }

  let expectedPrice = basePriceUsd;
  if (couponCode) {
    const code = String(couponCode).trim().toUpperCase();
    const { data: coupon, error: cpErr } = await sbAdmin
      .from('coupons')
      .select('id, code, discount_pct, discount_fixed, valid_until, max_uses, uses_count, course_id, is_active')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (cpErr) {
      console.error('create-paypal-order: coupon lookup error:', cpErr);
      return errOut('Error consultando el cupón.', 500);
    }
    if (!coupon) return errOut('Cupón inválido o inactivo.', 400);
    if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      return errOut('Cupón vencido.', 400);
    }
    if (coupon.max_uses && coupon.max_uses > 0 && (coupon.uses_count || 0) >= coupon.max_uses) {
      return errOut('Cupón agotado.', 400);
    }
    if (coupon.course_id && coupon.course_id !== course.id) {
      return errOut('El cupón no aplica a este curso.', 400);
    }
    if (coupon.discount_pct && Number(coupon.discount_pct) > 0) {
      expectedPrice = basePriceUsd * (1 - Number(coupon.discount_pct) / 100);
    } else if (coupon.discount_fixed && Number(coupon.discount_fixed) > 0) {
      // discount_fixed está expresado en ARS — no aplica a pagos USD.
      return errOut('Este cupón solo aplica a pagos en ARS.', 400);
    }
    expectedPrice = Math.max(0, Math.round(expectedPrice * 100) / 100);
  }

  if (Math.abs(amount - expectedPrice) > 0.01) {
    console.error('create-paypal-order: amount mismatch', { amount, expectedPrice, basePriceUsd, couponCode });
    return errOut('Monto inválido.', 400);
  }

  // ── 3) Obtener access token de PayPal ─────────────────
  const { token, error: tokErr } = await getPayPalAccessToken();
  if (!token) {
    console.error('create-paypal-order: OAuth falló —', tokErr);
    return errOut('No se pudo autenticar contra PayPal: ' + (tokErr || 'unknown'), 502);
  }

  // ── 4) Construir el body de la order ──────────────────
  // PayPal exige `value` como string con 2 decimales para USD.
  const amountStr = expectedPrice.toFixed(2);

  // El nombre del comprador es opcional. PayPal lo usa para pre-poblar el
  // formulario del popup; igual el alumno puede cambiarlo. El email también
  // es opcional pero útil para que process-payment lo recupere desde el
  // webhook (en payer.email_address). Si el alumno usa otra cuenta PayPal,
  // PayPal devolverá el email de esa cuenta — nosotros leemos lo que venga.
  const orderBody: any = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value:         amountStr,
        },
        custom_id: courseId,              // UUID del curso → process-payment lo lee
        description: 'Acceso al curso en HB Lab',
      },
    ],
    application_context: {
      brand_name:       'HB Lab',
      user_action:      'PAY_NOW',
      shipping_preference: 'NO_SHIPPING',
    },
  };

  if (nombre || apellido) {
    orderBody.payer = orderBody.payer || {};
    orderBody.payer.name = {};
    if (nombre)   orderBody.payer.name.given_name = nombre;
    if (apellido) orderBody.payer.name.surname    = apellido;
  }
  if (email) {
    orderBody.payer = orderBody.payer || {};
    orderBody.payer.email_address = email;
  }

  // ── 5) POST /v2/checkout/orders ───────────────────────
  try {
    const r = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify(orderBody),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error('create-paypal-order: PayPal API falló —', r.status, txt);
      return errOut(`PayPal /v2/checkout/orders → HTTP ${r.status}: ${txt}`, 502);
    }
    const data = await r.json();
    const orderId = data?.id;
    if (!orderId) {
      console.error('create-paypal-order: PayPal response sin id —', data);
      return errOut('PayPal no devolvió order_id.', 502);
    }
    return json({ ok: true, order_id: orderId, status: data?.status || 'CREATED' });
  } catch (e: any) {
    console.error('create-paypal-order: excepción —', e);
    return errOut('No se pudo crear la order: ' + (e?.message || String(e)), 500);
  }
});
