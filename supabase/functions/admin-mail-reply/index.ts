// Réponse à un courrier depuis le backoffice (page Courrier, migration 081).
//
// POST { mailId, subject, body, markHandled? }  (JWT d'un administrateur)
//   1. vérifie que l'appelant est administrateur (is_admin, avec SON jeton) ;
//   2. envoie la réponse par l'API transactionnelle Brevo, depuis
//      Zola <support@zola-rdc.com>, avec In-Reply-To et References pour que
//      la réponse se range dans le même fil chez le destinataire ;
//   3. garde une trace dans inbound_mail_replies et dans l'historique des
//      actions, puis marque le message traité si demandé.
//
// Les réponses du destinataire reviennent sur support@, donc dans le
// Courrier par le webhook Hostinger, comme tout autre message.
//
// Clé Brevo : même source que le mail de bienvenue (BREVO_API_KEY en
// environnement, sinon Vault via public.waitlist_config).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const SITE_URL = 'https://zola-rdc.com';
const LOGO_URL = 'https://img.mailinblue.com/11818379/images/rnb/original/6aa5dc2c89731999b7229df2.png';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function replyHtml(body: string, quoted: { from: string; date: string; text: string } | null): string {
  const paragraphs = escapeHtml(body.trim())
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#24262a;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  const quote = quoted
    ? `<div style="margin-top:22px;padding:12px 16px;border-left:3px solid #e7e9ee;color:#656a78;font-size:13px;line-height:1.55;">
         <div style="margin-bottom:6px;">Le ${escapeHtml(quoted.date)}, ${escapeHtml(quoted.from)} a écrit</div>
         ${escapeHtml(quoted.text).replace(/\n/g, '<br>')}
       </div>`
    : '';
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zola</title></head>
<body style="margin:0;padding:0;background:#f0f1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f1f4;padding:28px 14px;"><tr><td align="center">
<table role="presentation" width="580" cellspacing="0" cellpadding="0" style="max-width:580px;width:100%;background:#ffffff;border-radius:18px;">
  <tr><td style="padding:28px 30px 8px;">${paragraphs}${quote}</td></tr>
  <tr><td style="padding:8px 30px 26px;border-top:1px solid #f0f1f4;">
    <table role="presentation" cellspacing="0" cellpadding="0"><tr>
      <td style="padding-right:12px;"><img src="${LOGO_URL}" width="36" height="36" alt="Zola" style="display:block;border-radius:9px;"></td>
      <td style="font-size:13px;line-height:1.45;color:#656a78;"><strong style="color:#101113;">L'équipe Zola</strong><br>
        <a href="${SITE_URL}" style="color:#fd267a;text-decoration:none;">zola-rdc.com</a> · support@zola-rdc.com</td>
    </tr></table>
  </td></tr>
</table>
<div style="max-width:580px;margin:14px auto 0;font-size:11px;line-height:1.5;color:#979eaf;text-align:center;">
  Zola est un service de Goblaire Ltd, 20 Wenlock Road, Londres N1 7GU, Angleterre.
</div>
</td></tr></table>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let payload: { mailId?: unknown; subject?: unknown; body?: unknown; markHandled?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const mailId = Number(payload.mailId);
  const subject = typeof payload.subject === 'string' ? payload.subject.trim().slice(0, 300) : '';
  const body = typeof payload.body === 'string' ? payload.body.trim().slice(0, 20000) : '';
  const markHandled = payload.markHandled !== false;
  if (!Number.isFinite(mailId) || !subject || body.length < 2) return json({ error: 'invalid_reply' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData } = await asUser.auth.getUser();
  if (!userData?.user) return json({ error: 'unauthorized' }, 401);
  const { data: isAdmin } = await asUser.rpc('is_admin');
  if (isAdmin !== true) return json({ error: 'forbidden' }, 403);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: mail } = await admin
    .from('inbound_mail')
    .select('id, from_name, from_address, subject, body_preview, received_at, created_at, raw, source')
    .eq('id', mailId)
    .maybeSingle();
  if (!mail) return json({ error: 'mail_not_found' }, 404);

  const to = String(mail.from_address || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return json({ error: 'no_reply_address' }, 400);

  const { data: cfg } = await admin.rpc('waitlist_config');
  const config = (cfg ?? {}) as Record<string, string>;
  const apiKey = Deno.env.get('BREVO_API_KEY') ?? config.BREVO_API_KEY ?? '';
  if (!apiKey) return json({ error: 'brevo_key_missing' }, 500);

  const originalId: string | undefined = mail.source === 'mail' ? mail.raw?.data?.messageId : undefined;
  const references: string | undefined = mail.source === 'mail' ? mail.raw?.data?.references : undefined;
  const received = new Date(mail.received_at ?? mail.created_at);
  const quoted = mail.body_preview
    ? {
        from: mail.from_name ? `${mail.from_name} <${to}>` : to,
        date: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Kinshasa' }).format(received),
        text: String(mail.body_preview),
      }
    : null;

  const headers: Record<string, string> = { 'X-Zola-Kind': 'mail-reply' };
  if (originalId) {
    headers['In-Reply-To'] = originalId;
    headers['References'] = [references, originalId].filter(Boolean).join(' ');
  }

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Zola', email: 'support@zola-rdc.com' },
      to: [{ email: to, ...(mail.from_name ? { name: mail.from_name } : {}) }],
      replyTo: { name: 'Support Zola', email: 'support@zola-rdc.com' },
      subject,
      htmlContent: replyHtml(body, quoted),
      textContent: quoted
        ? `${body}\n\n--\nL'équipe Zola\nzola-rdc.com\n\nLe ${quoted.date}, ${quoted.from} a écrit\n${quoted.text.split('\n').map((l) => `> ${l}`).join('\n')}`
        : `${body}\n\n--\nL'équipe Zola\nzola-rdc.com`,
      tags: ['mail-reply'],
      headers,
    }),
  });
  const raw = await res.text();
  if (!res.ok) {
    console.error('Brevo a refusé la réponse', res.status, raw.slice(0, 300));
    return json({ error: 'send_failed', status: res.status }, 502);
  }
  let messageId: string | null = null;
  try {
    messageId = JSON.parse(raw)?.messageId ?? null;
  } catch { /* corps vide */ }

  await admin.from('inbound_mail_replies').insert({
    mail_id: mail.id,
    sent_by: userData.user.id,
    to_address: to,
    subject,
    body,
    brevo_message_id: messageId,
  });
  await admin.rpc('log_admin_action', {
    p_actor: userData.user.id,
    p_action: 'mail_replied',
    p_target_user: null,
    p_reason: subject,
    p_target_type: 'inbound_mail',
    p_target_id: String(mail.id),
    p_metadata: { to },
  });
  if (markHandled) {
    // Avec le jeton de l'administrateur : traité « par » lui.
    await asUser.rpc('admin_handle_inbound_mail', { p_id: mail.id, p_handled: true, p_note: 'Répondu depuis le backoffice' });
  }

  return json({ ok: true, messageId });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
