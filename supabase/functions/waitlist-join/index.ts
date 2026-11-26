// Inscription à la liste d'attente du site + e-mail de bienvenue (Brevo).
//
// POST { email, platform? } depuis apps/web/index.html.
//   1. enregistre l'adresse par la RPC join_waitlist (validation, minuscules,
//      doublon silencieux) en service_role ;
//   2. si l'adresse est nouvelle, envoie l'e-mail de confirmation par l'API
//      transactionnelle Brevo, puis note welcome_sent_at.
//
// Fonction publique (verify_jwt désactivé) : n'importe qui peut s'inscrire,
// c'est le but. Ce qu'elle expose est borné : elle ne lit jamais la liste,
// répond la même chose à une adresse nouvelle et à une adresse déjà connue,
// et l'échec de l'e-mail n'annule pas l'inscription (la personne sera prévenue
// à la sortie quoi qu'il arrive, c'est la promesse du site).
//
// Clé Brevo : variable d'environnement BREVO_API_KEY d'abord, coffre Vault
// ensuite (public.waitlist_config, migration 054). Sans clé, l'inscription
// passe et l'e-mail est simplement sauté, avec une ligne de journal.
//
// Doc Brevo : https://developers.brevo.com/reference/sendtransacemail
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const SITE_URL = 'https://zola-rdc.com';
// Icône officielle de l'app (apps/mobile/assets/images/icon.png), déposée
// dans la galerie d'images du compte Brevo : hébergée chez eux, elle ne dépend
// ni d'un déploiement du site ni du géoblocage. Les clients mail qui bloquent
// les images affichent le texte alternatif « Zola ».
const LOGO_URL = 'https://img.mailinblue.com/11818379/images/rnb/original/6aa5dc2c89731999b7229df2.png';

type Config = Record<string, string>;
let configCache: Config | null = null;

async function loadConfig(admin: SupabaseClient): Promise<Config> {
  if (configCache) return configCache;
  const { data, error } = await admin.rpc('waitlist_config');
  if (error) {
    console.error('waitlist_config injoignable', error);
    configCache = {};
  } else {
    configCache = (data ?? {}) as Config;
  }
  return configCache;
}

function setting(config: Config, key: string, fallback = ''): string {
  return Deno.env.get(key) ?? config[key] ?? fallback;
}

// Même facture que les e-mails de code de l'app : tables imbriquées, styles
// en ligne. Seule image : le logo, hébergé chez Brevo (voir LOGO_URL).
function welcomeHtml(platform: string | null): string {
  const device = platform === 'ios' ? "sur l'App Store" : platform === 'android' ? 'sur Google Play' : "sur l'App Store et Google Play";
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
    <h1 style="margin:0 0 14px;font-size:24px;line-height:1.25;font-weight:800;color:#101113;">C'est noté, tu es sur la liste.</h1>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#24262a;">Zola arrive bientôt ${device}. Le jour où l'application est en ligne, tu reçois un seul e-mail de notre part, avec le lien pour la télécharger.</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#24262a;">D'ici là, rien d'autre dans ta boîte : pas de newsletter, pas de relance.</p>
  </td></tr>
  <tr><td style="padding:0 32px 8px;">
    <table role="presentation" cellspacing="0" cellpadding="0" style="background:#ffe1ea;border-radius:14px;width:100%;">
      <tr><td style="padding:18px 20px;font-size:15px;line-height:1.55;color:#24262a;">
        <strong style="color:#101113;">Ce qui t'attend sur Zola</strong><br>
        Des rencontres dans ta ville, avec des gens qui disent ce qu'ils cherchent dès le départ : relation sérieuse, mariage ou amitié. Profils vérifiés, chat en temps réel, et l'essentiel gratuit.
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:20px 32px 36px;">
    <p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#656a78;">Tu n'es pas à l'origine de cette inscription ? Ignore simplement ce message, ton adresse sera retirée sur demande à <a href="mailto:support@zola-rdc.com" style="color:#fd267a;text-decoration:none;">support@zola-rdc.com</a>.</p>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#656a78;">À très vite,<br>L'équipe Zola</p>
  </td></tr>
</table>
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;">
  <tr><td style="padding:20px 12px 0;text-align:center;font-size:12px;line-height:1.6;color:#979eaf;">
    Zola est un service de Goblaire Ltd, 20 Wenlock Road, Londres N1 7GU, Angleterre.<br>
    <a href="${SITE_URL}" style="color:#979eaf;">zola-rdc.com</a> · <a href="${SITE_URL}/confidentialite" style="color:#979eaf;">Confidentialité</a>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function welcomeText(platform: string | null): string {
  const device = platform === 'ios' ? "sur l'App Store" : platform === 'android' ? 'sur Google Play' : "sur l'App Store et Google Play";
  return [
    "C'est noté, tu es sur la liste.",
    '',
    `Zola arrive bientôt ${device}. Le jour où l'application est en ligne, tu reçois un seul e-mail de notre part, avec le lien pour la télécharger.`,
    "D'ici là, rien d'autre dans ta boîte : pas de newsletter, pas de relance.",
    '',
    "Tu n'es pas à l'origine de cette inscription ? Ignore ce message, ton adresse sera retirée sur demande à support@zola-rdc.com.",
    '',
    'À très vite,',
    "L'équipe Zola",
    '',
    'Zola est un service de Goblaire Ltd, 20 Wenlock Road, Londres N1 7GU, Angleterre.',
    SITE_URL,
  ].join('\n');
}

async function sendWelcome(config: Config, email: string, platform: string | null): Promise<boolean> {
  const apiKey = setting(config, 'BREVO_API_KEY');
  if (!apiKey) {
    console.warn('BREVO_API_KEY absente : e-mail de bienvenue sauté pour', email);
    return false;
  }
  const senderEmail = setting(config, 'BREVO_SENDER_EMAIL', 'support@zola-rdc.com');
  const senderName = setting(config, 'BREVO_SENDER_NAME', 'Zola');

  const res = await fetch(BREVO_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email }],
      replyTo: { name: 'Support Zola', email: 'support@zola-rdc.com' },
      subject: "Tu es sur la liste : on te prévient à la sortie de Zola",
      htmlContent: welcomeHtml(platform),
      textContent: welcomeText(platform),
      tags: ['waitlist'],
      // List-Unsubscribe : lu par Apple, Gmail et Outlook comme un signal de
      // sérieux, même sur un transactionnel. La boîte support existe (Hostinger).
      headers: {
        'X-Zola-Kind': 'waitlist-welcome',
        'List-Unsubscribe': '<mailto:support@zola-rdc.com?subject=retrait>',
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Brevo a refusé l\'envoi', res.status, body.slice(0, 500));
    return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let payload: { email?: unknown; platform?: unknown } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const rawPlatform = typeof payload.platform === 'string' ? payload.platform.trim().toLowerCase() : '';
  const platform = rawPlatform === 'ios' || rawPlatform === 'android' ? rawPlatform : null;

  // Premier filtre côté fonction : la RPC revalide de toute façon.
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return json({ status: 'invalid_email' }, 200);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: result, error } = await admin.rpc('join_waitlist', {
    p_email: email,
    p_platform: platform,
    p_source: 'site',
  });
  if (error) {
    console.error('join_waitlist en échec', error);
    return json({ error: 'unavailable' }, 503);
  }
  if (result === 'invalid_email') {
    return json({ status: 'invalid_email' }, 200);
  }

  // Une adresse déjà connue ne reçoit pas un second e-mail : on ne relance
  // pas quelqu'un parce qu'il a rechargé la page. Le site affiche de toute
  // façon la même confirmation dans les deux cas.
  if (result === 'ok') {
    const config = await loadConfig(admin);
    const sent = await sendWelcome(config, email, platform);
    if (sent) {
      const { error: markErr } = await admin.rpc('mark_waitlist_welcome', { p_email: email });
      if (markErr) console.error('mark_waitlist_welcome en échec', markErr);
    }
  }

  return json({ status: 'ok' }, 200);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
