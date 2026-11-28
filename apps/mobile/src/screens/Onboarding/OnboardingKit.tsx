import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale, useSelectedBackground, useToggleProgress } from '@/components/motion';
import { haptic } from '@/utils/haptics';
import { colors, flame, motion, spacing } from '@/theme';

// Kit de l'onboarding. Une question par écran, sur fond clair : un grand
// titre, une ligne d'explication, des réponses en lignes pleine largeur, et
// un seul bouton plein en bas. Les couleurs restent celles de Zola : le prune
// pour l'action et l'état choisi, le rose pâle pour la ligne sélectionnée.

// ---------------------------------------------------------------------------
// En-tête : chevron retour et fine barre de progression.
// ---------------------------------------------------------------------------
export function OnboardingHeader({
  step,
  total,
  onBack,
}: {
  step: number;
  total: number;
  onBack: () => void;
}) {
  // La barre glisse jusqu'à sa nouvelle longueur au lieu de sauter.
  const progress = useSharedValue(step / total);
  useEffect(() => {
    progress.set(
      withTiming(step / total, {
        duration: motion.duration.slow,
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      }),
    );
  }, [step, total, progress]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={kh.header}>
      <Pressable
        onPress={onBack}
        hitSlop={14}
        disabled={step === 1}
        style={({ pressed }) => [
          kh.back,
          step === 1 && { opacity: 0 },
          pressed && { opacity: 0.6 },
        ]}
        accessibilityLabel="Retour"
      >
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <View style={kh.track}>
        <Animated.View style={[kh.fill, fillStyle]} />
      </View>
      <View style={kh.back} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pastille d'étape : icône prune dans un rond rose pâle, au-dessus du titre.
// ---------------------------------------------------------------------------
export function StepBadge({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={kb.badge}>
      <Ionicons name={icon} size={24} color={colors.primary} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bouton principal : pilule pleine prune. L'unique bouton plein de l'écran.
// ---------------------------------------------------------------------------
export function GradientButton({
  title,
  onPress,
  disabled,
  dimmed,
  loading,
  icon = null,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  // Grisé à l'œil mais toujours touchable : l'appui reste reçu et l'écran
  // explique ce qui manque. À préférer à `disabled` quand l'état bascule
  // pendant la saisie : un Pressable qui passe de désactivé à actif peut
  // ignorer l'appui qui suit juste, d'où le « il faut appuyer deux fois ».
  dimmed?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap | null;
}) {
  // Pressable simple, sans l'échelle animée de PressableScale : sur Android
  // (nouvelle architecture), rétrécir le bouton pendant l'appui pouvait faire
  // croire que le doigt s'était relevé hors du bouton, et l'appui était
  // perdu. Le retour visuel passe par l'opacité, qui ne bouge rien.
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => {
        haptic.impact();
        onPress();
      }}
      // Zone de tolérance large : un doigt qui glisse un peu reste un appui.
      hitSlop={6}
      pressRetentionOffset={40}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!dimmed, busy: !!loading }}
      style={({ pressed }) => [
        kg.btn,
        (disabled || dimmed) && kg.btnOff,
        pressed && !disabled && { opacity: dimmed ? 0.3 : 0.85 },
      ]}
    >
      {/* Dégradé flamme des boutons du site (--flame). */}
      <LinearGradient
        pointerEvents="none"
        colors={flame}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={[StyleSheet.absoluteFill, kg.btnFill]}
      />
      {loading ? (
        <ActivityIndicator color={colors.textOnPrimary} />
      ) : (
        <>
          {icon !== null && <Ionicons name={icon} size={18} color={colors.textOnPrimary} />}
          <Text style={kg.text}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// Lien « Ignorer » posé au-dessus du bouton principal.
export function SkipLink({ onPress, label = 'Ignorer' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [kg.skip, pressed && { opacity: 0.6 }]}
    >
      <Text style={kg.skipText}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Rond de sélection : vide, ou prune avec un point blanc. En mode multiple,
// une case arrondie cochée.
// ---------------------------------------------------------------------------
function Mark({ on, multi }: { on: boolean; multi?: boolean }) {
  // Le contour fond vers le prune et le contenu éclot au ressort : la réponse
  // se pose sous le doigt au lieu d'apparaître d'un coup.
  const p = useToggleProgress(on);
  const shell = useAnimatedStyle(() => {
    const t = Math.min(Math.max(p.value, 0), 1);
    return {
      borderColor: interpolateColor(t, [0, 1], [colors.text, colors.primary]),
      backgroundColor: interpolateColor(t, [0, 1], ['transparent', colors.primary]),
    };
  });
  const inner = useAnimatedStyle(() => ({
    opacity: Math.min(Math.max(p.value, 0), 1),
    transform: [{ scale: p.value }],
  }));
  return (
    <Animated.View style={[multi ? km.box : km.ring, shell]}>
      <Animated.View style={inner}>
        {multi ? (
          <Ionicons name="checkmark" size={15} color={colors.textOnPrimary} />
        ) : (
          <View style={km.dot} />
        )}
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Ligne de réponse : libellé, explication facultative, rond à droite. La
// ligne choisie passe en rose pâle. `icon` ajoute un pictogramme à gauche.
// ---------------------------------------------------------------------------
export function OptionCard({
  icon,
  emoji,
  label,
  hint,
  selected,
  multi,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  // Emoji posé à la place de l'icône, par exemple le drapeau d'un pays.
  emoji?: string;
  label: string;
  hint?: string;
  selected?: boolean;
  multi?: boolean;
  onPress: () => void;
}) {
  const bg = useSelectedBackground(!!selected, colors.surface, colors.selected);
  return (
    <PressableScale
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: !!selected }}
      scaleTo={0.98}
    >
      <Animated.View style={[ko.row, !!hint && ko.rowTall, bg]}>
        {emoji ? (
          <Text style={[ko.icon, ko.emoji]}>{emoji}</Text>
        ) : (
          !!icon && <Ionicons name={icon} size={22} color={colors.text} style={ko.icon} />
        )}
        <View style={ko.body}>
          <Text style={[ko.label, !!hint && ko.labelStrong]}>{label}</Text>
          {!!hint && <Text style={ko.hint}>{hint}</Text>}
        </View>
        <Mark on={!!selected} multi={multi} />
      </Animated.View>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Bouton de choix entouré, centré (genre). Choisi, il se remplit de prune.
// ---------------------------------------------------------------------------
export function ChoiceTile({
  label,
  selected,
  onPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const p = useToggleProgress(!!selected);
  const fill = useAnimatedStyle(() => {
    const t = Math.min(Math.max(p.value, 0), 1);
    return {
      backgroundColor: interpolateColor(t, [0, 1], ['transparent', colors.primary]),
      borderColor: interpolateColor(t, [0, 1], [colors.text, colors.primary]),
    };
  });
  return (
    <PressableScale
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected }}
    >
      <Animated.View style={[kt.pill, fill]}>
        <Text style={[kt.label, selected && kt.labelOn]}>{label}</Text>
      </Animated.View>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Puce de centre d'intérêt : grise avec un « + », rose pâle et cochée une
// fois choisie.
// ---------------------------------------------------------------------------
export function BounceChip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  // Pictogramme au trait posé avant le libellé (centres d'intérêt).
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  active?: boolean;
  onPress: () => void;
}) {
  const bg = useSelectedBackground(!!active, colors.surface, colors.selected);
  return (
    <PressableScale
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!active }}
      scaleTo={0.94}
    >
      <Animated.View style={[kc.chip, bg]}>
        {!!icon && (
          <MaterialCommunityIcons
            name={icon}
            size={17}
            color={active ? colors.selectedInk : colors.text}
          />
        )}
        <Text style={[kc.text, active && kc.textOn]}>{label}</Text>
        <Ionicons
          name={active ? 'checkmark' : 'add'}
          size={16}
          color={active ? colors.selectedInk : colors.text}
        />
      </Animated.View>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// Trait de saisie sous un champ nu : fin et gris, plus marqué quand la saisie
// est valide.
// ---------------------------------------------------------------------------
export function FocusLine({ active }: { active: boolean }) {
  return <View style={[kf.line, active && kf.lineOn]} />;
}

// ---------------------------------------------------------------------------
// Curseur de taille : rail fin, poignée blanche ronde. On touche n'importe où
// et elle s'y place. `value` null = pas encore choisi, poignée au centre.
// ---------------------------------------------------------------------------
const THUMB = 30;
const TRACK_H = 3;

export function HeightSlider({
  min,
  max,
  value,
  onChange,
}: {
  min: number;
  max: number;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const [usable, setUsable] = useState(0);
  const x = useSharedValue(0);
  const last = useSharedValue(value ?? -1);
  const span = Math.max(max - min, 1);

  const onLayout = (width: number) => {
    const u = Math.max(width - THUMB, 1);
    setUsable(u);
    const v = value ?? Math.round((min + max) / 2);
    x.set(((v - min) / span) * u);
  };

  useEffect(() => {
    if (value === null && usable > 0) {
      last.set(-1);
      x.set(((Math.round((min + max) / 2) - min) / span) * usable);
    }
  }, [value, usable, min, max, span, x, last]);

  const report = (v: number) => {
    haptic.select();
    onChange(v);
  };

  const moveTo = (ex: number) => {
    'worklet';
    const nx = Math.min(Math.max(ex - THUMB / 2, 0), usable);
    x.set(nx);
    const val = Math.round(min + (nx / Math.max(usable, 1)) * span);
    if (val !== last.value) {
      last.set(val);
      runOnJS(report)(val);
    }
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      moveTo(e.x);
    })
    .onUpdate((e) => {
      moveTo(e.x);
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.value + THUMB / 2 }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[kd.wrap, value === null && { opacity: 0.6 }]}
        onLayout={(e) => onLayout(e.nativeEvent.layout.width)}
      >
        <View style={kd.track} />
        <Animated.View style={[kd.fill, fillStyle]} />
        <Animated.View style={[kd.thumb, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------

const kh = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2, backgroundColor: colors.text },
});

const kb = StyleSheet.create({
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.selected,
  },
});

const kg = StyleSheet.create({
  btn: {
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnFill: { borderRadius: 27 },
  btnOff: { opacity: 0.4 },
  text: { fontSize: 16, fontWeight: '700', color: colors.textOnPrimary },
  skip: { alignSelf: 'center', paddingVertical: 10, marginBottom: 4 },
  skipText: { fontSize: 15, fontWeight: '600', color: colors.text },
});

const km = StyleSheet.create({
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textOnPrimary,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const ko = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    paddingVertical: 12,
  },
  rowTall: { paddingVertical: 16 },
  icon: { width: 24 },
  // Drapeau : un peu plus grand qu'une icône, centré sur la même colonne.
  emoji: { width: 32, fontSize: 26, lineHeight: 32, textAlign: 'center' },
  body: { flex: 1, gap: 3 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  labelStrong: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 18, color: colors.textMuted },
});

const kt = StyleSheet.create({
  pill: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  labelOn: { color: colors.textOnPrimary },
});

const kc = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  emoji: { fontSize: 15 },
  text: { fontSize: 14, fontWeight: '600', color: colors.text },
  textOn: { color: colors.selectedInk, fontWeight: '700' },
});

const kf = StyleSheet.create({
  line: { height: 1, backgroundColor: colors.border },
  lineOn: { height: 1.5, backgroundColor: colors.text },
});

const kd = StyleSheet.create({
  wrap: { height: THUMB + 12, justifyContent: 'center' },
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: colors.border,
    marginHorizontal: THUMB / 2,
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: colors.text,
    top: '50%',
    marginTop: -TRACK_H / 2,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
