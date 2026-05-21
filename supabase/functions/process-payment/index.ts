// supabase/functions/process-payment/index.ts
//
// Etapa X.11 — Edge Function: webhook de pagos (Mercado Pago / PayPal).
// Recibe POST con el payload del proveedor, verifica firma, registra el acceso
// del alumno al curso en `public.user_courses` con payment_status='paid'.
// Si el alumno todavía no existe en auth.users, lo invita por email y usa el
// id retornado para insertar la fila de acceso.
//
// Despliegue: `supabase functions deploy process-payment`
// `verify_jwt = false` en config.toml — los webhooks de MP/PayPal no llevan JWT
// de Supabase, la autenticación es por firma del proveedor (verificada abajo).
//
// Secrets requeridos (Supabase → Edge Functions → Manage secrets):
//   - SUPABASE_SERVICE_ROLE_KEY  → auto-inyectado por el runtime.
//   - SUPABASE_URL               → auto-inyectado por el runtime.
//   - MP_ACCESS_TOKEN            → access token de PRODUCCIÓN de Mercado Pago, usado
//                                  para enriquecer el webhook con GET /v1/payments/{id}.
//   - RESEND_API_KEY             → Etapa X.19 — API key de Resend.com para enviar el
//                                  email de bienvenida con la contraseña temporal al
//                                  alumno cuando se crea por primera vez.
//   - PAYMENTS_ALLOW_UNVERIFIED  → opcional (=1 en dev/sandbox para bypassear firma).

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

// ─────────────────────────────────────────────────────────────
// Etapa X.19 — Helpers para creación de usuario + email de bienvenida
// ─────────────────────────────────────────────────────────────
// Antes usábamos `auth.admin.inviteUserByEmail` que dependía del SMTP de
// Supabase para enviar el email de invite — esto falla con "Error sending
// invite email" cuando el SMTP no está bien configurado para edge functions.
// Ahora creamos el usuario directamente con `auth.admin.createUser`
// (email_confirm: true + password temporal random) y enviamos el email de
// bienvenida via Resend API, que es más confiable y nos da control total
// del contenido del mensaje.

function generateTempPassword(length = 12): string {
  // 12 chars alfanuméricos (letras mayúsculas, minúsculas y dígitos).
  // crypto.getRandomValues garantiza distribución uniforme.
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += charset[bytes[i] % charset.length];
  return out;
}

async function sendWelcomeEmail(opts: {
  email: string;
  fullName?: string;
  courseTitle: string;
  magicLink: string;        // Etapa X.20: reemplaza tempPassword. URL del magic link
                            // generado con auth.admin.generateLink({ type:'magiclink' }).
                            // El click autentica al alumno y lo redirige a set-password.html.
}): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY no configurado en env' };
  }
  const safeName  = (opts.fullName || '').trim() || 'alumna/o';
  const safeTitle = (opts.courseTitle || '(tu curso)').replace(/</g, '&lt;');

  // HTML email-safe (inline styles, table layout — sin grids/flex modernos).
  // Sin contraseña temporal visible: el alumno hace click en el botón y queda
  // autenticado vía magic link → la página set-password.html detecta la sesión
  // y le ofrece elegir su contraseña.
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0 !important;padding:0 !important;background:#1E2A3A !important;font-family:'Inter',Arial,Helvetica,sans-serif;color:#FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1E2A3A !important;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#243042 !important;border:1px solid #2f3e52;border-radius:14px;padding:36px;">
        <tr><td>
          <h1 style="margin:0 0 12px;font-size:24px;color:#FFFFFF;letter-spacing:-0.02em;font-family:'Inter',Arial,Helvetica,sans-serif;">¡Bienvenida/o a <span style="color:#C8E600">HB Lab</span>!</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.55;">Hola ${safeName}, gracias por sumarte. Tu compra del curso <strong style="color:#FFFFFF">${safeTitle}</strong> está confirmada y ya podés acceder.</p>

          <p style="margin:0 0 16px;font-size:14px;color:#94A3B8;line-height:1.55;">Para activar tu cuenta y elegir tu contraseña personal, hacé click acá abajo:</p>

          <p style="margin:0 0 28px;"><a href="${opts.magicLink}" style="display:inline-block;background:#C8E600 !important;color:#1E2A3A !important;text-decoration:none;font-weight:700;padding:16px 32px;border-radius:8px;font-size:15px;font-family:'Inter',Arial,Helvetica,sans-serif;">Crear mi contraseña →</a></p>

          <p style="margin:0 0 8px;font-size:12px;color:#94A3B8;line-height:1.55;">¿El botón no funciona? Copiá y pegá este link en tu navegador:</p>
          <p style="margin:0 0 24px;font-size:12px;color:#C8E600;word-break:break-all;line-height:1.4;">${opts.magicLink}</p>

          <p style="margin:0 0 6px;font-size:13px;color:#94A3B8;line-height:1.55;">El link expira en 1 hora. Si vence, podés pedir uno nuevo desde la pantalla de login con "Olvidaste tu contraseña" usando este email: <strong style="color:#FFFFFF">${opts.email}</strong>.</p>

          <hr style="border:none;border-top:1px solid #2f3e52;margin:28px 0;">
          <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.5;">Si tenés alguna pregunta, respondé este email o escribinos a ekapradacoach@gmail.com.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'HB Lab <noreply@hblabarg.com>',
        to:      opts.email,
        subject: `🎉 Tu acceso a HB Lab — ${opts.courseTitle}`,
        html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `Resend HTTP ${res.status}: ${txt}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

// ─────────────────────────────────────────────────────────────
// Etapa X.27 — Email de CONFIRMACIÓN para alumnos existentes
// ─────────────────────────────────────────────────────────────
// Cuando un alumno que YA tiene cuenta compra un curso adicional, no le mandamos
// el welcome email (que tiene magic link para crear contraseña). En su lugar,
// le mandamos una confirmación simple que le dice "el acceso ya está activo"
// y un botón al dashboard. Sin magic link, sin contraseña visible.
async function sendConfirmationEmail(opts: {
  email: string;
  fullName?: string;
  courseTitle: string;
}): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY no configurado en env' };
  }
  const safeName    = (opts.fullName || '').trim() || 'alumna/o';
  const safeTitle   = (opts.courseTitle || '(tu curso)').replace(/</g, '&lt;');
  const dashboardUrl = 'https://hblabarg.com/dashboard.html';

  // HTML email-safe — mismo estilo visual inline que sendWelcomeEmail.
  // Sin magic link, sin contraseña, solo CTA al dashboard.
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0 !important;padding:0 !important;background:#1E2A3A !important;font-family:'Inter',Arial,Helvetica,sans-serif;color:#FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1E2A3A !important;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#243042 !important;border:1px solid #2f3e52;border-radius:14px;padding:36px;">
        <tr><td>
          <h1 style="margin:0 0 12px;font-size:24px;color:#FFFFFF;letter-spacing:-0.02em;font-family:'Inter',Arial,Helvetica,sans-serif;">✅ Nuevo curso activado en <span style="color:#C8E600">HB Lab</span></h1>
          <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.55;">Hola ${safeName}, tu acceso al curso <strong style="color:#FFFFFF">${safeTitle}</strong> ya está activo. Entrá a tu dashboard para empezar.</p>

          <p style="margin:0 0 28px;"><a href="${dashboardUrl}" style="display:inline-block;background:#C8E600 !important;color:#1E2A3A !important;text-decoration:none;font-weight:700;padding:16px 32px;border-radius:8px;font-size:15px;font-family:'Inter',Arial,Helvetica,sans-serif;">Ir al dashboard →</a></p>

          <p style="margin:0 0 8px;font-size:12px;color:#94A3B8;line-height:1.55;">¿El botón no funciona? Copiá y pegá este link en tu navegador:</p>
          <p style="margin:0 0 24px;font-size:12px;color:#C8E600;word-break:break-all;line-height:1.4;">${dashboardUrl}</p>

          <p style="margin:0;font-size:13px;color:#94A3B8;line-height:1.55;">Ingresá con tu email <strong style="color:#FFFFFF">${opts.email}</strong> y la contraseña que ya configuraste.</p>

          <hr style="border:none;border-top:1px solid #2f3e52;margin:28px 0;">
          <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.5;">Si tenés alguna pregunta, respondé este email o escribinos a ekapradacoach@gmail.com.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'HB Lab <noreply@hblabarg.com>',
        to:      opts.email,
        subject: `✅ Nuevo curso activado — ${opts.courseTitle}`,
        html,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `Resend HTTP ${res.status}: ${txt}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

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
// Etapa X.28 — Helper OAuth de PayPal
// ─────────────────────────────────────────────────────────────
// Obtiene un access token via /v1/oauth2/token con Basic Auth (client_id:secret).
// Se usa tanto en verifySignature (para llamar a /verify-webhook-signature) como
// en la normalización inline del branch PayPal (para hacer GET del order).
// Stateless: cada request hace su propio fetch — el token expira en ~9h pero no
// vale la pena cachear en Edge Functions (escalan horizontalmente, no compartirían).
let _paypalEnv: 'sandbox' | 'live' = (Deno.env.get('PAYPAL_ENV') === 'sandbox') ? 'sandbox' : 'live';
const PAYPAL_API_BASE = _paypalEnv === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

async function getPayPalAccessToken(): Promise<{ token: string | null; error?: string }> {
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const secret   = Deno.env.get('PAYPAL_CLIENT_SECRET');
  if (!clientId || !secret) {
    return { token: null, error: 'PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET no configurados' };
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
      return { token: null, error: `PayPal OAuth HTTP ${r.status}: ${txt}` };
    }
    const data = await r.json();
    return { token: data?.access_token || null, error: data?.access_token ? undefined : 'sin access_token en response' };
  } catch (e: any) {
    return { token: null, error: 'OAuth excepción: ' + (e?.message || String(e)) };
  }
}

// ─────────────────────────────────────────────────────────────
// VERIFICACIÓN DE FIRMA
// ─────────────────────────────────────────────────────────────
// - MercadoPago (Etapa X.31): HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`
//   con MP_WEBHOOK_SECRET, comparado contra el `v1=...` del header x-signature.
// - PayPal (Etapa X.28): implementado vía /v1/notifications/verify-webhook-signature.
//
// Flag de bypass `PAYMENTS_ALLOW_UNVERIFIED=1` se mantiene para dev local; en
// producción debe estar **siempre apagada**.
async function verifySignature(req: Request, rawBody: string): Promise<{ ok: boolean; provider: string; reason?: string }> {
  const isMP     = !!req.headers.get('x-signature') || !!req.headers.get('X-Signature');
  const isPaypal = !!req.headers.get('paypal-transmission-sig');

  const allowUnverified = Deno.env.get('PAYMENTS_ALLOW_UNVERIFIED') === '1';
  if (allowUnverified) {
    return { ok: true, provider: isPaypal ? 'paypal' : (isMP ? 'mercadopago' : 'unknown') };
  }

  // ── PayPal: verificación real (Etapa X.28 + ajustes X.32) ─
  if (isPaypal) {
    const WEBHOOK_ID = Deno.env.get('PAYPAL_WEBHOOK_ID');
    if (!WEBHOOK_ID) {
      return { ok: false, provider: 'paypal', reason: 'PAYPAL_WEBHOOK_ID no configurado' };
    }

    // 1) Validar que TODOS los headers críticos estén presentes.
    const ppTransmissionId   = req.headers.get('paypal-transmission-id');
    const ppTransmissionTime = req.headers.get('paypal-transmission-time');
    const ppCertUrl          = req.headers.get('paypal-cert-url');
    const ppAuthAlgo         = req.headers.get('paypal-auth-algo');
    const ppTransmissionSig  = req.headers.get('paypal-transmission-sig');
    if (!ppTransmissionId || !ppTransmissionTime || !ppCertUrl || !ppAuthAlgo || !ppTransmissionSig) {
      return { ok: false, provider: 'paypal', reason: 'headers PayPal incompletos' };
    }

    // 2) Obtener access token vía OAuth (helper compartido con create-paypal-order).
    const { token, error: tokErr } = await getPayPalAccessToken();
    if (!token) {
      return { ok: false, provider: 'paypal', reason: 'error verificando firma PayPal: ' + (tokErr || 'no se pudo obtener access token') };
    }

    // 3) Parsear el body original — el endpoint /verify-webhook-signature espera
    //    `webhook_event` como objeto JS (no como string).
    let parsedEvent: any;
    try {
      parsedEvent = JSON.parse(rawBody);
    } catch {
      return { ok: false, provider: 'paypal', reason: 'error verificando firma PayPal: body no es JSON válido' };
    }

    const verifyBody = {
      auth_algo:         ppAuthAlgo,
      cert_url:          ppCertUrl,
      transmission_id:   ppTransmissionId,
      transmission_sig:  ppTransmissionSig,
      transmission_time: ppTransmissionTime,
      webhook_id:        WEBHOOK_ID,
      webhook_event:     parsedEvent,
    };

    // 4) POST a la API real. Usamos PAYPAL_API_BASE que ya conmuta sandbox/live
    //    según PAYPAL_ENV (default 'live' → https://api-m.paypal.com).
    try {
      const r = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
          'Accept':        'application/json',
        },
        body: JSON.stringify(verifyBody),
      });
      if (!r.ok) {
        const txt = await r.text();
        return { ok: false, provider: 'paypal', reason: `error verificando firma PayPal: HTTP ${r.status}: ${txt}` };
      }
      const data = await r.json();
      if (data?.verification_status === 'SUCCESS') {
        return { ok: true, provider: 'paypal' };
      }
      console.warn('PayPal signature mismatch', { verification_status: data?.verification_status, transmission_id: ppTransmissionId });
      return { ok: false, provider: 'paypal', reason: 'firma PayPal inválida' };
    } catch (e: any) {
      return { ok: false, provider: 'paypal', reason: 'error verificando firma PayPal: ' + (e?.message || String(e)) };
    }
  }

  // ── MP: verificación real HMAC-SHA256 (Etapa X.31) ─────
  // Doc: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks#editor_4
  // El header `x-signature` viene como `ts=<unix>,v1=<hex>` (orden de campos puede variar).
  // La firma se calcula como HMAC-SHA256(`id:<data.id>;request-id:<x-request-id>;ts:<ts>`, MP_WEBHOOK_SECRET).
  if (isMP) {
    const SECRET = Deno.env.get('MP_WEBHOOK_SECRET');
    if (!SECRET) {
      return { ok: false, provider: 'mercadopago', reason: 'MP_WEBHOOK_SECRET no configurado' };
    }

    const xSignature = req.headers.get('x-signature') || req.headers.get('X-Signature') || '';
    const xRequestId = req.headers.get('x-request-id') || req.headers.get('X-Request-Id') || '';
    if (!xSignature) {
      return { ok: false, provider: 'mercadopago', reason: 'header x-signature ausente' };
    }
    if (!xRequestId) {
      return { ok: false, provider: 'mercadopago', reason: 'header x-request-id ausente' };
    }

    // Parsear `ts=...,v1=...` (separados por coma, posibles espacios alrededor).
    let ts = '', v1 = '';
    for (const part of xSignature.split(',')) {
      const [k, ...rest] = part.split('=');
      const key = (k || '').trim();
      const val = rest.join('=').trim();
      if (key === 'ts') ts = val;
      else if (key === 'v1') v1 = val;
    }
    if (!ts || !v1) {
      return { ok: false, provider: 'mercadopago', reason: 'x-signature mal formado (faltan ts o v1)' };
    }

    // Parsear payload para sacar data.id (el payment_id que envía MP).
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return { ok: false, provider: 'mercadopago', reason: 'body no es JSON válido' };
    }
    const dataId = payload?.data?.id;
    if (!dataId) {
      return { ok: false, provider: 'mercadopago', reason: 'data.id ausente en el payload' };
    }

    // Construir el string canónico — formato exacto de MP.
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    try {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      );
      const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest));
      const hex = Array.from(new Uint8Array(sigBuf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Comparación lower-case en ambos extremos (MP devuelve lowercase pero defensivo).
      if (hex.toLowerCase() === v1.toLowerCase()) {
        return { ok: true, provider: 'mercadopago' };
      }
      console.warn('MP signature mismatch', { manifest_len: manifest.length, dataId, ts, expected_v1: v1, got_hex: hex });
      return { ok: false, provider: 'mercadopago', reason: 'firma MP inválida' };
    } catch (e: any) {
      return { ok: false, provider: 'mercadopago', reason: 'HMAC exception: ' + (e?.message || String(e)) };
    }
  }

  return {
    ok: false, provider: 'unknown',
    reason: 'No se detectó proveedor (headers x-signature ni paypal-transmission-sig).',
  };
}

// ─────────────────────────────────────────────────────────────
// NORMALIZACIÓN DEL PAYLOAD
// ─────────────────────────────────────────────────────────────
// Tanto el parser de MP como el de PayPal se hacen INLINE en el handler.
//   MP (X.16):    el webhook solo trae { action, data: { id } } — se hace
//                 GET /v1/payments/{id} para enriquecer.
//   PayPal (X.28): el webhook trae { resource: { id } } — se hace GET
//                 /v2/checkout/orders/{id} para enriquecer y validar status.
// No queda ningún parser standalone; todo vive en la sección 2a/2b del handler.

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
      // ── 2b) PayPal webhook (Etapa X.28) ──────────────────
      // El webhook trae { resource: { id } } — el `id` puede ser el order_id
      // (eventos CHECKOUT.ORDER.*) o un capture_id (PAYMENT.CAPTURE.*). Para el
      // caso CAPTURE.COMPLETED, el order_id real vive en
      //   resource.supplementary_data.related_ids.order_id
      // Tomamos el primero disponible.
      const orderId =
        payload?.resource?.supplementary_data?.related_ids?.order_id ||
        payload?.resource?.id;

      if (!orderId) {
        console.warn('process-payment[PayPal]: webhook sin order_id, payload:', payload);
        return json({ ok: true, skipped: true, reason: 'sin order_id' });
      }

      // Access token (reuso el helper de verifySignature)
      const { token, error: tokErr } = await getPayPalAccessToken();
      if (!token) {
        console.error('process-payment[PayPal]: token error:', tokErr);
        return errOut('No se pudo obtener access token de PayPal: ' + (tokErr || 'unknown'), 502);
      }

      // GET /v2/checkout/orders/{id} para obtener detalles completos
      let order: any;
      try {
        const r = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept':        'application/json',
          },
        });
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`PayPal /v2/checkout/orders/${orderId} → HTTP ${r.status}: ${txt}`);
        }
        order = await r.json();
      } catch (e: any) {
        console.error('process-payment[PayPal]: fetch order falló:', e);
        return errOut('No se pudo consultar la orden en PayPal: ' + (e.message || e), 502);
      }

      // Validar status: procesar si order.status === 'COMPLETED' O si
      // intent === 'CAPTURE' Y alguna capture[0] está COMPLETED.
      const orderStatus = order?.status || '';
      const isCompleted = orderStatus === 'COMPLETED';
      const hasCapture  = order?.intent === 'CAPTURE' &&
        (order?.purchase_units || []).some((u: any) =>
          (u?.payments?.captures || []).some((c: any) => (c?.status || '') === 'COMPLETED')
        );
      if (!isCompleted && !hasCapture) {
        console.log(`process-payment[PayPal]: order ${orderId} status=${orderStatus}, intent=${order?.intent} → skip`);
        return json({ ok: true, skipped: true, reason: `status=${orderStatus}`, order_id: orderId });
      }

      // Extraer datos del order response
      const unit       = order?.purchase_units?.[0] || {};
      const ppEmail    = (order?.payer?.email_address || '').trim().toLowerCase();
      const ppCourseId = (unit?.custom_id || '').trim();   // UUID del curso (seteado por create-paypal-order)
      const ppAmount   = Number(unit?.amount?.value || 0);
      const ppCurrency = (unit?.amount?.currency_code || 'USD').toUpperCase();
      const ppGiven    = (order?.payer?.name?.given_name || '').trim() || undefined;
      const ppSurname  = (order?.payer?.name?.surname    || '').trim() || undefined;

      if (!ppEmail)    return errOut('webhook PayPal: payer sin email_address.');
      if (!ppCourseId) return errOut('webhook PayPal: purchase_units[0].custom_id vacío (esperaba course_id UUID).');

      normalized = {
        email:          ppEmail,
        course_id:      ppCourseId,
        amount:         ppAmount,
        currency:       ppCurrency,
        payment_method: 'paypal',
        external_ref:   String(order.id || orderId),
        nombre:         ppGiven,
        apellido:       ppSurname,
      };
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
  // Etapa X.19 — flujo simplificado:
  //   (a) Lookup PRIMARIO en `profiles.email`. Si existe → usar ese id y NO
  //       mandar email de bienvenida (el alumno ya tenía cuenta).
  //   (b) Si no existe → `auth.admin.createUser({ email_confirm: true, password })`
  //       con contraseña temporal random. Más confiable que inviteUserByEmail,
  //       que dependía del SMTP de Supabase (fallaba con "Error sending invite
  //       email" cuando el SMTP no está bien configurado para edge functions).
  //       Si createUser dice "already exists" (race condition) → re-lookup en
  //       profiles. Otros errores → degradan a warning, NO abortan el flujo.
  //   (c) El UPSERT en user_courses siempre se ejecuta (paso 5), aunque el
  //       createUser haya fallado. Si tampoco hay userId al final → respuesta
  //       200 con `pending_invite:true` para que MP no reintente.
  //   (d) Etapa X.19: tras el UPSERT, si el usuario era nuevo (tempPassword set),
  //       enviamos el email de bienvenida con la contraseña temporal vía Resend.
  let userId: string | null = null;
  let inviteSkippedReason: string | null = null;
  let tempPassword: string | null = null;     // se setea solo si createUser fue OK con usuario nuevo

  // 4.a) Lookup primario en profiles por email
  try {
    const { data: prof, error: profErr } = await sbAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (profErr) {
      console.warn('process-payment: lookup profiles falló (sigo con createUser):', profErr);
    } else if (prof?.id) {
      userId = prof.id;
      inviteSkippedReason = 'usuario ya existe en profiles';
    }
  } catch (e) {
    console.warn('process-payment: lookup profiles excepción:', e);
  }

  // 4.b) Si no existe en profiles, crear el usuario con createUser (Etapa X.19)
  if (!userId) {
    const tp = generateTempPassword();
    const fullName = [nombre, apellido].filter(Boolean).join(' ').trim();
    const userMeta: Record<string, unknown> = fullName
      ? { full_name: fullName, name: fullName }
      : {};

    try {
      const { data: created, error: createErr } = await sbAdmin.auth.admin.createUser({
        email,
        email_confirm: true,        // marca el email como confirmado → puede loguear al toque
        password: tp,
        user_metadata: userMeta,    // el trigger handle_new_user lee `name`/`full_name`
      });

      if (createErr) {
        const msg = (createErr.message || '').toLowerCase();
        if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
          // Race condition: alguien creó al usuario entre el lookup y este punto.
          // Re-lookup en profiles para recuperar el id existente. No mandamos email.
          const { data: prof2 } = await sbAdmin
            .from('profiles').select('id').eq('email', email).maybeSingle();
          if (prof2?.id) {
            userId = prof2.id;
            inviteSkippedReason = 'usuario ya existía (race) — recuperado de profiles';
          } else {
            console.warn('process-payment: createUser dijo "already exists" pero profiles no lo tiene:', email);
            inviteSkippedReason = 'createUser already-exists / profiles vacío';
          }
        } else {
          // Cualquier otro error de createUser → log + NO abortar.
          console.warn('process-payment: createUser falló (sigo con UPSERT):', createErr);
          inviteSkippedReason = 'createUser error: ' + createErr.message;
        }
      } else if (created?.user?.id) {
        userId = created.user.id;
        tempPassword = tp;          // ← marca: hay que mandar email de bienvenida
      } else {
        console.warn('process-payment: createUser no devolvió user.id');
        inviteSkippedReason = 'createUser sin user.id';
      }
    } catch (e: any) {
      console.warn('process-payment: createUser excepción:', e?.message || e);
      inviteSkippedReason = 'createUser exception: ' + (e?.message || e);
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

  // ── 5.5) Etapa X.27 — Email de CONFIRMACIÓN para alumnos existentes ──────
  // Si llegamos acá con `inviteSkippedReason` set Y `tempPassword` null, es porque
  // el lookup en profiles encontró al usuario (paso 4.a) y NO se creó cuenta nueva.
  // Le mandamos un email de confirmación simple (sin magic link, sin contraseña)
  // con el botón al dashboard. Si Resend falla, se loguea warning y se sigue —
  // el acceso al curso ya quedó registrado en user_courses.
  let confirmationDelivery: { ok: boolean; error?: string } | null = null;
  if (inviteSkippedReason && !tempPassword) {
    // Resolver title del curso para el subject + body del email
    let courseTitleConf = '(tu curso)';
    try {
      const { data: c } = await sbAdmin
        .from('courses').select('title').eq('id', course_id).maybeSingle();
      if (c?.title) courseTitleConf = c.title;
    } catch (e) { /* fallback al placeholder */ }

    // Resolver full_name del comprador desde profiles (los datos `nombre`/`apellido`
    // del extRef pueden no estar — para usuarios ya existentes el extRef del pago
    // tiene los datos del comprador actual, pero también podemos usar el nombre
    // guardado en profiles que es más confiable).
    let fullNameConf = [nombre, apellido].filter(Boolean).join(' ').trim();
    if (!fullNameConf) {
      try {
        const { data: p } = await sbAdmin
          .from('profiles').select('full_name').eq('id', userId).maybeSingle();
        if (p?.full_name) fullNameConf = p.full_name;
      } catch (e) { /* sin fullName, el template usa "alumna/o" */ }
    }

    confirmationDelivery = await sendConfirmationEmail({
      email,
      fullName: fullNameConf || undefined,
      courseTitle: courseTitleConf,
    });
    if (!confirmationDelivery.ok) {
      console.warn('process-payment: confirmation email falló (sigo):', confirmationDelivery.error);
    }
  }

  // ── 6) Etapa X.20: email de bienvenida con MAGIC LINK (sin contraseña visible) ──
  // Solo cuando createUser arriba devolvió un id real (tempPassword set, alumno
  // nuevo creado en este request). Para usuarios pre-existentes saltamos esto —
  // ya tienen su password y no necesitan activación. Si algo falla en este paso,
  // NO abortamos: el acceso al curso ya quedó registrado, el admin puede reenviar
  // el email manualmente desde el panel.
  //
  // Antes (Etapa X.19) el email incluía la contraseña temporal y un link a login.
  // Ahora (Etapa X.20) generamos un magic link con auth.admin.generateLink y se
  // lo enviamos al alumno: al hacer click queda autenticado y aterriza en
  // set-password.html, donde elige su contraseña personal. La temp password
  // sigue existiendo solo a nivel BD (necesaria para createUser); el alumno
  // nunca la ve.
  let emailDelivery: { ok: boolean; error?: string } | null = null;
  let magicLinkSkipped: string | null = null;
  if (tempPassword) {
    // 6.a) Generar el magic link
    let magicLink: string | null = null;
    try {
      const { data: linkData, error: linkErr } = await sbAdmin.auth.admin.generateLink({
        type:  'magiclink',
        email,
        options: {
          redirectTo: 'https://hblabarg.com/set-password.html',
        },
      });
      if (linkErr) {
        console.warn('process-payment: generateLink falló:', linkErr);
        magicLinkSkipped = 'generateLink error: ' + linkErr.message;
      } else if (linkData?.properties?.action_link) {
        magicLink = linkData.properties.action_link;
      } else {
        console.warn('process-payment: generateLink sin action_link en response');
        magicLinkSkipped = 'generateLink sin action_link';
      }
    } catch (e: any) {
      console.warn('process-payment: generateLink excepción:', e?.message || e);
      magicLinkSkipped = 'generateLink exception: ' + (e?.message || e);
    }

    // 6.b) Resolver title del curso (para el subject + body del email)
    let courseTitle = '(tu curso)';
    try {
      const { data: c } = await sbAdmin
        .from('courses').select('title').eq('id', course_id).maybeSingle();
      if (c?.title) courseTitle = c.title;
    } catch (e) { /* fallback al placeholder */ }

    // 6.c) Enviar el email vía Resend — solo si tenemos magic link
    if (magicLink) {
      const fullName = [nombre, apellido].filter(Boolean).join(' ').trim();
      emailDelivery = await sendWelcomeEmail({
        email,
        fullName: fullName || undefined,
        courseTitle,
        magicLink,
      });
      if (!emailDelivery.ok) {
        console.warn('process-payment: welcome email falló (sigo):', emailDelivery.error);
      }
    } else {
      console.warn('process-payment: skip welcome email — sin magic link para', email);
    }
  }

  return json({
    ok: true,
    user_id: userId,
    course_id,
    payment_method,
    external_ref,
    invite_skipped:     inviteSkippedReason || undefined,
    magic_link_skipped: magicLinkSkipped || undefined,
    welcome_email:      emailDelivery
      ? (emailDelivery.ok ? 'sent' : `failed: ${emailDelivery.error}`)
      : (tempPassword ? 'skipped_no_magic_link' : 'not_needed'),
    // Etapa X.27 — email de confirmación para alumnos existentes comprando otro curso.
    // 'sent' / 'failed: ...' si se envió o intentó; 'not_needed' si era usuario nuevo
    // (en ese caso el welcome_email de arriba cubre el aviso).
    confirmation_email: confirmationDelivery
      ? (confirmationDelivery.ok ? 'sent' : `failed: ${confirmationDelivery.error}`)
      : 'not_needed',
  });
});
