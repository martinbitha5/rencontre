// Qualité du réseau vue par l'app.
//
// Deux sources :
//   1. NetInfo (composant NetworkWatcher) dit si le téléphone a une connexion
//      et si internet répond.
//   2. monitoredFetch, branché sur le client Supabase, mesure les vraies
//      requêtes de l'app. Une requête très lente, ou qui échoue alors que le
//      téléphone se croit connecté, signale un réseau instable. C'est le cas
//      le plus courant sur un réseau mobile chargé : le téléphone affiche des
//      barres, mais rien ne passe.
//
// Les écrans n'écoutent pas ce module directement : NetworkWatcher affiche
// les bandeaux et relance la synchronisation au retour du réseau.

type Signal = 'slow' | 'failed';
type Listener = (s: Signal) => void;

const listeners = new Set<Listener>();

export function onNetworkSignal(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(s: Signal) {
  for (const cb of listeners) cb(s);
}

// Au-delà, une requête est jugée lente. Large, pour ne pas crier au loup sur
// un envoi de photo ou de vidéo, naturellement plus long.
const SLOW_MS = 8000;

function isUpload(init?: RequestInit): boolean {
  const body = init?.body as unknown;
  return (
    !!body &&
    typeof body !== 'string' &&
    !(body instanceof URLSearchParams)
  );
}

export const monitoredFetch: typeof fetch = async (input, init) => {
  const upload = isUpload(init);
  const slowTimer = upload ? null : setTimeout(() => emit('slow'), SLOW_MS);
  try {
    return await fetch(input, init);
  } catch (e) {
    // Une annulation volontaire (écran quitté, délai de l'app) n'est pas un
    // problème de réseau.
    const name = (e as { name?: string })?.name;
    if (name !== 'AbortError') emit('failed');
    throw e;
  } finally {
    if (slowTimer) clearTimeout(slowTimer);
  }
};

// Retour du réseau après une coupure : les écrans qui le souhaitent relisent
// leurs données (le profil est relu par NetworkWatcher).
const reconnectListeners = new Set<() => void>();

export function onReconnect(cb: () => void): () => void {
  reconnectListeners.add(cb);
  return () => reconnectListeners.delete(cb);
}

export function emitReconnect() {
  for (const cb of reconnectListeners) cb();
}
