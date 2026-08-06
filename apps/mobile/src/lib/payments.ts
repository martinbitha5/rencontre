import type { MobileMoneyOperator } from '../config/economy';
import { supabase } from './supabase';

// Rail de paiement local (RDC) : MultiPay / Interswitch Web Checkout.
//
// Le client ne fait qu'INITIER le paiement : la fonction Edge
// `multipay-checkout` calcule le vrai montant et crée la commande, puis
// l'utilisateur paie sur la page hébergée Interswitch (checkoutUrl, ouverte
// dans un navigateur intégré), où il choisit carte ou Mobile Money. Ce qui a
// été acheté (pièces, Incognito, ou l'accès à une soirée) est accordé
// UNIQUEMENT côté serveur (`multipay-return`), après revérification de la
// transaction chez Interswitch. Jamais depuis le client. En mode TEST
// (sandbox), le serveur simule en plus une approbation ~20 s après
// l'initiation pour que le parcours passe de bout en bout.
//
// Le rail international (App Store / Google Play) passera par RevenueCat :
// même principe, crédit via webhook.

export type MobileMoneyResult =
  | { status: 'pending'; reference: string; checkoutUrl: string }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

// Ce que le serveur refuse de facturer, avec un message qui a du sens pour
// quelqu'un debout devant une porte plutôt qu'un code brut.
const CHECKOUT_ERRORS: Record<string, string> = {
  event_closed: "Cette soirée vient d'être fermée par l'organisateur.",
  event_free: "L'entrée de cette soirée est libre, il n'y a rien à payer.",
  already_attending: 'Tu es déjà sur la liste de cette soirée.',
  unknown_item: 'Cet article de paiement est introuvable.',
};

export async function initiateMobileMoneyPayment(params: {
  // 'coins' = pack de pièces, 'incognito' = abonnement au mois,
  // 'event' = entrée en soirée (itemId porte l'id de la soirée, et c'est le
  // serveur qui relit le prix dans la base).
  kind: 'coins' | 'incognito' | 'event';
  itemId: string;
  // Inutiles pour une entrée en soirée : le moyen de paiement se choisit sur
  // la page Interswitch, on ne demande pas un numéro pour rien à l'entrée.
  operator?: MobileMoneyOperator;
  phone?: string;
}): Promise<MobileMoneyResult> {
  try {
    const { data, error } = await supabase.functions.invoke('multipay-checkout', {
      body: params,
    });
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
    if (data?.reference && data?.checkoutUrl) {
      return {
        status: 'pending',
        reference: String(data.reference),
        checkoutUrl: String(data.checkoutUrl),
      };
    }
    return { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
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

// Interroge multipay-return en JSON : la fonction revérifie la transaction
// chez Interswitch et crédite si elle vient d'être approuvée (idempotent).
export async function getPaymentStatus(reference: string): Promise<PaymentStatus> {
  try {
    const { data, error } = await supabase.functions.invoke('multipay-return', {
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

// L'utilisateur a refermé le navigateur de paiement sans aller au bout : on
// ferme la commande côté serveur. Elle ne pourra JAMAIS être créditée ensuite
// (seule une commande `pending` peut l'être) — c'est la garantie qu'un
// paiement abandonné ne crédite rien.
export async function cancelPayment(reference: string): Promise<PaymentStatus> {
  try {
    const { data, error } = await supabase.functions.invoke('multipay-return', {
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
  let last: PaymentStatus = 'unknown';
  for (let i = 0; i < tries; i++) {
    last = await getPaymentStatus(reference);
    if (FINAL_STATUSES.includes(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last;
}
