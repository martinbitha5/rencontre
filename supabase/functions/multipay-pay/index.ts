// Description d'une commande pour la page de paiement (Interswitch RDC).
//
// GET ?ref=<txn_ref> -> JSON avec le montant et les identifiants marchand,
// consommé par la page web /payer (apps/web/payer.html, hébergée sur Vercel)
// qui charge inline-checkout.js d'Interswitch et ouvre le paiement.
//
// Pourquoi une page web séparée : Supabase force en text/plain toute réponse
// HTML servie depuis *.supabase.co (mesure anti-phishing), une fonction Edge
// ne peut donc pas rendre la page de paiement elle-même.
//
// Ce rail n'est plus le rail principal : en LIVE, multipay-checkout pousse la
// demande de paiement directement sur le téléphone du client et cette page
// n'est jamais ouverte. Elle reste le seul rail du mode TEST, et le filet de
// secours si la poussée échoue.
//
// Fonction publique (verify_jwt désactivé) : la référence est non devinable
// et la réponse n'expose que ce que la page de paiement doit afficher. Le
// crédit, lui, n'a lieu que dans multipay-return après vérification serveur.
//
// Doc : https://docs.interswitchgroup.com/docs/web-checkout-drc
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
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

// CDF, code ISO 4217 numérique. Montants envoyés en unités mineures
// (centimes) : amount_cdf * 100.
const CURRENCY_CDF = 976;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'GET') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const ref = new URL(req.url).searchParams.get('ref') ?? '';
  if (!/^DOWE[A-Z0-9]{8,}$/.test(ref)) {
    return json({ error: 'invalid_ref' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const config = await loadConfig(admin);
  const mode = setting(config, 'MULTIPAY_MODE', 'TEST').toUpperCase();
  const merchantCode = setting(config, 'MULTIPAY_MERCHANT_CODE', mode === 'TEST' ? 'MX228251' : '');
  const payItemId = setting(
    config,
    'MULTIPAY_PAY_ITEM_ID',
    mode === 'TEST' ? 'Default_Payable_MX228251' : '',
  );

  // Script du checkout par environnement (doc Interswitch).
  const checkoutJs =
    mode === 'LIVE'
      ? 'https://newwebpay.interswitchng.com/inline-checkout.js'
      : 'https://newwebpay-sandbox.interswitchng.com/inline-checkout.js';

  const { data: order } = await admin
    .from('payment_orders')
    .select('txn_ref, status, amount_cdf, customer_email, phone, user_id')
    .eq('txn_ref', ref)
    .maybeSingle();

  if (!order) {
    return json({ error: 'order_not_found' }, 404);
  }

  return json({
    status: order.status,
    txn_ref: order.txn_ref,
    amount_minor: order.amount_cdf * 100,
    amount_label: String(order.amount_cdf).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' CDF',
    currency: CURRENCY_CDF,
    merchant_code: merchantCode,
    pay_item_id: payItemId,
    mode,
    checkout_js: checkoutJs,
    cust_email: order.customer_email ?? 'client@dowe.app',
    cust_id: order.user_id,
    cust_mobile_no: order.phone ?? '',
    return_url: `${supabaseUrl}/functions/v1/multipay-return?ref=${order.txn_ref}`,
  });
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    },
  });
}
