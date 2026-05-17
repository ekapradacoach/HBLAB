// supabase/functions/invite-coach-new/index.ts
//
// Crea una cuenta de coach desde cero: el admin ingresa email + nombre,
// se crea el usuario en auth con password temporal, se setea role='coach'
// en profiles y se envía un magic link al email del coach para que active
// la cuenta y elija su contraseña en set-password.html.
//
// Diferencia con `invite-coach` (legacy):
//   - invite-coach: requería que el usuario ya estuviera registrado, solo
//     asignaba el rol via inviteUserByEmail (dependía del SMTP de Supabase).
//   - invite-coach-new: crea la cuenta directamente con createUser + manda
//     email propio vía Resend con magic link (mismo flow que process-payment).
//
// Despliegue: `supabase functions deploy invite-coach-new`
// Secrets requeridos (ya configurados): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// RESEND_API_KEY.

// @ts-ignore — Deno std
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore — supabase-js ESM
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface InviteBody {
  email?: string;
  full_name?: string;
}

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

function generateTempPassword(length = 16): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += charset[bytes[i] % charset.length];
  return out;
}

async function sendCoachInviteEmail(opts: {
  email: string;
  fullName: string;
  magicLink: string;
}): Promise<{ ok: boolean; error?: string }> {
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY no configurado' };

  const safeName = (opts.fullName || '').trim() || 'coach';

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#1E2A3A;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#1E2A3A;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#243042;border:1px solid #2f3e52;border-radius:14px;padding:36px;">
        <tr><td>
          <h1 style="margin:0 0 12px;font-size:24px;color:#FFFFFF;letter-spacing:-0.02em;">🎓 Te sumamos como Coach a <span style="color:#C8E600">HB Lab</span></h1>
          <p style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.55;">Hola ${safeName}, fuiste agregado como <strong style="color:#FFFFFF">coach</strong> en la plataforma HB Lab. Desde tu panel vas a poder gestionar el foro de tus cursos, materiales, ver el progreso de los alumnos y consultar tus ganancias.</p>

          <p style="margin:0 0 16px;font-size:14px;color:#94A3B8;line-height:1.55;">Para activar tu cuenta y elegir tu contraseña, hacé click acá abajo:</p>

          <p style="margin:0 0 28px;"><a href="${opts.magicLink}" style="display:inline-block;background:#C8E600;color:#1E2A3A;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:8px;font-size:15px;">Activar mi cuenta →</a></p>

          <p style="margin:0 0 8px;font-size:12px;color:#94A3B8;line-height:1.55;">¿El botón no funciona? Copiá y pegá este link en tu navegador:</p>
          <p style="margin:0 0 24px;font-size:12px;color:#9B6FDE;word-break:break-all;line-height:1.4;">${opts.magicLink}</p>

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
        subject: '🎓 Tu acceso como Coach a HB Lab',
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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST')    return errOut('Método no permitido. Usar POST.', 405);

  // ── 1) Parse body ────────────────────────────────────────
  let body: InviteBody;
  try {
    body = await req.json();
  } catch {
    return errOut('Body inválido: se esperaba JSON.');
  }
  const email     = (body.email || '').trim().toLowerCase();
  const full_name = (body.full_name || '').trim();
  if (!email)     return errOut('email es obligatorio.');
  if (!full_name) return errOut('full_name es obligatorio.');

  // ── 2) Env ───────────────────────────────────────────────
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  if (!SERVICE_ROLE || !SUPABASE_URL) {
    console.error('invite-coach-new: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    return errOut('Configuración del servidor incompleta.', 500);
  }

  // ── 3) Verificar caller es admin ────────────────────────
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
    console.error('invite-coach-new: error leyendo profile del caller:', profErr);
    return errOut('No se pudo verificar el rol del caller.', 500);
  }
  if (!callerProfile || callerProfile.role !== 'admin') {
    return errOut('Solo un admin puede crear coaches.', 403);
  }

  // ── 4) Verificar que el email no exista ya en profiles ──
  const { data: existing, error: existErr } = await sbAdmin
    .from('profiles').select('id').eq('email', email).maybeSingle();
  if (existErr) {
    console.error('invite-coach-new: error buscando profile existente:', existErr);
    return errOut('No se pudo verificar si el email ya existe.', 500);
  }
  if (existing) {
    return json({ status: 'already_exists', email });
  }

  // ── 5) Crear el usuario en auth ─────────────────────────
  const tempPassword = generateTempPassword();
  const { data: created, error: createErr } = await sbAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: tempPassword,
    user_metadata: { full_name, name: full_name, role: 'coach' },
  });
  if (createErr || !created?.user) {
    console.error('invite-coach-new: createUser falló:', createErr);
    return errOut('No se pudo crear la cuenta: ' + (createErr?.message || 'sin detalle'), 500);
  }
  const newUserId = created.user.id;

  // ── 6) Setear role='coach' en profiles ──────────────────
  // El trigger handle_new_user crea la fila con role='student' por defecto;
  // forzamos coach con UPDATE (UPSERT por las dudas si el trigger no corrió).
  const { error: upsertErr } = await sbAdmin
    .from('profiles')
    .upsert({ id: newUserId, email, full_name, role: 'coach' }, { onConflict: 'id' });
  if (upsertErr) {
    console.error('invite-coach-new: upsert profiles falló:', upsertErr);
    return errOut('Cuenta creada pero no se pudo asignar el rol: ' + upsertErr.message, 500);
  }

  // ── 7) Generar magic link ───────────────────────────────
  let magicLink: string | null = null;
  try {
    const { data: linkData, error: linkErr } = await sbAdmin.auth.admin.generateLink({
      type:  'magiclink',
      email,
      options: { redirectTo: 'https://hblabarg.com/set-password.html' },
    });
    if (linkErr) {
      console.error('invite-coach-new: generateLink falló:', linkErr);
      return errOut('Cuenta creada pero no se pudo generar el magic link: ' + linkErr.message, 500);
    }
    magicLink = linkData?.properties?.action_link || null;
  } catch (e: any) {
    console.error('invite-coach-new: generateLink excepción:', e);
    return errOut('Cuenta creada pero falló el magic link: ' + (e?.message || String(e)), 500);
  }
  if (!magicLink) return errOut('Cuenta creada pero no se obtuvo el magic link.', 500);

  // ── 8) Enviar email vía Resend ──────────────────────────
  const emailDelivery = await sendCoachInviteEmail({ email, fullName: full_name, magicLink });
  if (!emailDelivery.ok) {
    console.warn('invite-coach-new: email falló (sigo):', emailDelivery.error);
    return json({ status: 'ok', email, email_sent: false, email_error: emailDelivery.error });
  }

  return json({ status: 'ok', email, email_sent: true });
});
