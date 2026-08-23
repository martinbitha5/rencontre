import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { haptic } from '@/utils/haptics';
import { colors, isIOS, m3, radius, shadows, spacing } from '@/theme';

// Chaque composant parle la langue de sa plateforme : Liquid Glass sur iOS
// (translucides, pilules, enfoncement au ressort), Material 3 sur Android
// (surfaces toniques, ripple natif, échelle de formes M3). Même palette, même
// hiérarchie, deux grammaires — l'app doit sembler née sur chaque système.

// Bleu des badges de certification : volontairement hors palette. La marque
// est prune et magenta partout ailleurs ; ici la couleur ne parle pas de Dowe,
// elle parle de confiance, et c'est un code que le monde entier lit déjà sans
// explication. La teinte est fixe dans les deux thèmes — un badge qui change
// de couleur selon le mode ne serait plus un repère.
//
// Elle avait été passée en prune pour rentrer dans l'identité : c'était une
// erreur, le badge n'est pas un élément de marque.
export const VERIFIED_BLUE = '#1D9BF0';

// Badge « profil certifié », posé à côté du nom partout où il apparaît :
// carte Rencontres, fiche détaillée, listes d'activité, mon profil.
export function VerifiedBadge({ size = 18 }: { size?: number }) {
  return (
    <MaterialCommunityIcons
      name="check-decagram"
      size={size}
      color={VERIFIED_BLUE}
      accessibilityLabel="Profil certifié"
    />
  );
}

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}

// Boutons pilule : rose franc pour l'action principale, prune plein pour le
// secondaire. iOS : verre translucide pour le tertiaire, ombre et compression
// au ressort. Android : bouton M3 (plein sans ombre, outlined à liseré,
// ripple), le retour d'appui est celui du système.
export function Button({ title, onPress, variant = 'primary', loading, disabled }: ButtonProps) {
  const filled = variant === 'primary' || variant === 'secondary' || variant === 'danger';
  const bg = {
    primary: colors.accent,
    secondary: colors.primary,
    // M3 : le bouton outlined est transparent, seul le liseré le dessine.
    outline: isIOS ? colors.surface : 'transparent',
    ghost: 'transparent',
    danger: colors.danger,
  }[variant];
  const fg = {
    primary: colors.textOnAccent,
    secondary: colors.textOnPrimary,
    outline: colors.primary,
    ghost: colors.textMuted,
    danger: '#ffffff',
  }[variant];
  return (
    <Pressable
      onPress={() => {
        // Impact franc pour l'action principale, léger pour le reste.
        if (variant === 'primary' || variant === 'danger') haptic.impact();
        else haptic.tap();
        onPress();
      }}
      disabled={disabled || loading}
      // Ondulation Material : claire sur les fonds pleins, teintée ailleurs.
      android_ripple={{ color: filled ? m3.rippleOnPrimary : m3.ripple }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg },
        // Le ripple est rectangulaire par défaut : on le découpe à la pilule.
        !isIOS && { overflow: 'hidden' },
        !isIOS && variant === 'outline' && { borderWidth: 1, borderColor: m3.outline },
        // iOS : les variantes pleines portent une ombre, elles se détachent du
        // fond comme de vrais boutons. M3 : un bouton plein reste plat.
        isIOS && (variant === 'primary' || variant === 'secondary') && shadows.card,
        isIOS && variant === 'primary' && pressed && { backgroundColor: colors.accentPressed },
        isIOS && variant !== 'primary' && pressed && { opacity: 0.75 },
        // Retour tactile iOS : le bouton se comprime légèrement sous le doigt.
        isIOS && pressed && { transform: [{ scale: 0.98 }] },
        (disabled || loading) && { opacity: 0.45 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  small?: boolean;
}

// Chip sélectionnable. iOS : pilule de verre, prune pleine quand active.
// Android : filter chip M3 — angles 8, liseré au repos, conteneur secondaire
// quand active.
export function Chip({ label, active, onPress, small }: ChipProps) {
  return (
    <Pressable
      onPress={onPress ? () => { haptic.select(); onPress(); } : undefined}
      disabled={!onPress}
      android_ripple={{ color: m3.ripple }}
      style={({ pressed }) => [
        styles.chip,
        small && styles.chipSmall,
        active &&
          (isIOS
            ? { backgroundColor: colors.primary }
            : { backgroundColor: m3.secondaryContainer, borderColor: 'transparent' }),
        isIOS && pressed && { opacity: 0.8 },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          small && styles.chipTextSmall,
          active && { color: isIOS ? colors.textOnPrimary : m3.onSecondaryContainer },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SectionCard({
  title,
  children,
  style,
}: {
  title?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionCard, style]}>
      {!!title && <Text style={styles.sectionTitle}>{title}</Text>}
      {children}
    </View>
  );
}

export function Input(props: TextInputProps) {
  // Liseré vert quand le champ a le focus : on sait toujours où on écrit.
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[styles.input, focused && styles.inputFocused, props.style]}
    />
  );
}

export function ErrorText({ children }: { children: string | null }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

// Pastille de retour des sous-écrans, à poser dans le `left` de ScreenHeader.
// Un seul dessin partout : cercle de verre, chevron encre café.
export function HeaderBackButton({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Retour"
      style={({ pressed }) => [styles.headerBackBtn, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="chevron-back" size={22} color={colors.primaryDeep} />
    </Pressable>
  );
}

// En-tête des sous-écrans (portefeuille, transactions, paramètres, boutique).
// UN SEUL en-tête pour tous : le titre se lit au même endroit d'un écran à
// l'autre. iOS : titre centré, à la manière des barres de navigation natives.
// Android : titre aligné à gauche, comme une top app bar M3. Le retour reste
// possible au geste ; `left` ajoute la pastille quand l'écran la mérite.
export function ScreenHeader({
  title,
  left,
  right,
}: {
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
}) {
  if (!isIOS) {
    return (
      <View style={styles.screenHeaderAndroid}>
        {!!left && <View style={styles.screenHeaderSide}>{left}</View>}
        <Text style={styles.screenHeaderTitleAndroid} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.screenHeaderRight}>{right}</View>
      </View>
    );
  }
  return (
    <View style={styles.screenHeader}>
      {/* Le titre est posé en absolu et centré sur la largeur totale : il reste
          au milieu de l'écran qu'il y ait une pastille à gauche, à droite, ou
          aucune. Le centrer par flex le décalerait au premier bouton posé. */}
      <Text style={styles.screenHeaderTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.screenHeaderSide}>{left}</View>
      <View style={styles.screenHeaderRight}>{right}</View>
    </View>
  );
}

// En-tête du wizard d'onboarding : chevron retour + progression SEGMENTÉE
// (un segment par étape, comme les stories) + compteur "n/N". La progression
// segmentée dit d'un coup d'oeil combien d'étapes restent, là où une barre
// continue ne donne qu'une impression.
export function WizardHeader({
  step,
  total,
  onBack,
}: {
  step: number;
  total: number;
  onBack?: () => void;
}) {
  const router = useRouter();
  return (
    <View style={styles.wizardHeader}>
      <Pressable onPress={onBack ?? (() => router.back())} hitSlop={12} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={22} color={colors.text} />
      </Pressable>
      <View style={styles.progressSegments}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[styles.progressSegment, i < step && styles.progressSegmentDone]}
          />
        ))}
      </View>
      <Text style={styles.stepCounter}>
        {step}/{total}
      </Text>
    </View>
  );
}

// Titre d'étape du wizard : grand titre et sous-titre, sans icône encadrée.
// L'oeil va droit à la question posée.
export function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.stepTitleBlock}>
      <Text style={styles.stepTitleText}>{title}</Text>
      {!!subtitle && <Text style={styles.stepSubtitleText}>{subtitle}</Text>}
    </View>
  );
}

// Intro d'étape : icône dans un carré arrondi à liseré, titre, sous-texte gris.
export function StepIntro({
  icon,
  title,
  subtitle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.stepIntro}>
      <View style={styles.stepIconBox}>
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <Text style={styles.stepTitle}>{title}</Text>
      {!!subtitle && <Text style={styles.stepSubtitle}>{subtitle}</Text>}
    </View>
  );
}

// Segmented control (ex : Oui / Non / Pas de préférence). iOS : pilule sur
// fond de verre, segment actif prune avec ombre. Android : segmented buttons
// M3 — conteneur à liseré, séparateurs verticaux, segment actif sur conteneur
// secondaire.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T | null;
  onChange: (key: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((o, i) => (
        <Pressable
          key={o.key}
          android_ripple={{ color: m3.ripple }}
          style={[
            styles.segment,
            !isIOS && i > 0 && styles.segmentDivider,
            value === o.key && styles.segmentActive,
          ]}
          onPress={() => { haptic.select(); onChange(o.key); }}
        >
          <Text
            style={[styles.segmentText, value === o.key && styles.segmentTextActive]}
            numberOfLines={1}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// Option pleine largeur type pilule avec coche à droite quand sélectionnée.
export function OptionRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      android_ripple={{ color: m3.ripple }}
      style={({ pressed }) => [
        styles.optionRow,
        selected && styles.optionRowSelected,
        isIOS && pressed && { opacity: 0.85 },
      ]}
      onPress={() => { haptic.select(); onPress(); }}
    >
      <Text style={[styles.optionRowText, selected && { color: colors.primary }]}>{label}</Text>
      {selected && (
        <View style={styles.optionCheck}>
          <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />
        </View>
      )}
    </Pressable>
  );
}

// Grande carte sélectionnable (type de profil, thème, pack de pièces...).
export function SelectableCard({
  title,
  badge,
  description,
  selected,
  onPress,
  children,
  style,
}: {
  title?: string;
  badge?: string;
  description?: string;
  selected?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      android_ripple={{ color: m3.ripple }}
      style={({ pressed }) => [
        styles.selectCard,
        selected && styles.selectCardSelected,
        isIOS && pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
        style,
      ]}
      onPress={() => { haptic.select(); onPress(); }}
    >
      {(!!title || !!badge) && (
        <View style={styles.selectCardHead}>
          {!!title && (
            <Text style={[styles.selectCardTitle, selected && { color: colors.primary }]}>
              {title}
            </Text>
          )}
          {!!badge && (
            <View style={styles.selectCardBadge}>
              <Text style={styles.selectCardBadgeText}>{badge}</Text>
            </View>
          )}
        </View>
      )}
      {!!description && <Text style={styles.selectCardDesc}>{description}</Text>}
      {children}
      {selected && (
        <View style={styles.selectCardCheck}>
          <Ionicons name="checkmark" size={14} color={colors.textOnPrimary} />
        </View>
      )}
    </Pressable>
  );
}

// Bandeau d'en-tête couleur primaire avec titre blanc centré.
// Léger dégradé du haut vers le bas : le bandeau a de la matière au lieu
// d'être un aplat, sans changer l'identité de couleur.
export function HeaderBand({
  title,
  left,
  right,
  children,
}: {
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
}) {
  // iOS : le haut reste couleur primaire pour se fondre avec la zone
  // d'encoche, le bas s'éclaircit légèrement et s'arrondit. Android : bandeau
  // plat sans arrondi, comme une top app bar M3 colorée. Dans les deux cas le
  // bandeau se termine par un liseré rose épais et porte une ombre : la
  // frontière entre l'en-tête et le contenu se lit d'un coup d'oeil.
  return (
    <View style={styles.headerBandShadow}>
      {/* La découpe arrondie vit sur ce calque : le liseré du bas épouse la
          courbe, et l'ombre du calque parent n'est pas rognée. */}
      <View style={styles.headerBandClip}>
        <LinearGradient
          colors={isIOS ? [colors.primary, colors.primaryDark] : [colors.primary, colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.4, y: 1 }}
          style={styles.headerBand}
        >
          <View style={styles.headerBandRow}>
            <View style={styles.headerBandSide}>{left}</View>
            <Text style={styles.headerBandTitle} numberOfLines={1}>
              {title}
            </Text>
            <View style={[styles.headerBandSide, { alignItems: 'flex-end' }]}>{right}</View>
          </View>
          {children}
        </LinearGradient>
        {/* Liseré de séparation : un dégradé rose franc qui court sur toute la
            largeur, assez épais pour se voir, dans la palette pour rester
            élégant. */}
        <LinearGradient
          colors={[colors.accent, colors.accentPressed, colors.accent]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.headerBandEdge}
        />
      </View>
    </View>
  );
}

// Libellé de section en majuscules (hub Paramètres).
export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children.toUpperCase()}</Text>;
}

// Rangée de menu : icône ronde, libellé, valeur optionnelle, chevron.
export function MenuRow({
  icon,
  label,
  detail,
  onPress,
  destructive,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      android_ripple={{ color: m3.ripple }}
      // iOS : surlignage du fond à l'appui, plus net qu'une simple
      // transparence. Android : le ripple s'en charge.
      style={({ pressed }) => [
        styles.menuRow,
        isIOS && pressed && { backgroundColor: colors.surface },
      ]}
      onPress={() => { haptic.tap(); onPress(); }}
    >
      {!!icon && (
        <View style={styles.menuRowIcon}>
          <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.primary} />
        </View>
      )}
      <Text
        style={[styles.menuRowLabel, destructive && { color: colors.danger }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {!!detail && (
        <Text style={styles.menuRowDetail} numberOfLines={1}>
          {detail}
        </Text>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wizardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  // Progression segmentée : un trait par étape, franchi au fur et à mesure.
  progressSegments: { flex: 1, flexDirection: 'row', gap: 4 },
  progressSegment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surface,
  },
  progressSegmentDone: { backgroundColor: colors.accent },
  stepCounter: { fontSize: 13, fontWeight: '700', color: colors.textMuted, minWidth: 30, textAlign: 'right' },
  stepTitleBlock: { paddingHorizontal: spacing.md, marginTop: spacing.lg, gap: spacing.sm },
  stepTitleText: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 37,
    letterSpacing: -0.5,
  },
  stepSubtitleText: { fontSize: 15, color: colors.textMuted, lineHeight: 22 },
  stepIntro: { paddingHorizontal: spacing.md, marginTop: spacing.sm, gap: spacing.sm },
  stepIconBox: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  stepSubtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  segmented: isIOS
    ? {
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderRadius: radius.full,
        padding: 3,
      }
    : {
        flexDirection: 'row',
        borderRadius: radius.full,
        borderWidth: 1,
        borderColor: m3.outline,
        overflow: 'hidden',
      },
  segment: {
    flex: 1,
    paddingVertical: isIOS ? 9 : 10,
    borderRadius: isIOS ? radius.full : 0,
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  // Séparateur vertical entre segments, signature des segmented buttons M3.
  segmentDivider: { borderLeftWidth: 1, borderLeftColor: m3.outline },
  segmentActive: isIOS
    ? { backgroundColor: colors.primary, ...shadows.card }
    : { backgroundColor: m3.secondaryContainer },
  segmentText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: isIOS ? colors.textOnPrimary : m3.onSecondaryContainer },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // iOS : pilule de verre. Android : carte tonique aux angles M3.
    backgroundColor: isIOS ? colors.surface : m3.surfaceContainerLow,
    borderRadius: isIOS ? radius.full : radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingVertical: 15,
    overflow: isIOS ? undefined : 'hidden',
  },
  optionRowSelected: {
    borderColor: colors.primary,
    backgroundColor: isIOS ? colors.card : m3.secondaryContainer,
  },
  // flexShrink : un libellé long passe à la ligne au lieu de pousser la coche
  // hors de la pilule sur les petits écrans.
  optionRowText: { fontSize: 16, fontWeight: '600', color: colors.text, flexShrink: 1 },
  optionCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCard: {
    backgroundColor: isIOS ? colors.surface : m3.surfaceContainerLow,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.md,
    gap: spacing.xs,
    overflow: isIOS ? undefined : 'hidden',
  },
  selectCardSelected: isIOS
    ? { borderColor: colors.primary, backgroundColor: colors.card, ...shadows.card }
    : { borderColor: colors.primary, backgroundColor: m3.surfaceContainerHigh },
  selectCardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // flexShrink : le badge reste visible même si le titre est long.
  selectCardTitle: { fontSize: 17, fontWeight: '800', color: colors.text, flexShrink: 1 },
  selectCardBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  selectCardBadgeText: { fontSize: 11, fontWeight: '800', color: colors.textOnAccent },
  selectCardDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  selectCardCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // L'ombre vit sur le calque extérieur (une découpe `overflow: hidden` la
  // rognerait sur iOS) ; elle décolle l'en-tête du contenu.
  headerBandShadow: {
    ...shadows.card,
    shadowOffset: { width: 0, height: 6 },
    zIndex: 1,
  },
  headerBandClip: {
    overflow: 'hidden',
    // Bas arrondi sur iOS seulement : une top app bar M3 est droite.
    borderBottomLeftRadius: isIOS ? radius.lg : 0,
    borderBottomRightRadius: isIOS ? radius.lg : 0,
    backgroundColor: colors.primary,
  },
  headerBand: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  // Liseré de séparation sous le bandeau : 4 points d'épaisseur, la courbe
  // du bas est donnée par la découpe du calque parent.
  headerBandEdge: { height: 4 },
  headerBandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  headerBandSide: { width: 60, justifyContent: 'center' },
  headerBandTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: colors.textOnPrimary,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    backgroundColor: colors.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuRowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuRowLabel: { flex: 1, minWidth: 0, fontSize: 16, fontWeight: '600', color: colors.text },
  menuRowDetail: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
    flexShrink: 1,
    maxWidth: '45%',
  },
  button: {
    height: 54,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  chip: isIOS
    ? {
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: radius.full,
        backgroundColor: colors.surface,
      }
    : {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: m3.outlineVariant,
        backgroundColor: 'transparent',
        overflow: 'hidden',
      },
  chipSmall: { paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  chipTextSmall: { fontSize: 12 },
  // iOS : carte de verre dense à liseré, ombre douce. Android : carte élevée
  // M3, surface tonique opaque, élévation 1.
  sectionCard: isIOS
    ? {
        backgroundColor: colors.card,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        ...shadows.card,
      }
    : {
        backgroundColor: m3.surfaceContainerLow,
        borderRadius: radius.md,
        padding: spacing.md,
        elevation: 1,
      },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  // iOS : champ de verre, liseré au focus. Android : champ outlined M3, le
  // liseré passe du gris neutre à la couleur primaire au focus.
  input: {
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: isIOS ? colors.inputBg : m3.surfaceContainerLowest,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: isIOS ? 'transparent' : m3.outlineVariant,
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: isIOS ? colors.card : m3.surfaceContainerLowest,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    // Pastille gauche à gauche, pastille droite à droite : le titre, posé en
    // absolu, reste centré quoi qu'il arrive.
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenHeaderTitle: {
    ...StyleSheet.absoluteFillObject,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 52,
    // Marge de part et d'autre pour qu'un titre long ne passe pas sous la
    // pastille de droite.
    paddingHorizontal: 52,
    fontSize: 24,
    fontWeight: '800',
    color: colors.primaryDeep,
  },
  screenHeaderSide: { flexDirection: 'row', alignItems: 'center' },
  screenHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  // Variante Android : top app bar M3, titre à gauche, actions à droite.
  screenHeaderAndroid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 56,
  },
  screenHeaderTitleAndroid: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.primaryDeep,
  },
});
