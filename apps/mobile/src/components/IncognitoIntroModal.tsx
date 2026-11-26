import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Reveal } from '@/components/motion';
import { ZolaMark } from '@/components/ZolaLogo';
import { PAYMENTS_ENABLED } from '@/config/features';
import { INCOGNITO_KEEPS, INCOGNITO_PERKS } from '@/config/incognito';
import { photoUrl } from '@/services/api';
import { haptic } from '@/utils/haptics';
import { colors, flame } from '@/theme';

// Introduction du mode Incognito : un écran entier, aux couleurs du site
// (fond blanc voilé de rose en haut, cartes claires, rose et dégradé flamme). Il s'ouvre
// AVANT l'activation, depuis la carte du profil, et dit tout en un passage :
// ce que les autres ne verront plus, ce que le mode apporte, ce qu'il ne
// change pas, et à quel titre il est ouvert (offert pendant le lancement, ou
// sur abonnement quand le rail payant reviendra).
//
// Le geste visuel qui porte l'écran : MA photo, celle que les autres voient
// dans Rencontres, se voile sous un badge « invisible » une seconde après
// l'ouverture. On comprend l'effet avant d'avoir lu un mot.
//
// Couper l'incognito ne passe pas par ici : redevenir visible est immédiat.

// Encre sombre fixe du badge « invisible » (le noir du site).
const NOIR = '#101113';

export function IncognitoIntroModal({
  visible,
  activating,
  untilLabel,
  photoPath,
  displayName,
  onActivate,
  onClose,
}: {
  visible: boolean;
  // Vrai pendant l'appel serveur : le bouton principal passe en chargement.
  activating: boolean;
  // Échéance de l'abonnement en cours, déjà formatée (rail payant seulement).
  untilLabel: string | null;
  // Ma première photo de profil : c'est elle qui se voile dans le héros.
  photoPath: string | null;
  displayName: string;
  onActivate: () => void;
  onClose: () => void;
}) {
  // Marges lues dans le contexte racine : la SafeAreaView native ne les voit
  // pas dans une Modal Android à barre d'état translucide.
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0,
  );

  const offer = !PAYMENTS_ENABLED
    ? {
        badge: 'Offert pendant le lancement',
        text: 'Normalement réservé aux abonnés, le mode Invisible est ouvert à tout le monde pendant le lancement de Zola. Sans carte, sans engagement.',
      }
    : untilLabel
      ? {
          badge: `Abonnement valable jusqu’au ${untilLabel}`,
          text: 'Ton abonnement est en cours : active le mode quand tu veux, il reste actif jusqu’à l’échéance.',
        }
      : {
          badge: 'Sur abonnement',
          text: 'Le mode Invisible fait partie de l’abonnement. Tu choisis ton forfait à l’étape suivante, sans reconduction automatique.',
        };

  const cta = PAYMENTS_ENABLED && !untilLabel ? 'Choisir mon forfait' : 'Activer le mode Invisible';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.screen}>
        {/* Voile rose doux en haut, qui se fond dans le blanc : le rose des
            sections de l'accueil du site. */}
        <LinearGradient
          colors={[colors.washFrom, colors.background]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 0.55 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Filigrane d'empreinte, la signature de la marque, en haut à droite. */}
        <View style={styles.watermark} pointerEvents="none">
          <ZolaMark size={360} color="rgba(253, 38, 122, 0.035)" strokeWidth={1.6} />
        </View>

        <View
          style={[
            styles.safe,
            {
              paddingTop: topInset,
              paddingBottom: Math.max(insets.bottom, 12),
              paddingLeft: insets.left,
              paddingRight: insets.right,
            },
          ]}
        >
          <View style={styles.topBar}>
            <Pressable
              onPress={() => {
                haptic.tap();
                onClose();
              }}
              hitSlop={12}
              disabled={activating}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              style={({ pressed }) => [
                styles.closeBtn,
                pressed && { opacity: 0.6, transform: [{ scale: 0.92 }] },
                activating && { opacity: 0.4 },
              ]}
            >
              <Ionicons name="close" size={32} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.column}>
              <VeiledAvatar photoPath={photoPath} displayName={displayName} />

              <Reveal index={0} style={styles.heroTexts}>
                <Text style={styles.eyebrow}>MODE INVISIBLE</Text>
                <Text style={styles.title}>Sois là, sans être vu.</Text>
                <Text style={styles.lead}>
                  Ton profil sort du fil Rencontres. Toi, tu continues à voir tout le monde.
                </Text>
              </Reveal>

              {/* L'offre : pourquoi c'est ouvert, avec le badge en dégradé
                  flamme du site. */}
              <Reveal index={1} style={styles.offerCard}>
                <View style={styles.offerBadge}>
                  <LinearGradient
                    colors={flame}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <Ionicons name="gift" size={13} color="#ffffff" />
                  <Text style={styles.offerBadgeText}>{offer.badge}</Text>
                </View>
                <Text style={styles.offerText}>{offer.text}</Text>
              </Reveal>

              <Reveal index={2}>
                <Text style={styles.sectionTitle}>CE QUE TU DÉBLOQUES</Text>
              </Reveal>
              <View style={styles.grid}>
                {INCOGNITO_PERKS.map((perk, i) => (
                  <Reveal key={perk.title} index={3 + i} style={styles.tile}>
                    <View style={styles.tileIcon}>
                      <Ionicons name={perk.icon} size={20} color={colors.primary} />
                    </View>
                    <Text style={styles.tileTitle}>{perk.title}</Text>
                    <Text style={styles.tileText}>{perk.text}</Text>
                  </Reveal>
                ))}
              </View>

              <Reveal index={7} style={styles.keepsCard}>
                <Text style={styles.keepsTitle}>CE QUI NE CHANGE PAS</Text>
                {INCOGNITO_KEEPS.map((line) => (
                  <View key={line} style={styles.keepRow}>
                    <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                    <Text style={styles.keepText}>{line}</Text>
                  </View>
                ))}
              </Reveal>
            </View>
          </ScrollView>

          <View style={[styles.footer, styles.column]}>
            <Pressable
              onPress={() => {
                haptic.impact();
                onActivate();
              }}
              disabled={activating}
              accessibilityRole="button"
              accessibilityLabel={cta}
              style={({ pressed }) => [
                styles.cta,
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <LinearGradient
                colors={flame}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              {activating ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="eye-off" size={18} color="#ffffff" />
                  <Text style={styles.ctaText}>{cta}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                haptic.tap();
                onClose();
              }}
              disabled={activating}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => [styles.later, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.laterText}>Plus tard</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// Ma photo, telle qu'elle apparaît dans Rencontres, qui se voile : l'image
// s'assombrit, un badge « invisible » surgit sur l'anneau. C'est la
// démonstration du mode, avant toute explication.
function VeiledAvatar({
  photoPath,
  displayName,
}: {
  photoPath: string | null;
  displayName: string;
}) {
  const reduceMotion = useReducedMotion();
  const veil = useSharedValue(reduceMotion ? 1 : 0);
  const badge = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    veil.set(withDelay(
      650,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
    ));
    badge.set(withDelay(950, withSpring(1, { damping: 14, stiffness: 220 })));
  }, [reduceMotion, veil, badge]);

  const photoStyle = useAnimatedStyle(() => ({ opacity: 1 - 0.55 * veil.value }));
  const veilStyle = useAnimatedStyle(() => ({ opacity: veil.value }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: badge.value,
    transform: [{ scale: 0.4 + 0.6 * badge.value }],
  }));

  return (
    <View style={styles.hero}>
      <View style={styles.ring}>
        <LinearGradient
          colors={flame}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.ringClip}>
          {photoPath ? (
            <Animated.View style={[StyleSheet.absoluteFill, photoStyle]}>
              <Image
                source={{ uri: photoUrl(photoPath) }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </Animated.View>
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitial}>
                {displayName?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
          )}
          {/* Le voile : un dégradé sombre qui monte sur la photo. */}
          <Animated.View style={[StyleSheet.absoluteFill, veilStyle]} pointerEvents="none">
            <LinearGradient
              colors={['rgba(16, 17, 19,0.15)', 'rgba(16, 17, 19,0.75)']}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </View>
      </View>
      <Animated.View style={[styles.veilBadge, badgeStyle]}>
        <Ionicons name="eye-off" size={20} color="#ffffff" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  watermark: { position: 'absolute', top: -70, right: -110 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    zIndex: 2,
  },
  // La croix seule, sans pastille : grande cible (48 points) pour le pouce.
  closeBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  // Colonne centrée, bornée en largeur : tablette et paysage compris.
  column: { width: '100%', maxWidth: 480, alignSelf: 'center' },

  hero: { alignSelf: 'center', width: 148, height: 148, marginTop: 4 },
  ring: {
    width: 148,
    height: 148,
    borderRadius: 74,
    padding: 4,
    overflow: 'hidden',
  },
  ringClip: {
    flex: 1,
    borderRadius: 70,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.background,
  },
  avatarFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 56, fontWeight: '800', color: colors.textMuted },
  // Badge « invisible » sur l'anneau : rond noir, oeil barré blanc, comme la
  // carte Incognito du profil.
  veilBadge: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: NOIR,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.background,
  },

  heroTexts: { alignItems: 'center', marginTop: 20, gap: 6 },
  eyebrow: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    color: colors.primaryDeep,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  lead: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
  },

  offerCard: {
    marginTop: 22,
    borderRadius: 22,
    padding: 16,
    gap: 10,
    backgroundColor: colors.selected,
  },
  offerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  offerBadgeText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  offerText: { color: colors.text, fontSize: 14, lineHeight: 20 },

  sectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginTop: 26,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  // Cartes claires bordées, deux par rangée, comme les cartes du site.
  tile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 14,
    gap: 6,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tileTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  tileText: { color: colors.textMuted, fontSize: 12.5, lineHeight: 17 },

  keepsCard: {
    marginTop: 14,
    borderRadius: 20,
    padding: 16,
    gap: 10,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  keepsTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: 2,
  },
  keepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  keepText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 20 },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: 4,
  },
  cta: {
    height: 56,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  later: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 16 },
  laterText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
});
