// L'intro de démarrage (IntroSplash) recouvre l'app pendant environ 1 s. Un
// clavier ouvert pendant ce temps s'affiche PAR-DESSUS l'intro (le clavier
// est une fenêtre système). Les écrans qui veulent ouvrir le clavier tout
// seuls attendent donc la fin de l'intro.
let done = false;
const listeners = new Set<() => void>();

export function markIntroDone() {
  if (done) return;
  done = true;
  for (const cb of listeners) cb();
  listeners.clear();
}

export function onIntroDone(cb: () => void): () => void {
  if (done) {
    cb();
    return () => {};
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}
