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
import { isSavingData } from '@/utils/dataSaver';
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

// Commandes exposées à l'écran : Like et Passer partent des boutons, et c'est
// le paquet qui joue l'envol de la carte.
export interface SwipeDeckHandle {
  swipeOut: (liked: boolean) => void;
}

// Le glissement horizontal fait défiler les photos du profil, comme un
// carrousel : la bande de photos suit le doigt et se cale sur la suivante ou
// la précédente au relâchement. Il ne décide jamais d'un like ou d'un non :
// ces décisions passent par les boutons. Toucher la photo, n'importe où,
// ouvre le profil complet.
const PAGE_RATIO = 0.18; // part de la largeur à franchir pour changer de photo
const PAGE_VELOCITY = 450; // un geste vif change de photo même sur une courte course
const EDGE_RESIST = 0.3; // résistance au-delà de la première ou dernière photo
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
  // Position du carrousel de photos, en nombre de photos (0 = la première).
  // Elle suit le doigt en continu, l'index affiché se met à jour au calage.
  const photoPos = useSharedValue(0);
  const dragStart = useSharedValue(0);
  // Largeur réelle de la carte, mesurée : une page du carrousel.
  const [cardWidth, setCardWidth] = useState(width);
  const pageW = useSharedValue(width);
  // Vrai pendant l'envol d'une carte : ignore les commandes en rafale et fige
  // le geste. Shared value : lue depuis les worklets du geste (thread UI).
  const leaving = useSharedValue(false);

  const top = profiles[0];
  const next = profiles[1];
  const third = profiles[2];
  const photoCount = top?.photos?.length ?? 0;

  // Préchargement des cartes qui attendent leur tour : quand la carte du
  // dessus part, la suivante arrive déjà habillée, jamais grise.
  //   - en Wi-Fi : la première photo des trois cartes suivantes, plus la
  //     deuxième de la carte suivante (prête pour le premier glissement) ;
  //   - en économie de données : seulement la première photo de la carte
  //     suivante. Les autres se chargent quand on les regarde.
  // Avant, toutes les photos de la carte suivante partaient d'avance, même
  // pour un profil qu'on passe en une seconde.
  useEffect(() => {
    const saving = isSavingData();
    const upcoming = profiles.slice(1, saving ? 2 : 4);
    for (const p of upcoming) {
      const first = p.photos?.[0];
      if (first) Image.prefetch(photoUrl(first.path)).catch(() => {});
    }
    const second = next?.photos?.[1];
    if (!saving && second) Image.prefetch(photoUrl(second.path)).catch(() => {});
  }, [profiles, next]);

  // La photo affichée appartient au paquet, pas à la carte : c'est ici que le
  // geste est capté. Elle repart à la première dès que la carte du dessus
  // change.
  const [photoIndex, setPhotoIndex] = useState(0);
  useEffect(() => {
    setPhotoIndex(0);
    photoPos.set(0);
  }, [top?.user_id, photoPos]);

  const finishSwipe = useCallback(
    (liked: boolean) => {
      leaving.set(false);
      translateX.set(0);
      if (top) onSwipe(top, liked);
    },
    [top, onSwipe, translateX, leaving],
  );

  // Envol de la carte, lancé par les boutons : à droite pour un Like, à
  // gauche pour un Passer, avec le tampon qui se révèle en route.
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

  // Calage terminé sur une photo : l'index affiché (repères, compteur) suit.
  const settlePhoto = useCallback((i: number) => {
    setPhotoIndex((prev) => {
      if (prev !== i) haptic.select();
      return i;
    });
  }, []);

  const pan = Gesture.Pan()
    // Le geste ne prend la main qu'au-delà de dix points à l'horizontale : en
    // deçà, l'appui reste un appui (il ouvre le profil), et un geste vertical
    // laisse défiler l'écran.
    .activeOffsetX([-10, 10])
    .failOffsetY([-24, 24])
    .enabled(photoCount > 1)
    .onBegin(() => {
      dragStart.set(photoPos.value);
    })
    .onUpdate((e) => {
      if (leaving.value) return;
      const w = pageW.value || 1;
      let pos = dragStart.value - e.translationX / w;
      const last = photoCount - 1;
      // Au-delà des bords, la bande résiste : on sent qu'il n'y a plus rien.
      if (pos < 0) pos = pos * EDGE_RESIST;
      else if (pos > last) pos = last + (pos - last) * EDGE_RESIST;
      photoPos.set(pos);
    })
    .onEnd((e) => {
      if (leaving.value) return;
      const w = pageW.value || 1;
      const from = Math.round(dragStart.value);
      let target = from;
      if (e.translationX < -w * PAGE_RATIO || e.velocityX < -PAGE_VELOCITY) target = from + 1;
      else if (e.translationX > w * PAGE_RATIO || e.velocityX > PAGE_VELOCITY) target = from - 1;
      target = Math.max(0, Math.min(photoCount - 1, target));
      photoPos.set(withSpring(target, { damping: 26, stiffness: 260, mass: 0.8 }));
      runOnJS(settlePhoto)(target);
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { rotate: `${interpolate(translateX.value, [-width, width], [-12, 12])}deg` },
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
    <View
      style={styles.container}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width;
        setCardWidth(w);
        pageW.set(w);
      }}
    >
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
            photoPos={photoPos}
            pageWidth={cardWidth}
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
