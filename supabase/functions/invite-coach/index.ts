// supabase/functions/invite-coach/index.ts
//
// Etapa X.11 — Edge Function: invitar a un usuario por email y asignarle un rol
// (coach o admin) en `public.profiles`. Solo invocable por un admin autenticado.
//
// Flujo:
//   1. Lee Authorization: Bearer <jwt> y verifica que el caller sea admin.
//   2. Llama supabase.auth.admin.inviteUserByEmail(email) con la service role key.
//   3. Setea profiles.role = role para el usuario invitado (UPSERT por id de auth).
//      Nota: el trigger handle_new_user crea la fila en profiles al confirmar el
//      email; para asegurar el role inmediatamente hacemos UPSERT con el id
//      retornado por el invite.
//
// Despliegue: `supabase functions deploy invite-coach`
// Secret requerido: SUPABASE_SERVICE_ROLE_KEY (vía `supabase secrets set ...`).
// `verify_jwt = true` en supabase/config.toml exige Authorization en cada request.

// @ts-ignore — Deno std @ jsr-style imports
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore — supabase-js es ESM compatible con Deno
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Tipos minimal ─────────────────────────────────────────
interface InviteRequest {
  email?: string;
  role?: 'coach' | 'admin' | 'student';
}

// ── Helpers ───────────────────────────────────────────────
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // CORS — admin.html llama desde el browser
      'access-control-allow-origin':  '*',
      'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
    },
  });

const errOut = (msg: string, status = 400) => json({ error: msg }, status);

// ── Handler ───────────────────────────────────────────────
serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST')    return errOut('Método no permitido. Usar POST.', 405);

  // ── 1) Parse body ────────────────────────────────────────
  let body: InviteRequest;
  try {
    body = await req.json();
  } catch {
    return errOut('Body inválido: se esperaba JSON.');
  }
  const email = (body.email || '').trim().toLowerCase();
  const role  = (body.role  || '').trim().toLowerCase() as InviteRequest['role'];
  if (!email)                                  return errOut('email es obligatorio.');
  if (!['coach','admin','student'].includes(role!)) return errOut('role inválido (coach | admin | student).');

  // ── 2) Resolver service role key ─────────────────────────
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  if (!SERVICE_ROLE || !SUPABASE_URL) {
    console.error('invite-coach: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en env');
    return errOut('Configuración del servidor incompleta.', 500);
  }

  // ── 3) Verificar caller es admin ─────────────────────────
  // Authorization: Bearer <jwt>. Usamos un cliente "as-user" para resolver el id,
  // luego consultamos profiles.role con la service role key (bypassea RLS).
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return errOut('Falta el header Authorization con el JWT del admin.', 401);

  const sbAsUser = createClient(SUPABASE_URL, SERVICE_ROLE, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes, error: userErr } = await sbAsUser.auth.getUser(jwt);
  if (userErr || !userRes?.user) {
    return errOut('JWT inválido o expirado.', 401);
  }
  const callerId = userRes.user.id;

  // Cliente con service role para consultas/escrituras administrativas
  const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerProfile, error: profErr } = await sbAdmin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  if (profErr) {
    console.error('invite-coach: error leyendo profiles del caller:', profErr);
    return errOut('No se pudo verificar el rol del caller.', 500);
  }
  if (!callerProfile || callerProfile.role !== 'admin') {
    return errOut('Solo un admin puede invitar usuarios.', 403);
  }

  // ── 4) Invitar por email ────────────────────────────────
  // Si el email ya existe en auth.users, inviteUserByEmail retorna error.
  // Tratamos ese caso como "ya invitado / ya existe" y solo seteamos el rol.
  let invitedUserId: string | null = null;
  const { data: invited, error: inviteErr } = await sbAdmin.auth.admin.inviteUserByEmail(email);

  if (inviteErr) {
    // Caso "ya existe": resolver el id por listado o lookup directo.
    const msg = (inviteErr.message || '').toLowerCase();
    const alreadyExists = msg.includes('already') || msg.includes('exists') || msg.includes('registered');
    if (!alreadyExists) {
      console.error('invite-coach: inviteUserByEmail falló:', inviteErr);
      return errOut('No se pudo enviar la invitación: ' + inviteErr.message, 500);
    }
    // Lookup del usuario existente por email
    const { data: existing, error: listErr } = await sbAdmin.auth.admin.listUsers({
      page: 1, perPage: 200,
    });
    if (listErr) {
      console.error('invite-coach: listUsers falló:', listErr);
      return errOut('Usuario ya existía pero no se pudo obtener su id: ' + listErr.message, 500);
    }
    const found = (existing?.users || []).find(u => (u.email || '').toLowerCase() === email);
    if (!found) return errOut('Usuario no encontrado tras invite-already-exists.', 404);
    invitedUserId = found.id;
  } else {
    invitedUserId = invited?.user?.id || null;
  }

  if (!invitedUserId) return errOut('No se obtuvo el id del usuario invitado.', 500);

  // ── 5) UPSERT del rol en profiles ───────────────────────
  // El trigger handle_new_user crea la fila en profiles al confirmar email,
  // pero podemos forzar el rol ya — UPSERT por id resuelve ambos casos.
  const { error: upsertErr } = await sbAdmin
    .from('profiles')
    .upsert({ id: invitedUserId, role }, { onConflict: 'id' });
  if (upsertErr) {
    console.error('invite-coach: upsert profiles.role falló:', upsertErr);
    return errOut('Invitación enviada pero no se pudo asignar el rol: ' + upsertErr.message, 500);
  }

  return json({ ok: true, user_id: invitedUserId, email, role });
});
