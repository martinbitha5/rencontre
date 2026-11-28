import { useEffect, useState } from 'react';
import { getMyBadges } from '@/services/api';
import { onBadgesStale } from '@/utils/badgeEvents';
import type { Badges } from '@/types';

// Pastilles des onglets, partagées par toute l'app :
//   Discussions : messages non lus des conversations ;
//   Activité    : invitations DM non lues + nouveaux likes + nouvelles vues.
// Les chiffres viennent du serveur (get_my_badges, migration 080), relus au
// démarrage, au retour de l'app au premier plan, à chaque notification push,
// au retour du réseau, et dès qu'un écran signale qu'il a lu quelque chose
// (badgeEvents). Une relecture lente ou ratée garde simplement l'ancien état.

const EMPTY: Badges = { messages: 0, requests: 0, likes: 0, views: 0 };

let current: Badges = EMPTY;
let inFlight: Promise<void> | null = null;
let again = false;
const listeners = new Set<(b: Badges) => void>();

function publish(b: Badges) {
  current = b;
  for (const cb of listeners) cb(b);
}

export function refreshBadges(): void {
  // Une seule lecture à la fois ; une demande arrivée pendant la lecture en
  // déclenche une seconde juste après, pour ne jamais rester sur un état vieux.
  if (inFlight) {
    again = true;
    return;
  }
  inFlight = getMyBadges()
    .then(publish)
    .catch(() => {})
    .finally(() => {
      inFlight = null;
      if (again) {
        again = false;
        refreshBadges();
      }
    });
}

export function resetBadges(): void {
  publish(EMPTY);
}

// Les écrans qui lisent des messages ou ouvrent Likes / Vues préviennent par
// badgeEvents : on relit à ce moment-là.
onBadgesStale(refreshBadges);

export function useBadges(): Badges {
  const [b, setB] = useState(current);
  useEffect(() => {
    listeners.add(setB);
    return () => {
      listeners.delete(setB);
    };
  }, []);
  return b;
}

// Texte d'une pastille d'onglet : rien à zéro, « 99+ » au-delà.
export function badgeLabel(n: number): string | undefined {
  if (n <= 0) return undefined;
  return n > 99 ? '99+' : String(n);
}
