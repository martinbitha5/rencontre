// Signal « les pastilles ne sont plus à jour », sans aucune dépendance : le
// service api peut l'émettre (après avoir marqué des messages lus) sans
// importer badgeSignal, qui lui-même importe api.
const listeners = new Set<() => void>();

export function notifyBadgesStale(): void {
  for (const cb of listeners) cb();
}

export function onBadgesStale(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
