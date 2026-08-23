import { BlurView } from 'expo-blur';
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeInDown,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { colors, glass, isDark, isIOS, m3, radius } from '@/theme';

// Primitives de mouvement et de matière, partagées par tous les écrans pour
// que l'app ait un seul rythme. Durées 150-300 ms, ressort à l'appui,
// entrées décalées de 40 ms : au-delà ça traîne, en deçà ça ne se voit pas.
//
// « Réduire les animations » du système est respecté là où ça compte : les
// entrées reanimated reçoivent ReduceMotion.System et le compteur saute
// directement à sa valeur. Une animation ne doit jamais être un péage vers
// l'information. Le retour d'appui, lui, est conservé dans tous les cas : ce
// n'est pas du mouvement décoratif mais la confirmation que le doigt a porté.

// ---------------------------------------------------------------------------
// Entrée en fondu montant, décalée par index dans une liste.
// ---------------------------------------------------------------------------
export function Reveal({
  children,
  index = 0,
  style,
}: {
  children: React.ReactNode;
  index?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View
      style={style}
      entering={FadeInDown.duration(260)
        .delay(Math.min(index, 8) * 40)
        .reduceMotion(ReduceMotion.System)}
    >
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Appui : léger enfoncement au ressort. Le retour visuel arrive avant la
// navigation, c'est lui qui donne l'impression de réactivité.
// ---------------------------------------------------------------------------
// `style` habille le Pressable lui-même : c'est lui qui porte la mise en page
// interne (direction, padding, gap). `containerStyle` va sur l'enveloppe
// animée, pour ce qui concerne le placement dans le parent (flex, largeur).
// Séparer les deux évite que le transform écrase la mise en page, ou l'inverse.
export function PressableScale({
  children,
  style,
  containerStyle,
  scaleTo = 0.97,
  ...props
}: PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={[animated, containerStyle]}>
      <Pressable
        {...props}
        style={style}
        onPressIn={(e) => {
          scale.value = withSpring(scaleTo, { damping: 18, stiffness: 320 });
          props.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withSpring(1, { damping: 18, stiffness: 320 });
          props.onPressOut?.(e);
        }}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Compteur : part de 0 et rattrape la valeur. Courbe fortement sortante — le
// gros du chemin est fait en 300 ms, la fin se pose. Piloté en JS : sur ~700 ms
// ça fait une quarantaine de rendus d'un seul Text, c'est indolore, et ça reste
// lisible face à l'astuce TextInput animé.
// ---------------------------------------------------------------------------
export function CountUp({
  value,
  duration = 700,
  format = (n: number) => String(n),
  style,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  style?: StyleProp<TextStyle>;
}) {
  // Part de 0 dès le premier rendu : afficher la valeur finale un instant
  // avant d'animer tuait tout l'effet (le compteur semblait ne rien faire).
  const [shown, setShown] = useState(0);
  const [reduced, setReduced] = useState(false);
  const frame = useRef<number | null>(null);
  const previous = useRef(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduced)
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const from = previous.current === value ? 0 : previous.current;
    previous.current = value;
    if (value === from || reduced) {
      setShown(value);
      return;
    }

    const start = Date.now();
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      // easeOutQuint : démarre très vite, se pose en douceur.
      const eased = 1 - Math.pow(1 - t, 5);
      setShown(Math.round(from + (value - from) * eased));
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      }
    };
    frame.current = requestAnimationFrame(tick);

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [value, duration, reduced]);

  // Chiffres tabulaires : sans ça la largeur saute à chaque rendu.
  return (
    <Text style={[style, styles.tabular]} allowFontScaling={false}>
      {format(shown)}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Surface adaptative par plateforme. Sur iOS : verre Liquid Glass, flou réel
// + teinte + reflet spéculaire sur le bord haut, là où il sert à dire « ce qui
// est dessous est en retrait » (barres flottantes, calques de modale). Sur
// Android : pas de verre — Material 3 parle en surfaces toniques opaques et en
// élévation, le flou y reste expérimental et hors langage.
// ---------------------------------------------------------------------------
export function GlassSurface({
  children,
  intensity = 50,
  blur = isIOS,
  style,
}: {
  children: React.ReactNode;
  intensity?: number;
  blur?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  if (!blur) {
    return <View style={[styles.glassFallback, style]}>{children}</View>;
  }
  return (
    <View style={[styles.glassClip, style]}>
      <BlurView
        intensity={intensity}
        // Le verre suit le thème : un voile blanc posé sur une interface
        // sombre faisait des barres claires en mode sombre.
        tint={isDark ? 'dark' : 'light'}
        // Sans ce réglage, Android n'affiche qu'un voile translucide.
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.glassTint} />
      {/* Reflet : un fil de lumière sur l'arête supérieure, comme une tranche
          de verre qui accroche la lumière. */}
      <View style={styles.glassHighlight} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tabular: { fontVariant: ['tabular-nums'] },
  // borderRadius ne s'applique pas au flou sur Android : on découpe au parent.
  glassClip: { overflow: 'hidden', borderRadius: radius.md },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: glass.tint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: glass.border,
    borderRadius: radius.md,
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: radius.md,
    right: radius.md,
    height: StyleSheet.hairlineWidth,
    backgroundColor: glass.highlight,
  },
  // Repli sans flou : surface tonique Material sur Android, voile dense ailleurs.
  glassFallback: isIOS
    ? {
        backgroundColor: isDark ? 'rgba(28,11,19,.85)' : 'rgba(255,255,255,.82)',
        borderRadius: radius.md,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }
    : {
        backgroundColor: m3.surfaceContainerHigh,
        borderRadius: radius.md,
      },
});
