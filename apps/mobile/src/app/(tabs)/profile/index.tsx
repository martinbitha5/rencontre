import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyPhotos, getMyVerification, photoUrl, setIncognito } from '../../../api';
import { CoinIcon } from '../../../components/coins';
import { CountUp } from '../../../components/motion';
import { ProfileDetailModal } from '../../../components/ProfileDetailModal';
import { Centered, VerifiedBadge } from '../../../components/ui';
import { formatCoins } from '../../../config/economy';
import { useAuth } from '../../../lib/auth';
import { cacheGet, cacheSet } from '../../../lib/cache';
import { haptic } from '../../../lib/haptics';
import { useWallet } from '../../../lib/wallet';
import { colors, radius, shadows, spacing } from '../../../theme';
import {
  ageFromBirthDate,
  type MyPhoto,
  type VerificationState,
  type ViewableProfile,
} from '../../../types';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Largeur des cartes promo du carrousel : ~85 % de l'écran pour laisser
// dépasser la carte suivante et inviter au balayage.
const PROMO_WIDTH = Math.round(SCREEN_W * 0.85);

// Hauteur du dégradé d'en-tête : ~45 % de l'écran, il fond vers le fond.
const HEADER_GRAD_H = Math.round(SCREEN_H * 0.45);

// Le solde du bandeau ne se compose (0 -> solde) qu'à la PREMIÈRE visite du
// profil après l'ouverture de l'app : demande explicite de l'utilisateur —
// revenir de Rencontres ne doit pas rejouer le comptage. Le portefeuille,
// lui, compte à chaque ouverture (écran wallet).
let balanceIntroPlayed = false;

// Accueil de l'onglet Profil, structure type Heyama : dégradé magenta qui
// fond vers le fond de l'écran (avatar cerclé de blanc, nom, solde, pilule
// « Modifier le profil »), carrousel de cartes promo blanches à pagination,
// puis menu en cartes blanches séparées.
export default function ProfileHome() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  // Échéance de l'abonnement Incognito, formatée pour la carte ci-dessous.
  const incognitoUntil =
    wallet?.incognito_until && new Date(wallet.incognito_until) > new Date()
      ? new Date(wallet.incognito_until).toLocaleDateString('fr-FR')
      : null;
  const [photos, setPhotos] = useState<MyPhoto[]>([]);
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [togglingIncognito, setTogglingIncognito] = useState(false);
  // Carte promo visible, pour les points de pagination sous le carrousel.
  const [promoIndex, setPromoIndex] = useState(0);
  // Aperçu public : la fiche exacte que voient les autres, ouverte au toucher
  // de ma photo.
  const [previewing, setPreviewing] = useState(false);
  // Consomme le droit au comptage d'intro : vrai une seule fois par lancement.
  const [animateBalance] = useState(() => {
    if (balanceIntroPlayed) return false;
    balanceIntroPlayed = true;
    return true;
  });

  // Les photos et l'état de vérification connus s'affichent immédiatement
  // depuis le cache local (préchauffé dès l'arrivée sur les onglets, voir
  // (tabs)/_layout) ; le réseau corrige ensuite en silence.
  useEffect(() => {
    cacheGet<MyPhoto[]>('my-photos').then((cached) => {
      if (cached) setPhotos((prev) => (prev.length ? prev : cached));
    });
    cacheGet<VerificationState>('my-verification').then((cached) => {
      if (cached) setVerification((prev) => prev ?? cached);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      getMyPhotos()
        .then((fresh) => {
          setPhotos(fresh);
          cacheSet('my-photos', fresh);
        })
        .catch(() => {});
      getMyVerification()
        .then((fresh) => {
          setVerification(fresh);
          cacheSet('my-verification', fresh);
        })
        .catch(() => {});
      refreshWallet();
    }, [refreshWallet]),
  );

  if (!profile) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Centered>
    );
  }

  // Ma fiche publique, assemblée avec les mêmes données que celles servies aux
  // autres : ce que je vois dans l'aperçu est ce qu'ils voient. La ville reste
  // vide (l'écran ne connaît que son identifiant), la fiche sait l'omettre.
  const publicPreview: ViewableProfile = {
    ...profile,
    display_name: profile.display_name ?? '',
    birth_date: profile.birth_date ?? '',
    gender: profile.gender ?? 'homme',
    bio: profile.bio ?? '',
    city_name: null,
    photos: photos.map((p) => ({ id: p.id, path: p.storage_path })),
  };

  // L'activation exige un abonnement en cours : c'est le serveur qui tranche,
  // l'app se contente d'envoyer vers l'offre quand il refuse.
  const toggleIncognito = async (value: boolean) => {
    if (togglingIncognito) return;
    setTogglingIncognito(true);
    try {
      const res = await setIncognito(value);
      if (res.status === 'subscription_required') {
        router.push('/incognito');
        return;
      }
      await refreshProfile();
    } catch {
      Alert.alert('Erreur', "Impossible de changer le mode incognito pour l'instant.");
    } finally {
      setTogglingIncognito(false);
    }
  };

  // Nombre de cartes du carrousel : la carte vérification disparaît une fois
  // le compte certifié.
  const promoCount = profile.is_verified ? 2 : 3;

  const onPromoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (PROMO_WIDTH + spacing.sm));
    setPromoIndex(Math.min(Math.max(i, 0), promoCount - 1));
  };

  return (
    <View style={styles.root}>
      {/* Dégradé magenta qui fond vers le fond : l'écran défile par-dessus. */}
      <LinearGradient
        colors={[colors.headerGradFrom, colors.headerGradTo, colors.background]}
        style={styles.headerGrad}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.band}>
            <View style={styles.avatarWrap}>
              {/* Toucher ma photo ouvre l'aperçu public de ma fiche, telle que
                  les autres la voient. Le badge caméra mène à l'édition. */}
              <Pressable
                onPress={() => setPreviewing(true)}
                accessibilityRole="button"
                accessibilityLabel="Voir mon profil comme les autres le voient"
              >
                {photos[0] ? (
                  <Image
                    source={{ uri: photoUrl(photos[0].storage_path) }}
                    style={styles.avatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="person" size={64} color="#9ca3af" />
                  </View>
                )}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.cameraBadge, pressed && { opacity: 0.8 }]}
                onPress={() => router.push('/(tabs)/profile/edit')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Changer ma photo"
              >
                <Ionicons name="camera" size={18} color="#6b7280" />
              </Pressable>
            </View>

            <Pressable style={styles.nameRow} onPress={() => setPreviewing(true)}>
              <Text style={styles.name}>
                {profile.display_name}
                {profile.birth_date ? `, ${ageFromBirthDate(profile.birth_date)}` : ''}
              </Text>
              {profile.is_verified && <VerifiedBadge size={24} />}
            </Pressable>

            {/* Solde, blanc sur le dégradé : mène à la recharge. */}
            <Pressable
              style={({ pressed }) => [styles.balance, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/recharge')}
            >
              {wallet ? (
                animateBalance ? (
                  <CountUp
                    value={wallet.balance}
                    duration={1100}
                    format={(n) => formatCoins(n)}
                    style={styles.balanceText}
                  />
                ) : (
                  <Text style={styles.balanceText}>{formatCoins(wallet.balance)}</Text>
                )
              ) : (
                <Text style={styles.balanceText}>–</Text>
              )}
              <CoinIcon size={18} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.editPill, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/(tabs)/profile/edit')}
            >
              <Text style={styles.editPillText}>Modifier le profil</Text>
            </Pressable>
          </View>

          {/* Carrousel promo : cartes blanches à pagination. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={PROMO_WIDTH + spacing.sm}
            snapToAlignment="start"
            decelerationRate="fast"
            onScroll={onPromoScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.carousel}
          >
            <View style={styles.promo}>
              <View style={styles.promoIconRow}>
                <View style={styles.promoIconCircle}>
                  <CoinIcon size={24} />
                </View>
                <Text style={styles.promoTitle}>Plus de pièces</Text>
              </View>
              <Text style={styles.promoText}>
                Recharge ton solde pour liker en retour et écrire en premier.
              </Text>
              <Pressable
                style={({ pressed }) => [styles.promoBtnWrap, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  haptic.tap();
                  router.push('/recharge');
                }}
              >
                <LinearGradient
                  colors={[colors.purple, colors.purpleDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.promoBtn}
                >
                  <Text style={styles.promoBtnText}>{"J'en profite"}</Text>
                </LinearGradient>
              </Pressable>
            </View>

            <View style={styles.promo}>
              <View style={styles.promoIconRow}>
                <View style={styles.promoIconCircle}>
                  <Ionicons name="eye-off-outline" size={24} color={colors.text} />
                </View>
                <Text style={styles.promoTitle}>Incognito</Text>
              </View>
              <Text style={styles.promoText}>
                {profile.incognito
                  ? 'Activé : tu n’apparais plus dans Rencontres.'
                  : 'Reste discret : ton profil sort du deck Rencontres.'}
                {incognitoUntil
                  ? ` Abonnement valable jusqu’au ${incognitoUntil}.`
                  : ' Sur abonnement.'}
              </Text>
              <Pressable
                disabled={togglingIncognito}
                style={({ pressed }) => [
                  styles.promoBtnWrap,
                  (pressed || togglingIncognito) && { opacity: 0.85 },
                ]}
                onPress={() => {
                  haptic.tap();
                  toggleIncognito(!profile.incognito);
                }}
              >
                <LinearGradient
                  colors={[colors.purple, colors.purpleDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.promoBtn}
                >
                  <Text style={styles.promoBtnText}>
                    {profile.incognito ? 'Redevenir visible' : 'Deviens invisible'}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>

            {/* Vérification : l'invitation à certifier son compte. Une fois
                vérifié, seul le badge bleu à côté du nom reste. */}
            {!profile.is_verified && (
              <View style={styles.promo}>
                <View style={styles.promoIconRow}>
                  <View style={styles.promoIconCircle}>
                    <Ionicons name="shield-checkmark-outline" size={24} color={colors.text} />
                  </View>
                  <Text style={styles.promoTitle}>Vérification</Text>
                </View>
                <Text style={styles.promoText}>
                  {verification?.status === 'pending'
                    ? 'Ta vérification est en cours, on te prévient dès que c’est bon.'
                    : verification?.status === 'rejected'
                      ? 'Ta vérification a échoué, refais une tentative.'
                      : 'Fais vérifier ton compte et gagne le badge bleu de confiance.'}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.promoBtnWrap, pressed && { opacity: 0.85 }]}
                  onPress={() => {
                    haptic.tap();
                    router.push('/verify-profile');
                  }}
                >
                  <LinearGradient
                    colors={[colors.purple, colors.purpleDark]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.promoBtn}
                  >
                    <Text style={styles.promoBtnText}>
                      {verification?.status === 'pending' ? 'Voir où ça en est' : 'Je me lance'}
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            )}
          </ScrollView>

          {/* Points de pagination du carrousel. */}
          <View style={styles.dots}>
            {Array.from({ length: promoCount }).map((_, i) => (
              <View key={i} style={[styles.dot, i === promoIndex && styles.dotActive]} />
            ))}
          </View>

          {/* Menu : une carte blanche par entrée. */}
          <View style={styles.menu}>
            <MenuCard
              icon="qr-code-outline"
              label="Scanner"
              onPress={() => router.push('/scan')}
            />
            <MenuCard
              icon="wallet-outline"
              label="Mon portefeuille"
              detail={wallet ? formatCoins(wallet.balance) : undefined}
              onPress={() => router.push('/(tabs)/profile/wallet')}
            />
            <MenuCard
              icon="settings-outline"
              label="Paramètres"
              onPress={() => router.push('/(tabs)/profile/settings')}
            />
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* Aperçu public : même composant que la fiche vue par les autres. */}
      <ProfileDetailModal
        profile={previewing ? publicPreview : null}
        onClose={() => setPreviewing(false)}
        isSelf
      />
    </View>
  );
}

// Entrée de menu en carte blanche séparée : pastille rose pâle, libellé,
// chevron. Le rouge est réservé aux actions dangereuses.
function MenuCard({
  icon,
  label,
  detail,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuCard, pressed && { opacity: 0.85 }]}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
    >
      <View style={styles.menuIconWash}>
        <Ionicons name={icon} size={20} color={destructive ? colors.danger : colors.accent} />
      </View>
      <Text style={[styles.menuLabel, destructive && { color: colors.danger }]}>{label}</Text>
      {!!detail && <Text style={styles.menuDetail}>{detail}</Text>}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headerGrad: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_GRAD_H,
  },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: spacing.xl * 2, gap: spacing.md },
  band: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  avatarWrap: { width: 130, height: 130 },
  avatar: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  avatarFallback: {
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 26, fontWeight: '700', color: '#ffffff' },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceText: { fontSize: 18, fontWeight: '700', color: '#ffffff' },
  editPill: {
    height: 44,
    paddingHorizontal: 24,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  editPillText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  carousel: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  promo: {
    width: PROMO_WIDTH,
    backgroundColor: colors.cardSolid,
    borderRadius: 24,
    padding: 18,
    gap: spacing.sm,
    ...shadows.card,
  },
  promoIconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  promoIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  promoText: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  promoBtnWrap: { alignSelf: 'flex-start', marginTop: spacing.xs },
  promoBtn: {
    height: 44,
    paddingHorizontal: 20,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBtnText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: -spacing.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.accent,
  },
  menu: {
    marginHorizontal: spacing.md,
    gap: 0,
  },
  menuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  menuIconWash: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.washFrom,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 17, fontWeight: '600', color: colors.text },
  menuDetail: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
});
