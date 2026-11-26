// Compteur de la page d'accueil (migration 061, fonction public_counter).
// Avant le lancement : personnes en liste d'attente. Après : comptes créés.
// Le mode se change dans la base (site_settings.counter_mode), pas ici.
import { SUPABASE_URL, SUPABASE_KEY } from './supabase-public.js';

export async function fetchCounter() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/public_counter', {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) throw new Error('public_counter a répondu ' + res.status);
  const data = await res.json();
  return { mode: data.mode === 'members' ? 'members' : 'waitlist', count: Number(data.count) || 0 };
}

export function counterLabel({ mode, count }) {
  const many = count > 1;
  if (mode === 'members') return many ? 'personnes déjà inscrites sur Zola' : 'personne déjà inscrite sur Zola';
  return many ? 'personnes attendent déjà Zola' : 'personne attend déjà Zola';
}

export const formatCount = (n) => new Intl.NumberFormat('fr-FR').format(n);
