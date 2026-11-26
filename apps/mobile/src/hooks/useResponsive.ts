import { useWindowDimensions } from 'react-native';

// Repères de taille d'écran, communs à toute l'app. Les écrans sont dessinés
// pour un téléphone de 390 points de large (iPhone 14, gros Android). En
// dessous de 360 (petits Android, iPhone SE), certaines mises en page se
// resserrent ; au-dessus de 600 (tablette), le contenu reste une colonne
// centrée plutôt que de s'étirer.
//
// `size(n)` met une dimension à l'échelle de l'écran, bornée pour qu'un
// élément ne devienne jamais minuscule sur un petit téléphone ni démesuré sur
// une tablette.
export function useResponsive() {
  const { width, height, fontScale } = useWindowDimensions();
  const scale = Math.min(Math.max(width / 390, 0.82), 1.12);
  return {
    width,
    height,
    // Grand texte réglé dans le téléphone : on laisse plus de place au texte.
    largeText: fontScale > 1.15,
    compact: width < 360,
    short: height < 700,
    tablet: width >= 600,
    size: (n: number) => Math.round(n * scale),
  };
}
