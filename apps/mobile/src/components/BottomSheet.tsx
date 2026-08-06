import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { colors, glass, isDark, isIOS, m3, radius, shadows, spacing } from '../theme';

// Feuille qui glisse depuis le bas, pour tous les choix importants de l'app
// (apparence, options...). Même langage que les écrans de paiement : poignée,
// coins arrondis, fond estompé. Elle se ferme au toucher du fond, d'un
// glissement vers le bas, ou par le bouton système retour.
//
// Le parent garde la main sur `visible` ; la feuille joue sa sortie avant de
// démonter le Modal, pour que la fermeture soit aussi fluide que l'ouverture.

// Course de l'animation d'entrée : la feuille part de ce décalage sous sa
// position finale. Une valeur fixe suffit, le ressort fait le reste.
const TRAVEL = 480;

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  // Le Modal reste monté le temps de jouer la sortie.
  const [mounted, setMounted] = useState(visible);
  // 0 = hors écran, 1 = en place.
  const progress = useSharedValue(0);
  // Glissement du doigt pendant le drag, en points.
  const drag = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      drag.value = 0;
      progress.value = withSpring(1, { damping: 24, stiffness: 260, mass: 0.9 });
    } else {
      progress.value = withTiming(0, { duration: 200 }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible, progress, drag]);

  // Glisser vers le bas pour fermer : la feuille suit le doigt (jamais vers le
  // haut), et un geste franc ou une bonne distance la congédie.
  const pan = Gesture.Pan()
    .activeOffsetY([-12, 12])
    .onUpdate((e) => {
      drag.value = Math.max(e.translationY, 0);
    })
    .onEnd((e) => {
      if (e.translationY > 110 || e.velocityY > 700) {
        runOnJS(onClose)();
      } else {
        drag.value = withSpring(0, { damping: 24, stiffness: 260 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [TRAVEL, 0]) + drag.value },
    ],
  }));
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {/* Les gestes ne traversent pas un Modal RN sans leur propre racine. */}
      <GestureHandlerRootView style={styles.root}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            {/* iOS : la feuille est une plaque de verre — flou réel sous une
                teinte dense pour rester lisible, reflet sur l'arête. Android :
                surface tonique opaque, c'est le langage des bottom sheets M3. */}
            {isIOS && (
              <>
                <BlurView
                  intensity={80}
                  tint={isDark ? 'dark' : 'light'}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.sheetTint} />
                <View style={styles.sheetHighlight} />
              </>
            )}
            <SafeAreaView edges={['bottom']}>
              <View style={styles.handle} />
              {!!title && <Text style={styles.title}>{title}</Text>}
              {children}
            </SafeAreaView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,15,12,.55)',
  },
  sheet: {
    // iOS : fond quasi transparent, le flou et la teinte peints par-dessus
    // font le verre. Android : surface tonique M3 opaque. Dans les deux cas
    // les coins hauts sont largement arrondis (28, l'extra-large M3 et la
    // courbe des feuilles iOS modernes).
    backgroundColor: isIOS ? 'transparent' : m3.surfaceContainerLow,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    // Le flou déborderait des coins arrondis sans découpe.
    overflow: isIOS ? 'hidden' : undefined,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    // L'ombre portée n'a de sens que sur la feuille opaque Android : sur iOS
    // elle serait découpée par l'overflow, et le fond estompé détache déjà la
    // plaque de verre.
    ...(isIOS ? null : shadows.floating),
  },
  sheetTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.tintStrong,
  },
  sheetHighlight: {
    position: 'absolute',
    top: 0,
    left: radius.lg,
    right: radius.lg,
    height: StyleSheet.hairlineWidth,
    backgroundColor: glass.highlight,
  },
  handle: {
    alignSelf: 'center',
    width: isIOS ? 44 : 32,
    height: isIOS ? 5 : 4,
    borderRadius: 3,
    backgroundColor: isIOS ? colors.border : m3.outlineVariant,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.primaryDeep,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
