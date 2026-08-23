import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { haptic } from '@/utils/haptics';
import { colors, radius } from '@/theme';

// Curseur à deux poignées pour choisir une fourchette (l'âge des filtres).
// Deux pilules à chevrons glissent sur un rail ; le segment entre elles est
// teinté. Les valeurs remontent au parent à chaque cran entier, qui les
// affiche en direct (« Entre 18-40 ans »).
//
// Le composant est non contrôlé pendant le glissement : les positions vivent
// dans des sharedValues (thread UI, 60 fps sans re-rendu), le parent ne fait
// que recevoir les crans. Les props initiales posent les poignées au montage.

const THUMB_W = 46;
const THUMB_H = 30;
const TRACK_H = 6;

export function RangeSlider({
  min,
  max,
  initialLow,
  initialHigh,
  onChange,
}: {
  min: number;
  max: number;
  initialLow: number;
  initialHigh: number;
  onChange: (low: number, high: number) => void;
}) {
  // Course utile en pixels (le rail moins une largeur de poignée).
  const [usable, setUsable] = useState(0);
  const lowX = useSharedValue(0);
  const highX = useSharedValue(0);
  const lowStart = useSharedValue(0);
  const highStart = useSharedValue(0);
  // Dernier cran annoncé : le retour haptique ne joue qu'au changement.
  const lastLow = useSharedValue(initialLow);
  const lastHigh = useSharedValue(initialHigh);

  const span = Math.max(max - min, 1);

  const report = (low: number, high: number) => {
    haptic.select();
    onChange(low, high);
  };

  const onTrackLayout = (width: number) => {
    const u = Math.max(width - THUMB_W, 1);
    setUsable(u);
    // Pose les poignées sur les valeurs courantes, une fois la largeur connue.
    lowX.value = ((initialLow - min) / span) * u;
    highX.value = ((initialHigh - min) / span) * u;
  };

  // Intention du geste, déclarée explicitement sur les deux poignées.
  //
  // Sans ces deux réglages, un `Gesture.Pan()` réclame le toucher dès le
  // premier pixel et dans n'importe quelle direction. Deux dégâts :
  //
  //   - la poignée basse repose sur `left: 0` quand la fourchette part du
  //     minimum, donc tout près du bord gauche de l'écran. Elle happait le
  //     toucher avant que le geste de retour natif ait pu s'engager — d'où un
  //     retour arrière qui marchait une fois sur deux, selon l'endroit où le
  //     doigt se posait et la position de la poignée ;
  //   - un glissement vertical parti d'une poignée déplaçait la valeur au
  //     lieu de faire défiler la page.
  //
  // `activeOffsetX` n'active qu'après une intention horizontale nette,
  // `failOffsetY` rend la main dès que le doigt part en vertical.
  const ACTIVE_X: [number, number] = [-8, 8];
  const FAIL_Y: [number, number] = [-10, 10];

  const lowPan = Gesture.Pan()
    .activeOffsetX(ACTIVE_X)
    .failOffsetY(FAIL_Y)
    .onStart(() => {
      lowStart.value = lowX.value;
    })
    .onUpdate((e) => {
      const next = Math.min(Math.max(lowStart.value + e.translationX, 0), highX.value);
      lowX.value = next;
      const val = Math.round(min + (next / Math.max(usable, 1)) * span);
      if (val !== lastLow.value) {
        lastLow.value = val;
        runOnJS(report)(val, lastHigh.value);
      }
    });

  const highPan = Gesture.Pan()
    .activeOffsetX(ACTIVE_X)
    .failOffsetY(FAIL_Y)
    .onStart(() => {
      highStart.value = highX.value;
    })
    .onUpdate((e) => {
      const next = Math.max(Math.min(highStart.value + e.translationX, usable), lowX.value);
      highX.value = next;
      const val = Math.round(min + (next / Math.max(usable, 1)) * span);
      if (val !== lastHigh.value) {
        lastHigh.value = val;
        runOnJS(report)(lastLow.value, val);
      }
    });

  const lowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: lowX.value }],
  }));
  const highStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: highX.value }],
  }));
  // Segment teinté entre les deux poignées.
  const fillStyle = useAnimatedStyle(() => ({
    left: lowX.value + THUMB_W / 2,
    width: Math.max(highX.value - lowX.value, 0),
  }));

  return (
    <View
      style={styles.wrap}
      onLayout={(e) => onTrackLayout(e.nativeEvent.layout.width)}
    >
      <View style={styles.track} />
      <Animated.View style={[styles.fill, fillStyle]} />
      <GestureDetector gesture={lowPan}>
        <Animated.View style={[styles.thumb, lowStyle]} hitSlop={12}>
          <Ionicons name="chevron-back" size={13} color={colors.primary} />
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </Animated.View>
      </GestureDetector>
      <GestureDetector gesture={highPan}>
        <Animated.View style={[styles.thumb, highStyle]} hitSlop={12}>
          <Ionicons name="chevron-back" size={13} color={colors.primary} />
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: Math.max(THUMB_H, TRACK_H) + 8,
    justifyContent: 'center',
  },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: colors.border,
    marginHorizontal: THUMB_W / 2,
  },
  fill: {
    position: 'absolute',
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: colors.accent,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: radius.full,
    backgroundColor: colors.cardSolid,
    borderWidth: 1.5,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    // Petite ombre : la poignée flotte sur le rail.
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
