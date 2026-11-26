import { Image } from 'expo-image';
import type { ImageStyle, StyleProp } from 'react-native';

// Illustrations des gestes de vérification : mains 3D Fluent Emoji de
// Microsoft (licence MIT, teinte Medium-Dark), voir assets/gestures/CREDITS.txt.
// Une image se comprend d'un coup d'oeil, là où une phrase ou un pictogramme
// plat demandait de lire et d'interpréter. Les codes sont ceux de
// draw_gesture() (migration 031).
// Un require() d'image renvoie l'identifiant numérique de l'asset.
const ART: Record<string, number> = {
  main_ouverte: require('../../assets/gestures/main_ouverte.png'),
  pouce_leve: require('../../assets/gestures/pouce_leve.png'),
  signe_v: require('../../assets/gestures/signe_v.png'),
  main_joue: require('../../assets/gestures/main_joue.png'),
  main_sur_tete: require('../../assets/gestures/paume_face.png'),
  trois_doigts: require('../../assets/gestures/trois_doigts.png'),
  index_leve: require('../../assets/gestures/index_leve.png'),
  paume_face: require('../../assets/gestures/paume_face.png'),
};

const FALLBACK = ART.main_ouverte;

export function gestureArt(code: string | null | undefined): number {
  return (code && ART[code]) || FALLBACK;
}

export function GestureImage({
  code,
  size,
  style,
}: {
  code: string | null | undefined;
  size: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={gestureArt(code)}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
