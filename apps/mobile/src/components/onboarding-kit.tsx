import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  ZoomIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptic } from '../lib/haptics';
import { colors, isDark, radius, shadows, spacing } from '../theme';

// Kit de l'onboarding : les primitives visuelles qui donnent au parcours son
// caractère. Tout le mouvement vit sur le thread UI (Reanimated), les entrées
// respectent « Réduire les animations » du système, et chaque interaction rend
// un retour immédiat (ressort + haptique) avant de changer l'état.

// Dégradé signature du parcours : rose franc vers prune en clair, rose vif
// vers rose clair en sombre (la prune noire absorberait le dégradé).
export const ACCENT_GRADIENT = (isDark
  ? ['#ec4899', '#f472b6']
  : ['#db2777', '#9d174d']) as [string, string];

// Ressort commun des appuis : sec et vivant, jamais élastique.
const POP = { damping: 16, stiffness: 280 };

// ---------------------------------------------------------------------------
// En-tête : chevron retour + barre de progression fluide. La barre rattrape
// chaque étape au ressort, le dégradé donne la direction, et le compteur reste
// discret. Pas de segments : la fluidité EST l'indicateur.
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
  const p = useSharedValue(step / total);

  useEffect(() => {
    p.value = withSpring(step / total, { damping: 20, stiffness: 140 });
  }, [step, total, p]);

  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));

  return (
    <View style={kh.header}>
      <Pressable
        onPress={onBack}
        hitSlop={12}
        style={({ pressed }) => [
          kh.back,
          step === 1 && { opacity: 0.35 },
          pressed && step > 1 && { opacity: 0.7 },
        ]}
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </Pressable>
      <View style={kh.track}>
        <Animated.View style={[kh.fill, fill]}>
          <LinearGradient
            colors={ACCENT_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
      <Text style={kh.count}>
        {step}
        <Text style={kh.countTotal}>/{total}</Text>
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fond ambiant : deux halos de couleur qui dérivent très lentement derrière le
// contenu. C'est la profondeur de l'écran — imperceptible en soi, mais sans
// lui la page redevient un formulaire posé sur un aplat.
// ---------------------------------------------------------------------------
export function AmbientBackground() {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, {
        duration: 9000,
        easing: Easing.inOut(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      true,
    );
  }, [t]);

  const blobA = useAnimatedStyle(() => ({
    transform: [{ translateX: t.value * 34 }, { translateY: t.value * 22 }],
  }));
  const blobB = useAnimatedStyle(() => ({
    transform: [{ translateX: -t.value * 28 }, { translateY: -t.value * 34 }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[ka.blob, ka.blobA, blobA]} />
      <Animated.View style={[ka.blob, ka.blobB, blobB]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pastille d'étape : l'icône qui donne sa personnalité à chaque question,
// posée dans un halo teinté qui apparaît d'un ressort.
// ---------------------------------------------------------------------------
export function StepBadge({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <Animated.View
      entering={ZoomIn.springify().damping(15).reduceMotion(ReduceMotion.System)}
      style={kb.badge}
    >
      <Ionicons name={icon} size={22} color={colors.accent} />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Bouton principal : pilule au dégradé signature, compression au ressort,
// flèche qui dit « on avance ». L'unique bouton plein de l'écran.
// ---------------------------------------------------------------------------
export function GradientButton({
  title,
  onPress,
  disabled,
  loading,
  icon = 'arrow-forward',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap | null;
}) {
  const scale = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={st}>
      <Pressable
        disabled={disabled || loading}
        onPressIn={() => {
          scale.value = withSpring(0.97, POP);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, POP);
        }}
        onPress={() => {
          haptic.impact();
          onPress();
        }}
        style={[kg.btn, disabled && { opacity: 0.35 }]}
      >
        <LinearGradient
          colors={ACCENT_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {loading ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <>
            <Text style={kg.text}>{title}</Text>
            {icon !== null && <Ionicons name={icon} size={18} color="#ffffff" />}
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Carte d'option pleine largeur : icône dans un carré teinté, libellé, coche
// qui surgit d'un ressort à la sélection. Les cartes entrent en cascade.
// ---------------------------------------------------------------------------
export function OptionCard({
  icon,
  label,
  hint,
  selected,
  onPress,
  index = 0,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  selected?: boolean;
  onPress: () => void;
  index?: number;
}) {
  const scale = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.duration(240)
        .delay(Math.min(index, 8) * 45)
        .reduceMotion(ReduceMotion.System)}
      style={st}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.97, POP);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, POP);
        }}
        onPress={() => {
          haptic.select();
          onPress();
        }}
        style={[ko.card, selected && ko.cardOn]}
      >
        <View style={[ko.iconBox, selected && ko.iconBoxOn]}>
          <Ionicons
            name={icon}
            size={19}
            color={selected ? colors.textOnAccent : colors.accent}
          />
        </View>
        <View style={ko.body}>
          <Text style={[ko.label, selected && ko.labelOn]}>{label}</Text>
          {!!hint && <Text style={ko.hint}>{hint}</Text>}
        </View>
        {selected && (
          <Animated.View
            entering={ZoomIn.springify().damping(13).reduceMotion(ReduceMotion.System)}
            style={ko.check}
          >
            <Ionicons name="checkmark" size={14} color={colors.textOnAccent} />
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Tuile de choix : carte demi-largeur verticale (genre, enfants), grande
// icône, sélection au ressort.
// ---------------------------------------------------------------------------
export function ChoiceTile({
  icon,
  label,
  selected,
  onPress,
  index = 0,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  selected?: boolean;
  onPress: () => void;
  index?: number;
}) {
  const scale = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.duration(240)
        .delay(Math.min(index, 8) * 60)
        .reduceMotion(ReduceMotion.System)}
      style={[{ flex: 1 }, st]}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.96, POP);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, POP);
        }}
        onPress={() => {
          haptic.select();
          onPress();
        }}
        style={[kt.tile, selected && kt.tileOn]}
      >
        <View style={[kt.iconRing, selected && kt.iconRingOn]}>
          <Ionicons
            name={icon}
            size={26}
            color={selected ? colors.textOnAccent : colors.accent}
          />
        </View>
        <Text style={[kt.label, selected && kt.labelOn]}>{label}</Text>
        {selected && (
          <Animated.View
            entering={ZoomIn.springify().damping(13).reduceMotion(ReduceMotion.System)}
            style={kt.check}
          >
            <Ionicons name="checkmark" size={13} color={colors.textOnAccent} />
          </Animated.View>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Pilules segmentées (Jamais / Parfois / Souvent) : le segment actif reçoit le
// dégradé d'un ressort. Un nouvel appui sur l'actif le désélectionne (géré par
// le parent, comme partout dans le parcours).
// ---------------------------------------------------------------------------
export function SegmentPills({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <View style={ks.track}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            style={ks.item}
            onPress={() => {
              haptic.select();
              onChange(o.value);
            }}
          >
            {on && (
              <Animated.View
                entering={ZoomIn.springify().damping(16).reduceMotion(ReduceMotion.System)}
                style={[StyleSheet.absoluteFill, ks.activeClip]}
              >
                <LinearGradient
                  colors={ACCENT_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
            )}
            <Text style={[ks.text, on && ks.textOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chip à rebond : la pastille sursaute quand on la choisit. Active : dégradé
// signature. Utilisée pour langues, religion, études et centres d'intérêt.
// ---------------------------------------------------------------------------
export function BounceChip({
  label,
  active,
  onPress,
  index = 0,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  index?: number;
}) {
  const scale = useSharedValue(1);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View
      entering={FadeInDown.duration(220)
        .delay(Math.min(index, 12) * 28)
        .reduceMotion(ReduceMotion.System)}
      style={st}
    >
      <Pressable
        onPress={() => {
          haptic.select();
          scale.value = withSequence(withSpring(1.1, POP), withSpring(1, POP));
          onPress();
        }}
        style={[kc.chip, active && kc.chipOn]}
      >
        {active && (
          <LinearGradient
            colors={ACCENT_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <Text style={[kc.text, active && kc.textOn]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Trait de saisie : la ligne sous le grand champ du prénom. Elle s'étire du
// centre quand la saisie devient valide — la validation se voit sans un mot.
// ---------------------------------------------------------------------------
export function FocusLine({ active }: { active: boolean }) {
  const p = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    p.value = withSpring(active ? 1 : 0, { damping: 18, stiffness: 160 });
  }, [active, p]);

  const st = useAnimatedStyle(() => ({
    transform: [{ scaleX: 0.08 + p.value * 0.92 }],
    opacity: 0.35 + p.value * 0.65,
  }));

  return (
    <View style={kf.track}>
      <Animated.View style={[kf.fill, st]}>
        <LinearGradient
          colors={ACCENT_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Curseur de taille : une poignée sur un rail, on touche n'importe où et elle
// accourt. Le segment parcouru se teinte, la poignée grossit sous le doigt.
// `value` null = pas encore choisi : la poignée attend au centre, estompée.
// ---------------------------------------------------------------------------
const THUMB = 36;
const TRACK_H = 6;

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
  const pressed = useSharedValue(0);
  const last = useSharedValue(value ?? -1);
  const span = Math.max(max - min, 1);

  const onLayout = (width: number) => {
    const u = Math.max(width - THUMB, 1);
    setUsable(u);
    const v = value ?? Math.round((min + max) / 2);
    x.value = ((v - min) / span) * u;
  };

  // « Effacer » côté parent : la poignée revient au centre en douceur.
  useEffect(() => {
    if (value === null && usable > 0) {
      last.value = -1;
      x.value = withSpring(((Math.round((min + max) / 2) - min) / span) * usable, {
        damping: 20,
        stiffness: 160,
      });
    }
  }, [value, usable, min, max, span, x, last]);

  const report = (v: number) => {
    haptic.select();
    onChange(v);
  };

  const moveTo = (ex: number) => {
    'worklet';
    const nx = Math.min(Math.max(ex - THUMB / 2, 0), usable);
    x.value = nx;
    const val = Math.round(min + (nx / Math.max(usable, 1)) * span);
    if (val !== last.value) {
      last.value = val;
      runOnJS(report)(val);
    }
  };

  const pan = Gesture.Pan()
    .onBegin((e) => {
      pressed.value = 1;
      moveTo(e.x);
    })
    .onUpdate((e) => {
      moveTo(e.x);
    })
    .onFinalize(() => {
      pressed.value = 0;
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      { scale: withSpring(pressed.value ? 1.15 : 1, POP) },
    ],
  }));
  const fillStyle = useAnimatedStyle(() => ({ width: x.value + THUMB / 2 }));

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[kd.wrap, value === null && { opacity: 0.55 }]}
        onLayout={(e) => onLayout(e.nativeEvent.layout.width)}
      >
        <View style={kd.track} />
        <Animated.View style={[kd.fill, fillStyle]}>
          <LinearGradient
            colors={ACCENT_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[StyleSheet.absoluteFill, { borderRadius: TRACK_H / 2 }]}
          />
        </Animated.View>
        <Animated.View style={[kd.thumb, thumbStyle]}>
          <LinearGradient
            colors={ACCENT_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={kd.thumbDot} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

// ---------------------------------------------------------------------------

const kh = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    overflow: 'hidden',
  },
  count: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    minWidth: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  countTotal: { color: colors.textMuted, fontWeight: '600' },
});

const ka = StyleSheet.create({
  blob: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    opacity: isDark ? 0.16 : 0.45,
  },
  blobA: {
    top: -90,
    right: -110,
    backgroundColor: colors.washFrom,
    shadowColor: colors.washFrom,
    shadowOpacity: 1,
    shadowRadius: 70,
  },
  blobB: {
    bottom: -60,
    left: -130,
    backgroundColor: colors.washTo,
    shadowColor: colors.washTo,
    shadowOpacity: 1,
    shadowRadius: 70,
  },
});

const kb = StyleSheet.create({
  badge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

const kg = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadows.floating,
  },
  text: { fontSize: 16, fontWeight: '800', color: '#ffffff', letterSpacing: 0.2 },
});

const ko = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  cardOn: {
    borderColor: colors.accent,
    backgroundColor: colors.cardSolid,
    ...shadows.card,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  iconBoxOn: { backgroundColor: colors.accent },
  body: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  labelOn: { fontWeight: '800' },
  hint: { fontSize: 13, color: colors.textMuted },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const kt = StyleSheet.create({
  tile: {
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  tileOn: {
    borderColor: colors.accent,
    backgroundColor: colors.cardSolid,
    ...shadows.card,
  },
  iconRing: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  iconRingOn: { backgroundColor: colors.accent },
  label: { fontSize: 15, fontWeight: '700', color: colors.text },
  labelOn: { color: colors.accent },
  check: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const ks = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    padding: 4,
    gap: 4,
  },
  item: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeClip: { borderRadius: radius.full, overflow: 'hidden' },
  text: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  textOn: { color: '#ffffff' },
});

const kc = StyleSheet.create({
  chip: {
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  chipOn: { borderColor: 'transparent' },
  text: { fontSize: 15, fontWeight: '600', color: colors.text },
  textOn: { color: '#ffffff', fontWeight: '700' },
});

const kf = StyleSheet.create({
  track: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 2, overflow: 'hidden' },
});

const kd = StyleSheet.create({
  wrap: {
    height: THUMB + 10,
    justifyContent: 'center',
  },
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
    overflow: 'hidden',
    top: '50%',
    marginTop: -TRACK_H / 2,
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  thumbDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
  },
});
