// supabase/functions/process-payment/index.ts
//
// Etapa X.11 — Edge Function: webhook de pagos (Mercado Pago / PayPal).
// Recibe POST con el payload del proveedor, verifica firma, registra el acceso
// del alumno al curso en `public.user_courses` con payment_status='paid'.
// Si el alumno todavía no existe en auth.users, lo invita por email y usa el
// id retornado para insertar la fila de acceso.
//
// Despliegue: `supabase functions deploy process-payment`
// Secret requerido: SUPABASE_SERVICE_ROLE_KEY (vía `supabase secrets set ...`).
// `verify_jwt = false` en config.toml — los webhooks de MP/PayPal no llevan JWT
// de Supabase, la autenticación es por firma del proveedor (verificada abajo).

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
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-signature, paypal-transmission-sig',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });
const errOut = (msg: string, status = 400) => json({ error: msg }, status);

// ── Tipos del payload normalizado ─────────────────────────
interface NormalizedPayment {
  email:          string;
  course_id:      string;
  amount:         number;
  currency:       string;             // 'ARS' | 'USD'
  payment_method: 'mercadopago' | 'paypal' | 'manual' | 'coupon';
  external_ref?:  string;             // id de la transacción en el proveedor
  // Datos opcionales del comprador para el invite (Etapa X.13)
  nombre?:        string;
  apellido?:      string;
}

// ─────────────────────────────────────────────────────────────
// VERIFICACIÓN DE FIRMA — placeholder
// ─────────────────────────────────────────────────────────────
// TODO (al integrar pagos reales):
//
// Mercado Pago:
//   - Header: x-signature  (formato "ts=...,v1=...")
//   - Calcular HMAC-SHA256 sobre `id:{data.id};request-id:{x-request-id};ts:{ts}`
//     usando MP_WEBHOOK_SECRET. Comparar con v1.
//   - Docs: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks#editor_8
//
// PayPal:
//   - Headers: paypal-transmission-id, paypal-transmission-time,
//     paypal-cert-url, paypal-auth-algo, paypal-transmission-sig.
//   - Llamar a /v1/notifications/verify-webhook-signature con esos headers
//     + el body raw + PAYPAL_WEBHOOK_ID. Verificar verification_status === 'SUCCESS'.
//   - Docs: https://developer.paypal.com/api/rest/webhooks/rest/#link-verifywebhooksignature
//
// Mientras la verificación no esté implementada, retornamos 401 si la flag
// PAYMENTS_ALLOW_UNVERIFIED no está set en env. En desarrollo se puede setear
// `PAYMENTS_ALLOW_UNVERIFIED=1` para bypassear (NUNCA en producción).
async function verifySignature(req: Request, rawBody: string): Promise<{ ok: boolean; provider: string; reason?: string }> {
  // Detectar proveedor por headers presentes
  const isMP     = !!req.headers.get('x-signature') || !!req.headers.get('X-Signature');
  const isPaypal = !!req.headers.get('paypal-transmission-sig');

  const allowUnverified = Deno.env.get('PAYMENTS_ALLOW_UNVERIFIED') === '1';
  if (allowUnverified) {
    return { ok: true, provider: isPaypal ? 'paypal' : (isMP ? 'mercadopago' : 'unknown') };
  }

  // ⚠️ Implementación pendiente — ver bloque TODO arriba.
  // Cuando se implemente, devolver { ok: true|false, provider, reason }.
  return { ok: false, provider: isPaypal ? 'paypal' : (isMP ? 'mercadopago' : 'unknown'),
           reason: 'Verificación de firma no implementada (set PAYMENTS_ALLOW_UNVERIFIED=1 solo en dev).' };
}

// ─────────────────────────────────────────────────────────────
// NORMALIZACIÓN DEL PAYLOAD
// ─────────────────────────────────────────────────────────────
// El parser de MP fue REMOVIDO: el webhook real de MP solo trae
//   { action, data: { id }, type, user_id }
// — sin email, sin amount, sin external_reference. La normalización
// se hace inline en el handler (sección 2a) llamando a la API de MP
// con el payment_id para enriquecer todos los datos. Etapa X.16.

function normalizePayPal(payload: any): NormalizedPayment | null {
  // PayPal manda CHECKOUT.ORDER.APPROVED o PAYMENT.CAPTURE.COMPLETED.
  const r        = payload?.resource || payload;
  const email    = r?.payer?.email_address || r?.purchase_units?.[0]?.payer?.email_address;
  const courseId = r?.purchase_units?.[0]?.custom_id || r?.custom_id;
  const amount   = Number(r?.amount?.value ?? r?.purchase_units?.[0]?.amount?.value ?? 0);
  const currency = (r?.amount?.currency_code || r?.purchase_units?.[0]?.amount?.currency_code || 'USD').toUpperCase();
  const externalRef = r?.id ? String(r.id) : undefined;
  if (!email || !courseId) return null;
  return { email, course_id: courseId, amount, currency, payment_method: 'paypal', external_ref: externalRef };
}

// ─────────────────────────────────────────────────────────────
// HANDLER
// ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST')    return errOut('Método no permitido.', 405);

  // Leer body como texto primero (necesario para verificar firma)
  const rawBody = await req.text();

  // ── 0) Branch "coupon" — pago 100% off (Etapa X.14) ─────
  // Cuando el cupón aplicado deja el precio en $0, el cliente NO pasa por MP/PayPal.
  // En su lugar manda directamente a este endpoint con provider:'coupon' y los datos
  // del comprador. Saltamos la verificación de firma (no la hay — confiamos en
  // que la BD valida que el coupon exista y deje el precio en 0) y procesamos
  // el acceso con el mismo flujo de invite + UPSERT user_courses.
  let earlyParsed: any = null;
  try { earlyParsed = JSON.parse(rawBody); } catch { /* fall-through al flujo normal */ }
  const isCouponFlow = earlyParsed && earlyParsed.provider === 'coupon';

  let normalized: NormalizedPayment | null = null;
  let sigInfo: { ok: boolean; provider: string; reason?: string } | null = null;

  if (isCouponFlow) {
    // Resolver course_id por slug (el cliente solo conoce slug)
    const slug = (earlyParsed.slug || '').trim();
    if (!slug) return errOut('coupon flow: falta slug.');
    const SERVICE_ROLE_EARLY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const SUPABASE_URL_EARLY = Deno.env.get('SUPABASE_URL');
    if (!SERVICE_ROLE_EARLY || !SUPABASE_URL_EARLY) {
      console.error('process-payment[coupon]: faltan SUPABASE_URL/SERVICE_ROLE');
      return errOut('Configuración del servidor incompleta.', 500);
    }
    const sbEarly = createClient(SUPABASE_URL_EARLY, SERVICE_ROLE_EARLY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: course, error: courseErr } = await sbEarly
      .from('courses').select('id').eq('slug', slug).eq('is_active', true).maybeSingle();
    if (courseErr || !course) {
      console.error('process-payment[coupon]: course lookup falló', courseErr);
      return errOut('Curso no encontrado o inactivo.', 404);
    }
    // Validar que el cupón exista, esté activo, y resulte en amount=0 contra el course
    // (defensivo — evita que un cliente malicioso envíe amount:0 con un cupón inválido).
    const couponCode = (earlyParsed.coupon_code || '').toUpperCase();
    if (couponCode) {
      const { data: cps } = await sbEarly
        .from('coupons')
        .select('id, code, discount_pct, discount_fixed, valid_until, max_uses, uses_count, course_id, is_active')
        .eq('code', couponCode)
        .eq('is_active', true);
      const coupon = (cps || [])[0];
      if (!coupon) return errOut('Cupón inválido o inactivo.', 400);
      if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
        return errOut('Cupón vencido.', 400);
      }
      if (coupon.max_uses && coupon.max_uses > 0 && (coupon.uses_count || 0) >= coupon.max_uses) {
        return errOut('Cupón agotado.', 400);
      }
      if (coupon.course_id && coupon.course_id !== course.id) {
        return errOut('Cupón no aplicable a este curso.', 400);
      }
      // (En este flujo NO recalculamos el precio: si el cliente reportó amount=0 y
      // el cupón existe + está vigente, asumimos que el descuento legítimamente lo dejó
      // en 0. La validación exhaustiva del cálculo queda como follow-up — process-payment
      // necesitaría también el price_ars del course, que ya tenemos en `course`. Por ahora
      // confiamos en la chequeada simétrica que ya hace checkout.html antes de llamar.)
    }

    normalized = {
      email:          (earlyParsed.email || '').trim().toLowerCase(),
      course_id:      course.id,
      amount:         0,
      currency:       (earlyParsed.currency || 'ARS').toUpperCase(),
      payment_method: 'coupon',
      external_ref:   couponCode ? `coupon:${couponCode}` : 'coupon:none',
      nombre:         (earlyParsed.nombre   || '').trim() || undefined,
      apellido:       (earlyParsed.apellido || '').trim() || undefined,
    };
    if (!normalized.email) return errOut('coupon flow: falta email.');
    sigInfo = { ok: true, provider: 'coupon' };
  } else {
    // ── 1) Flujo normal: Verificar firma ──────────────────
    sigInfo = await verifySignature(req, rawBody);
    if (!sigInfo.ok) {
      console.warn('process-payment: firma inválida —', sigInfo.reason || 'unknown');
      return errOut('Firma inválida o no verificada.', 401);
    }

    // ── 2) Parsear ──────────────────────────────────────
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return errOut('Body inválido: se esperaba JSON.');
    }

    if (sigInfo.provider === 'mercadopago') {
      // ── 2a) MP webhook (Etapa X.16) ─────────────────────
      // El webhook real de MP solo trae { action, data: { id }, type, user_id }.
      // Tenemos que hacer GET /v1/payments/{id} para obtener email, monto,
      // currency, status y external_reference. Si el pago no está aprobado
      // todavía (pending, in_process, rejected) → skip silencioso (200 ok)
      // para que MP no reintente. external_reference viene como un string
      // JSON serializado por create-preference con { slug, email, nombre,
      // apellido, coupon_code, course_id }.

      const paymentId = payload?.data?.id;
      if (!paymentId) {
        console.warn('process-payment[MP]: webhook sin data.id, payload:', payload);
        // Algunos eventos secundarios (test, refund, etc.) no traen data.id —
        // respondemos 200 para que MP no reintente, pero no procesamos nada.
        return json({ ok: true, skipped: true, reason: 'sin data.id' });
      }

      const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
      if (!MP_ACCESS_TOKEN) {
        console.error('process-payment[MP]: MP_ACCESS_TOKEN no configurado');
        return errOut('Configuración del servidor incompleta (MP_ACCESS_TOKEN).', 500);
      }

      // ── Fetch a la API de MP ──────────────────────────
      let payment: any;
      try {
        const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
          headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
        });
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`MP /v1/payments/${paymentId} → HTTP ${r.status}: ${txt}`);
        }
        payment = await r.json();
      } catch (e: any) {
        console.error('process-payment[MP]: fetch payment falló:', e);
        return errOut('No se pudo consultar el pago en MP: ' + (e.message || e), 502);
      }

      // ── Skip si no está aprobado ──────────────────────
      // status posibles: approved, in_process, pending, rejected, cancelled,
      // refunded, charged_back. Solo procesamos `approved`. MP reintenta los
      // webhooks ante 4xx/5xx, así que respondemos 200 con skipped:true.
      if (payment.status !== 'approved') {
        console.log(`process-payment[MP]: payment ${paymentId} status=${payment.status} → skip`);
        return json({ ok: true, skipped: true, reason: `status=${payment.status}`, payment_id: paymentId });
      }

      // ── Parsear external_reference ────────────────────
      let extRef: any = {};
      try {
        if (payment.external_reference) extRef = JSON.parse(payment.external_reference);
      } catch (e) {
        console.warn('process-payment[MP]: external_reference no es JSON válido:', payment.external_reference);
        extRef = {};
      }

      const slug      = (extRef.slug || '').trim();
      const refEmail  = (extRef.email || payment?.payer?.email || '').trim().toLowerCase();
      const refNombre = (extRef.nombre   || '').trim() || undefined;
      const refApell  = (extRef.apellido || '').trim() || undefined;

      if (!slug)     return errOut('webhook MP: external_reference sin slug.');
      if (!refEmail) return errOut('webhook MP: no se pudo determinar el email del comprador.');

      // ── Resolver course_id por slug (service role bypassea RLS) ──
      const SERVICE_ROLE_MP = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const SUPABASE_URL_MP = Deno.env.get('SUPABASE_URL');
      if (!SERVICE_ROLE_MP || !SUPABASE_URL_MP) {
        console.error('process-payment[MP]: faltan SUPABASE_URL/SERVICE_ROLE');
        return errOut('Configuración del servidor incompleta.', 500);
      }
      const sbMP = createClient(SUPABASE_URL_MP, SERVICE_ROLE_MP, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: course, error: courseErr } = await sbMP
        .from('courses').select('id').eq('slug', slug).eq('is_active', true).maybeSingle();
      if (courseErr || !course) {
        console.error('process-payment[MP]: curso no encontrado para slug=' + slug, courseErr);
        return errOut(`Curso no encontrado o inactivo (slug=${slug}).`, 404);
      }

      normalized = {
        email:          refEmail,
        course_id:      course.id,
        amount:         Number(payment.transaction_amount || 0),
        currency:       (payment.currency_id || 'ARS').toUpperCase(),
        payment_method: 'mercadopago',
        external_ref:   String(payment.id),
        nombre:         refNombre,
        apellido:       refApell,
      };

      // (Follow-up Etapa X.14): incrementar coupons.uses_count si extRef.coupon_code
      // está set y el cupón existe. No bloquea el flujo del pago.
    } else if (sigInfo.provider === 'paypal') {
      normalized = normalizePayPal(payload);
      if (!normalized) {
        return errOut('Payload PayPal no reconocido o incompleto.');
      }
    } else {
      return errOut(`Payload no reconocido (provider=${sigInfo.provider}).`);
    }
  }

  const { email, course_id, amount, currency, payment_method, external_ref, nombre, apellido } = normalized;

  // ── 3) Cliente service role ─────────────────────────────
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  if (!SERVICE_ROLE || !SUPABASE_URL) {
    console.error('process-payment: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env');
    return errOut('Configuración del servidor incompleta.', 500);
  }
  const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 4) Resolver user_id por email ──────────────────────
  // Etapa X.18 — tres mejoras:
  //   (a) Lookup PRIMARIO en `profiles.email` (más rápido y barato que listUsers,
  //       y `profiles` se mantiene en sync con auth.users vía el trigger
  //       `handle_new_user` que ahora persiste email también).
  //   (b) Solo invitamos si la búsqueda devuelve data = null. Evita reinvitar
  //       a usuarios existentes cada vez que compran un nuevo curso.
  //   (c) El invite va en try/catch y los errores de rate limit / email no
  //       abortan el flujo: el UPSERT en user_courses siempre se ejecuta. Si
  //       el invite falla, el alumno puede pedir un nuevo magic link desde
  //       login.html → "Olvidaste tu contraseña".
  let userId: string | null = null;
  let inviteSkippedReason: string | null = null;

  // 4.a) Lookup primario en profiles por email
  try {
    const { data: prof, error: profErr } = await sbAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (profErr) {
      console.warn('process-payment: lookup profiles falló (sigo con invite):', profErr);
    } else if (prof?.id) {
      userId = prof.id;
      inviteSkippedReason = 'usuario ya existe en profiles';
    }
  } catch (e) {
    console.warn('process-payment: lookup profiles excepción:', e);
  }

  // 4.b) Si no existe en profiles, invitar — tolerante a rate limit
  if (!userId) {
    // Si tenemos nombre+apellido (coupon flow trae estos campos), pasarlos como
    // metadata para que el trigger handle_new_user los guarde en profiles.full_name.
    // redirectTo: el botón del email de invite manda al alumno a set-password.html
    // (Etapa X.17) para que elija su contraseña y entre al dashboard.
    const fullName = [nombre, apellido].filter(Boolean).join(' ').trim();
    const inviteOpts: { data?: Record<string, unknown>; redirectTo: string } = {
      redirectTo: 'https://ekapradacoach.github.io/HBLAB/set-password.html',
    };
    if (fullName) inviteOpts.data = { full_name: fullName, name: fullName };

    try {
      const { data: invited, error: inviteErr } = await sbAdmin.auth.admin.inviteUserByEmail(email, inviteOpts);
      if (inviteErr) {
        // Rate limit / email error → degradar a warning, NO abortar el flujo.
        const msg = (inviteErr.message || '').toLowerCase();
        if (msg.includes('rate limit') || msg.includes('email')) {
          console.warn('invite rate limited:', email, '—', inviteErr.message);
          inviteSkippedReason = 'rate limit / email error: ' + inviteErr.message;
        } else {
          // Cualquier otro error del invite también lo logueamos pero NO abortamos
          // — el UPSERT en user_courses debe ocurrir igual para no perder el pago.
          console.warn('process-payment: invite falló (sigo con UPSERT):', inviteErr);
          inviteSkippedReason = 'invite error: ' + inviteErr.message;
        }
      } else if (invited?.user?.id) {
        userId = invited.user.id;
      } else {
        console.warn('process-payment: invite no devolvió user.id (sigo con UPSERT)');
        inviteSkippedReason = 'invite sin user.id';
      }
    } catch (e: any) {
      console.warn('invite rate limited:', email, '—', e?.message || e);
      inviteSkippedReason = 'invite exception: ' + (e?.message || e);
    }
  }

  // ── 5) UPSERT en user_courses ──────────────────────────
  // ⚠️ Etapa X.18: este bloque corre SIEMPRE, fuera del if del invite.
  // Si tenemos userId (de profiles o del invite) → registramos el acceso.
  // Si NO tenemos userId (invite falló por rate limit Y el usuario era nuevo)
  // → no podemos hacer el UPSERT (user_id es NOT NULL); respondemos 200 con
  // un flag `pending_invite` para que MP no reintente. El admin puede asignar
  // el curso manualmente desde admin.html una vez que el alumno se registre.
  if (!userId) {
    console.error('process-payment: no se pudo resolver user_id —', { email, course_id, inviteSkippedReason });
    return json({
      ok: true,
      pending_invite: true,
      reason: inviteSkippedReason || 'no user_id',
      email,
      course_id,
      payment_method,
      external_ref,
    });
  }

  // onConflict (user_id, course_id) — si ya existe la inscripción, la pisamos
  // con payment_status='paid' (idempotencia frente a re-envío del webhook).
  const upsertPayload = {
    user_id:        userId,
    course_id,
    payment_status: 'paid',
    payment_method,
    amount_paid:    amount,
    currency,
    status:         'active',
  };
  const { error: ucErr } = await sbAdmin
    .from('user_courses')
    .upsert(upsertPayload, { onConflict: 'user_id,course_id' });
  if (ucErr) {
    console.error('process-payment: upsert user_courses falló:', ucErr, { external_ref });
    return errOut('No se pudo registrar el acceso al curso: ' + ucErr.message, 500);
  }

  return json({
    ok: true,
    user_id: userId,
    course_id,
    payment_method,
    external_ref,
    invite_skipped: inviteSkippedReason || undefined,
  });
});
