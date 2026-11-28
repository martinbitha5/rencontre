import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MobileMoneyOperator } from '@/config/economy';
import { EVENT_PAYMENTS_ENABLED, PAYMENTS_ENABLED } from '@/config/features';
import { supabase } from '@/services/supabase';

// Mode gratuit (PAYMENTS_ENABLED = false) : aucune de ces fonctions ne touche
// le réseau, sauf pour l'entrée payante d'une soirée quand
// EVENT_PAYMENTS_ENABLED vaut true (paiement sur le web, voir features.ts).
// Les fonctions Edge restent déployées, elles ne sont simplement
// plus sollicitées. Le corps de chaque fonction est conservé tel quel en
// dessous du garde-fou — remettre l'interrupteur à true suffit à tout
// rebrancher, il n'y a rien à réécrire.

// Rail de paiement local (RDC) : pawaPay (depuis le 27/11/2026, MultiPay /
// Interswitch avant ; les fonctions multipay-* restent déployées pour les
// anciennes commandes).
//
// Le client ne fait qu'INITIER le paiement : la fonction Edge
// `pawapay-checkout` calcule le vrai montant et crée la commande. Ensuite,
// deux issues :
//   - `pushed` : opérateur et numéro choisis dans l'app, pawaPay envoie la
//     demande de confirmation directement sur le téléphone. checkoutUrl est
//     null, l'écran affiche « confirme sur ton téléphone » et sonde.
//   - `checkoutUrl` : sans opérateur ni numéro (entrée en soirée), page de
//     paiement hébergée pawaPay à ouvrir dans un navigateur intégré.
// Ce qui a été acheté (pièces, Incognito, ou l'accès à une soirée) est
// accordé UNIQUEMENT côté serveur (`pawapay-return`), après revérification
// du dépôt chez pawaPay. Jamais depuis le client.
//
// Le rail international (App Store / Google Play) passera par RevenueCat :
// même principe, crédit via webhook.

export type MobileMoneyResult =
  // checkoutUrl null : paiement poussé sur le téléphone, rien à ouvrir.
  | {
      status: 'pending';
      reference: string;
      checkoutUrl: string | null;
      alreadyStarted?: boolean;
    }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

// Ce que le serveur refuse de facturer, avec un message qui a du sens pour
// quelqu'un debout devant une porte plutôt qu'un code brut.
const CHECKOUT_ERRORS: Record<string, string> = {
  event_closed: "Cette soirée vient d'être fermée par l'organisateur.",
  event_free: "L'entrée de cette soirée est libre, il n'y a rien à payer.",
  already_attending: 'Tu es déjà sur la liste de cette soirée.',
  unknown_item: 'Cet article de paiement est introuvable.',
  invalid_phone: "Ce numéro n'est pas reconnu par l'opérateur. Vérifie-le puis réessaie.",
  wrong_country: "Ce numéro n'est pas du même pays que la soirée. Utilise un numéro Mobile Money du pays de la soirée.",
  unknown_operator: "Cet opérateur n'est pas disponible dans ce pays.",
  provider_unavailable: "L'opérateur Mobile Money ne répond pas pour l'instant. Réessaie dans un instant.",
  amount_out_of_bounds: 'Ce montant dépasse la limite de ton compte Mobile Money.',
  payment_rejected: "L'opérateur a refusé le paiement. Réessaie ou choisis un autre opérateur.",
};

// Fonctions Edge du rail. Un seul endroit à changer si le fournisseur change.
const CHECKOUT_FUNCTION = 'pawapay-checkout';
const RETURN_FUNCTION = 'pawapay-return';

const idempotencyKeyPromises = new Map<string, Promise<string>>();

function idempotencyStorageKey(userId: string, kind: string, itemId: string): string {
  return `pawapay_attempt:${userId}:${kind}:${itemId}`;
}

async function getIdempotencyKey(userId: string, kind: string, itemId: string): Promise<string> {
  const storageKey = idempotencyStorageKey(userId, kind, itemId);
  const pending = idempotencyKeyPromises.get(storageKey);
  if (pending) return pending;

  const keyPromise = (async () => {
    const savedKey = await AsyncStorage.getItem(storageKey);
    if (savedKey) return savedKey;

    const randomPart = () => Math.random().toString(36).slice(2);
    const key = `${Date.now().toString(36)}_${randomPart()}${randomPart()}${randomPart()}`;
    await AsyncStorage.setItem(storageKey, key);
    return key;
  })();

  idempotencyKeyPromises.set(storageKey, keyPromise);
  try {
    return await keyPromise;
  } finally {
    idempotencyKeyPromises.delete(storageKey);
  }
}

export async function clearMobileMoneyAttempt(kind: string, itemId: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    await AsyncStorage.removeItem(idempotencyStorageKey(userId, kind, itemId));
  } catch {
    // Garder une clé déjà réglée ne peut pas créer un débit supplémentaire.
  }
}

export async function initiateMobileMoneyPayment(params: {
  // 'coins' = pack de pièces, 'incognito' = abonnement au mois,
  // 'event' = entrée en soirée (itemId porte l'id de la soirée, et c'est le
  // serveur qui relit le prix dans la base).
  kind: 'coins' | 'incognito' | 'event';
  itemId: string;
  // Inutiles pour une entrée en soirée : le moyen de paiement se choisit sur
  // la page pawaPay, on ne demande pas un numéro pour rien à l'entrée.
  operator?: MobileMoneyOperator;
  phone?: string;
}): Promise<MobileMoneyResult> {
  // Seule l'entrée en soirée échappe au mode gratuit (EVENT_PAYMENTS_ENABLED).
  const allowed = PAYMENTS_ENABLED || (EVENT_PAYMENTS_ENABLED && params.kind === 'event');
  if (!allowed) return { status: 'unavailable' };
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) {
      return { status: 'error', message: 'Session expirée. Reconnecte-toi puis réessaie.' };
    }
    // Deux essais au plus : une tentative précédente déjà close (échouée,
    // annulée) ou dont la page pawaPay a expiré exige une nouvelle clé, donc
    // une nouvelle commande. Sans ça, la même clé rejouerait indéfiniment une
    // commande morte.
    let attempt = await invokeCheckout(userId, params);
    if (attempt.retry) {
      await clearMobileMoneyAttempt(params.kind, params.itemId);
      attempt = await invokeCheckout(userId, params);
    }
    const { data, error } = attempt;
    if (error) {
      // Fonction pas encore déployée (404) ou intégration pas branchée (501) :
      // l'UI affiche « bientôt disponible » plutôt qu'une erreur brute.
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 404 || status === 501) return { status: 'unavailable' };
      // Pas de statut HTTP = échec réseau : message actionnable.
      if (typeof status !== 'number') {
        return { status: 'error', message: 'Connexion impossible. Vérifie ton réseau et réessaie.' };
      }
      // 409 : la commande est refusée pour une raison métier que le serveur
      // nomme dans le corps de la réponse.
      const body = await readErrorBody(error);
      if (body && CHECKOUT_ERRORS[body]) {
        return { status: 'error', message: CHECKOUT_ERRORS[body] };
      }
      // Raison inconnue : jamais le message technique brut à l'écran.
      return {
        status: 'error',
        message: "Le paiement n'a pas pu démarrer. Réessaie dans un instant.",
      };
    }
    if (data?.reference && data?.pushed === true) {
      return {
        status: 'pending',
        reference: String(data.reference),
        checkoutUrl: null,
        alreadyStarted: data?.alreadyStarted === true,
      };
    }
    if (data?.reference && data?.checkoutUrl) {
      return {
        status: 'pending',
        reference: String(data.reference),
        checkoutUrl: String(data.checkoutUrl),
        alreadyStarted: data?.alreadyStarted === true,
      };
    }
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

const DEAD_ATTEMPT_ERRORS = new Set([
  'invalid_phone',
  'unknown_operator',
  'wrong_country',
  'provider_unavailable',
  'payment_rejected',
  'amount_out_of_bounds',
]);

async function invokeCheckout(
  userId: string,
  params: { kind: string; itemId: string; operator?: string; phone?: string },
): Promise<{ data: any; error: unknown; retry: boolean }> {
  const idempotencyKey = await getIdempotencyKey(userId, params.kind, params.itemId);
  const { data, error } = await supabase.functions.invoke(CHECKOUT_FUNCTION, {
    body: { ...params, idempotencyKey },
  });
  if (error) {
    const code = await readErrorBody(error);
    // Refus définitif de cette tentative (numéro, opérateur, pays, pawaPay
    // indisponible) : la clé est jetée, le prochain appui crée une commande
    // neuve au lieu de rejouer une commande morte. Pas de nouvel essai
    // automatique, c'est à la personne de corriger puis de réappuyer.
    if (code && DEAD_ATTEMPT_ERRORS.has(code)) {
      await clearMobileMoneyAttempt(params.kind, params.itemId);
    }
    return { data, error, retry: code === 'attempt_expired' };
  }
  if (data?.alreadyStarted === true && data?.pushed === true && data?.reference) {
    const status = await getPaymentStatus(String(data.reference));
    if (status === 'failed' || status === 'cancelled') return { data, error, retry: true };
  }
  return { data, error, retry: false };
}

// supabase-js range le corps de la réponse d'erreur dans error.context (une
// Response). On y lit le code d'erreur métier, sans jamais faire échouer
// l'appelant si le corps est absent ou illisible.
async function readErrorBody(error: unknown): Promise<string | null> {
  try {
    const context = (error as { context?: unknown }).context;
    if (!(context instanceof Response)) return null;
    const parsed = await context.clone().json();
    return typeof parsed?.error === 'string' ? parsed.error : null;
  } catch {
    return null;
  }
}

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'cancelled' | 'unknown';

const FINAL_STATUSES: PaymentStatus[] = ['success', 'failed', 'cancelled'];

// Interroge pawapay-return en JSON : la fonction revérifie le dépôt
// chez pawaPay et crédite si elle vient d'être approuvée (idempotent).
export async function getPaymentStatus(reference: string): Promise<PaymentStatus> {
  if (!PAYMENTS_ENABLED && !EVENT_PAYMENTS_ENABLED) return 'unknown';
  try {
    const { data, error } = await supabase.functions.invoke(RETURN_FUNCTION, {
      body: { ref: reference },
    });
    if (error || !data?.status) return 'unknown';
    if (data.status === 'pending' || FINAL_STATUSES.includes(data.status)) {
      return data.status as PaymentStatus;
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// Ferme définitivement une commande : elle ne pourra JAMAIS être créditée
// ensuite, seule une commande `pending` peut l'être.
//
// N'EST PLUS APPELÉE, et ne doit pas le redevenir à la légère. Les écrans
// d'achat s'en servaient dès que le navigateur de paiement se refermait sans
// repasser par l'URL de retour. Or ce retour ne se fait pas toujours en
// production : on fermait donc des commandes que MultiPay annonçait ensuite
// par webhook comme TRANSACTION.COMPLETED, alors que le client avait payé.
//
// Fermer ne protégeait de rien. Le crédit exige déjà que pawapay-return
// revérifie le dépôt chez pawaPay et y retrouve un COMPLETED au
// bon montant : un paiement abandonné n'est pas créditable de toute façon.
//
// Ne l'utiliser que sur une annulation EXPLICITE de l'utilisateur, jamais sur
// une simple fermeture de navigateur.
export async function cancelPayment(reference: string): Promise<PaymentStatus> {
  if (!PAYMENTS_ENABLED && !EVENT_PAYMENTS_ENABLED) return 'unknown';
  try {
    const { data, error } = await supabase.functions.invoke(RETURN_FUNCTION, {
      body: { ref: reference, cancel: true },
    });
    if (error || !data?.status) return 'unknown';
    return data.status as PaymentStatus;
  } catch {
    return 'unknown';
  }
}

// Au retour du navigateur de paiement : sondage espacé (par défaut
// ~2 minutes au total), arrêt au premier statut final.
export async function waitForPaymentSettlement(
  reference: string,
  tries = 30,
  delayMs = 4000,
): Promise<PaymentStatus> {
  // Sans paiement, rien à attendre : on ne lance pas un sondage de 2 minutes.
  if (!PAYMENTS_ENABLED && !EVENT_PAYMENTS_ENABLED) return 'unknown';
  let last: PaymentStatus = 'unknown';
  for (let i = 0; i < tries; i++) {
    last = await getPaymentStatus(reference);
    if (FINAL_STATUSES.includes(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last;
}
