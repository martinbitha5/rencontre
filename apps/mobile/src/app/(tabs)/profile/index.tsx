import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyPhotos, getMyVerification, photoUrl, setIncognito } from '../../../api';
import { CoinIcon } from '../../../components/coins';
import { CountUp } from '../../../components/motion';
import { ProfileDetailModal } from '../../../components/ProfileDetailModal';
import { Centered, MenuRow, VerifiedBadge } from '../../../components/ui';
import { COIN_NAME_PLURAL, formatCoins } from '../../../config/economy';
import { useAuth } from '../../../lib/auth';
import { cacheGet, cacheSet } from '../../../lib/cache';
import { useWallet } from '../../../lib/wallet';
import { colors, radius, spacing } from '../../../theme';
import {
  ageFromBirthDate,
  type MyPhoto,
  type VerificationState,
  type ViewableProfile,
} from '../../../types';

// Largeur des cartes promo du carrousel : ~85 % de l'écran pour laisser
// dépasser la carte suivante et inviter au balayage.
const PROMO_WIDTH = Math.round(Dimensions.get('window').width * 0.85);

// Le solde du bandeau ne se compose (0 -> solde) qu'à la PREMIÈRE visite du
// profil après l'ouverture de l'app : demande explicite de l'utilisateur —
// revenir de Rencontres ne doit pas rejouer le comptage. Le portefeuille,
// lui, compte à chaque ouverture (écran wallet).
let balanceIntroPlayed = false;

// Accueil de l'onglet Profil, structure type Heyama : grand bandeau vert
// forêt (avatar + crayon, nom, pilule de solde), carrousel de cartes promo
// (recharge, incognito), puis menu (scan, portefeuille, paramètres).
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.band}>
          <View style={styles.avatarWrap}>
            {/* Toucher ma photo ouvre l'aperçu public de ma fiche, telle que
                les autres la voient. Le crayon reste la porte de l'édition. */}
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
                  <Text style={styles.avatarLetter}>
                    {profile.display_name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.editBadge, pressed && { opacity: 0.8 }]}
              onPress={() => router.push('/(tabs)/profile/edit')}
              hitSlop={8}
            >
              <Ionicons name="pencil" size={15} color={colors.textOnAccent} />
            </Pressable>
          </View>
          <Pressable style={styles.nameRow} onPress={() => setPreviewing(true)}>
            <Text style={styles.name}>
              {profile.display_name}
              {profile.birth_date ? `, ${ageFromBirthDate(profile.birth_date)}` : ''}
            </Text>
            {profile.is_verified && <VerifiedBadge size={22} />}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.balance, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/recharge')}
          >
            <CoinIcon size={15} />
            {wallet ? (
              animateBalance ? (
                <CountUp
                  value={wallet.balance}
                  duration={1100}
                  format={(n) => `${formatCoins(n)} ${COIN_NAME_PLURAL}`}
                  style={styles.balanceText}
                />
              ) : (
                <Text style={styles.balanceText}>
                  {formatCoins(wallet.balance)} {COIN_NAME_PLURAL}
                </Text>
              )
            ) : (
              <Text style={styles.balanceText}>– {COIN_NAME_PLURAL}</Text>
            )}
          </Pressable>

          {/* Vérification, sous la photo et le crayon : l'invitation à
              certifier son compte. Une fois vérifié, seul le badge bleu à
              côté du nom reste (demande explicite : pas de pastille en plus). */}
          {!profile.is_verified && (
            <Pressable
              style={({ pressed }) => [styles.verifyChip, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/verify-profile')}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={17}
                color={colors.textOnPrimary}
              />
              <Text style={styles.verifyChipText}>
                {verification?.status === 'pending'
                  ? 'Vérification en cours'
                  : verification?.status === 'rejected'
                    ? 'Vérification à refaire'
                    : 'Fais vérifier ton compte'}
              </Text>
              <Ionicons name="chevron-forward" size={15} color={colors.textOnPrimary} />
            </Pressable>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={PROMO_WIDTH + spacing.sm}
          snapToAlignment="start"
          decelerationRate="fast"
          contentContainerStyle={styles.carousel}
        >
          <View style={[styles.promo, styles.promoCoins]}>
            <CoinIcon size={26} />
            <Text style={[styles.promoTitle, { color: colors.textOnAccent }]}>Plus de pièces</Text>
            <Text style={[styles.promoText, { color: colors.textOnAccent }]}>
              Recharge ton solde pour liker en retour et écrire en premier.
            </Text>
            <Pressable
              style={({ pressed }) => [styles.promoBtn, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/recharge')}
            >
              <Text style={styles.promoBtnText}>J'en profite</Text>
            </Pressable>
          </View>

          <View style={[styles.promo, styles.promoIncognito]}>
            <View style={styles.promoTopRow}>
              <Ionicons name="eye-off-outline" size={28} color={colors.textOnPrimary} />
              <Switch
                value={profile.incognito}
                onValueChange={toggleIncognito}
                disabled={togglingIncognito}
                trackColor={{ true: colors.accent, false: 'rgba(255,255,255,.35)' }}
                thumbColor="#ffffff"
              />
            </View>
            <Text style={[styles.promoTitle, { color: colors.textOnPrimary }]}>
              Mode incognito
            </Text>
            <Text style={[styles.promoText, { color: 'rgba(255,255,255,.85)' }]}>
              {profile.incognito
                ? 'Activé : tu n’apparais plus dans Rencontres.'
                : 'Reste discret : ton profil sort du deck Rencontres.'}
              {incognitoUntil
                ? ` Abonnement valable jusqu’au ${incognitoUntil}.`
                : ' Sur abonnement.'}
            </Text>
          </View>
        </ScrollView>

        <View style={styles.menu}>
          <MenuRow
            icon="qr-code-outline"
            label="Scanner"
            onPress={() => router.push('/scan')}
          />
          <MenuRow
            icon="wallet-outline"
            label="Mon portefeuille"
            detail={wallet ? formatCoins(wallet.balance) : undefined}
            onPress={() => router.push('/(tabs)/profile/wallet')}
          />
          <MenuRow
            icon="settings-outline"
            label="Paramètres"
            onPress={() => router.push('/(tabs)/profile/settings')}
          />
        </View>
      </ScrollView>

      {/* Aperçu public : même composant que la fiche vue par les autres. */}
      <ProfileDetailModal
        profile={previewing ? publicPreview : null}
        onClose={() => setPreviewing(false)}
        isSelf
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  band: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  avatarWrap: { width: 112, height: 112 },
  avatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,.25)',
  },
  avatarFallback: {
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: colors.textOnPrimary, fontSize: 44, fontWeight: '700' },
  editBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 24, fontWeight: '800', color: colors.textOnPrimary },
  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  balanceText: { fontSize: 15, fontWeight: '800', color: colors.textOnAccent },
  verifyChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,.35)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 2,
  },
  verifyChipText: { fontSize: 13.5, fontWeight: '700', color: colors.textOnPrimary },
  carousel: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  promo: {
    width: PROMO_WIDTH,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    minHeight: 150,
  },
  promoCoins: { backgroundColor: colors.accent },
  promoIncognito: { backgroundColor: colors.primary },
  promoTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promoTitle: { fontSize: 17, fontWeight: '800', marginTop: spacing.xs },
  promoText: { fontSize: 13, lineHeight: 18 },
  promoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: spacing.xs,
  },
  promoBtnText: { fontSize: 13, fontWeight: '700', color: colors.textOnPrimary },
  menu: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
