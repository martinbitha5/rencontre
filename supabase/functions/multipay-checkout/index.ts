// Initiation d'un paiement via MultiPay (Interswitch RDC).
//
// DEUX RAILS, dans l'ordre de préférence :
//
// 1. POUSSÉE WALLET DIRECTE (LIVE uniquement). L'app a déjà fait choisir
//    l'opérateur et saisir le numéro : redemander « carte ou mobile money »
//    sur une page web est une étape morte. On appelle donc l'API Wallet
//    Payments (mobile-wallet/initialize) côté serveur : l'opérateur envoie la
//    demande de confirmation directement sur le téléphone du client, aucun
//    navigateur ne s'ouvre, et l'app sonde multipay-return comme avant.
//    Doc : https://docs.interswitchgroup.com/docs/wallet-payments-api-drc
//
// 2. NAVIGATEUR (repli, et rail unique du mode TEST). Page /payer du site
//    Dowe qui charge inline-checkout.js d'Interswitch. En TEST c'est le seul
//    rail possible : la simulation d'approbation de multipay-return repose
//    sur le marqueur done=1 posé par cette page, une poussée directe ne
//    saurait donc jamais être confirmée en sandbox.
//    Doc : https://docs.interswitchgroup.com/docs/web-checkout-drc
//
// Contrat client (apps/mobile/src/services/payments.ts) :
//   POST { kind: 'coins'|'incognito'|'event', itemId: string,
//          operator?: 'airtel'|'orange'|'vodacom', phone?: '+2438XXXXXXXX' }
//   ('event' : itemId = id de la soirée, le prix est lu dans la base)
//   L'opérateur et le numéro sont obligatoires pour un achat de boutique et
//   tolérés absents pour une entrée en soirée — mais l'app les envoie dans
//   les deux cas.
//   -> 200 { reference, pushed: true }
//        La demande de paiement est partie sur le téléphone : rien à ouvrir,
//        l'app affiche « confirme sur ton téléphone » et sonde le statut.
//   -> 200 { reference, checkoutUrl }
//        Rail navigateur : page /payer à ouvrir dans un navigateur intégré.
//   -> 501 { error: 'multipay_not_configured' } en LIVE sans clés marchand
//
// Modes :
// - TEST : marchand sandbox de la doc par défaut, cartes de test Interswitch.
//   multipay-return simule en plus une approbation à la fin du tunnel /payer.
// - LIVE : secrets MULTIPAY_MODE=LIVE MULTIPAY_MERCHANT_CODE=...
//   MULTIPAY_PAY_ITEM_ID=... ; la poussée wallet exige en plus
//   MULTIPAY_CLIENT_ID et MULTIPAY_SECRET_KEY (portail MultiPay, Developer
//   Tools > API/SDK Integration). Sans eux, le rail navigateur prend le
//   relais : on dégrade l'expérience, jamais la disponibilité.
//
// MULTIPAY_WALLET_PUSH (ON par défaut) : interrupteur du rail 1. Posé à OFF
// le 2026-08-21 parce que le provisioning Mobile Money du marchand chez
// Interswitch est incomplet (Z68 systématique, ticket support en cours) :
// TOUS les paiements partent alors vers la page web /payer, quel que soit
// l'opérateur. Remettre ON (ou supprimer le secret du coffre Vault) quand
// Interswitch aura activé les canaux — aucun autre changement requis.
//
// Règles :
// - Les montants sont définis ICI (jamais envoyés par le client). Pour une
//   soirée, le prix est relu dans la table events, jamais dans la requête.
// - Le crédit (ou l'accès à la soirée) n'arrive JAMAIS d'ici : uniquement via
//   multipay-return, après vérification serveur de la transaction chez
//   Interswitch. La poussée wallet n'y change rien : elle INITIE, c'est tout.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// --- Configuration MultiPay ------------------------------------------------
//
// DEUX SOURCES, dans cet ordre : les variables d'environnement de la fonction
// (`supabase secrets set`), puis à défaut le coffre Vault de la base
// (migration 051, fonction public.multipay_config réservée au service_role).
//
// La préséance est délibérée. Les variables d'environnement restent la voie
// conventionnelle, celle qu'un développeur qui reprend le projet cherchera en
// premier ; le coffre n'est là que parce qu'elles ne se posent ni depuis une
// migration ni depuis l'API de gestion, et qu'une étape manuelle sur un rail
// de paiement finit toujours par être celle qu'on oublie. Les poser un jour à
// la CLI reprend la main sans qu'il faille vider le coffre.
//
// Ces vingt lignes sont répétées dans les quatre fonctions multipay-*, et
// c'est voulu : un module partagé ne survit pas au bundler, qui range le point
// d'entrée sous source/ et casse l'import relatif. Sur le chemin de l'argent,
// une dépendance de déploiement fragile coûte plus cher qu'une duplication.
//
// Le cache vaut pour l'instance : une fonction chaude ne relit pas la base à
// chaque paiement. Corollaire — changer une valeur dans le coffre prend effet
// après extinction des instances (quelques minutes), ou tout de suite après un
// redéploiement.
type MultipayConfig = Record<string, string>;

let configCache: MultipayConfig | null = null;

async function loadConfig(admin: SupabaseClient): Promise<MultipayConfig> {
  if (configCache) return configCache;
  const { data, error } = await admin.rpc('multipay_config');
  if (error) {
    console.error('multipay_config injoignable', error);
    configCache = {};
  } else {
    configCache = (data ?? {}) as MultipayConfig;
  }
  return configCache;
}

function setting(config: MultipayConfig, key: string, fallback = ''): string {
  return Deno.env.get(key) ?? config[key] ?? fallback;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Ce dont cette fonction a besoin, résolu une fois par requête depuis
// l'environnement puis le coffre Vault (voir l'en-tete Configuration ci-dessus).
interface Settings {
  mode: string;
  merchantCode: string;
  payItemId: string;
  clientId: string;
  secretKey: string;
  // Rail 1 (poussée wallet) autorisé ? Voir MULTIPAY_WALLET_PUSH en tête.
  walletPush: boolean;
  // Site web Dowe (Vercel) : héberge la page /payer qui charge le checkout
  // Interswitch. Une fonction Edge ne peut pas servir de HTML depuis
  // *.supabase.co (forcé en text/plain), d'où cette page externe.
  webBase: string;
}

function resolveSettings(config: MultipayConfig): Settings {
  const mode = setting(config, 'MULTIPAY_MODE', 'TEST').toUpperCase();
  return {
    mode,
    merchantCode: setting(config, 'MULTIPAY_MERCHANT_CODE', mode === 'TEST' ? 'MX228251' : ''),
    payItemId: setting(
      config,
      'MULTIPAY_PAY_ITEM_ID',
      mode === 'TEST' ? 'Default_Payable_MX228251' : '',
    ),
    // Identifiants API du portail MultiPay. Leur absence n'est pas une erreur :
    // elle renvoie simplement le paiement vers le rail navigateur.
    clientId: setting(config, 'MULTIPAY_CLIENT_ID'),
    secretKey: setting(config, 'MULTIPAY_SECRET_KEY'),
    walletPush: setting(config, 'MULTIPAY_WALLET_PUSH', 'ON').toUpperCase() !== 'OFF',
    webBase: setting(config, 'MULTIPAY_WEB_BASE', 'https://dowe-eight.vercel.app'),
  };
}

// Montants en francs congolais, source de vérité serveur.
// Doit rester synchronisé avec COIN_PACKS et INCOGNITO_PLANS
// (apps/mobile/src/config/economy.ts), qui ne sont qu'un affichage.
//
// Ces montants intègrent les 3 % prélevés par MultiPay sur chaque
// transaction (taux confirmé par courrier du 2026-08-21) : ils sont calés
// pour qu'APRÈS commission il reste la grille d'origine (4 300 / 12 900 /
// 21 500 / 42 900 CDF pour les packs, 107 500 / 172 000 / 279 000 pour
// l'abonnement).
//
// Packs de pièces. validityDays > 0 : pièces périssables, créditées via
// credit_coins(user, coins, 'recharge', validityDays) — elles expirent après
// N jours et sont dépensées avant les pièces permanentes.
const COIN_PACKS: Record<string, { coins: number; amountCdf: number; validityDays: number }> = {
  decouverte: { coins: 800, amountCdf: 4500, validityDays: 0 },
  elan: { coins: 3000, amountCdf: 13300, validityDays: 0 },
  envol: { coins: 6500, amountCdf: 22200, validityDays: 0 },
  prestige: { coins: 20000, amountCdf: 44300, validityDays: 30 },
};

// Abonnement Incognito, crédité via credit_incognito(user, months) :
// un rachat prolonge l'échéance en cours au lieu de l'écraser.
const INCOGNITO_PLANS: Record<string, { months: number; amountCdf: number }> = {
  '3m': { months: 3, amountCdf: 110900 },
  '6m': { months: 6, amountCdf: 177400 },
  '12m': { months: 12, amountCdf: 287700 },
};

const OPERATORS = new Set(['airtel', 'orange', 'vodacom']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// --- Poussée wallet directe (LIVE) -----------------------------------------
//
// Le sandbox wallet existe (ipg-v2.k8.isw.la) mais reste inutile ici : sans
// réseau Mobile Money derrière le marchand de démonstration, la poussée ne
// peut jamais être confirmée, et la simulation TEST vit sur le rail
// navigateur. La poussée est donc strictement LIVE.
// ATTENTION À L'HÔTE. `newwebpay.interswitchng.com` sert le checkout web, pas
// l'API : sur cette route il tente de rendre une page et plante en 500
// (« TypeError: res.render is not a function »). C'est `webpay` qui porte
// l'API, exactement comme pour gettransaction.json. Mesuré le 2026-08-21 sur
// le marchand MDRC190945.
const PASSPORT_URL = 'https://passport.interswitchng.com/passport/oauth/token';
const WALLET_URL =
  'https://webpay.interswitchng.com/collections/api/v2/mobile-wallet/initialize';

// Nos identifiants d'opérateur -> les noms de fournisseur de l'API wallet.
// Vodacom opère M-Pesa en RDC.
const WALLET_PROVIDERS: Record<string, string> = {
  airtel: 'AIRTELMONEY',
  orange: 'ORANGE',
  vodacom: 'MPESA',
};

// Jeton OAuth (client_credentials), mis en cache tant que l'instance est
// chaude : il vaut 24 h, le redemander à chaque paiement serait du gaspillage.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(settings: Settings): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;
  try {
    const res = await fetch(PASSPORT_URL, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(`${settings.clientId}:${settings.secretKey}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
      console.error('passport token refused', res.status);
      return null;
    }
    const data = await res.json();
    if (typeof data?.access_token !== 'string') return null;
    const lifetimeMs = (Number(data.expires_in) || 3600) * 1000;
    // Marge de 5 min : mieux vaut redemander un jeton que présenter un mort.
    cachedToken = { value: data.access_token, expiresAt: Date.now() + lifetimeMs - 300_000 };
    return cachedToken.value;
  } catch (err) {
    console.error('passport unreachable', err);
    return null;
  }
}

// Envoie la demande de paiement sur le téléphone du client. Retourne true si
// la poussée est partie — et SEULEMENT ça : la confirmation, le montant et le
// crédit restent l'affaire de multipay-return.
async function pushWalletPayment(
  settings: Settings,
  order: Order,
  txnRef: string,
  operator: string,
  phone: string,
): Promise<boolean> {
  const provider = WALLET_PROVIDERS[operator];
  if (!provider) return false;

  const token = await getAccessToken(settings);
  if (!token) return false;

  // MultiPay attend le numéro NATIONAL nu, sans indicatif ni zéro :
  // 0827241919 (saisie app) -> +243827241919 (stockage) -> 827241919 (envoyé).
  // L'API le renormalise ensuite en 0827241919 dans sa réponse (peerId).
  const msisdn = phone.replace(/^\+243/, '');

  try {
    const res = await fetch(WALLET_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchant_code: settings.merchantCode,
        pay_item_id: settings.payItemId,
        txn_ref: txnRef,
        order_id: txnRef,
        // Unités mineures (centimes de CDF), comme partout ailleurs sur la
        // plateforme. VÉRIFIÉ le 2026-08-21 par l'écho de l'initialize :
        // Interswitch divise lui-même par 100 avant l'opérateur — 1330000
        // envoyé ici devient « Amount: 13300.00 » dans la demande transmise à
        // Vodacom. Envoyer des francs entiers ferait payer UN CENTIÈME du
        // prix : ne « corrige » jamais cette ligne sans refaire la sonde.
        order_amount: String(order.amountCdf * 100),
        order_currency: 'CDF',
        currency: '976',
        customer_mobile_number: msisdn,
        mobile_wallet_provider: provider,
        merchant_country: 'CD',
      }),
    });
    // Le corps est lu en texte d'abord : quand l'appel part sur le mauvais
    // hôte, Interswitch répond une page HTML d'erreur et un .json() muet
    // masquerait la seule information utile.
    const raw = await res.text();
    if (!res.ok) {
      console.error('wallet initialize refused', txnRef, res.status, raw.slice(0, 300));
      return false;
    }
    let status = '';
    try {
      status = JSON.parse(raw)?.data?.status ?? '';
    } catch {
      console.error('wallet initialize: reponse illisible', txnRef, raw.slice(0, 200));
      return false;
    }
    console.log('wallet push sent', txnRef, provider, status);
    return true;
  } catch (err) {
    console.error('wallet initialize unreachable', txnRef, err);
    return false;
  }
}

interface Order {
  kind: 'coins' | 'incognito' | 'event';
  itemId: string;
  amountCdf: number;
  // Ce que multipay-return devra accorder à la confirmation.
  coins?: number;
  validityDays?: number;
  months?: number;
}

// Résolution d'une commande. Retourne un code d'erreur plutôt qu'un null
// indifférencié : une soirée fermée et un pack inconnu ne se disent pas de la
// même façon à l'utilisateur, qui est debout devant une porte.
type Resolution = { order: Order } | { error: string; status: number };

async function resolveOrder(
  admin: SupabaseClient,
  userId: string,
  kind?: string,
  itemId?: string,
): Promise<Resolution> {
  if (kind === 'event') {
    if (!itemId || !UUID_RE.test(itemId)) return { error: 'unknown_item', status: 400 };

    // Le prix vient de la base, jamais du client. Les conditions d'ouverture
    // sont exactement celles de scan_event() : un QR qui vient d'être scanné
    // avec succès peut avoir été fermé entre-temps.
    const { data: event } = await admin
      .from('events')
      .select('id, price_cdf, is_active, ends_at')
      .eq('id', itemId)
      .maybeSingle<{ id: string; price_cdf: number; is_active: boolean; ends_at: string | null }>();

    if (!event) return { error: 'unknown_item', status: 400 };
    if (!event.is_active || (event.ends_at && new Date(event.ends_at) < new Date())) {
      return { error: 'event_closed', status: 409 };
    }
    if (event.price_cdf <= 0) return { error: 'event_free', status: 409 };

    // Déjà sur la liste : l'entrée est acquise, on ne fait pas payer deux fois.
    const { data: attendee } = await admin
      .from('event_attendees')
      .select('event_id')
      .eq('event_id', event.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (attendee) return { error: 'already_attending', status: 409 };

    return { order: { kind: 'event', itemId: event.id, amountCdf: event.price_cdf } };
  }

  if (kind === 'incognito') {
    const plan = itemId ? INCOGNITO_PLANS[itemId] : undefined;
    if (!plan) return { error: 'unknown_item', status: 400 };
    return {
      order: { kind: 'incognito', itemId, amountCdf: plan.amountCdf, months: plan.months },
    };
  }

  if (kind === 'coins') {
    const pack = itemId ? COIN_PACKS[itemId] : undefined;
    if (!pack) return { error: 'unknown_item', status: 400 };
    return {
      order: {
        kind: 'coins',
        itemId,
        amountCdf: pack.amountCdf,
        coins: pack.coins,
        validityDays: pack.validityDays,
      },
    };
  }

  return { error: 'unknown_item', status: 400 };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let body: { kind?: string; itemId?: string; operator?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  // Opérateur et numéro : exigés pour un achat de boutique, tolérés absents
  // pour une entrée en soirée. Cette tolérance n'est pas une invitation à s'en
  // passer — l'écran Scanner les demande — mais elle laisse la porte ouverte à
  // un règlement par carte seule sans casser la fonction. En revanche, dès
  // qu'ils sont fournis ils sont validés : ils partent tels quels vers l'API
  // wallet en LIVE.
  const needsOperator = body.kind !== 'event';
  if (body.operator !== undefined || needsOperator) {
    if (!body.operator || !OPERATORS.has(body.operator)) {
      return json({ error: 'unknown_operator' }, 400);
    }
  }
  if (body.phone !== undefined || needsOperator) {
    if (!body.phone || !/^\+243[89]\d{8}$/.test(body.phone)) {
      return json({ error: 'invalid_phone' }, 400);
    }
  }

  // Utilisateur authentifié : la commande lui appartient, l'achat ira à lui.
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const auth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: userData, error: userError } = await auth.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: 'unauthorized' }, 401);
  }
  const user = userData.user;

  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const settings = resolveSettings(await loadConfig(admin));

  if (!settings.merchantCode || !settings.payItemId) {
    // LIVE demandé mais clés marchand absentes : l'app affiche « bientôt ».
    return json({ error: 'multipay_not_configured' }, 501);
  }

  const resolved = await resolveOrder(admin, user.id, body.kind, body.itemId);
  if ('error' in resolved) return json({ error: resolved.error }, resolved.status);
  const order = resolved.order;

  // Référence de transaction : unique et non devinable (elle sert aussi de
  // clé de consultation du statut côté client).
  const txnRef = 'DOWE' + crypto.randomUUID().replace(/-/g, '').slice(0, 24).toUpperCase();

  const { error: insertError } = await admin.from('payment_orders').insert({
    user_id: user.id,
    kind: order.kind,
    item_id: order.itemId,
    amount_cdf: order.amountCdf,
    coins: order.coins ?? null,
    validity_days: order.validityDays ?? 0,
    months: order.months ?? null,
    operator: body.operator ?? null,
    phone: body.phone ?? null,
    customer_email: user.email ?? null,
    txn_ref: txnRef,
  });
  if (insertError) {
    console.error('payment_orders insert failed', insertError);
    return json({ error: 'order_creation_failed' }, 500);
  }

  // Rail 1 : poussée directe sur le téléphone. Interrupteur MULTIPAY_WALLET_PUSH
  // ouvert, LIVE seulement, identifiants API présents, et un opérateur + numéro
  // fournis (une entrée en soirée sans eux retombe sur le navigateur). Un échec
  // ici n'est jamais bloquant : la commande existe déjà, le rail navigateur
  // peut toujours la régler.
  if (
    settings.walletPush &&
    settings.mode === 'LIVE' &&
    settings.clientId &&
    settings.secretKey &&
    body.operator &&
    body.phone
  ) {
    const pushed = await pushWalletPayment(settings, order, txnRef, body.operator, body.phone);
    if (pushed) {
      return json({ reference: txnRef, pushed: true });
    }
    console.error('wallet push failed, falling back to browser checkout', txnRef);
  }

  // Rail 2 : la page /payer du site Dowe (checkout web Interswitch).
  return json({
    reference: txnRef,
    checkoutUrl: `${settings.webBase}/payer?ref=${txnRef}`,
  });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', Connection: 'keep-alive' },
  });
}
