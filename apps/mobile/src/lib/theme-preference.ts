import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { Appearance, DevSettings } from 'react-native';
import { isDark } from '../theme';

// Choix de thème : « system » suit le téléphone, « light » et « dark » forcent.
//
// Les StyleSheet de tous les écrans figent leurs couleurs au chargement du
// bundle (voir theme.ts). Appliquer un thème revient donc à poser le schéma
// natif (Appearance.setColorScheme) puis à recharger le bundle : au
// rechargement, theme.ts relit le schéma et exporte la bonne palette.
//
// Au démarrage à froid, le forçage natif n'existe plus : bootThemePreference()
// relit la préférence enregistrée et refait ce même cycle une seule fois,
// derrière l'écran de chargement, avec un garde-fou anti-boucle.

export type ThemePref = 'system' | 'light' | 'dark';

const PREF_KEY = 'dowe-theme-pref';
const BOOT_GUARD_KEY = 'dowe-theme-boot-guard';
const BOOT_GUARD_MS = 30_000;

// Le schéma que l'interface AFFICHE réellement : celui que theme.ts a figé au
// chargement du bundle. C'est la seule référence fiable pour décider d'un
// rechargement — relire Appearance.getColorScheme() juste après un
// setColorScheme renvoie une valeur périmée sur Android (la recréation
// d'activité est asynchrone), et cette comparaison mensongère est exactement
// ce qui rendait le changement de thème inopérant.
const FROZEN_SCHEME: 'light' | 'dark' = isDark ? 'dark' : 'light';

// Court répit laissé au natif entre la pose du schéma et le rechargement :
// recharger trop tôt ferait relire l'ancienne configuration par le nouveau
// bundle, surtout sur Android.
const APPLY_DELAY_MS = 250;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function getThemePref(): Promise<ThemePref> {
  try {
    const v = await AsyncStorage.getItem(PREF_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

async function reloadBundle(): Promise<void> {
  try {
    await Updates.reloadAsync();
  } catch {
    // En développement (Expo Go, dev client), Updates refuse de recharger.
    // DevSettings.reload prend le relais : le thème s'applique immédiatement
    // là aussi, au lieu d'attendre silencieusement le prochain démarrage.
    try {
      DevSettings.reload();
    } catch {
      // Vraiment aucun rechargement possible : prochain démarrage.
    }
  }
}

// Appelée depuis les paramètres quand l'utilisateur choisit un thème.
export async function setThemePref(pref: ThemePref): Promise<void> {
  try {
    await AsyncStorage.setItem(PREF_KEY, pref);
  } catch {}
  Appearance.setColorScheme(pref === 'system' ? null : pref);

  // Thème forcé : la cible est connue d'avance, aucune lecture native à
  // faire. On recharge dès qu'elle diffère de ce que l'écran montre.
  // Choisir « sombre » quand on y est déjà ne fait rien clignoter.
  if (pref !== 'system') {
    if (pref !== FROZEN_SCHEME) {
      await wait(APPLY_DELAY_MS);
      await reloadBundle();
    }
    return;
  }

  // Retour au mode système : l'override vient d'être levé, on laisse le
  // natif retomber sur le schéma du téléphone avant de le lire.
  await wait(APPLY_DELAY_MS);
  const system = Appearance.getColorScheme() ?? 'light';
  if (system !== FROZEN_SCHEME) await reloadBundle();
}

// En mode « système », le téléphone peut changer de thème pendant que l'app
// vit (bascule automatique du soir, réglage rapide...). Ce guetteur recharge
// alors le bundle pour suivre. `frozenScheme` est le schéma que theme.ts a
// figé au chargement : tant que l'effectif lui correspond, rien à faire.
// Un thème forcé pose un override natif : l'effectif ne bouge alors pas, le
// guetteur reste muet.
export function watchSystemTheme(): () => void {
  const sub = Appearance.addChangeListener(() => {
    (async () => {
      const pref = await getThemePref();
      if (pref !== 'system') return;
      const current = Appearance.getColorScheme() ?? 'light';
      if (current !== FROZEN_SCHEME) await reloadBundle();
    })().catch(() => {});
  });
  return () => sub.remove();
}

// Appelée une fois au démarrage, derrière l'écran de chargement.
export async function bootThemePreference(): Promise<void> {
  const pref = await getThemePref();
  if (pref === 'system') return;
  // La comparaison se fait avec ce que le bundle a figé, pas avec une lecture
  // native : même raison que dans setThemePref.
  if (pref === FROZEN_SCHEME) {
    // L'écran est déjà dans le bon thème ; on repose quand même l'override
    // pour que « système » ne reprenne pas la main en cours de session.
    Appearance.setColorScheme(pref);
    return;
  }

  // Garde-fou : si un rechargement récent n'a pas suffi (plateforme qui ne
  // conserve pas le forçage), on n'insiste pas plutôt que de boucler.
  try {
    const last = Number((await AsyncStorage.getItem(BOOT_GUARD_KEY)) ?? 0);
    if (Date.now() - last < BOOT_GUARD_MS) return;
    await AsyncStorage.setItem(BOOT_GUARD_KEY, String(Date.now()));
  } catch {}

  Appearance.setColorScheme(pref);
  await wait(APPLY_DELAY_MS);
  await reloadBundle();
}
