import type { Href } from 'expo-router';

// Retour qui marche toujours. router.back() ne fait rien quand il n'y a pas
// d'écran précédent (arrivée par un lien, une notification, ou après une
// redirection replace() de Gate) : le bouton semblait mort. Dans ce cas on
// ouvre l'écran parent logique à la place.
type BackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: Href) => void;
};

export function safeBack(router: BackRouter, fallback: Href = '/(tabs)') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
