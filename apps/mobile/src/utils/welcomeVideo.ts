import { Asset } from 'expo-asset';

// Vidéo de l'écran d'accueil (non connecté).
//
// Avant, le lecteur recevait directement le require() : en développement
// (Expo Go), iOS lisait alors la vidéo en flux depuis le serveur Metro du PC,
// 4,3 Mo par le Wi-Fi ou le partage de connexion, et l'écran restait sur le
// dégradé plusieurs secondes avant le fondu. On copie maintenant la vidéo
// dans le cache du téléphone dès que l'app sait que personne n'est connecté,
// pendant l'intro animée : le lecteur lit ensuite un fichier local, la
// première image arrive tout de suite. Le cache survit aux redémarrages tant
// que le système ne le vide pas. Dans une vraie build, la vidéo est déjà
// dans l'app : la copie est immédiate.
export const WELCOME_VIDEO = require('../../assets/IMG_1770.mp4');

let pending: Promise<string | null> | null = null;

export function preloadWelcomeVideo(): Promise<string | null> {
  if (!pending) {
    pending = Asset.fromModule(WELCOME_VIDEO)
      .downloadAsync()
      .then((asset) => asset.localUri ?? asset.uri ?? null)
      .catch(() => {
        // Échec (réseau coupé en développement) : on retentera à la
        // prochaine demande, et l'écran lira la vidéo comme avant.
        pending = null;
        return null;
      });
  }
  return pending;
}
