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

// ── Tipos del body ────────────────────────────────────────
interface CreatePrefBody {
  slug?:        string;
  email?:       string;
  nombre?:      string;
  apellido?:    string;
  amount?:      number;        // precio FINAL en ARS (post-cupón)
  coupon_code?: string | null;
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
    .select('id, slug, title, price_ars, is_active')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (courseErr) {
    console.error('create-preference: course lookup error:', courseErr);
    return errOut('Error consultando el curso: ' + courseErr.message, 500);
  }
  if (!course) return errOut('Curso no encontrado o inactivo.', 404);

  // ── 4) Construir el payload de la preference ────────────
  // external_reference llega como string en el webhook; codificamos los
  // datos del comprador para que process-payment los pueda recuperar
  // y crear el invite + UPSERT en user_courses.
  const externalRef = JSON.stringify({
    slug, email, nombre, apellido,
    coupon_code: couponCode,
    course_id:   course.id,
  });

  const prefPayload = {
    items: [{
      title:       course.title,
      quantity:    1,
      unit_price:  amount,
      currency_id: 'ARS',
    }],
    payer: {
      email,
      name:    nombre,
      surname: apellido,
    },
    back_urls: {
      success: 'https://ekapradacoach.github.io/HBLAB/checkout-success.html',
      failure: 'https://ekapradacoach.github.io/HBLAB/checkout.html',
      pending: 'https://ekapradacoach.github.io/HBLAB/checkout-pending.html',
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
