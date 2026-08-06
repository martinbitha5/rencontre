// Retour et règlement d'un paiement MultiPay (Interswitch Web Checkout RDC).
//
// C'est la SEULE porte d'entrée de ce qui s'achète : pièces, Incognito, et
// accès à une soirée.
// 1. Interswitch redirige le navigateur ici après le checkout (GET/POST form),
//    et l'app mobile interroge aussi cette fonction en JSON (POST {ref}).
// 2. Le statut ne vient JAMAIS du navigateur : la transaction est revérifiée
//    côté serveur via gettransaction.json (doc « Confirming Transactions »)
//    et le montant retourné est comparé au montant de la commande avant tout
//    crédit.
// 3. La transition pending -> success est atomique, et une commande qui n'est
//    plus pending ne peut plus être créditée : ni rejeu, ni résurrection d'une
//    commande annulée.
//
// ABANDON : un paiement quitté ou annulé ne doit JAMAIS être crédité. Trois
// signaux le disent, et chacun ferme la commande définitivement :
//   - l'app appelle POST { ref, cancel: true } quand l'utilisateur referme le
//     navigateur de paiement sans aller au bout ;
//   - le lien « Annuler » d'Interswitch revient sur ce retour SANS le
//     marqueur done=1 que pose la page /payer à la fin du tunnel ;
//   - le code de réponse remonté vaut Z6 (annulation client) ou Z0.
//
// Mode TEST : le marchand de démonstration n'a pas de réseau Mobile Money
// derrière lui, la vérification réelle ne peut donc pas aboutir. On simule
// l'approbation, mais UNIQUEMENT sur preuve que le tunnel est allé à son
// terme (done=1). Jamais sur un simple délai : c'était le défaut de la
// première version, qui créditait un paiement abandonné.
//
// Réponses :
//   - JSON (POST {ref}) : { status: 'pending'|'success'|'failed'|'cancelled', code, message }
//   - navigateur : redirection 302 vers /paiement-retour sur le site Dowe
//     (Vercel), qui affiche le résultat et renvoie vers l'app (dowe://).
//     Supabase force en text/plain le HTML servi depuis *.supabase.co,
//     cette fonction ne rend donc jamais de page elle-même.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const MODE = (Deno.env.get('MULTIPAY_MODE') ?? 'TEST').toUpperCase();
const MERCHANT_CODE =
  Deno.env.get('MULTIPAY_MERCHANT_CODE') ?? (MODE === 'TEST' ? 'MX228251' : '');

// Endpoint de confirmation (requery). La doc générale donne
// sandbox.interswitchng.com / webpay.interswitchng.com ; l'environnement
// sandbox RDC vit sur newwebpay-sandbox : on essaie dans l'ordre et on
// retient la première réponse exploitable. Surchargable par secret.
const REQUERY_URLS = Deno.env.get('MULTIPAY_REQUERY_URL')
  ? [Deno.env.get('MULTIPAY_REQUERY_URL')!]
  : MODE === 'LIVE'
    ? [
        'https://newwebpay.interswitchng.com/collections/api/v1/gettransaction.json',
        'https://webpay.interswitchng.com/collections/api/v1/gettransaction.json',
      ]
    : [
        'https://newwebpay-sandbox.interswitchng.com/collections/api/v1/gettransaction.json',
        'https://sandbox.interswitchng.com/collections/api/v1/gettransaction.json',
        'https://qa.interswitchng.com/collections/api/v1/gettransaction.json',
      ];

// Codes Interswitch (doc « Payment Response Codes ») :
// 00 approuvé, 10 partiellement approuvé, 11 approuvé VIP.
const SUCCESS_CODES = new Set(['00', '10', '11']);
// Z6 annulation du client, Z0 transaction non menée à terme.
const CANCEL_CODES = new Set(['Z6', 'Z0']);

// La doc fixe la durée de vie d'une transaction à 30 minutes. Tant que la
// fenêtre est ouverte, un code non-succès n'est pas définitif : l'utilisateur
// peut encore confirmer sur son téléphone (Mobile Money) ou retenter sa carte
// dans la même session. Marquer failed trop tôt ferait perdre un paiement
// encaissé après coup. Marge de 5 min sur les horloges.
const FINALITY_WINDOW_MS = 35 * 60 * 1000;

// Page de résultat hébergée sur le site Dowe (Vercel).
const WEB_BASE = Deno.env.get('MULTIPAY_WEB_BASE') ?? 'https://dowe-eight.vercel.app';

type OrderStatus = 'pending' | 'success' | 'failed' | 'cancelled';

interface OrderRow {
  txn_ref: string;
  user_id: string;
  kind: 'coins' | 'incognito' | 'event';
  // Pour une entrée en soirée : l'id de la soirée à débloquer.
  item_id: string;
  amount_cdf: number;
  coins: number | null;
  validity_days: number;
  months: number | null;
  status: OrderStatus;
  response_code: string | null;
  created_at: string;
}

// Ce que le navigateur (ou l'app) rapporte de la session de paiement. Aucun
// de ces signaux ne crédite à lui seul : ils ne servent qu'à savoir si le
// tunnel est allé au bout, ou s'il a été abandonné.
interface Signal {
  completed: boolean;      // done=1 : la page /payer a vu la fin du tunnel
  cancelled: boolean;      // abandon explicite (app) ou retour sans done=1
  reportedCode: string | null;
}

interface Requery {
  ok: boolean;
  code?: string;
  description?: string;
  amountMinor?: number;
  payload?: unknown;
}

async function requeryTransaction(ref: string, amountMinor: number): Promise<Requery> {
  const params = new URLSearchParams({
    merchantcode: MERCHANT_CODE,
    transactionreference: ref,
    amount: String(amountMinor),
  });
  for (const base of REQUERY_URLS) {
    try {
      const res = await fetch(`${base}?${params}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const code = data?.ResponseCode ?? data?.responseCode ?? data?.code;
      if (typeof code !== 'string') continue;
      const amount = Number(data?.Amount ?? data?.amount);
      return {
        ok: true,
        code,
        description: String(
          data?.ResponseDescription ?? data?.responseDescription ?? data?.responseMessage ?? '',
        ),
        amountMinor: Number.isFinite(amount) ? amount : undefined,
        payload: data,
      };
    } catch (err) {
      console.error('requery failed on', base, err);
    }
  }
  return { ok: false };
}

// Ferme une commande sans la créditer. `.eq('status','pending')` garantit
// qu'on ne touche jamais une commande déjà réglée.
async function closeOrder(
  admin: SupabaseClient,
  order: OrderRow,
  status: 'failed' | 'cancelled',
  code: string | null,
  description: string,
  payload: unknown = null,
): Promise<OrderRow> {
  await admin
    .from('payment_orders')
    .update({
      status,
      response_code: code,
      response_description: description,
      provider_payload: payload,
    })
    .eq('txn_ref', order.txn_ref)
    .eq('status', 'pending');
  return { ...order, status, response_code: code };
}

// Passe la commande en success et crédite, en une transition atomique :
// une seule requête gagne le droit de créditer, les autres ne font rien.
async function approveAndCredit(
  admin: SupabaseClient,
  order: OrderRow,
  code: string,
  description: string,
  payload: unknown,
): Promise<OrderRow> {
  const { data: claimed } = await admin
    .from('payment_orders')
    .update({
      status: 'success',
      response_code: code,
      response_description: description,
      provider_payload: payload ?? null,
      credited_at: new Date().toISOString(),
    })
    .eq('txn_ref', order.txn_ref)
    .eq('status', 'pending')
    .select('txn_ref');

  if (claimed && claimed.length === 1) {
    // Ce que la commande achetait : des pièces, du temps d'Incognito, ou
    // l'entrée à une soirée. Dans les trois cas c'est une RPC réservée au
    // service_role qui accorde le droit, jamais le client.
    const { error: creditError } =
      order.kind === 'incognito'
        ? await admin.rpc('credit_incognito', {
            p_user: order.user_id,
            p_months: order.months ?? 1,
          })
        : order.kind === 'event'
          ? await admin.rpc('grant_event_access', {
              p_user: order.user_id,
              p_event: order.item_id,
            })
          : await admin.rpc('credit_coins', {
              p_user: order.user_id,
              p_amount: order.coins ?? 0,
              p_kind: 'recharge',
              p_validity_days: order.validity_days ?? 0,
            });
    if (creditError) {
      // Paiement encaissé mais crédit en échec : on rend la commande pending
      // pour que la prochaine consultation retente le crédit.
      console.error('credit failed, reverting to pending', order.txn_ref, creditError);
      await admin
        .from('payment_orders')
        .update({ status: 'pending', credited_at: null })
        .eq('txn_ref', order.txn_ref);
      return { ...order, status: 'pending', response_code: code };
    }
  }
  return { ...order, status: 'success', response_code: code };
}

// Vérifie la transaction et crédite si (et seulement si) elle est approuvée
// pour le bon montant. Idempotent : rejouable sans double crédit.
async function settleOrder(
  admin: SupabaseClient,
  order: OrderRow,
  signal: Signal,
): Promise<OrderRow> {
  // Une commande déjà réglée, échouée ou annulée est définitive.
  if (order.status !== 'pending') return order;

  // Abandon annoncé : on ferme avant même d'interroger Interswitch.
  if (signal.cancelled) {
    return closeOrder(
      admin,
      order,
      'cancelled',
      signal.reportedCode ?? 'CANCELLED',
      'Paiement annulé avant son terme',
    );
  }
  if (signal.reportedCode && CANCEL_CODES.has(signal.reportedCode)) {
    return closeOrder(
      admin,
      order,
      'cancelled',
      signal.reportedCode,
      'Paiement annulé par le client',
    );
  }

  const amountMinor = order.amount_cdf * 100;
  const ageMs = Date.now() - new Date(order.created_at).getTime();
  const result = await requeryTransaction(order.txn_ref, amountMinor);

  if (result.ok && result.code && SUCCESS_CODES.has(result.code)) {
    // Garde-fou de la doc : le montant confirmé DOIT être celui de la
    // commande. Un écart est traité comme un échec, jamais crédité.
    if (result.amountMinor !== undefined && result.amountMinor !== amountMinor) {
      console.error('amount mismatch', order.txn_ref, result.amountMinor, amountMinor);
      return closeOrder(
        admin,
        order,
        'failed',
        result.code,
        'Montant confirmé différent du montant attendu',
        result.payload,
      );
    }
    return approveAndCredit(
      admin,
      order,
      result.code,
      result.description ?? 'Approuvé',
      result.payload,
    );
  }

  // Sandbox : la vérification réelle ne peut pas aboutir (marchand de démo).
  // On approuve UNIQUEMENT si le tunnel est allé à son terme — jamais sur le
  // simple écoulement du temps, sinon un paiement abandonné serait crédité.
  if (MODE === 'TEST' && signal.completed) {
    return approveAndCredit(
      admin,
      order,
      signal.reportedCode || '00',
      'Approuvé (simulation sandbox TEST)',
      { simulated: true, reportedCode: signal.reportedCode },
    );
  }

  if (!result.ok || !result.code) return order; // Injoignable : on reste pending.

  // Non-succès : on trace le dernier code vu, mais le verdict failed n'est
  // posé qu'une fois la fenêtre de vie de la transaction refermée.
  if (ageMs > FINALITY_WINDOW_MS) {
    return closeOrder(
      admin,
      order,
      'failed',
      result.code,
      result.description ?? 'Paiement non abouti',
      result.payload,
    );
  }
  await admin
    .from('payment_orders')
    .update({
      response_code: result.code,
      response_description: result.description ?? null,
      provider_payload: result.payload ?? null,
    })
    .eq('txn_ref', order.txn_ref)
    .eq('status', 'pending');
  return { ...order, status: 'pending', response_code: result.code };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  // Référence : query (?ref=), JSON ({ ref }) ou formulaire posté par
  // Interswitch (txnref / txn_ref / transactionreference).
  const url = new URL(req.url);
  let ref = url.searchParams.get('ref') ?? '';
  const contentType = req.headers.get('content-type') ?? '';
  // Sondage de l'app : POST JSON. Tout le reste (GET, formulaire posté par
  // Interswitch) est une navigation du navigateur de paiement. La distinction
  // doit être stricte : un sondage pris pour un retour navigateur annulerait
  // un paiement encore en cours.
  const isAppPoll = req.method === 'POST' && contentType.includes('application/json');
  let cancelRequested = false;

  if (isAppPoll) {
    try {
      const body = await req.json();
      if (!ref && typeof body?.ref === 'string') ref = body.ref;
      // L'app signale que l'utilisateur a refermé le navigateur de paiement
      // sans aller au bout.
      if (body?.cancel === true) cancelRequested = true;
    } catch {
      // corps vide toléré si ?ref= est présent
    }
  } else if (req.method === 'POST' && contentType.includes('form')) {
    try {
      const form = await req.formData();
      for (const key of ['txnref', 'txn_ref', 'transactionreference', 'ref']) {
        const value = form.get(key);
        if (!ref && typeof value === 'string') ref = value;
      }
    } catch {
      // idem
    }
  }

  // done=1 est posé par la page /payer à la fin du tunnel. Son absence sur un
  // retour navigateur signe un abandon (lien « Annuler » d'Interswitch, ou
  // retour arrière).
  const completed = url.searchParams.get('done') === '1';
  const wantsJson = isAppPoll;
  const signal: Signal = {
    completed,
    cancelled: cancelRequested || (!isAppPoll && !completed),
    reportedCode: url.searchParams.get('code') || null,
  };

  if (!/^DOWE[A-Z0-9]{8,}$/.test(ref)) {
    return wantsJson
      ? json({ status: 'unknown', error: 'invalid_ref' }, 400)
      : redirectResult('failed', null);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const { data: order } = await admin
    .from('payment_orders')
    .select(
      'txn_ref, user_id, kind, item_id, amount_cdf, coins, validity_days, months, status, response_code, created_at',
    )
    .eq('txn_ref', ref)
    .maybeSingle<OrderRow>();

  if (!order) {
    return wantsJson
      ? json({ status: 'unknown', error: 'order_not_found' }, 404)
      : redirectResult('failed', null);
  }

  const settled = await settleOrder(admin, order, signal);

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

  return redirectResult(settled.status, settled.txn_ref);
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', Connection: 'keep-alive' },
  });
}

function redirectResult(status: OrderStatus, ref: string | null): Response {
  const target = `${WEB_BASE}/paiement-retour?status=${status}${ref ? `&ref=${ref}` : ''}`;
  return new Response(null, {
    status: 302,
    headers: { Location: target, 'Cache-Control': 'no-store' },
  });
}
