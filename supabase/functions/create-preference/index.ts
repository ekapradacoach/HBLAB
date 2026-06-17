// supabase/functions/create-preference/index.ts
//
// Etapa X.13 — Edge Function: crea una "preference" en Mercado Pago y devuelve
// el `init_point` (URL del checkout hosteado de MP) al cliente. Acepta
// { slug, email, nombre, apellido, amount, coupon_code } desde checkout.html.
//
// Despliegue manual via Dashboard:
//   Supabase → Edge Functions → New function → "Via Editor" → pegar este archivo.
//   Settings de la function: verify_jwt = false (es público — la auth la hace
//   el alumno indirecto: solo puede crear preferencias para cursos activos en BD).
//
// Secrets requeridos:
//   - MP_ACCESS_TOKEN  → Access Token de PRODUCCIÓN del partner de MP.
//   - SUPABASE_URL                (auto-inyectado)
//   - SUPABASE_SERVICE_ROLE_KEY   (auto-inyectado)

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

// Etapa X.92 — precio ARS vigente según courses.scheduled_prices (espejo del
// helper getEffectivePrice del front). Si no hay scheduled_prices vigente →
// devuelve price_ars base. Tolerante con string JSON.
function getEffectivePriceArs(course: any): number {
  const base = Number(course?.price_ars || 0);
  let arr = course?.scheduled_prices;
  if (typeof arr === 'string') {
    try { arr = JSON.parse(arr); } catch { arr = []; }
  }
  if (!Array.isArray(arr) || !arr.length) return base;
  const now   = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const vigentes = arr
    .filter((r: any) => r && r.date && r.date <= today)
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
  if (!vigentes.length) return base;
  const w = vigentes[0];
  return Number(w.price_ars != null ? w.price_ars : base) || base;
}

// ── Tipos del body ────────────────────────────────────────
interface CreatePrefBody {
  slug?:            string;
  email?:           string;
  nombre?:          string;
  apellido?:        string;
  amount?:          number;        // precio FINAL en ARS (post-cupón)
  coupon_code?:     string | null;
  turnstile_token?: string;        // Cloudflare Turnstile (Etapa X.32)
}

// ─────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST')    return errOut('Método no permitido. Usar POST.', 405);

  // ── 1) Parse body ────────────────────────────────────────
  let body: CreatePrefBody;
  try {
    body = await req.json();
  } catch {
    return errOut('Body inválido: se esperaba JSON.');
  }

  const slug       = (body.slug     || '').trim();
  const email      = (body.email    || '').trim().toLowerCase();
  const nombre     = (body.nombre   || '').trim();
  const apellido   = (body.apellido || '').trim();
  const amount     = Number(body.amount || 0);
  const couponCode = body.coupon_code || null;

  if (!slug)              return errOut('slug es obligatorio.');
  if (!email)             return errOut('email es obligatorio.');
  if (!nombre || !apellido) return errOut('nombre y apellido son obligatorios.');
  if (amount <= 0)        return errOut('amount debe ser mayor a 0.');

  // ── 1.5) Verificar Cloudflare Turnstile (Etapa X.32) ─────
  // Defensa anti-bot/anti-spam. El token es single-use y lo genera el widget
  // en el cliente. Lo validamos contra la API de Cloudflare con TURNSTILE_SECRET_KEY.
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
      console.warn('create-preference: turnstile failed', tsData);
      return errOut('Verificación de seguridad fallida.', 400);
    }
  } catch (e: any) {
    console.error('create-preference: turnstile exception', e);
    return errOut('Error verificando captcha: ' + (e?.message || String(e)), 502);
  }

  // ── 2) Resolver secrets ──────────────────────────────────
  const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
  const SERVICE_ROLE    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const SUPABASE_URL    = Deno.env.get('SUPABASE_URL');
  if (!MP_ACCESS_TOKEN) {
    console.error('create-preference: falta MP_ACCESS_TOKEN en env');
    return errOut('Configuración del servidor incompleta (MP_ACCESS_TOKEN).', 500);
  }
  if (!SERVICE_ROLE || !SUPABASE_URL) {
    console.error('create-preference: faltan SUPABASE_URL/SERVICE_ROLE');
    return errOut('Configuración del servidor incompleta (Supabase).', 500);
  }

  // ── 3) Verificar que el curso existe y está activo ───────
  // Lo hacemos del lado del server con service role para bypassear RLS
  // y tener una fuente de verdad fiable para el title (no confiamos en lo
  // que mande el front, que podría haber sido manipulado).
  const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: course, error: courseErr } = await sbAdmin
    .from('courses')
    .select('id, slug, title, price_ars, scheduled_prices, is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (courseErr) {
    console.error('create-preference: course lookup error:', courseErr);
    return errOut('Error consultando el curso: ' + courseErr.message, 500);
  }
  if (!course) return errOut('Curso no encontrado o inactivo.', 404);

  // ── 3.5) Calcular precio final server-side y validar contra `amount` ──
  // No confiamos en el `amount` que mande el cliente — un atacante podría
  // editar el body antes del fetch y comprar a $1. Reconstruimos el precio
  // desde la fuente de verdad (BD) y exigimos que coincida (tolerancia ±1 ARS
  // para redondeos del front).
  // Etapa X.92 — el precio base debe ser el VIGENTE (scheduled_prices), no el
  // price_ars crudo, para que coincida con lo que checkout.html le muestra y
  // cobra al alumno. Sin esto, un scheduled_price activo haría fallar la
  // validación de monto ('Monto inválido') o permitiría pagar el precio viejo.
  const basePrice = getEffectivePriceArs(course);
  if (!(basePrice > 0)) {
    console.error('create-preference: course sin price_ars válido', course);
    return errOut('Curso sin precio configurado.', 500);
  }

  let expectedPrice = basePrice;
  if (couponCode) {
    const code = String(couponCode).trim().toUpperCase();
    const { data: coupon, error: cpErr } = await sbAdmin
      .from('coupons')
      .select('id, code, discount_pct, discount_fixed, valid_until, max_uses, uses_count, course_id, is_active')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();
    if (cpErr) {
      console.error('create-preference: coupon lookup error:', cpErr);
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
      expectedPrice = basePrice * (1 - Number(coupon.discount_pct) / 100);
    } else if (coupon.discount_fixed && Number(coupon.discount_fixed) > 0) {
      // discount_fixed sólo aplica a ARS (este endpoint es ARS — OK).
      expectedPrice = Math.max(0, basePrice - Number(coupon.discount_fixed));
    }
    expectedPrice = Math.max(0, Math.round(expectedPrice * 100) / 100);
  }

  if (Math.abs(amount - expectedPrice) > 1) {
    console.error('create-preference: amount mismatch', { amount, expectedPrice, basePrice, couponCode });
    return errOut('Monto inválido.', 400);
  }

  // ── 4) Construir el payload de la preference ────────────
  // external_reference llega como string en el webhook; codificamos los
  // datos del comprador para que process-payment los pueda recuperar
  // y crear el invite + UPSERT en user_courses.
  // Etapa X.75 — agregamos `amount` y `currency` para que checkout-success.html
  // pueda disparar el fbq('track', 'Purchase', { value, currency }) leyéndolos
  // del query param que MP devuelve en el back_url (sessionStorage no sobrevive
  // si el redirect cruza de origin).
  const externalRef = JSON.stringify({
    slug, email, nombre, apellido,
    coupon_code: couponCode,
    course_id:   course.id,
    amount:      expectedPrice,
    currency:    'ARS',
  });

  const prefPayload = {
    items: [{
      title:       course.title,
      quantity:    1,
      unit_price:  expectedPrice,
      currency_id: 'ARS',
    }],
    payer: {
      email,
      name:    nombre,
      surname: apellido,
    },
    // Etapa X.75 — back_urls al dominio de producción REAL (hblabarg.com).
    // Antes apuntaban a ekapradacoach.github.io (legacy) → MP redirigía cross-
    // origin, sessionStorage del checkout no estaba disponible y el evento
    // fbq('track', 'Purchase') nunca disparaba.
    back_urls: {
      success: 'https://hblabarg.com/checkout-success.html',
      failure: 'https://hblabarg.com/checkout.html',
      pending: 'https://hblabarg.com/checkout-pending.html',
    },
    auto_return: 'approved',
    notification_url: 'https://bqkajhxfdybmuilvzchm.supabase.co/functions/v1/process-payment',
    external_reference: externalRef,
  };

  // ── 5) Llamar a la API de Mercado Pago ──────────────────
  let prefRes: Response;
  try {
    prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(prefPayload),
    });
  } catch (e) {
    console.error('create-preference: fetch a MP falló:', e);
    return errOut('No se pudo contactar a Mercado Pago.', 502);
  }

  if (!prefRes.ok) {
    const errText = await prefRes.text();
    console.error('create-preference: MP respondió', prefRes.status, errText);
    return errOut(`Mercado Pago retornó ${prefRes.status}: ${errText}`, 502);
  }

  let prefData: any;
  try {
    prefData = await prefRes.json();
  } catch {
    return errOut('Respuesta de MP inválida.', 502);
  }

  if (!prefData?.init_point) {
    console.error('create-preference: MP devolvió response sin init_point:', prefData);
    return errOut('Respuesta de MP sin init_point.', 502);
  }

  // ── 6) Retornar al cliente lo que necesita para redirigir ──
  return json({
    ok:                 true,
    init_point:         prefData.init_point,
    sandbox_init_point: prefData.sandbox_init_point || null,
    preference_id:      prefData.id || null,
  });
});
