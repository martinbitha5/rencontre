import { useEffect, useState } from 'react';
import { countUnreadNotifications } from '@/services/api';

// Nombre de notifications non lues, partagé par la cloche du Profil et
// l'écran Notifications. Relu à la réception d'un push (LiveSync), au retour
// du réseau et à l'ouverture de l'onglet Profil ; remis à zéro quand l'écran
// Notifications marque tout comme lu.
let unread = 0;
const listeners = new Set<(n: number) => void>();

function set(n: number) {
  unread = n;
  for (const cb of listeners) cb(n);
}

export function refreshUnreadNotices(): void {
  countUnreadNotifications()
    .then(set)
    .catch(() => {});
}

export function clearUnreadNotices(): void {
  set(0);
}

export function useUnreadNotices(): number {
  const [n, setN] = useState(unread);
  useEffect(() => {
    listeners.add(setN);
    return () => {
      listeners.delete(setN);
    };
  }, []);
  return n;
}
