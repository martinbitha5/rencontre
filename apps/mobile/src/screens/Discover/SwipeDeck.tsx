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
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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

// Commandes exposées à l'écran : les boutons Like et Passer lancent la même
// sortie que le geste.
export interface SwipeDeckHandle {
  swipeOut: (liked: boolean) => void;
}

// Le glissement décide : vers la droite c'est un like, vers la gauche un non.
// La carte suit le doigt et pivote, le tampon « J'AIME » ou « NON » apparaît
// en route. Au relâchement, au-delà du seuil (ou d'un geste vif), la carte
// s'envole ; en deçà, elle revient au centre avec un léger rebond.
// Les photos se feuillettent en touchant le bord gauche ou droit de la carte.
const DECIDE_RATIO = 0.28; // part de la largeur à franchir pour décider
const FLING_VELOCITY = 900; // un geste vif décide même sur une courte course
const STAMP_FROM = 0.06; // le tampon commence à paraître
const STAMP_FULL = 0.26; // le tampon est entièrement visible

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
  const translateY = useSharedValue(0);
  // Doigt posé sur la carte : elle se soulève légèrement.
  const dragging = useSharedValue(false);
  // Côté du seuil franchi pendant le geste (-1, 0, 1) : une vibration légère
  // à chaque passage, pour sentir le moment où la décision est prise.
  const armed = useSharedValue(0);
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
      leaving.set(false);
      translateX.set(0);
      translateY.set(0);
      if (top) onSwipe(top, liked);
    },
    [top, onSwipe, translateX, translateY, leaving],
  );

  const decidedFeedback = useCallback((liked: boolean) => {
    if (liked) haptic.success();
    else haptic.tap();
  }, []);

  // Envol de la carte, depuis le geste ou les boutons : à droite pour un
  // Like, à gauche pour un Passer, avec le tampon qui se révèle en route.
  const swipeOut = useCallback(
    (liked: boolean) => {
      if (!top || leaving.value) return;
      // Les boutons vibrent déjà de leur côté : pas de second retour ici.
      leaving.set(true);
      translateX.set(withTiming(
        (liked ? 1 : -1) * width * 1.4,
        { duration: 260 },
        () => runOnJS(finishSwipe)(liked),
      ));
    },
    [top, width, translateX, leaving, finishSwipe],
  );

  useImperativeHandle(ref, () => ({ swipeOut }), [swipeOut]);

  const tick = useCallback(() => haptic.select(), []);

  // Bord droit : photo suivante ; bord gauche : précédente.
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
    // Le geste ne prend la main qu'au-delà de dix points à l'horizontale : en
    // deçà, l'appui reste un appui (photo suivante ou profil), et un geste
    // vertical laisse défiler l'écran.
    .activeOffsetX([-10, 10])
    .failOffsetY([-24, 24])
    .onBegin(() => {
      if (leaving.value) return;
      dragging.set(true);
    })
    .onUpdate((e) => {
      if (leaving.value) return;
      translateX.set(e.translationX);
      // Un peu de jeu vertical : la carte se tient dans la main, pas sur un rail.
      translateY.set(e.translationY * 0.2);
      const side = e.translationX > width * DECIDE_RATIO ? 1
        : e.translationX < -width * DECIDE_RATIO ? -1 : 0;
      if (side !== armed.value) {
        armed.set(side);
        if (side !== 0) runOnJS(tick)();
      }
    })
    .onEnd((e) => {
      if (leaving.value) return;
      const dx = e.translationX;
      const vx = e.velocityX;
      const decided = Math.abs(dx) > width * DECIDE_RATIO
        || (Math.abs(vx) > FLING_VELOCITY && Math.sign(vx) === Math.sign(dx));
      if (decided && top) {
        const liked = dx > 0;
        leaving.set(true);
        runOnJS(decidedFeedback)(liked);
        // La carte part dans la direction du geste, à sa vitesse.
        const duration = Math.max(160, Math.min(320, (width * 1.4 - Math.abs(dx)) / (Math.abs(vx) / 1000 || 1)));
        translateX.set(withTiming((liked ? 1 : -1) * width * 1.5, { duration }, () =>
          runOnJS(finishSwipe)(liked),
        ));
        translateY.set(withTiming(translateY.value + e.velocityY * 0.05, { duration }));
      } else {
        translateX.set(withSpring(0, { damping: 15, stiffness: 180 }));
        translateY.set(withSpring(0, { damping: 15, stiffness: 180 }));
      }
    })
    .onFinalize(() => {
      dragging.set(false);
      armed.set(0);
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${interpolate(translateX.value, [-width, width], [-12, 12])}deg` },
      { scale: withSpring(dragging.value ? 1.02 : 1, { damping: 18, stiffness: 220 }) },
    ],
  }));

  // Les tampons grandissent en même temps qu'ils apparaissent.
  const likeStyle = useAnimatedStyle(() => {
    const t = interpolate(translateX.value, [width * STAMP_FROM, width * STAMP_FULL], [0, 1], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ rotate: '-14deg' }, { scale: 0.8 + t * 0.25 }] };
  });
  const nopeStyle = useAnimatedStyle(() => {
    const t = interpolate(translateX.value, [-width * STAMP_FULL, -width * STAMP_FROM], [1, 0], Extrapolation.CLAMP);
    return { opacity: t, transform: [{ rotate: '14deg' }, { scale: 0.8 + t * 0.25 }] };
  });
  // Teinte de toute la carte : verte vers le like, rouge vers le non.
  const likeTint = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, width * 0.5], [0, 0.2], Extrapolation.CLAMP),
  }));
  const nopeTint = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-width * 0.5, 0], [0.2, 0], Extrapolation.CLAMP),
  }));
  // Avancement de l'envol : 0 au repos, 1 quand la carte du dessus est sortie.
  // Chaque carte de la pile glisse d'un rang pendant ce trajet.
  const nextStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(translateX.value) / (width * 0.6), 1);
    return {
      transform: [
        { translateY: interpolate(progress, [0, 1], [STACK.next.translateY, 0]) },
        { scale: interpolate(progress, [0, 1], [STACK.next.scale, 1]) },
      ],
      opacity: STACK.next.opacity,
    };
  });
  const thirdStyle = useAnimatedStyle(() => {
    const progress = Math.min(Math.abs(translateX.value) / (width * 0.6), 1);
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
            onStepPhoto={shiftPhoto}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.tint, { backgroundColor: onLight.success }, likeTint]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.tint, { backgroundColor: onLight.danger }, nopeTint]}
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
    top: 96, // sous le prénom et les pastilles, jamais dessus
    borderWidth: 4,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 4,
    // Pastille crème Velours plutôt que blanc pur : mêmes encres fixes.
    backgroundColor: 'rgba(255, 255, 255,.88)',
  },
  // La rotation des tampons est posée par leur style animé (avec l'échelle).
  likeStamp: { left: 20, borderColor: onLight.success },
  nopeStamp: { right: 20, borderColor: onLight.danger },
  tint: { ...StyleSheet.absoluteFill, borderRadius: 20 }, // même arrondi que ProfileCard
  stampText: { fontSize: 26, fontWeight: '800', letterSpacing: 2 },
});
