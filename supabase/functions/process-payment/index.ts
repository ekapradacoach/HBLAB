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
  payment_method: 'mercadopago' | 'paypal' | 'manual';
  external_ref?:  string;             // id de la transacción en el proveedor
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
// Cada proveedor manda el payload con su propio shape. Acá lo aplanamos a
// NormalizedPayment para que el resto del flujo no se entere.
//
// NOTA: estos parsers son placeholders — al integrar de verdad hay que
// confirmar los campos exactos contra docs/sandbox del proveedor.
function normalizeMP(payload: any): NormalizedPayment | null {
  // payload.type === 'payment' → payload.data.id es el id del pago.
  // En producción, con el id, se debería hacer un GET /v1/payments/{id} a la
  // API de MP para obtener email + currency + status confirmados (no confiar
  // en el body del webhook). Acá modelamos el caso "ya enriquecido":
  const p = payload?.data || payload;
  const email     = p?.payer?.email || p?.email;
  const courseId  = p?.metadata?.course_id || p?.external_reference;
  const amount    = Number(p?.transaction_amount ?? p?.amount ?? 0);
  const currency  = (p?.currency_id || p?.currency || 'ARS').toUpperCase();
  const externalRef = p?.id ? String(p.id) : undefined;
  if (!email || !courseId) return null;
  return { email, course_id: courseId, amount, currency, payment_method: 'mercadopago', external_ref: externalRef };
}

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

  // ── 1) Verificar firma ──────────────────────────────────
  const sig = await verifySignature(req, rawBody);
  if (!sig.ok) {
    console.warn('process-payment: firma inválida —', sig.reason || 'unknown');
    return errOut('Firma inválida o no verificada.', 401);
  }

  // ── 2) Parsear y normalizar ────────────────────────────
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errOut('Body inválido: se esperaba JSON.');
  }

  const normalized: NormalizedPayment | null =
    sig.provider === 'mercadopago' ? normalizeMP(payload)
    : sig.provider === 'paypal'    ? normalizePayPal(payload)
    : null;

  if (!normalized) {
    return errOut(`Payload no reconocido o incompleto (provider=${sig.provider}).`);
  }

  const { email, course_id, amount, currency, payment_method, external_ref } = normalized;

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
  // Si existe → usar su id.
  // Si no → invitar por email; el id se obtiene del response del invite.
  let userId: string | null = null;

  // 4.a) Intento de lookup por listUsers (paginado)
  try {
    const { data: list, error: listErr } = await sbAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (listErr) throw listErr;
    const found = (list?.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase());
    if (found) userId = found.id;
  } catch (e) {
    console.warn('process-payment: listUsers falló (sigo con invite):', e);
  }

  // 4.b) Si no existe, invitar
  if (!userId) {
    const { data: invited, error: inviteErr } = await sbAdmin.auth.admin.inviteUserByEmail(email);
    if (inviteErr || !invited?.user?.id) {
      console.error('process-payment: invite falló:', inviteErr);
      return errOut('No se pudo invitar al usuario: ' + (inviteErr?.message || 'sin id'), 500);
    }
    userId = invited.user.id;
  }

  // ── 5) UPSERT en user_courses ──────────────────────────
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

  return json({ ok: true, user_id: userId, course_id, payment_method, external_ref });
});
