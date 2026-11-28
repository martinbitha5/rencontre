// Initiation d'un paiement Mobile Money via pawaPay (API Merchant v2), pour
// les deux Congo : RDC (COD, CDF, Airtel / Orange / M-Pesa) et
// Congo-Brazzaville (COG, XAF, MTN / Airtel).
//
// Remplace multipay-checkout depuis le 27/11/2026. Même contrat client, même
// chaîne de confiance : cette fonction INITIE seulement. Le droit acheté
// (pièces, Incognito, entrée en soirée) n'est accordé que par pawapay-return,
// après revérification du dépôt chez pawaPay (GET /v2/deposits/{depositId}).
//
// DEUX RAILS :
//
// 1. DÉPÔT DIRECT (POST /v2/deposits). L'app a fait choisir l'opérateur et
//    saisir le numéro : pawaPay envoie la demande de confirmation (code PIN)
//    directement sur le téléphone. Les trois opérateurs RDC sont en
//    PROVIDER_AUTH, aucun code de pré-autorisation n'est demandé.
// 2. PAGE DE PAIEMENT HÉBERGÉE (POST /v2/paymentpage). Quand l'app n'envoie
//    ni opérateur ni numéro (entrée en soirée), on renvoie l'adresse de la
//    page pawaPay : le client y choisit son opérateur et son numéro. Au
//    retour, pawaPay redirige vers pawapay-return, qui revérifie puis renvoie
//    vers /paiement-retour sur le site.
//
// Contrat client (apps/mobile/src/services/payments.ts) :
//   POST { kind: 'coins'|'incognito'|'event', itemId, operator?, phone?, idempotencyKey }
//   -> 200 { reference, pushed: true }       dépôt parti sur le téléphone
//   -> 200 { reference, checkoutUrl }        page pawaPay à ouvrir
//   -> 409 { error: 'attempt_expired' }      page d'une tentative précédente
//                                            périmée : nouvelle clé à générer
//   -> 501 { error: 'pawapay_not_configured' }
//
// Configuration (environnement d'abord, puis Vault via public.pawapay_config) :
//   PAWAPAY_MODE       SANDBOX (défaut) ou LIVE
//   PAWAPAY_API_TOKEN  jeton du tableau de bord pawaPay de l'environnement choisi
//   PAWAPAY_WEB_BASE   site Zola (défaut https://zola-rdc.com)
//
// Doc : https://docs.pawapay.io/v2/docs/how_to_start
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// --- Configuration pawaPay -------------------------------------------------
// Répété dans chaque fonction pawapay-*, comme pour multipay-* : un module
// partagé casse au bundling, et sur le chemin de l'argent une duplication
// coûte moins cher qu'une dépendance de déploiement fragile.
type PawapayConfig = Record<string, string>;
let configCache: PawapayConfig | null = null;

async function loadConfig(admin: SupabaseClient): Promise<PawapayConfig> {
  if (configCache) return configCache;
  const { data, error } = await admin.rpc('pawapay_config');
  if (error) {
    console.error('pawapay_config injoignable', error);
    configCache = {};
  } else {
    configCache = (data ?? {}) as PawapayConfig;
  }
  return configCache;
}

function setting(config: PawapayConfig, key: string, fallback = ''): string {
  return Deno.env.get(key) ?? config[key] ?? fallback;
}

interface Settings {
  mode: 'SANDBOX' | 'LIVE';
  apiBase: string;
  token: string;
  webBase: string;
}

function resolveSettings(config: PawapayConfig): Settings {
  const mode = setting(config, 'PAWAPAY_MODE', 'SANDBOX').toUpperCase() === 'LIVE'
    ? 'LIVE'
    : 'SANDBOX';
  return {
    mode,
    apiBase: mode === 'LIVE' ? 'https://api.pawapay.io' : 'https://api.sandbox.pawapay.io',
    token: setting(config, 'PAWAPAY_API_TOKEN'),
    webBase: setting(config, 'PAWAPAY_WEB_BASE', 'https://zola-rdc.com'),
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// --- Pays ------------------------------------------------------------------
// Le pays d'un paiement se déduit du numéro (+243 / +242) pour un achat de
// boutique, et de la devise de la soirée pour une entrée. Jamais d'un champ
// libre envoyé par le client.
type Currency = 'CDF' | 'XAF';

interface Country {
  code: 'COD' | 'COG';
  currency: Currency;
  phone: RegExp;
  // Nos identifiants d'opérateur -> codes fournisseur pawaPay.
  providers: Record<string, string>;
}

const COUNTRIES: Record<Currency, Country> = {
  CDF: {
    code: 'COD',
    currency: 'CDF',
    phone: /^\+243[89]\d{8}$/,
    providers: { airtel: 'AIRTEL_COD', orange: 'ORANGE_COD', vodacom: 'VODACOM_MPESA_COD' },
  },
  XAF: {
    code: 'COG',
    currency: 'XAF',
    // Mobiles du Congo : 9 chiffres commençant par 0 (04/05 Airtel, 06 MTN).
    phone: /^\+2420[4-6]\d{7}$/,
    providers: { airtel: 'AIRTEL_COG', mtn: 'MTN_MOMO_COG' },
  },
};

function countryOfPhone(phone: string): Country | null {
  if (phone.startsWith('+243')) return COUNTRIES.CDF;
  if (phone.startsWith('+242')) return COUNTRIES.XAF;
  return null;
}

// Montants, source de vérité serveur, dans la devise de chaque pays.
// CDF : identiques à apps/mobile/src/config/economy.ts (affichage). Ils
// intégraient la commission MultiPay de 3 % : à recaler sur la commission
// pawaPay du contrat avant de rouvrir les pièces et Incognito.
// XAF : dérivés des prix en dollars de la même grille (environ 570 XAF pour
// 1 $), arrondis à la centaine. À valider commercialement avant ouverture.
const COIN_PACKS: Record<string, { coins: number; validityDays: number; amount: Record<Currency, number> }> = {
  decouverte: { coins: 800, validityDays: 0, amount: { CDF: 4500, XAF: 1000 } },
  elan: { coins: 3000, validityDays: 0, amount: { CDF: 13300, XAF: 3100 } },
  envol: { coins: 6500, validityDays: 0, amount: { CDF: 22200, XAF: 5100 } },
  prestige: { coins: 20000, validityDays: 30, amount: { CDF: 44300, XAF: 10200 } },
};

const INCOGNITO_PLANS: Record<string, { months: number; amount: Record<Currency, number> }> = {
  '3m': { months: 3, amount: { CDF: 110900, XAF: 25500 } },
  '6m': { months: 6, amount: { CDF: 177400, XAF: 40800 } },
  '12m': { months: 12, amount: { CDF: 287700, XAF: 66300 } },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// La page pawaPay vit 15 minutes. Marge d'une minute.
const PAGE_LIFETIME_MS = 14 * 60 * 1000;

interface Order {
  kind: 'coins' | 'incognito' | 'event';
  itemId: string;
  // Montant dans la devise `currency` (colonne historique amount_cdf).
  amountCdf: number;
  currency: Currency;
  coins?: number;
  validityDays?: number;
  months?: number;
}

type Resolution = { order: Order } | { error: string; status: number };

async function resolveOrder(
  admin: SupabaseClient,
  userId: string,
  kind: string | undefined,
  itemId: string | undefined,
  // Devise imposée par le numéro, pour la boutique. Pour une soirée, c'est
  // l'organisateur qui fixe la devise.
  phoneCurrency: Currency | null,
): Promise<Resolution> {
  if (kind === 'event') {
    if (!itemId || !UUID_RE.test(itemId)) return { error: 'unknown_item', status: 400 };
    // Prix relu dans la base, jamais dans la requête. Mêmes conditions
    // d'ouverture que scan_event().
    const { data: event } = await admin
      .from('events')
      .select('id, price_cdf, currency, is_active, ends_at')
      .eq('id', itemId)
      .maybeSingle<{ id: string; price_cdf: number; currency: Currency; is_active: boolean; ends_at: string | null }>();
    if (!event) return { error: 'unknown_item', status: 400 };
    if (!event.is_active || (event.ends_at && new Date(event.ends_at) < new Date())) {
      return { error: 'event_closed', status: 409 };
    }
    if (event.price_cdf <= 0) return { error: 'event_free', status: 409 };
    const { data: attendee } = await admin
      .from('event_attendees')
      .select('event_id')
      .eq('event_id', event.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (attendee) return { error: 'already_attending', status: 409 };
    const currency: Currency = event.currency === 'XAF' ? 'XAF' : 'CDF';
    // Numéro d'un autre pays que la soirée : pawaPay refuserait le dépôt.
    if (phoneCurrency && phoneCurrency !== currency) return { error: 'wrong_country', status: 400 };
    return { order: { kind: 'event', itemId: event.id, amountCdf: event.price_cdf, currency } };
  }
  const currency: Currency = phoneCurrency ?? 'CDF';
  if (kind === 'incognito') {
    const plan = itemId ? INCOGNITO_PLANS[itemId] : undefined;
    if (!plan) return { error: 'unknown_item', status: 400 };
    return {
      order: { kind: 'incognito', itemId: itemId!, amountCdf: plan.amount[currency], currency, months: plan.months },
    };
  }
  if (kind === 'coins') {
    const pack = itemId ? COIN_PACKS[itemId] : undefined;
    if (!pack) return { error: 'unknown_item', status: 400 };
    return {
      order: {
        kind: 'coins',
        itemId: itemId!,
        amountCdf: pack.amount[currency],
        currency,
        coins: pack.coins,
        validityDays: pack.validityDays,
      },
    };
  }
  return { error: 'unknown_item', status: 400 };
}

// 4 à 22 caractères alphanumériques ou espaces (contrainte pawaPay), affiché
// sur le téléphone du client.
function customerMessage(kind: Order['kind']): string {
  if (kind === 'event') return 'Zola entree soiree';
  if (kind === 'incognito') return 'Zola Incognito';
  return 'Zola pieces';
}

async function pawapay(
  settings: Settings,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ httpStatus: number; data: any } | null> {
  try {
    const res = await fetch(`${settings.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${settings.token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await res.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      console.error('pawapay: réponse illisible', path, res.status, raw.slice(0, 200));
    }
    return { httpStatus: res.status, data };
  } catch (err) {
    console.error('pawapay injoignable', path, err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: { kind?: string; itemId?: string; operator?: string; phone?: string; idempotencyKey?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (!body.idempotencyKey || !/^[a-z0-9_-]{20,100}$/i.test(body.idempotencyKey)) {
    return json({ error: 'invalid_idempotency_key' }, 400);
  }

  // Opérateur et numéro : exigés pour la boutique, facultatifs pour une
  // soirée (la page pawaPay les demande alors elle-même). Validés dès qu'ils
  // sont fournis.
  const needsOperator = body.kind !== 'event';
  let phoneCountry: Country | null = null;
  if (body.phone !== undefined || needsOperator) {
    phoneCountry = body.phone ? countryOfPhone(body.phone) : null;
    if (!body.phone || !phoneCountry || !phoneCountry.phone.test(body.phone)) {
      return json({ error: 'invalid_phone' }, 400);
    }
  }
  if (body.operator !== undefined || needsOperator) {
    // L'opérateur doit exister DANS le pays du numéro (pas d'Orange au
    // Congo-Brazzaville, pas de MTN en RDC).
    if (!body.operator || !phoneCountry || !phoneCountry.providers[body.operator]) {
      return json({ error: 'unknown_operator' }, 400);
    }
  }
  const direct = !!body.operator && !!body.phone;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const auth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData, error: userError } = await auth.auth.getUser();
  if (userError || !userData?.user) return json({ error: 'unauthorized' }, 401);
  const user = userData.user;

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const settings = resolveSettings(await loadConfig(admin));
  if (!settings.token) return json({ error: 'pawapay_not_configured' }, 501);

  const resolved = await resolveOrder(
    admin,
    user.id,
    body.kind,
    body.itemId,
    phoneCountry?.currency ?? null,
  );
  if ('error' in resolved) return json({ error: resolved.error }, resolved.status);
  const order = resolved.order;
  const country = COUNTRIES[order.currency];

  // depositId pawaPay = txn_ref de la commande. UUID v4, non devinable, écrit
  // en base AVANT l'appel à pawaPay (recommandation de la doc).
  const depositId = crypto.randomUUID();

  const { error: insertError } = await admin.from('payment_orders').insert({
    user_id: user.id,
    kind: order.kind,
    item_id: order.itemId,
    amount_cdf: order.amountCdf,
    currency: order.currency,
    coins: order.coins ?? null,
    validity_days: order.validityDays ?? 0,
    months: order.months ?? null,
    operator: body.operator ?? null,
    phone: body.phone ?? null,
    customer_email: user.email ?? null,
    txn_ref: depositId,
    idempotency_key: body.idempotencyKey,
    checkout_method: direct ? 'wallet' : 'browser',
    provider: 'pawapay',
  });

  if (insertError) {
    if (insertError.code === '23505') return replayExisting(admin, user.id, body.idempotencyKey);
    console.error('payment_orders insert failed', insertError);
    return json({ error: 'order_creation_failed' }, 500);
  }

  // --- Rail 1 : dépôt direct sur le téléphone ------------------------------
  if (direct) {
    const res = await pawapay(settings, 'POST', '/v2/deposits', {
      depositId,
      // Montant en unités entières : Vodacom CDF et les deux opérateurs XAF
      // n'acceptent aucune décimale, et nos prix sont des francs ronds.
      amount: String(order.amountCdf),
      currency: order.currency,
      payer: {
        type: 'MMO',
        accountDetails: {
          // pawaPay attend l'indicatif sans « + » : 243XXXXXXXXX.
          phoneNumber: body.phone!.replace(/^\+/, ''),
          provider: country.providers[body.operator!],
        },
      },
      customerMessage: customerMessage(order.kind),
      clientReferenceId: order.kind + ':' + order.itemId,
      metadata: [{ kind: order.kind }, { itemId: order.itemId }],
    });

    const status = res?.data?.status;
    if (res && res.httpStatus >= 200 && res.httpStatus < 300 && (status === 'ACCEPTED' || status === 'DUPLICATE_IGNORED')) {
      return json({ reference: depositId, pushed: true });
    }

    if (res && status === 'REJECTED') {
      // Refus ferme : aucun dépôt n'existe chez pawaPay, la commande est close.
      const code = res.data?.failureReason?.failureCode ?? 'REJECTED';
      await admin
        .from('payment_orders')
        .update({
          status: 'failed',
          response_code: code,
          response_description: res.data?.failureReason?.failureMessage ?? 'Dépôt refusé',
          provider_payload: res.data,
        })
        .eq('txn_ref', depositId)
        .eq('status', 'pending');
      console.error('pawapay deposit rejected', depositId, code);
      return json({ error: rejectionError(code) }, 409);
    }

    // 5xx ou réseau : issue inconnue. On NE ferme PAS la commande ici : un
    // dépôt peut encore apparaître chez pawaPay quelques secondes plus tard,
    // et une commande fermée ne pourrait plus être créditée. Elle reste
    // pending : pawapay-return la créditera si le dépôt aboutit (callback),
    // ou la fermera après 20 minutes de NOT_FOUND.
    const check = await pawapay(settings, 'GET', `/v2/deposits/${depositId}`);
    if (check?.data?.status === 'NOT_FOUND') {
      return json({ error: 'provider_unavailable' }, 503);
    }
    return json({ reference: depositId, pushed: true });
  }

  // --- Rail 2 : page de paiement hébergée ----------------------------------
  const returnUrl = `${supabaseUrl}/functions/v1/pawapay-return?ref=${depositId}`;
  const page = await pawapay(settings, 'POST', '/v2/paymentpage', {
    depositId,
    returnUrl,
    customerMessage: customerMessage(order.kind),
    amountDetails: { amount: String(order.amountCdf), currency: order.currency },
    language: 'FR',
    country: country.code,
    reason: order.kind === 'event' ? 'Entrée en soirée Zola' : 'Achat Zola',
    metadata: [{ kind: order.kind }, { itemId: order.itemId }],
  });
  const redirectUrl = page?.data?.redirectUrl ?? page?.data?.redirectURL;

  // La page répond 201 (Created), pas 200 : vérifié en sandbox le 27/11/2026.
  if (!page || page.httpStatus < 200 || page.httpStatus > 299 || typeof redirectUrl !== 'string') {
    console.error('pawapay paymentpage failed', depositId, page?.httpStatus, JSON.stringify(page?.data)?.slice(0, 300));
    // Aucun dépôt n'existe tant que le client n'a pas validé sur la page :
    // fermer la commande est sans risque.
    await admin
      .from('payment_orders')
      .update({
        status: 'failed',
        response_code: page?.data?.failureReason?.failureCode ?? 'PAYMENT_PAGE_FAILED',
        response_description: 'Page de paiement non créée',
        provider_payload: page?.data ?? null,
      })
      .eq('txn_ref', depositId)
      .eq('status', 'pending');
    return json({ error: 'provider_unavailable' }, 503);
  }

  await admin
    .from('payment_orders')
    .update({ provider_payload: { redirectUrl } })
    .eq('txn_ref', depositId);

  return json({ reference: depositId, checkoutUrl: redirectUrl });
});

// Même clé d'idempotence rejouée (double tap, réseau qui reprend) : on rend
// la même commande, jamais une seconde.
async function replayExisting(admin: SupabaseClient, userId: string, key: string): Promise<Response> {
  const { data: existing } = await admin
    .from('payment_orders')
    .select('txn_ref, checkout_method, status, provider, provider_payload, created_at')
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .maybeSingle<{
      txn_ref: string;
      checkout_method: string;
      status: string;
      provider: string;
      provider_payload: { redirectUrl?: string } | null;
      created_at: string;
    }>();
  if (!existing) return json({ error: 'order_creation_failed' }, 500);

  // Une commande close (ou une ancienne commande MultiPay) ne se rouvre pas :
  // l'app sonde, lit le statut final, puis repart avec une nouvelle clé.
  if (existing.status !== 'pending' || existing.provider !== 'pawapay' || existing.checkout_method !== 'browser') {
    return json({ reference: existing.txn_ref, pushed: true, alreadyStarted: true });
  }
  const url = existing.provider_payload?.redirectUrl;
  const fresh = Date.now() - new Date(existing.created_at).getTime() < PAGE_LIFETIME_MS;
  if (url && fresh) {
    return json({ reference: existing.txn_ref, checkoutUrl: url, alreadyStarted: true });
  }
  // Page périmée : pawaPay exige un nouveau depositId, donc une nouvelle clé.
  return json({ error: 'attempt_expired' }, 409);
}

function rejectionError(code: string): string {
  if (code === 'INVALID_PHONE_NUMBER') return 'invalid_phone';
  if (code === 'PROVIDER_TEMPORARILY_UNAVAILABLE') return 'provider_unavailable';
  if (code === 'AMOUNT_OUT_OF_BOUNDS') return 'amount_out_of_bounds';
  if (code === 'INVALID_PROVIDER') return 'unknown_operator';
  return 'payment_rejected';
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', Connection: 'keep-alive' },
  });
}
