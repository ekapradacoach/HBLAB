// supabase/functions/sync-mp-payments/index.ts
//
// Etapa X.37 — Sincronizar el neto real de Mercado Pago en `user_courses.net_amount`.
//
// Flujo:
//   1. Verifica que el caller sea admin (JWT en Authorization).
//   2. SELECT user_courses WHERE payment_method='mercadopago' AND mp_payment_id IS NOT NULL.
//   3. Por cada fila: GET https://api.mercadopago.com/v1/payments/{mp_payment_id}
//      con `Authorization: Bearer ${MP_ACCESS_TOKEN}`.
//   4. Extrae `transaction_details.net_received_amount` (neto post-comisión + IIBB).
//   5. UPDATE user_courses SET net_amount = <neto> WHERE mp_payment_id = X.
//   6. Retorna { ok: true, updated, errors }.
//
// Despliegue: `supabase functions deploy sync-mp-payments`.
// Secrets requeridos (ya configurados): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// MP_ACCESS_TOKEN.

// @ts-ignore — Deno std
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore — supabase-js ESM
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST')    return errOut('Método no permitido. Usar POST.', 405);

  // ── 1) Env ───────────────────────────────────────────────
  const SERVICE_ROLE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const SUPABASE_URL   = Deno.env.get('SUPABASE_URL');
  const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN');
  if (!SERVICE_ROLE || !SUPABASE_URL) {
    console.error('sync-mp-payments: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    return errOut('Configuración del servidor incompleta.', 500);
  }
  if (!MP_ACCESS_TOKEN) {
    console.error('sync-mp-payments: falta MP_ACCESS_TOKEN');
    return errOut('Falta MP_ACCESS_TOKEN en secrets.', 500);
  }

  // ── 2) Verificar caller es admin ─────────────────────────
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return errOut('Falta el header Authorization con el JWT del admin.', 401);

  const sbAsUser = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes, error: userErr } = await sbAsUser.auth.getUser(jwt);
  if (userErr || !userRes?.user) return errOut('JWT inválido o expirado.', 401);
  const callerId = userRes.user.id;

  const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile, error: profErr } = await sbAdmin
    .from('profiles').select('role').eq('id', callerId).maybeSingle();
  if (profErr) {
    console.error('sync-mp-payments: error leyendo profile del caller:', profErr);
    return errOut('No se pudo verificar el rol del caller.', 500);
  }
  if (!callerProfile || callerProfile.role !== 'admin') {
    return errOut('Solo un admin puede sincronizar pagos.', 403);
  }

  // ── 3) Obtener registros MP a sincronizar ────────────────
  const { data: rows, error: rowsErr } = await sbAdmin
    .from('user_courses')
    .select('mp_payment_id')
    .eq('payment_method', 'mercadopago')
    .not('mp_payment_id', 'is', null);
  if (rowsErr) {
    console.error('sync-mp-payments: error leyendo user_courses:', rowsErr);
    return errOut('No se pudo leer user_courses: ' + rowsErr.message, 500);
  }
  if (!rows?.length) {
    return json({ ok: true, updated: 0, errors: [], note: 'Sin pagos MP para sincronizar.' });
  }

  // ── 4) Iterar y traer el neto real de cada payment ───────
  let updated = 0;
  const errors: Array<{ mp_payment_id: string; error: string }> = [];

  for (const row of rows) {
    const mpId = String(row.mp_payment_id);
    try {
      const r = await fetch(`https://api.mercadopago.com/v1/payments/${mpId}`, {
        headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` },
      });
      if (!r.ok) {
        const txt = await r.text();
        errors.push({ mp_payment_id: mpId, error: `MP HTTP ${r.status}: ${txt.slice(0, 200)}` });
        continue;
      }
      const payment = await r.json();
      const net = payment?.transaction_details?.net_received_amount;
      if (net == null) {
        errors.push({ mp_payment_id: mpId, error: 'sin transaction_details.net_received_amount' });
        continue;
      }

      const { error: updErr } = await sbAdmin
        .from('user_courses')
        .update({ net_amount: Number(net) })
        .eq('mp_payment_id', mpId);
      if (updErr) {
        errors.push({ mp_payment_id: mpId, error: 'UPDATE falló: ' + updErr.message });
        continue;
      }
      updated++;
    } catch (e: any) {
      errors.push({ mp_payment_id: mpId, error: 'excepción: ' + (e?.message || String(e)) });
    }
  }

  return json({ ok: true, updated, errors });
});
