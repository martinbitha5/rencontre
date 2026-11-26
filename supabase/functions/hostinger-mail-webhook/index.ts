// Réception des notifications Hostinger Mail (webhook « message.received »).
//
// Hostinger appelle cette adresse à chaque message reçu sur une boîte du
// domaine, avec le secret du webhook en Authorization: Bearer. On vérifie ce
// secret, on normalise ce qu'on trouve dans la notification (expéditeur,
// destinataires, sujet, date, identifiant), et on range le tout par la RPC
// record_inbound_mail (migration 057), qui classe le message par adresse de
// destination. Le backoffice affiche ensuite la file « Courrier ».
//
// Fonction publique (verify_jwt désactivé) : l'appelant est Hostinger, pas un
// utilisateur, et il ne porte pas de JWT Supabase. L'authentification est le
// secret du webhook, comparé en temps constant.
//
// Format constaté à l'envoi de test du 15/09/2026 (la documentation de l'API
// ne le décrit pas) :
//   { id, event: "message.received", timestamp,
//     data: { mailboxAddress, from: "a@b", to: ["c@d"], cc: [], date (RFC 2822),
//             subject, messageId, plainBody, htmlBody, bodyUrl, attachments } }
// On lit d'abord ces champs-là, avec des replis sur d'autres noms plausibles,
// et on garde le corps brut dans la ligne pour pouvoir affiner sans rien
// perdre. Le texte (plainBody) est conservé en extrait de 2 000 caractères.
//
// Secret : variable d'environnement HOSTINGER_MAIL_WEBHOOK_SECRET d'abord,
// coffre Vault ensuite (public.mail_webhook_config). Sans secret configuré, la
// fonction refuse tout : un webhook non protégé est une porte ouverte à de
// fausses entrées dans la file.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

type Json = Record<string, unknown>;

let secretCache: string | null | undefined;

async function loadSecret(admin: SupabaseClient): Promise<string | null> {
  const fromEnv = Deno.env.get('HOSTINGER_MAIL_WEBHOOK_SECRET');
  if (fromEnv) return fromEnv;
  if (secretCache !== undefined) return secretCache;
  const { data, error } = await admin.rpc('mail_webhook_config');
  if (error) {
    console.error('mail_webhook_config injoignable', error);
    secretCache = null;
  } else {
    const cfg = (data ?? {}) as Record<string, string>;
    secretCache = cfg.HOSTINGER_MAIL_WEBHOOK_SECRET ?? null;
  }
  return secretCache;
}

// Comparaison en temps constant : la longueur de l'écart ne doit pas se
// deviner au chronomètre.
function sameSecret(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

// Une adresse peut arriver sous la forme { name, address }, { email }, ou une
// chaîne « Nom <adresse> ».
function toAddress(v: unknown): { name: string; address: string } | null {
  if (isObject(v)) {
    const address = str(v.address) || str(v.email) || str(v.value);
    if (!address) return null;
    return { name: str(v.name), address };
  }
  if (typeof v === 'string' && v.trim()) {
    const m = v.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
    return m ? { name: m[1].trim(), address: m[2].trim() } : { name: '', address: v.trim() };
  }
  return null;
}

function toAddressList(v: unknown): { name: string; address: string }[] {
  const list = Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
  return list.map(toAddress).filter((a): a is { name: string; address: string } => !!a);
}

// Cherche le bloc « message » dans la notification, à plusieurs profondeurs.
function findMessage(payload: Json): Json {
  const candidates = [payload.message, payload.data, (payload.data as Json | undefined)?.message, payload.payload, payload];
  for (const c of candidates) {
    if (isObject(c) && (c.subject !== undefined || c.from !== undefined || c.uid !== undefined || c.messageId !== undefined)) {
      return c;
    }
  }
  return payload;
}

// Extrait lisible du texte : espaces repliés, 2 000 caractères au plus. Sans
// texte brut, on dépouille le HTML de ses balises, ça suffit pour trier.
function preview(m: Json): string {
  let text = str(m.plainBody) || str(m.text) || str(m.textBody);
  if (!text) {
    const html = str(m.htmlBody) || str(m.html);
    text = html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  }
  return text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2000);
}

function normalize(payload: Json) {
  const m = findMessage(payload);
  const from = toAddress(m.from) ?? toAddress(m.sender);
  const to = [...toAddressList(m.to), ...toAddressList(m.cc)];
  const mailbox =
    str(m.mailboxAddress) || str(payload.mailbox) || str(m.mailbox) ||
    str((payload.data as Json | undefined)?.mailbox) || str(payload.account) || str(m.account);
  return {
    message_id: str(m.messageId) || str(m.message_id) || str(m['message-id']),
    mailbox,
    folder: str(m.path) || str(m.folder) || 'INBOX',
    uid: str(m.uid),
    from_name: from?.name ?? '',
    from_address: from?.address ?? '',
    to_addresses: to.map((a) => a.address),
    subject: str(m.subject),
    received_at: str(m.date) || str(m.receivedAt) || str(payload.timestamp) || str(payload.createdAt),
    in_reply_to: str(m.inReplyTo) || str(m.in_reply_to),
    body_preview: preview(m),
    // Le corps brut sans le HTML ni le texte complet : ils peuvent peser des
    // dizaines de kilo-octets par message, l'extrait ci-dessus suffit.
    raw: { ...payload, data: isObject(payload.data) ? { ...payload.data, htmlBody: undefined, plainBody: undefined } : payload.data },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const secret = await loadSecret(admin);
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!secret || !token || !sameSecret(token, secret)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  if (!isObject(payload)) {
    return json({ error: 'invalid_payload' }, 400);
  }

  // Envoi de test depuis le tableau de bord Hostinger, ou événement d'un autre
  // type : on répond 200 pour que Hostinger considère l'adresse valide, sans
  // rien ranger.
  const event = str(payload.event) || str(payload.type) || str((payload.data as Json | undefined)?.event);
  const mail = normalize(payload);
  const looksLikeMessage = !!(mail.subject || mail.from_address || mail.message_id || mail.uid);
  if ((event && event !== 'message.received') || !looksLikeMessage) {
    console.log('notification ignorée', event || '(sans type)', JSON.stringify(payload).slice(0, 800));
    return json({ status: 'ignored' }, 200);
  }

  const { data, error } = await admin.rpc('record_inbound_mail', { p_mail: mail });
  if (error) {
    console.error('record_inbound_mail en échec', error, JSON.stringify(payload).slice(0, 800));
    // 500 : Hostinger rejouera, et la ligne sera dédoublonnée par message_id.
    return json({ error: 'unavailable' }, 500);
  }
  console.log('courrier rangé', JSON.stringify(data));
  return json({ status: 'ok', ...(data as Json) }, 200);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
