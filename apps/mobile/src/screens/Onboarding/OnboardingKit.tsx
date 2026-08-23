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
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { haptic } from '@/utils/haptics';
import { colors, shadows, sigCorner, spacing } from '@/theme';

// Kit de l'onboarding : les primitives visuelles du parcours. Pas d'animation
// décorative : les états s'affichent directement, le retour d'appui passe par
// une simple baisse d'opacité, et l'haptique confirme chaque choix.

// Dégradé signature du parcours : le magenta Velours vers sa version appuyée,
// dans les deux thèmes (les tokens portent déjà la déclinaison sombre).
export const ACCENT_GRADIENT = [colors.accent, colors.accentPressed] as [
  string,
  string,
];

// Dégradé des sélections MULTIPLES : voile rose pâle, encre prune. Le magenta
// dit « c'est ici qu'il faut appuyer » ; il ne peut pas dire ça vingt fois sur
// le même écran. Une liste de centres d'intérêt entièrement magenta ne
// signalerait plus rien et écraserait le bouton d'action juste en dessous.
// Les choix UNIQUES (genre, recherche, objectif) gardent le magenta : là, une
// seule pastille est allumée et elle doit se voir.
export const SELECT_GRADIENT = [colors.selected, colors.washTo] as [
  string,
  string,
];

// ---------------------------------------------------------------------------
// En-tête : chevron retour + barre de progression au dégradé. La largeur est
// recalculée à chaque rendu, sans animation.
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
        <View style={[kh.fill, { width: `${(step / total) * 100}%` }]}>
          <LinearGradient
            colors={ACCENT_GRADIENT}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
      </View>
      <Text style={kh.count}>
        {step}
        <Text style={kh.countTotal}>/{total}</Text>
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pastille d'étape : l'icône qui donne sa personnalité à chaque question.
// ---------------------------------------------------------------------------
export function StepBadge({ icon }: { icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={kb.badge}>
      <Ionicons name={icon} size={22} color={colors.accent} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bouton principal : dégradé signature et coin signature Velours, retour
// d'appui par opacité. L'unique bouton plein de l'écran.
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
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={() => {
        haptic.impact();
        onPress();
      }}
      style={({ pressed }) => [
        kg.btn,
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.85 },
      ]}
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
  );
}

// ---------------------------------------------------------------------------
// Carte d'option pleine largeur : icône dans un carré teinté, libellé, coche
// à la sélection.
// ---------------------------------------------------------------------------
export function OptionCard({
  icon,
  label,
  hint,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [
        ko.card,
        selected && ko.cardOn,
        pressed && { opacity: 0.85 },
      ]}
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
        <View style={ko.check}>
          <Ionicons name="checkmark" size={14} color={colors.textOnAccent} />
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Tuile de choix : carte demi-largeur verticale (genre, enfants), grande
// icône, coche à la sélection.
// ---------------------------------------------------------------------------
export function ChoiceTile({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [
        kt.tile,
        selected && kt.tileOn,
        pressed && { opacity: 0.85 },
      ]}
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
        <View style={kt.check}>
          <Ionicons name="checkmark" size={13} color={colors.textOnAccent} />
        </View>
      )}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Pilules segmentées (Jamais / Parfois / Souvent) : le segment actif porte le
// dégradé signature. Un nouvel appui sur l'actif le désélectionne (géré par
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
            style={({ pressed }) => [ks.item, pressed && { opacity: 0.85 }]}
            onPress={() => {
              haptic.select();
              onChange(o.value);
            }}
          >
            {on && (
              <View style={[StyleSheet.absoluteFill, ks.activeClip]}>
                <LinearGradient
                  colors={ACCENT_GRADIENT}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              </View>
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
// Chip de sélection : active, elle porte le dégradé signature. Utilisée pour
// langues, religion, études et centres d'intérêt.
// ---------------------------------------------------------------------------
export function BounceChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [
        kc.chip,
        active && kc.chipOn,
        pressed && { opacity: 0.85 },
      ]}
    >
      {active && (
        <LinearGradient
          colors={SELECT_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <Text style={[kc.text, active && kc.textOn]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Trait de saisie : la ligne sous le grand champ du prénom. Pleine quand la
// saisie est valide, discrète sinon.
// ---------------------------------------------------------------------------
export function FocusLine({ active }: { active: boolean }) {
  return (
    <View style={kf.track}>
      <View
        style={[
          kf.fill,
          {
            transform: [{ scaleX: active ? 1 : 0.08 }],
            opacity: active ? 1 : 0.35,
          },
        ]}
      >
        <LinearGradient
          colors={ACCENT_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Curseur de taille : une poignée sur un rail, on touche n'importe où et elle
// s'y place. Le segment parcouru se teinte. `value` null = pas encore choisi :
// la poignée attend au centre, estompée.
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
  const last = useSharedValue(value ?? -1);
  const span = Math.max(max - min, 1);

  const onLayout = (width: number) => {
    const u = Math.max(width - THUMB, 1);
    setUsable(u);
    const v = value ?? Math.round((min + max) / 2);
    x.value = ((v - min) / span) * u;
  };

  // « Effacer » côté parent : la poignée revient au centre, sans transition.
  useEffect(() => {
    if (value === null && usable > 0) {
      last.value = -1;
      x.value = ((Math.round((min + max) / 2) - min) / span) * usable;
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

const kb = StyleSheet.create({
  badge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardSolid,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
});

const kg = StyleSheet.create({
  btn: {
    height: 56,
    borderRadius: 18,
    borderBottomRightRadius: 8,
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
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    borderBottomRightRadius: sigCorner,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    ...shadows.card,
  },
  cardOn: {
    borderColor: colors.accent,
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
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    borderBottomRightRadius: sigCorner,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    ...shadows.card,
  },
  tileOn: {
    borderColor: colors.accent,
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
    borderRadius: 16,
    borderBottomRightRadius: 6,
    padding: 4,
    gap: 4,
  },
  item: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    borderBottomRightRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeClip: {
    borderRadius: 12,
    borderBottomRightRadius: 6,
    overflow: 'hidden',
  },
  text: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  textOn: { color: '#ffffff' },
});

const kc = StyleSheet.create({
  chip: {
    borderRadius: 16,
    borderBottomRightRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardSolid,
    paddingHorizontal: 16,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  // Sélectionnée : voile rose, liseré prune. Le liseré fait tout le travail de
  // signalement — sans lui, un voile rose pâle sur une carte claire se verrait
  // à peine.
  chipOn: { borderColor: colors.primary },
  text: { fontSize: 15, fontWeight: '600', color: colors.text },
  textOn: { color: colors.selectedInk, fontWeight: '700' },
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
