// Envoi TEMPORAIRE de l'invitation au test fermé Android (27/11/2026).
//
// POST ?key=... { emails: string[] }
// Pour chaque adresse : un mail par personne via l'API transactionnelle
// Brevo, même clé, même expéditeur et même facture que le mail de bienvenue
// de la liste d'attente (waitlist-join). Le registre public.tester_invites
// (migration 079) empêche tout double envoi : une adresse déjà 'sent' est
// sautée, seules les nouvelles et les échecs partent.
//
// À neutraliser une fois l'envoi terminé.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const KEY = 'd8874c2b1621ce3a4fbe6777cc590c2dfb66';
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const SITE_URL = 'https://zola-rdc.com';
const LOGO_URL = 'https://img.mailinblue.com/11818379/images/rnb/original/6aa5dc2c89731999b7229df2.png';
const TESTING_URL = 'https://play.google.com/apps/testing/com.zolardc.app';
const STORE_URL = 'https://play.google.com/store/apps/details?id=com.zolardc.app';

type Config = Record<string, string>;

async function loadConfig(admin: SupabaseClient): Promise<Config> {
  const { data, error } = await admin.rpc('waitlist_config');
  if (error) {
    console.error('waitlist_config injoignable', error);
    return {};
  }
  return (data ?? {}) as Config;
}

function setting(config: Config, key: string, fallback = ''): string {
  return Deno.env.get(key) ?? config[key] ?? fallback;
}

const SUBJECT = 'Deviens testeur de Zola avant tout le monde';

function step(n: number, title: string, body: string, link?: { href: string; label: string }): string {
  return `
  <tr><td style="padding:0 32px 14px;">
    <table role="presentation" cellspacing="0" cellpadding="0" style="background:#f6f7f9;border-radius:14px;width:100%;">
      <tr><td style="padding:18px 20px;font-size:15px;line-height:1.55;color:#24262a;">
        <strong style="color:#fd267a;">${n}.</strong> <strong style="color:#101113;">${title}</strong><br>
        ${body}
        ${link ? `<br><a href="${link.href}" style="display:inline-block;margin-top:12px;background:#fd267a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 20px;border-radius:999px;">${link.label}</a>` : ''}
      </td></tr>
    </table>
  </td></tr>`;
}

function inviteHtml(): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Zola</title></head>
<body style="margin:0;padding:0;background:#f0f1f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#24262a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f0f1f4;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;">
  <tr><td style="padding:36px 32px 0;text-align:center;">
    <a href="${SITE_URL}" style="text-decoration:none;">
      <img src="${LOGO_URL}" width="72" height="72" alt="Zola" style="display:block;margin:0 auto 12px;width:72px;height:72px;border-radius:18px;border:0;outline:none;">
      <span style="display:block;font-size:20px;font-weight:800;letter-spacing:.14em;color:#101113;">ZOLA</span>
    </a>
  </td></tr>
  <tr><td style="padding:0 32px;"><div style="height:1px;background:#e7e9ee;margin:24px 0 6px;"></div></td></tr>
  <tr><td style="padding:26px 32px 12px;">
    <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:800;color:#101113;">Deviens testeur de Zola avant tout le monde.</h1>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#24262a;">Salut, tu t'es inscrit sur la liste d'attente de Zola sur Android, et on a une bonne nouvelle. L'app est prête, et avant le lancement officiel on cherche nos premiers testeurs. On a pensé à toi.</p>
    <p style="margin:0 0 8px;font-size:16px;line-height:1.6;color:#24262a;">Le principe est simple. Pendant 14 jours, tu utilises Zola comme tu veux, et chaque jour tu confirmes ta présence d'un seul appui dans l'app. Au bout des 14 jours, tu reçois ta récompense de testeur fondateur.</p>
  </td></tr>
  ${step(1, 'Accepte de devenir testeur', "Ouvre ce lien avec le compte Google lié à cette adresse mail, puis appuie sur « Devenir testeur ».", { href: TESTING_URL, label: 'Devenir testeur' })}
  ${step(2, 'Télécharge Zola', "Une fois testeur, installe l'app depuis le Play Store.", { href: STORE_URL, label: 'Télécharger sur Google Play' })}
  ${step(3, 'Confirme ta présence chaque jour', "À chaque ouverture de Zola, une fenêtre te propose de confirmer ta journée. Tu suis ta progression dans Profil, puis Mes atouts. Les jours n'ont pas besoin de se suivre, il en faut 14 au total.")}
  <tr><td style="padding:10px 32px 36px;">
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#24262a;">Ton avis compte. Si quelque chose ne marche pas ou te dérange, réponds simplement à ce mail, on lit tout.</p>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#24262a;">Merci de faire partie des premiers.<br>L'équipe Zola</p>
  </td></tr>
</table>
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
  <tr><td style="padding:20px 12px 0;text-align:center;font-size:12px;line-height:1.6;color:#979eaf;">
    Tu reçois ce mail parce que tu t'es inscrit sur la liste d'attente de Zola. Pour ne plus rien recevoir, écris à <a href="mailto:support@zola-rdc.com?subject=retrait" style="color:#979eaf;">support@zola-rdc.com</a>.<br>
    Zola est un service de Goblaire Ltd, 20 Wenlock Road, Londres N1 7GU, Angleterre.<br>
    <a href="${SITE_URL}" style="color:#979eaf;">zola-rdc.com</a> · <a href="${SITE_URL}/confidentialite" style="color:#979eaf;">Confidentialité</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function inviteText(): string {
  return [
    'Deviens testeur de Zola avant tout le monde.',
    '',
    "Salut, tu t'es inscrit sur la liste d'attente de Zola sur Android, et on a une bonne nouvelle. L'app est prête, et avant le lancement officiel on cherche nos premiers testeurs. On a pensé à toi.",
    '',
    "Le principe est simple. Pendant 14 jours, tu utilises Zola comme tu veux, et chaque jour tu confirmes ta présence d'un seul appui dans l'app. Au bout des 14 jours, tu reçois ta récompense de testeur fondateur.",
    '',
    '1. Accepte de devenir testeur',
    'Ouvre ce lien avec le compte Google lié à cette adresse mail, puis appuie sur « Devenir testeur ».',
    TESTING_URL,
    '',
    '2. Télécharge Zola',
    "Une fois testeur, installe l'app depuis le Play Store.",
    STORE_URL,
    '',
    '3. Confirme ta présence chaque jour',
    "À chaque ouverture de Zola, une fenêtre te propose de confirmer ta journée. Tu suis ta progression dans Profil, puis Mes atouts. Les jours n'ont pas besoin de se suivre, il en faut 14 au total.",
    '',
    'Ton avis compte. Si quelque chose ne marche pas ou te dérange, réponds simplement à ce mail, on lit tout.',
    '',
    'Merci de faire partie des premiers.',
    "L'équipe Zola",
    '',
    "Pour ne plus rien recevoir, écris à support@zola-rdc.com.",
    'Zola est un service de Goblaire Ltd, 20 Wenlock Road, Londres N1 7GU, Angleterre.',
    SITE_URL,
  ].join('\n');
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get('key') !== KEY) return new Response('no', { status: 403 });
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });

  let emails: string[] = [];
  try {
    const body = await req.json();
    emails = Array.isArray(body?.emails) ? body.emails : [];
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 });
  }
  emails = [...new Set(emails.map((e) => String(e).trim().toLowerCase()))]
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const config = await loadConfig(admin);
  const apiKey = setting(config, 'BREVO_API_KEY');
  if (!apiKey) return Response.json({ error: 'brevo_key_missing' }, { status: 500 });
  const senderEmail = setting(config, 'BREVO_SENDER_EMAIL', 'support@zola-rdc.com');
  const senderName = setting(config, 'BREVO_SENDER_NAME', 'Zola');
  const html = inviteHtml();
  const text = inviteText();

  const results: { email: string; result: string }[] = [];
  for (const email of emails) {
    const { data: existing } = await admin
      .from('tester_invites')
      .select('status')
      .eq('email', email)
      .maybeSingle<{ status: string }>();
    if (existing?.status === 'sent' || existing?.status === 'sending') {
      results.push({ email, result: `skipped_${existing.status}` });
      continue;
    }
    // Réserve l'adresse AVANT l'appel à Brevo : deux exécutions en parallèle
    // ne peuvent pas envoyer chacune leur exemplaire.
    if (existing) {
      const { data: claimed } = await admin
        .from('tester_invites')
        .update({ status: 'sending', error: null })
        .eq('email', email)
        .eq('status', 'failed')
        .select('email');
      if (!claimed?.length) {
        results.push({ email, result: 'skipped_race' });
        continue;
      }
    } else {
      const { error: insErr } = await admin.from('tester_invites').insert({ email, status: 'sending' });
      if (insErr) {
        results.push({ email, result: 'skipped_race' });
        continue;
      }
    }

    try {
      const res = await fetch(BREVO_URL, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email }],
          replyTo: { name: 'Support Zola', email: 'support@zola-rdc.com' },
          subject: SUBJECT,
          htmlContent: html,
          textContent: text,
          tags: ['tester-invite'],
          headers: {
            'X-Zola-Kind': 'tester-invite',
            'List-Unsubscribe': '<mailto:support@zola-rdc.com?subject=retrait>',
          },
        }),
      });
      const raw = await res.text();
      if (!res.ok) {
        await admin.from('tester_invites').update({ status: 'failed', error: `${res.status} ${raw.slice(0, 300)}` }).eq('email', email);
        results.push({ email, result: `failed_${res.status}` });
        continue;
      }
      let messageId: string | null = null;
      try {
        messageId = JSON.parse(raw)?.messageId ?? null;
      } catch { /* corps vide */ }
      await admin
        .from('tester_invites')
        .update({ status: 'sent', brevo_message_id: messageId, sent_at: new Date().toISOString() })
        .eq('email', email);
      results.push({ email, result: 'sent' });
    } catch (err) {
      await admin.from('tester_invites').update({ status: 'failed', error: String(err).slice(0, 300) }).eq('email', email);
      results.push({ email, result: 'failed_network' });
    }
  }

  const summary = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.result] = (acc[r.result] ?? 0) + 1;
    return acc;
  }, {});
  return Response.json({ summary, results });
});
