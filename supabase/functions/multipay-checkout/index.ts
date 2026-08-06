// Initiation d'un paiement via MultiPay (Interswitch Web Checkout RDC).
//
// Flux NAVIGATEUR (choix voulu par l'utilisateur, calqué sur les exemples
// officiels github.com/techquest/integrating-to-ipg) : l'app ouvre la page
// /payer du site Dowe dans un navigateur intégré ; cette page charge
// inline-checkout.js d'Interswitch, où l'utilisateur choisit CARTE ou
// MOBILE MONEY et termine le paiement. Retour vers l'app via multipay-return.
// Doc : https://docs.interswitchgroup.com/docs/web-checkout-drc
//
// Contrat client (apps/mobile/src/lib/payments.ts) :
//   POST { kind: 'coins'|'incognito'|'event', itemId: string,
//          operator?: 'airtel'|'orange'|'vodacom', phone?: '+2438XXXXXXXX' }
//   ('event' : itemId = id de la soirée, le prix est lu dans la base)
//   L'opérateur et le numéro sont obligatoires pour un achat de boutique et
//   tolérés absents pour une entrée en soirée — mais l'app les envoie dans les
//   deux cas : un cust_mobile_no vide fait refuser la transaction chez
//   Interswitch (« Incorrect Transaction »), et apps/web/payer.html omet
//   désormais le champ plutôt que de l'envoyer vide.
//   -> 200 { reference, checkoutUrl }
//        reference   : txn_ref de la commande (suivi du statut)
//        checkoutUrl : page /payer du site Dowe, à ouvrir dans un navigateur
//   -> 501 { error: 'multipay_not_configured' } en LIVE sans clés marchand
//
// Modes :
// - TEST : marchand sandbox de la doc par défaut, cartes de test Interswitch.
//   multipay-return simule en plus une approbation ~20 s après création de la
//   commande pour que le parcours Expo passe de bout en bout.
// - LIVE : supabase secrets set MULTIPAY_MODE=LIVE MULTIPAY_MERCHANT_CODE=...
//   MULTIPAY_PAY_ITEM_ID=... ; vérification réelle via gettransaction.json.
//
// Règles :
// - Les montants sont définis ICI (jamais envoyés par le client). Pour une
//   soirée, le prix est relu dans la table events, jamais dans la requête.
// - Le crédit (ou l'accès à la soirée) n'arrive JAMAIS d'ici : uniquement via
//   multipay-return, après vérification serveur de la transaction chez
//   Interswitch.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODE = (Deno.env.get('MULTIPAY_MODE') ?? 'TEST').toUpperCase();
const MERCHANT_CODE =
  Deno.env.get('MULTIPAY_MERCHANT_CODE') ?? (MODE === 'TEST' ? 'MX228251' : '');
const PAY_ITEM_ID =
  Deno.env.get('MULTIPAY_PAY_ITEM_ID') ?? (MODE === 'TEST' ? 'Default_Payable_MX228251' : '');

// Site web Dowe (Vercel) : héberge la page /payer qui charge le checkout
// Interswitch. Une fonction Edge ne peut pas servir de HTML depuis
// *.supabase.co (forcé en text/plain), d'où cette page externe.
const WEB_BASE = Deno.env.get('MULTIPAY_WEB_BASE') ?? 'https://dowe-eight.vercel.app';

// Montants en francs congolais, source de vérité serveur.
// Doit rester synchronisé avec COIN_PACKS et INCOGNITO_PLANS
// (apps/mobile/src/config/economy.ts), qui ne sont qu'un affichage.
//
// Ces montants intègrent les 3 % prélevés par MultiPay sur chaque
// transaction : ils sont calés pour qu'APRÈS commission il reste la grille
// d'origine (4 300 / 12 900 / 21 500 / 42 900 CDF pour les packs,
// 107 500 / 172 000 / 279 000 pour l'abonnement).
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
  // un règlement par carte seule sans casser la fonction.
  const needsOperator = body.kind !== 'event';
  if (needsOperator) {
    if (!body.operator || !OPERATORS.has(body.operator)) {
      return json({ error: 'unknown_operator' }, 400);
    }
    if (!body.phone || !/^\+243[89]\d{8}$/.test(body.phone)) {
      return json({ error: 'invalid_phone' }, 400);
    }
  }

  if (!MERCHANT_CODE || !PAY_ITEM_ID) {
    // LIVE demandé mais clés marchand absentes : l'app affiche « bientôt ».
    return json({ error: 'multipay_not_configured' }, 501);
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

  return json({
    reference: txnRef,
    checkoutUrl: `${WEB_BASE}/payer?ref=${txnRef}`,
  });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', Connection: 'keep-alive' },
  });
}
