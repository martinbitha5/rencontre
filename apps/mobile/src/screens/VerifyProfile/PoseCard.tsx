import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { GestureImage } from '@/components/GestureArt';
import { VerifiedBadge } from '@/components/ui';
import { flame } from '@/theme';

// Carte « pose à reproduire » : une silhouette sur le dégradé de la marque, et
// la main 3D qui fait le geste, en grand, placée là où elle doit être (à côté
// du visage, sur la joue, au-dessus de la tête). C'est le modèle que la
// personne imite devant la caméra, et qu'on remet à côté de son selfie avant
// l'envoi pour qu'elle compare.

type Placement = 'side' | 'cheek' | 'top';

const PLACES: Record<string, Placement> = {
  main_ouverte: 'side',
  pouce_leve: 'cheek',
  signe_v: 'side',
  main_joue: 'cheek',
  main_sur_tete: 'top',
  trois_doigts: 'side',
  index_leve: 'side',
  paume_face: 'cheek',
};

export function PoseCard({
  gesture,
  width,
  badge = true,
}: {
  gesture: string | null;
  width: number;
  badge?: boolean;
}) {
  const place = (gesture && PLACES[gesture]) || 'side';
  const height = Math.round((width * 4) / 3);
  const head = width * 0.62;
  // La main est l'information : elle est grande, plus que la tête.
  const hand = width * 0.54;
  const handPos =
    place === 'top'
      ? { top: height * 0.0, left: width / 2 - hand / 2 }
      : place === 'cheek'
        ? { top: height * 0.34, right: -width * 0.02 }
        : { top: height * 0.14, left: -width * 0.02 };

  return (
    <View style={[styles.card, { width, height }]}>
      <LinearGradient
        colors={flame}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.person, { bottom: -height * 0.06 }]}>
        <Ionicons name="person" size={head} color="rgba(255,255,255,0.9)" />
      </View>
      <View style={[styles.hand, handPos]}>
        <GestureImage code={gesture} size={hand} />
      </View>
      {badge && (
        <View style={styles.badge}>
          <VerifiedBadge size={Math.max(18, width * 0.15)} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden' },
  person: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  hand: { position: 'absolute' },
  badge: { position: 'absolute', right: 8, bottom: 8 },
});
