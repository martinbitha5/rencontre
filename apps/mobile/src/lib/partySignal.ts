// Signal en mémoire entre l'écran Scan et l'onglet Rencontres.
//
// Rencontres ne réécoute plus les événements de navigation (chaque passage
// d'onglet relançait une requête). Mais quand un scan de QR vient d'accorder
// l'accès à une soirée, le deck doit basculer immédiatement sur les personnes
// présentes : le scan émet ce signal, Rencontres recharge alors sa soirée en
// cours. C'est le seul cas où un autre écran provoque une requête ici.

type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyPartyAccessChanged(): void {
  listeners.forEach((l) => l());
}

export function onPartyAccessChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
