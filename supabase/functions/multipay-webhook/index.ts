// Notification serveur à serveur de MultiPay (Interswitch / Quickteller
// Business).
//
// POURQUOI CETTE FONCTION EXISTE
// Jusqu'ici, une commande n'était réglée que si quelqu'un venait la
// réclamer : le navigateur de paiement revenant sur multipay-return, ou
// l'app sondant le statut. Un client qui paie puis tue l'application laisse
// donc une commande `pending` que plus rien ne réveille. En sandbox c'est
// sans conséquence. En production c'est de l'argent encaissé sans
// contrepartie, et c'est au client de s'en plaindre pour qu'on l'apprenne.
// Le webhook renverse ça : c'est MultiPay qui vient nous dire ce qui s'est
// passé, que le téléphone du client soit allumé ou au fond d'une poche.
//
// CE QU'ELLE NE FAIT PAS
// Elle ne crédite rien elle-même. Le crédit a UNE seule porte, et c'est
// multipay-return : la transition pending -> success y est atomique et le
// montant y est revérifié chez Interswitch avant tout octroi. Dupliquer
// cette logique ici, c'est signer un double crédit le jour où l'une des deux
// copies dérive de l'autre. Cette fonction se contente donc d'authentifier
// la notification, d'en extraire la référence, et de frapper à cette porte.
//
// ATTENTION AU CHEMIN EMPRUNTÉ. multipay-return traite tout retour qui n'est
// pas un POST JSON comme une navigation du navigateur de paiement, et un
// retour navigateur sans `done=1` vaut abandon : la commande passerait en
// `cancelled`. Une notification de paiement RÉUSSI annulerait la commande.
// L'appel ci-dessous est donc un POST JSON, et doit le rester.
//
// SIGNATURE (doc Interswitch « Webhooks »)
// Le corps brut est haché en HmacSHA512 avec la clé secrète du tableau de
// bord (Developer Tools > Webhooks > Notification Customization), encodé en
// hexadécimal, et transmis dans l'en-tête X-Interswitch-Signature. Sans clé
// configurée, la fonction refuse tout : une notification non vérifiable vaut
// une notification hostile.
//
// RÉPONSE ATTENDUE
// 200 avec un corps VIDE, sinon Interswitch réessaie jusqu'à cinq fois. On
// s'en sert : 200 quand le message est traité ou sans objet pour nous, 500
// quand c'est notre chaîne qui a flanché et qu'un nouvel essai a du sens.
// Un 401 sur signature invalide n'appelle pas de retentative utile, mais il
// laisse une trace nette dans les journaux plutôt qu'un silence complice.
//
// Doc : https://docs.interswitchgroup.com/v1.1/docs/webhooks
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

const SIGNATURE_HEADER = 'x-interswitch-signature';

// La référence de commande telle que nous l'avons émise dans
// multipay-checkout. Le même motif garde la fonction de reconnaître une
// référence qui ne vient pas de nous.
const REF_RE = /^DOWE[A-Z0-9]{8,}$/;

// Champs susceptibles de porter notre txn_ref dans l'objet `data`. La doc
// nomme `merchantReference` pour la référence du marchand et
// `paymentReference` pour celle d'Interswitch, mais l'ordre d'essai coûte
// moins cher qu'un pari : on retient le premier qui a la forme d'une de nos
// références.
const REF_FIELDS = [
  'merchantReference',
  'paymentReference',
  'transactionReference',
  'transactionreference',
  'txnRef',
  'txn_ref',
];

interface Notification {
  event?: string;
  uuid?: string;
  timestamp?: string;
  data?: Record<string, unknown>;
}

// HmacSHA512 hexadécimal du corps brut.
async function signHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Comparaison à temps constant. Un `===` sur des chaînes s'arrête au premier
// octet qui diffère, et ce temps de réponse se mesure : il laisse deviner la
// signature octet par octet.
function equalsConstantTime(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

// Cherche notre référence de commande dans la charge utile. On ne fait
// confiance qu'à ce qui a la forme attendue : le reste appartient à
// Interswitch, pas à nous.
function extractRef(payload: Notification): string | null {
  const data = payload.data ?? {};
  for (const field of REF_FIELDS) {
    const value = data[field];
    if (typeof value === 'string' && REF_RE.test(value.trim())) {
      return value.trim();
    }
  }
  return null;
}

// Corps vide, comme la doc l'exige.
function ack(status: number): Response {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return ack(405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const config = await loadConfig(admin);
  const webhookSecret = setting(config, 'MULTIPAY_WEBHOOK_SECRET');

  // Pas de clé : on ne peut rien vérifier, donc on n'accepte rien. Répondre
  // 200 ici reviendrait à dire à MultiPay que tout va bien pendant que les
  // paiements s'accumulent sans être crédités.
  if (!webhookSecret) {
    console.error('MULTIPAY_WEBHOOK_SECRET absent : notification refusée');
    return ack(500);
  }

  // Le corps DOIT être lu brut : re-sérialiser le JSON changerait un espace
  // ou un ordre de clés, et la signature ne tomberait plus jamais juste.
  const raw = await req.text();
  const received = req.headers.get(SIGNATURE_HEADER) ?? '';
  if (!received) {
    console.error('notification sans signature');
    return ack(401);
  }

  const expected = await signHex(webhookSecret, raw);
  if (!equalsConstantTime(received.trim().toLowerCase(), expected)) {
    console.error('signature de notification invalide');
    return ack(401);
  }

  let payload: Notification;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Signée mais illisible : rien à rejouer, on accuse réception pour ne pas
    // déclencher cinq retentatives inutiles.
    console.error('notification signée mais illisible');
    return ack(200);
  }

  const ref = extractRef(payload);
  if (!ref) {
    // Notification qui ne concerne aucune de nos commandes (facture, lien de
    // paiement, virement). Elle est authentique, elle n'est simplement pas
    // pour nous.
    console.log('notification sans référence Dowe', payload.event, payload.uuid);
    return ack(200);
  }

  // La porte unique vers le crédit. POST JSON, impérativement : voir l'en-tête
  // de ce fichier. multipay-return revérifie la transaction chez Interswitch
  // et n'accorde rien sur la seule foi de ce message.
  const settleUrl = `${supabaseUrl}/functions/v1/multipay-return`;
  try {
    const res = await fetch(settleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref }),
    });
    // Distinguer ce qui se rejoue de ce qui ne se rejoue pas. Un 404 dit que
    // cette commande n'existe pas chez nous — une notification pour un autre
    // marchand, ou une référence qui n'est pas de notre fait. Cinq
    // retentatives n'y changeront rien, on accuse réception. Seule une panne
    // de notre côté (5xx) mérite qu'Interswitch revienne.
    if (res.status === 404) {
      console.error('notification pour une commande inconnue', ref);
      return ack(200);
    }
    if (!res.ok) {
      console.error('règlement injoignable', ref, res.status);
      return ack(500); // Interswitch réessaiera.
    }
    const settled = await res.json().catch(() => null);
    console.log('notification traitée', payload.event, ref, settled?.status ?? 'inconnu');
    return ack(200);
  } catch (err) {
    console.error('règlement en échec', ref, err);
    return ack(500);
  }
});
