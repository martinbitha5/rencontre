// Remplace InteractionManager.runAfterInteractions, supprimé de React Native
// 0.88 (y accéder lève une erreur en développement, renvoie undefined en
// production : le chat et la liste des matchs plantaient à l'ouverture).
//
// Même contrat : la tâche part une fois l'écran posé, quand le thread JS
// respire, et { cancel } l'annule si l'écran est quitté avant.
type Idle = (cb: () => void, opts?: { timeout?: number }) => number;
type CancelIdle = (id: number) => void;

export function afterInteractions(task: () => void): { cancel: () => void } {
  const g = globalThis as unknown as { requestIdleCallback?: Idle; cancelIdleCallback?: CancelIdle };
  if (typeof g.requestIdleCallback === 'function') {
    // Délai maximal : même sous charge, la tâche finit par partir.
    const id = g.requestIdleCallback(task, { timeout: 500 });
    return { cancel: () => g.cancelIdleCallback?.(id) };
  }
  const id = setTimeout(task, 0);
  return { cancel: () => clearTimeout(id) };
}
