import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

// Économie de données mobiles.
//
// La plupart des gens en RDC paient leurs mégas au forfait : une app qui
// vide le forfait est une app qu'on désinstalle. L'essentiel de l'économie
// est permanent (photos plus légères, miniatures pour les petites images,
// notes vocales compressées, vidéos chargées seulement au toucher). Ce
// réglage ajoute un cran de plus : quand il est actif, l'app ne télécharge
// rien à l'avance (photos des cartes suivantes, rattrapage des miniatures).
//
// Trois modes :
//   - auto (par défaut) : actif sur le réseau mobile, inactif en Wi-Fi ;
//   - on : toujours actif ;
//   - off : jamais actif.

export type DataSaverMode = 'auto' | 'on' | 'off';

const KEY = 'data-saver-mode';

let mode: DataSaverMode = 'auto';
// Réseau mobile, ou réseau signalé coûteux par le système (partage de
// connexion, forfait limité). Inconnu au démarrage : on part du principe
// prudent.
let expensive = true;
const listeners = new Set<() => void>();

function notify() {
  for (const cb of listeners) cb();
}

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === 'on' || v === 'off' || v === 'auto') {
      mode = v;
      notify();
    }
  })
  .catch(() => {});

NetInfo.addEventListener((state) => {
  const next =
    state.type === 'cellular' ||
    state.type === 'unknown' ||
    state.details?.isConnectionExpensive === true;
  if (next !== expensive) {
    expensive = next;
    notify();
  }
});

// Vrai quand l'app doit éviter tout téléchargement non demandé.
export function isSavingData(): boolean {
  return mode === 'on' || (mode === 'auto' && expensive);
}

export function getDataSaverMode(): DataSaverMode {
  return mode;
}

export function setDataSaverMode(next: DataSaverMode): void {
  mode = next;
  AsyncStorage.setItem(KEY, next).catch(() => {});
  notify();
}

export function useDataSaver(): { mode: DataSaverMode; saving: boolean } {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  return { mode, saving: isSavingData() };
}
