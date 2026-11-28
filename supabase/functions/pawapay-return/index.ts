// Règlement d'un paiement pawaPay. SEULE porte d'entrée de ce qui s'achète
// (pièces, Incognito, accès à une soirée) pour les commandes provider=pawapay.
//
// Trois appelants, un seul verdict :
//   - l'app, qui sonde en POST JSON { ref } (et { ref, cancel: true } sur
//     annulation explicite) ;
//   - le navigateur, renvoyé ici par la page de paiement pawaPay (GET
//     ?ref=...&depositId=...) : on tranche puis on redirige vers
//     /paiement-retour sur le site ;
//   - pawapay-webhook, qui relaie le callback pawaPay en POST JSON.
//
// Le statut ne vient JAMAIS de l'appelant : il est relu chez pawaPay
// (GET /v2/deposits/{depositId}), et le montant et la devise confirmés sont
// comparés à la commande avant tout crédit. Le règlement passe par la RPC
// settle_payment_order (migration 075) : passage en success ET octroi du droit
// dans UNE transaction Postgres, sous verrou de ligne. Callback, sondage de
// l'app et retour navigateur peuvent arriver en même temps : un seul crédite,
// les autres lisent « déjà réglée ». Rejouable sans double crédit.
//
// Déploiement : sans vérification JWT (le navigateur et le webhook n'en ont
// pas). Le depositId est un UUID v4 non devinable, et cette fonction ne fait
// que demander à pawaPay ce qu'il en est : la sonder ne crédite rien qui
// n'ait été payé.
//
// Doc : https://docs.pawapay.io/v2/api-reference/deposits/check-deposit-status
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// --- Configuration pawaPay (voir pawapay-checkout) -------------------------
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
  apiBase: string;
  token: string;
  webBase: string;
}

function resolveSettings(config: PawapayConfig): Settings {
  const live = setting(config, 'PAWAPAY_MODE', 'SANDBOX').toUpperCase() === 'LIVE';
  return {
    apiBase: live ? 'https://api.pawapay.io' : 'https://api.sandbox.pawapay.io',
    token: setting(config, 'PAWAPAY_API_TOKEN'),
    webBase: setting(config, 'PAWAPAY_WEB_BASE', 'https://zola-rdc.com'),
  };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Un dépôt introuvable chez pawaPay n'est déclaré échoué qu'après ce délai :
// la page hébergée vit 15 minutes, et la doc ne conclut à l'échec que sur
// NOT_FOUND passé ce cap. Marge de 5 minutes sur les horloges.
const NOT_FOUND_FINAL_MS = 20 * 60 * 1000;

type OrderStatus = 'pending' | 'success' | 'failed' | 'cancelled';

interface OrderRow {
  txn_ref: string;
  user_id: string;
  kind: 'coins' | 'incognito' | 'event';
  item_id: string;
  // Montant dans la devise `currency` (colonne historique amount_cdf).
  amount_cdf: number;
  currency: 'CDF' | 'XAF';
  coins: number | null;
  validity_days: number;
  months: number | null;
  status: OrderStatus;
  response_code: string | null;
  provider: string;
  created_at: string;
}

type Lookup =
  | { kind: 'found'; status: string; data: any }
  | { kind: 'not_found' }
  | { kind: 'unreachable' };

async function lookupDeposit(settings: Settings, depositId: string): Promise<Lookup> {
  try {
    const res = await fetch(`${settings.apiBase}/v2/deposits/${depositId}`, {
      headers: { Authorization: `Bearer ${settings.token}` },
    });
    if (!res.ok) {
      console.error('pawapay status refused', depositId, res.status);
      return { kind: 'unreachable' };
    }
    const body = await res.json();
    if (body?.status === 'NOT_FOUND') return { kind: 'not_found' };
    if (body?.status === 'FOUND' && typeof body?.data?.status === 'string') {
      return { kind: 'found', status: body.data.status, data: body.data };
    }
    return { kind: 'unreachable' };
  } catch (err) {
    console.error('pawapay status unreachable', depositId, err);
    return { kind: 'unreachable' };
  }
}

async function closeOrder(
  admin: SupabaseClient,
  order: OrderRow,
  status: 'failed' | 'cancelled',
  code: string,
  description: string,
  payload: unknown = null,
): Promise<OrderRow> {
  await admin
    .from('payment_orders')
    .update({ status, response_code: code, response_description: description, provider_payload: payload })
    .eq('txn_ref', order.txn_ref)
    .eq('status', 'pending');
  return { ...order, status, response_code: code };
}

// Règlement atomique côté base : voir settle_payment_order (migration 075).
// Une erreur de crédit annule toute la transaction, la commande reste pending
// et le prochain passage (callback rejoué, sondage) retente.
async function approveAndCredit(
  admin: SupabaseClient,
  order: OrderRow,
  code: string,
  payload: unknown,
): Promise<OrderRow> {
  const { data, error } = await admin.rpc('settle_payment_order', {
    p_txn_ref: order.txn_ref,
    p_code: code,
    p_description: 'Dépôt confirmé par pawaPay',
    p_payload: payload ?? null,
  });
  if (error) {
    console.error('settle_payment_order failed, order stays pending', order.txn_ref, error);
    return order;
  }
  if (data === 'credited' || data === 'already') return { ...order, status: 'success', response_code: code };
  // not_pending : la commande avait été close entre-temps (failed/cancelled).
  console.error('settle_payment_order refused', order.txn_ref, data);
  const { data: fresh } = await admin
    .from('payment_orders')
    .select('status, response_code')
    .eq('txn_ref', order.txn_ref)
    .maybeSingle<{ status: OrderStatus; response_code: string | null }>();
  return fresh ? { ...order, ...fresh } : order;
}

async function settleOrder(
  admin: SupabaseClient,
  settings: Settings,
  order: OrderRow,
  cancelRequested: boolean,
): Promise<OrderRow> {
  if (order.status !== 'pending') return order;

  const lookup = await lookupDeposit(settings, order.txn_ref);
  const ageMs = Date.now() - new Date(order.created_at).getTime();

  if (lookup.kind === 'unreachable') return order;

  if (lookup.kind === 'not_found') {
    // Rien n'est arrivé chez pawaPay : annuler ou conclure ne fait perdre
    // aucun paiement.
    if (cancelRequested) {
      return closeOrder(admin, order, 'cancelled', 'CANCELLED', 'Paiement annulé avant son terme');
    }
    if (ageMs > NOT_FOUND_FINAL_MS) {
      return closeOrder(admin, order, 'failed', 'NOT_FOUND', 'Paiement non commencé ou expiré');
    }
    return order;
  }

  const data = lookup.data;
  if (lookup.status === 'COMPLETED') {
    // Garde-fou : montant ET devise confirmés doivent être ceux de la commande.
    const amount = Number(data?.amount);
    if (data?.currency !== order.currency || !Number.isFinite(amount) || amount !== order.amount_cdf) {
      console.error('amount mismatch', order.txn_ref, data?.amount, data?.currency, order.amount_cdf);
      return closeOrder(admin, order, 'failed', 'AMOUNT_MISMATCH', 'Montant confirmé différent du montant attendu', data);
    }
    return approveAndCredit(admin, order, 'COMPLETED', data);
  }

  if (lookup.status === 'FAILED') {
    const code = data?.failureReason?.failureCode ?? 'FAILED';
    return closeOrder(
      admin,
      order,
      'failed',
      code,
      data?.failureReason?.failureMessage ?? 'Paiement non abouti',
      data,
    );
  }

  // ACCEPTED, PROCESSING, IN_RECONCILIATION : le client confirme peut-être
  // en ce moment sur son téléphone. Une annulation n'est PAS appliquée ici :
  // elle pourrait détruire un paiement encaissé dans la seconde qui suit.
  await admin
    .from('payment_orders')
    .update({ response_code: lookup.status, provider_payload: data })
    .eq('txn_ref', order.txn_ref)
    .eq('status', 'pending');
  return { ...order, response_code: lookup.status };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  // pawaPay ajoute depositId au returnUrl ; ref est posé par pawapay-checkout.
  let ref = url.searchParams.get('ref') ?? url.searchParams.get('depositId') ?? '';
  const contentType = req.headers.get('content-type') ?? '';
  const wantsJson = req.method === 'POST' && contentType.includes('application/json');
  let cancelRequested = false;

  if (wantsJson) {
    try {
      const body = await req.json();
      if (!ref && typeof body?.ref === 'string') ref = body.ref;
      if (body?.cancel === true) cancelRequested = true;
    } catch {
      // corps vide toléré si ?ref= est présent
    }
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const settings = resolveSettings(await loadConfig(admin));

  if (!UUID_RE.test(ref)) {
    return wantsJson
      ? json({ status: 'unknown', error: 'invalid_ref' }, 400)
      : redirectResult(settings, 'failed', null);
  }

  const { data: order } = await admin
    .from('payment_orders')
    .select(
      'txn_ref, user_id, kind, item_id, amount_cdf, currency, coins, validity_days, months, status, response_code, provider, created_at',
    )
    .eq('txn_ref', ref)
    .eq('provider', 'pawapay')
    .maybeSingle<OrderRow>();

  if (!order) {
    return wantsJson
      ? json({ status: 'unknown', error: 'order_not_found' }, 404)
      : redirectResult(settings, 'failed', null);
  }

  const settled = settings.token ? await settleOrder(admin, settings, order, cancelRequested) : order;

  if (wantsJson) {
    return json({
      status: settled.status,
      code: settled.response_code,
      message:
        settled.status === 'success'
          ? 'Paiement confirmé.'
          : settled.status === 'cancelled'
            ? 'Paiement annulé.'
            : settled.status === 'failed'
              ? 'Paiement refusé.'
              : 'Paiement en attente de confirmation.',
    });
  }
  return redirectResult(settings, settled.status, settled.txn_ref);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', Connection: 'keep-alive' },
  });
}

function redirectResult(settings: Settings, status: OrderStatus, ref: string | null): Response {
  const target = `${settings.webBase}/paiement-retour?status=${status}${ref ? `&ref=${ref}` : ''}`;
  return new Response(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store' } });
}
