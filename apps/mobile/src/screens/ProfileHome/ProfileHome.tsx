import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyPhotos, getMyVerification, photoUrl, setIncognito } from '@/services/api';
import { CoinIcon } from '@/components/coins';
import { CountUp } from '@/components/motion';
import { ProfileDetailModal } from '@/components/ProfileDetailModal';
import { Centered, VerifiedBadge } from '@/components/ui';
import { formatCoins } from '@/config/economy';
import { PAYMENTS_ENABLED } from '@/config/features';
import { useAuth } from '@/providers/auth';
import { cacheGet, cacheSet } from '@/utils/cache';
import { haptic } from '@/utils/haptics';
import { useWallet } from '@/providers/wallet';
import { colors, spacing } from '@/theme';
import { styles } from './ProfileHome.styles';
import {
  ageFromBirthDate,
  type MyPhoto,
  type VerificationState,
  type ViewableProfile,
} from '@/types';

// Le solde du bandeau ne se compose (0 -> solde) qu'à la PREMIÈRE visite du
// profil après l'ouverture de l'app : demande explicite de l'utilisateur —
// revenir de Rencontres ne doit pas rejouer le comptage. Le portefeuille,
// lui, compte à chaque ouverture (écran wallet).
let balanceIntroPlayed = false;

// Accueil de l'onglet Profil, identité Velours : un doux voile sable fond
// vers l'ivoire derrière le haut (avatar cerclé de crème, nom et solde en
// encre, pilule « Modifier le profil »), carrousel de cartes promo crème à
// coin signature, puis menu en cartes crème séparées.
export default function ProfileHome() {
  const router = useRouter();
  // Dimensions vivantes (rotation, écrans pliables) plutôt qu'un instantané
  // figé au chargement du module.
  const { width: screenW, height: screenH } = useWindowDimensions();
  // Largeur des cartes promo du carrousel : ~85 % de l'écran pour laisser
  // dépasser la carte suivante et inviter au balayage.
  const promoWidth = Math.round(screenW * 0.85);
  // Hauteur du voile sable d'en-tête : ~40 % de l'écran, il fond vers l'ivoire.
  const headerGradH = Math.round(screenH * 0.4);
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
  // l'app se contente d'envoyer vers l'offre quand il refuse. En mode gratuit
  // il n'y a pas d'offre où envoyer : le serveur accorde l'incognito à tout le
  // monde (economy_config.free_mode), et un refus ne peut plus venir que d'une
  // base restée en mode payant.
  const toggleIncognito = async (value: boolean) => {
    if (togglingIncognito) return;
    setTogglingIncognito(true);
    try {
      const res = await setIncognito(value);
      if (res.status === 'subscription_required') {
        if (PAYMENTS_ENABLED) {
          router.push('/incognito');
        } else {
          Alert.alert(
            'Incognito indisponible',
            "Le mode incognito n'est pas activable pour l'instant. Réessaie plus tard.",
          );
        }
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
  // le compte certifié, et la carte « Plus de pièces » tant que l'app est
  // gratuite. Les points de pagination doivent suivre, sinon ils annoncent
  // une carte qui n'existe pas.
  const promoCount =
    (PAYMENTS_ENABLED ? 1 : 0) + 1 + (profile.is_verified ? 0 : 1);

  const onPromoScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / (promoWidth + spacing.sm));
    setPromoIndex(Math.min(Math.max(i, 0), promoCount - 1));
  };

  return (
    <View style={styles.root}>
      {/* Voile sable qui fond vers l'ivoire : l'écran défile par-dessus. */}
      <LinearGradient
        colors={[colors.washFrom, colors.background]}
        style={[styles.headerGrad, { height: headerGradH }]}
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
                    <Ionicons name="person" size={64} color={colors.textMuted} />
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
                <Ionicons name="camera" size={18} color={colors.primaryDeep} />
              </Pressable>
            </View>

            <Pressable style={styles.nameRow} onPress={() => setPreviewing(true)}>
              <Text style={styles.name} numberOfLines={1}>
                {profile.display_name}
                {profile.birth_date ? `, ${ageFromBirthDate(profile.birth_date)}` : ''}
              </Text>
              {profile.is_verified && <VerifiedBadge size={24} />}
            </Pressable>

            {/* Solde, en encre sur le voile sable : mène à la recharge.
                Masqué tant que l'app est gratuite. */}
            {PAYMENTS_ENABLED && (
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
            )}

            <Pressable
              style={({ pressed }) => [styles.editPill, pressed && { opacity: 0.85 }]}
              onPress={() => router.push('/(tabs)/profile/edit')}
            >
              <Text style={styles.editPillText}>Modifier le profil</Text>
            </Pressable>
          </View>

          {/* Carrousel promo : cartes crème à coin signature, pagination. */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={promoWidth + spacing.sm}
            snapToAlignment="start"
            decelerationRate="fast"
            onScroll={onPromoScroll}
            scrollEventThrottle={16}
            contentContainerStyle={styles.carousel}
          >
            {PAYMENTS_ENABLED && (
              <View style={[styles.promo, { width: promoWidth }]}>
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
            )}

            <View style={[styles.promo, { width: promoWidth }]}>
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
                {!PAYMENTS_ENABLED
                  ? ' Offert.'
                  : incognitoUntil
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
              <View style={[styles.promo, { width: promoWidth }]}>
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

          {/* Menu : une carte crème par entrée. */}
          <View style={styles.menu}>
            <MenuCard
              icon="qr-code-outline"
              label="Scanner"
              onPress={() => router.push('/scan')}
            />
            {/* Portefeuille : porte d'entrée de toute l'économie de pièces
                (solde, récompenses, parrainage, transactions). Retirée du menu
                tant que l'app est gratuite. */}
            {PAYMENTS_ENABLED && (
              <MenuCard
                icon="wallet-outline"
                label="Mon portefeuille"
                detail={wallet ? formatCoins(wallet.balance) : undefined}
                onPress={() => router.push('/(tabs)/profile/wallet')}
              />
            )}
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

// Entrée de menu en carte crème séparée : pastille voile sable, icône corail,
// libellé, chevron. Le rouge est réservé aux actions dangereuses.
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
