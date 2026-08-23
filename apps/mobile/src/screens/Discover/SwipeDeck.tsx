import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { photoUrl } from '@/services/api';
import { haptic } from '@/utils/haptics';
import { onLight, radius } from '@/theme';
import type { FeedProfile } from '@/types';
import { ProfileCard } from './ProfileCard';

interface SwipeDeckProps {
  profiles: FeedProfile[];
  onSwipe: (profile: FeedProfile, liked: boolean) => void;
  onOpenProfile?: (profile: FeedProfile) => void;
  isFavorite?: (profile: FeedProfile) => boolean;
  onToggleFavorite?: (profile: FeedProfile) => void;
}

// Commandes exposées à l'écran : Like et Passer partent des boutons, jamais
// du geste. Le paquet garde la main sur l'animation de sortie de la carte.
export interface SwipeDeckHandle {
  swipeOut: (liked: boolean) => void;
}

// Le glissement horizontal n'a qu'un seul sens : feuilleter les photos du
// profil. Il ne peut pas déclencher un Like ou un Dislike — ces décisions
// passent par les boutons, qui envoient la carte hors de l'écran.
//
// Pendant le glissement, la carte ne bouge PAS (demande explicite : pas
// d'animation) : au relâchement, la photo change d'un coup, exactement comme
// sur la fiche détaillée.
const PHOTO_MIN_RATIO = 0.05;

// Pile de cartes : la suivante dépasse en bas de la carte du dessus, une
// troisième affleure derrière elle. Chaque rang est décrit par sa position de
// repos ; pendant l'envol de la carte du dessus, chaque carte glisse vers le
// rang au-dessus. Les valeurs d'arrivée du rang N sont exactement celles de
// repos du rang N-1 : à la fin de l'animation, la promotion des cartes se fait
// sans le moindre saut visible.
const STACK = {
  next: { translateY: 18, scale: 0.96, opacity: 1 },
  third: { translateY: 34, scale: 0.92, opacity: 0.6 },
};

export const SwipeDeck = forwardRef<SwipeDeckHandle, SwipeDeckProps>(function SwipeDeck(
  { profiles, onSwipe, onOpenProfile, isFavorite, onToggleFavorite },
  ref,
) {
  const { width } = useWindowDimensions();
  const translateX = useSharedValue(0);
  // Vrai pendant l'envol d'une carte : ignore les commandes en rafale et fige
  // le geste. Shared value : lue depuis les worklets du geste (thread UI).
  const leaving = useSharedValue(false);

  const top = profiles[0];
  const next = profiles[1];
  const third = profiles[2];
  const photoCount = top?.photos?.length ?? 0;

  // Les photos des cartes qui attendent leur tour sont préchargées : quand la
  // carte du dessus part, la suivante arrive déjà habillée, jamais grise.
  useEffect(() => {
    const upcoming = profiles.slice(1, 4);
    for (const p of upcoming) {
      const first = p.photos?.[0];
      if (first) Image.prefetch(photoUrl(first.path)).catch(() => {});
    }
    // Les autres photos de la carte suivante aussi : on peut feuilleter dès
    // qu'elle passe dessus.
    for (const photo of next?.photos?.slice(1) ?? []) {
      Image.prefetch(photoUrl(photo.path)).catch(() => {});
    }
  }, [profiles, next]);

  // La photo affichée appartient au paquet, pas à la carte : c'est ici que le
  // geste est capté. Elle repart à la première dès que la carte du dessus
  // change.
  const [photoIndex, setPhotoIndex] = useState(0);
  useEffect(() => {
    setPhotoIndex(0);
  }, [top?.user_id]);

  const finishSwipe = useCallback(
    (liked: boolean) => {
      leaving.value = false;
      translateX.value = 0;
      if (top) onSwipe(top, liked);
    },
    [top, onSwipe, translateX, leaving],
  );

  // Envol de la carte, déclenché par les boutons de l'écran : à droite pour
  // un Like, à gauche pour un Passer, avec le tampon qui se révèle en route.
  const swipeOut = useCallback(
    (liked: boolean) => {
      if (!top || leaving.value) return;
      leaving.value = true;
      translateX.value = withTiming(
        (liked ? 1 : -1) * width * 1.4,
        { duration: 260 },
        () => runOnJS(finishSwipe)(liked),
      );
    },
    [top, width, translateX, leaving, finishSwipe],
  );

  useImperativeHandle(ref, () => ({ swipeOut }), [swipeOut]);

  // Glissement vers la gauche : photo suivante, comme on tourne une page.
  const shiftPhoto = useCallback(
    (dir: 1 | -1) => {
      setPhotoIndex((i) => {
        const next = i + dir;
        if (next < 0 || next > photoCount - 1) return i;
        haptic.select();
        return next;
      });
    },
    [photoCount],
  );

  const pan = Gesture.Pan()
    // Le geste ne prend la main qu'au-delà de dix points : en deçà, l'appui
    // reste un appui et ouvre le profil.
    .activeOffsetX([-10, 10])
    .onEnd((e) => {
      if (leaving.value) return;
      const dx = e.translationX;
      if (photoCount > 1 && Math.abs(dx) > width * PHOTO_MIN_RATIO) {
        runOnJS(shiftPhoto)(dx < 0 ? 1 : -1);
      }
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${interpolate(translateX.value, [-width, width], [-14, 14])}deg` },
    ],
  }));

  // Les tampons ne se révèlent que sur la course d'envol (au-delà de ce que le
  // drag retenu peut atteindre) : jamais pendant qu'on feuillette les photos.
  const likeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [width * 0.4, width * 0.9], [0, 1]),
  }));
  const nopeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-width * 0.9, -width * 0.4], [1, 0]),
  }));
  // Avancement de l'envol : 0 au repos, 1 quand la carte du dessus est sortie.
  // Chaque carte de la pile glisse d'un rang pendant ce trajet.
  const nextStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(translateX.value) / (width * 0.9), 1);
    return {
      transform: [
        { translateY: interpolate(progress, [0, 1], [STACK.next.translateY, 0]) },
        { scale: interpolate(progress, [0, 1], [STACK.next.scale, 1]) },
      ],
      opacity: STACK.next.opacity,
    };
  });
  const thirdStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(translateX.value) / (width * 0.9), 1);
    return {
      transform: [
        {
          translateY: interpolate(
            progress,
            [0, 1],
            [STACK.third.translateY, STACK.next.translateY],
          ),
        },
        { scale: interpolate(progress, [0, 1], [STACK.third.scale, STACK.next.scale]) },
      ],
      opacity: interpolate(progress, [0, 1], [STACK.third.opacity, STACK.next.opacity]),
    };
  });

  if (!top) return null;

  return (
    <View style={styles.container}>
      {third && (
        <Animated.View style={[styles.cardWrapper, thirdStyle]} pointerEvents="none">
          <ProfileCard profile={third} />
        </Animated.View>
      )}
      {next && (
        <Animated.View style={[styles.cardWrapper, nextStyle]} pointerEvents="none">
          <ProfileCard profile={next} />
        </Animated.View>
      )}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.cardWrapper, topStyle]}>
          <ProfileCard
            profile={top}
            photoIndex={photoIndex}
            onOpenDetail={onOpenProfile ? () => onOpenProfile(top) : undefined}
            favorite={isFavorite?.(top)}
            onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(top) : undefined}
          />
          {/* Tampons posés sur une pastille blanche : couleurs fixes, les
              variantes claires du thème sombre s'y délavaient. */}
          <Animated.View style={[styles.stamp, styles.likeStamp, likeStyle]}>
            <Text style={[styles.stampText, { color: onLight.success }]}>{"J'AIME"}</Text>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.nopeStamp, nopeStyle]}>
            <Text style={[styles.stampText, { color: onLight.danger }]}>NON</Text>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  cardWrapper: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  stamp: {
    position: 'absolute',
    top: 28,
    borderWidth: 4,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 4,
    // Pastille crème Velours plutôt que blanc pur : mêmes encres fixes.
    backgroundColor: 'rgba(255,252,254,.88)',
  },
  likeStamp: { left: 20, borderColor: onLight.success, transform: [{ rotate: '-14deg' }] },
  nopeStamp: { right: 20, borderColor: onLight.danger, transform: [{ rotate: '14deg' }] },
  stampText: { fontSize: 26, fontWeight: '800', letterSpacing: 2 },
});
