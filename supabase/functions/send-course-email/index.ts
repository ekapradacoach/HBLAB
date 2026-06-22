// supabase/functions/send-course-email/index.ts
//
// Etapa X.93 — Envía un email individual a cada alumno seleccionado de un curso
// desde el panel admin (Tab Cursos → ⋮ → "📧 Enviar email").
//
// Body: { recipients: [{ email, name }], subject, message }
//   - recipients: lista de destinatarios (email obligatorio, name opcional).
//   - subject:    asunto del email (texto).
//   - message:    cuerpo en texto plano (se respetan saltos de línea).
//
// Seguridad: verify_jwt = true en config.toml + verificación explícita de que
// el caller sea admin (igual patrón que invite-coach-new). Envía vía Resend con
// el dark theme estándar del proyecto. from: 'HB Lab <noreply@hblabarg.com>'.
//
// Despliegue manual via Dashboard: Edge Functions → New function → "Via Editor"
//   → pegar este archivo → Deploy. Activar "Enforce JWT verification" en Settings.
// Secrets requeridos (ya configurados): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// RESEND_API_KEY.

// @ts-ignore — Deno std
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-ignore — supabase-js ESM
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Recipient { email?: string; name?: string; }
interface SendBody {
  recipients?: Recipient[];
  subject?:    string;
  message?:    string;
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

function escapeHtml(s: string): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Construye el HTML del email con el dark theme estándar del proyecto.
// El mensaje del admin (texto plano) se escapa y los \n se convierten en <br>.
function buildEmailHtml(opts: { name: string; subject: string; message: string }): string {
  const safeName = (opts.name || '').trim();
  const saludo   = safeName ? `Hola ${escapeHtml(safeName)},` : 'Hola,';
  const bodyHtml = escapeHtml(opts.message).replace(/\r?\n/g, '<br>');

  return `<!DOCTYPE html>
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
          <p style="margin:0 0 18px;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#C8E600;font-family:'Inter',Arial,Helvetica,sans-serif;">HB Lab</p>
          <p style="margin:0 0 16px;font-size:16px;color:#FFFFFF;font-family:'Inter',Arial,Helvetica,sans-serif;">${saludo}</p>
          <div style="margin:0 0 24px;font-size:15px;color:#94A3B8;line-height:1.65;font-family:'Inter',Arial,Helvetica,sans-serif;">${bodyHtml}</div>
          <hr style="border:none;border-top:1px solid #2f3e52;margin:28px 0;">
          <p style="margin:0;font-size:12px;color:#94A3B8;line-height:1.5;">Si tenés alguna pregunta, respondé este email o escribinos a ekapradacoach@gmail.com.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Pausa entre envíos para no superar el rate limit de Resend (~2 req/seg en el
// plan free). 600ms → ~1.6 req/seg, con margen. Para 23 destinatarios ≈ 14s.
const SEND_DELAY_MS = 600;

async function sendOne(opts: {
  apiKey: string; to: string; name: string; subject: string; message: string;
}): Promise<{ ok: boolean; error?: string }> {
  const payload = JSON.stringify({
    from:    'HB Lab <noreply@hblabarg.com>',
    to:      opts.to,
    subject: opts.subject,
    html:    buildEmailHtml({ name: opts.name, subject: opts.subject, message: opts.message }),
  });

  // Hasta 2 intentos: si Resend responde 429 (rate limit), esperamos y reintentamos una vez.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${opts.apiKey}`,
          'Content-Type':  'application/json',
        },
        body: payload,
      });
      if (res.ok) return { ok: true };

      const txt = await res.text();
      if (res.status === 429 && attempt === 1) {
        await sleep(1200);   // backoff antes del reintento
        continue;
      }
      return { ok: false, error: `Resend HTTP ${res.status}: ${txt}` };
    } catch (e: any) {
      if (attempt === 1) { await sleep(1200); continue; }
      return { ok: false, error: e?.message || String(e) };
    }
  }
  return { ok: false, error: 'agotados los reintentos' };
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return json({ ok: true });
  if (req.method !== 'POST')    return errOut('Método no permitido. Usar POST.', 405);

  // ── 1) Parse body ────────────────────────────────────────
  let body: SendBody;
  try {
    body = await req.json();
  } catch {
    return errOut('Body inválido: se esperaba JSON.');
  }
  const subject = (body.subject || '').trim();
  const message = (body.message || '').trim();
  const recipients = Array.isArray(body.recipients) ? body.recipients : [];

  if (!subject)            return errOut('subject es obligatorio.');
  if (!message)            return errOut('message es obligatorio.');
  if (!recipients.length)  return errOut('Se requiere al menos un destinatario.');
  if (recipients.length > 1000) return errOut('Demasiados destinatarios (máx. 1000).');

  // ── 2) Env ───────────────────────────────────────────────
  const SERVICE_ROLE   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const SUPABASE_URL   = Deno.env.get('SUPABASE_URL');
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (!SERVICE_ROLE || !SUPABASE_URL) {
    console.error('send-course-email: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    return errOut('Configuración del servidor incompleta.', 500);
  }
  if (!RESEND_API_KEY) {
    console.error('send-course-email: falta RESEND_API_KEY');
    return errOut('Configuración del servidor incompleta (email).', 500);
  }

  // ── 3) Verificar caller es admin ────────────────────────
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return errOut('Falta el header Authorization con el JWT del admin.', 401);

  const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userRes, error: userErr } = await sbAdmin.auth.getUser(jwt);
  if (userErr || !userRes?.user) return errOut('JWT inválido o expirado.', 401);
  const callerId = userRes.user.id;

  const { data: callerProfile, error: profErr } = await sbAdmin
    .from('profiles').select('role').eq('id', callerId).maybeSingle();
  if (profErr) {
    console.error('send-course-email: error leyendo profile del caller:', profErr);
    return errOut('No se pudo verificar el rol del caller.', 500);
  }
  if (!callerProfile || callerProfile.role !== 'admin') {
    return errOut('Solo un admin puede enviar emails a los alumnos.', 403);
  }

  // ── 4) Enviar un email por destinatario (secuencial) ────
  let sent = 0;
  let failed = 0;
  const errors: Array<{ email: string; error: string }> = [];
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // Solo destinatarios con email válido (los inválidos se cuentan como failed sin gastar tiempo).
  const valid = recipients
    .map(r => ({ to: (r?.email || '').trim(), name: (r?.name || '').trim() }))
    .filter(r => {
      if (!r.to || !emailRe.test(r.to)) {
        failed++;
        errors.push({ email: r.to || '(vacío)', error: 'email inválido' });
        return false;
      }
      return true;
    });

  for (let i = 0; i < valid.length; i++) {
    const { to, name } = valid[i];
    const result = await sendOne({ apiKey: RESEND_API_KEY, to, name, subject, message });
    if (result.ok) {
      sent++;
    } else {
      failed++;
      errors.push({ email: to, error: result.error || 'desconocido' });
      console.warn('send-course-email: falló envío a', to, '→', result.error);
    }
    // Throttle entre envíos (no después del último) para respetar el rate limit de Resend.
    if (i < valid.length - 1) await sleep(SEND_DELAY_MS);
  }

  return json({ ok: true, sent, failed, errors });
});
