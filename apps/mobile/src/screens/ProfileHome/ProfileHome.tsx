import { Ionicons } from '@expo/vector-icons';

import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyPhotos, getMyVerification, setIncognito, updateMyProfile } from '@/services/api';
import { GoalSheet } from '@/components/GoalSheet';
import { CoinIcon } from '@/components/coins';
import { IncognitoIntroModal } from '@/components/IncognitoIntroModal';
import { ProfileDetailModal } from '@/components/ProfileDetailModal';
import { Centered, VerifiedBadge } from '@/components/ui';
import { formatCoins } from '@/config/economy';
import { TesterProgramCard } from '@/components/TesterProgram';
import { PAYMENTS_ENABLED } from '@/config/features';
import { SITE } from '@/config/support';
import { useAuth } from '@/providers/auth';
import { cacheGet, cacheSet } from '@/utils/cache';
import { haptic } from '@/utils/haptics';
import { useWallet } from '@/providers/wallet';
import { useResponsive } from '@/hooks/useResponsive';
import { GOAL_OPTIONS, goalIcon, labelFor } from '@/profileOptions';
import { colors, flame } from '@/theme';
import { styles } from './ProfileHome.styles';
import {
  ageFromBirthDate,
  type MyPhoto,
  type VerificationState,
  type ViewableProfile,
} from '@/types';
import { Photo } from '@/components/Photo';
import { refreshUnreadNotices, useUnreadNotices } from '@/utils/noticeSignal';

// Accueil de l'onglet Profil. En haut, sur fond blanc : le titre et trois
// raccourcis (paramètres, aide, modifier), la photo dans l'anneau de
// remplissage avec le prénom et l'intention, puis la prochaine chose à faire
// pour un meilleur profil. En dessous, deux onglets soulignés et une zone
// grise de cartes blanches : mes atouts (photos, vérification, soirées) et
// sécurité (Incognito, code secret, confidentialité, conseils).
export default function ProfileHome() {
  const router = useRouter();
  // Petit téléphone (moins de 360 points) : photo, nom et tuiles se
  // resserrent pour que rien ne soit coupé.
  const { width } = useResponsive();
  // La photo suit la largeur de l'écran (34 %), bornée entre 104 et 148.
  const ring = Math.round(Math.min(148, Math.max(104, width * 0.34)));
  // Sous 400 points, le nom et l'intention prennent une taille plus sobre.
  const narrow = width < 400;
  const avatarSize = ring - 20;
  const { profile, refreshProfile } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  // Échéance de l'abonnement Invisible, formatée pour la carte ci-dessous.
  const incognitoUntil =
    wallet?.incognito_until && new Date(wallet.incognito_until) > new Date()
      ? new Date(wallet.incognito_until).toLocaleDateString('fr-FR')
      : null;
  const [photos, setPhotos] = useState<MyPhoto[]>([]);
  const [verification, setVerification] = useState<VerificationState | null>(null);
  const [togglingIncognito, setTogglingIncognito] = useState(false);
  // Feuille d'introduction Incognito : elle s'ouvre avant chaque ACTIVATION
  // pour dire ce que le mode apporte et à quel titre il est ouvert. Couper le
  // mode reste immédiat, sans feuille.
  const [incognitoIntro, setIncognitoIntro] = useState(false);
  // Onglet affiché sous l'identité.
  const [tab, setTab] = useState<'atouts' | 'securite'>('atouts');
  // Aperçu public : la fiche exacte que voient les autres, ouverte au toucher
  // de ma photo.
  const [previewing, setPreviewing] = useState(false);
  // Choix de l'intention, ouvert depuis la pastille sous le prénom.
  const [goalOpen, setGoalOpen] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);

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

  // Cloche : nombre de notifications non lues, relu à chaque visite.
  const unreadNotices = useUnreadNotices();
  // Lu dans l'effet de focus sans le relancer à chaque rendu.
  const profileVerifiedRef = useRef(!!profile?.is_verified);
  useEffect(() => {
    profileVerifiedRef.current = !!profile?.is_verified;
  }, [profile?.is_verified]);

  useFocusEffect(
    useCallback(() => {
      refreshUnreadNotices();
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
          // Vérification validée depuis le dernier chargement du profil : on
          // relit le profil pour que le badge apparaisse et que la tuile parte.
          if (fresh.is_verified && !profileVerifiedRef.current) void refreshProfile();
        })
        .catch(() => {});
      refreshWallet();
    }, [refreshWallet, refreshProfile]),
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
        setIncognitoIntro(false);
        if (PAYMENTS_ENABLED) {
          router.push('/incognito');
        } else {
          Alert.alert(
            'Mode Invisible indisponible',
            "Le mode Invisible n'est pas activable pour l'instant. Réessaie plus tard.",
          );
        }
        return;
      }
      await refreshProfile();
      setIncognitoIntro(false);
      if (value) haptic.success();
    } catch {
      Alert.alert('Erreur', "Impossible de changer le mode Invisible pour l'instant.");
    } finally {
      setTogglingIncognito(false);
    }
  };

  // Le bouton de la carte : activer passe par la feuille d'introduction,
  // couper est immédiat. En rail payant sans abonnement en cours, la feuille
  // envoie directement vers les forfaits plutôt que d'essuyer un refus.
  const onIncognitoPress = () => {
    haptic.tap();
    if (profile?.incognito) {
      toggleIncognito(false);
      return;
    }
    setIncognitoIntro(true);
  };

  const onIncognitoActivate = () => {
    if (PAYMENTS_ENABLED && !incognitoUntil) {
      setIncognitoIntro(false);
      router.push('/incognito');
      return;
    }
    toggleIncognito(true);
  };

  const saveGoal = async (value: string) => {
    if (savingGoal) return;
    setSavingGoal(true);
    try {
      await updateMyProfile({ relationship_goal: value });
      await refreshProfile();
      setGoalOpen(false);
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer ton intention pour l'instant. Réessaie.");
    } finally {
      setSavingGoal(false);
    }
  };

  // Taux de remplissage du profil : chaque info compte pareil. Il s'affiche
  // dans l'anneau autour de la photo et pilote la carte « Complète ton
  // profil » juste en dessous.
  const checks = [
    photos.length >= 2,
    !!profile.bio?.trim(),
    !!profile.job_title,
    !!profile.education,
    !!profile.height_cm,
    !!profile.religion,
    (profile.languages?.length ?? 0) > 0,
    (profile.interests?.length ?? 0) >= 5,
    !!profile.smoking,
    !!profile.drinking,
    !!profile.wants_children,
    !!profile.relationship_goal,
    profile.is_verified,
  ];
  const completion = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  const goalLabel = labelFor(GOAL_OPTIONS, profile.relationship_goal);
  // Le profil ou l'état fraîchement relu : dès que l'un dit vérifié, la tuile
  // de vérification n'a plus rien à faire.
  const isVerified = profile.is_verified || !!verification?.is_verified;
  const nextTip = !photos.length || photos.length < 2
    ? 'Ajoute une deuxième photo, les profils avec plusieurs photos reçoivent plus de likes.'
    : !profile.bio?.trim()
      ? 'Écris quelques mots sur toi, ça donne envie de te répondre.'
      : (profile.interests?.length ?? 0) < 5
        ? "Choisis tes centres d'intérêt, ce sont eux qui lancent la conversation."
        : 'Ajoute ton métier, tes études ou tes langues pour te démarquer.';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* En-tête : le titre, et trois raccourcis ronds à droite. */}
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Profil</Text>
          <View style={styles.topIcons}>
            <TopIcon
              icon="notifications"
              label="Notifications"
              badge={unreadNotices}
              onPress={() => router.push('/notifications')}
            />
            <TopIcon
              icon="settings-sharp"
              label="Paramètres"
              onPress={() => router.push('/(tabs)/profile/settings')}
            />
            {/* Les soirées : scanner le QR affiché à l'entrée. Remplace l'ancien
                raccourci d'aide, l'aide reste dans les Paramètres. */}
            <TopIcon
              icon="qr-code"
              label="Scanner une soirée"
              onPress={() => {
                haptic.tap();
                router.push('/scan');
              }}
            />
            <TopIcon
              icon="create"
              label="Modifier mon profil"
              onPress={() => router.push('/(tabs)/profile/edit')}
            />
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[2]}
        >
          {/* Identité : la photo dans l'anneau de remplissage à gauche, le
              prénom et l'intention à droite. Deux gestes distincts : la photo
              (et le prénom) ouvrent l'aperçu public, la pastille d'intention
              ouvre le choix de l'intention. */}
          <View style={styles.identity}>
            <Pressable
              style={({ pressed }) => [
                styles.avatarWrap,
                { width: ring, height: ring },
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => setPreviewing(true)}
              accessibilityRole="button"
              accessibilityLabel="Voir mon profil comme les autres le voient"
            >
              <CompletionRing percent={completion} size={ring} />
              {photos[0] ? (
                <Photo
                  path={photos[0].storage_path}
                  style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    styles.avatarFallback,
                    { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 },
                  ]}
                >
                  <Ionicons name="person" size={46} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.percentPill}>
                <Text style={styles.percentText}>{completion} %</Text>
              </View>
            </Pressable>

            <View style={styles.identityText}>
              <Pressable
                style={({ pressed }) => [styles.nameRow, pressed && { opacity: 0.7 }]}
                onPress={() => setPreviewing(true)}
                accessibilityRole="button"
                accessibilityLabel="Voir mon profil comme les autres le voient"
              >
                <Text style={[styles.name, narrow && styles.nameCompact]} numberOfLines={3}>
                  {profile.display_name}
                  {profile.birth_date ? `, ${ageFromBirthDate(profile.birth_date)}` : ''}
                </Text>
                {profile.is_verified && <VerifiedBadge size={22} />}
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.goalChip, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  haptic.tap();
                  setGoalOpen(true);
                }}
                accessibilityRole="button"
                accessibilityLabel={goalLabel ? `Ton intention, ${goalLabel}. Changer` : 'Choisir ton intention'}
              >
                <Ionicons name={goalIcon(profile.relationship_goal)} size={15} color={colors.primary} />
                <Text style={[styles.goalText, narrow && styles.goalTextCompact]} numberOfLines={2}>
                  {goalLabel ?? 'Ce que je cherche'}
                </Text>
                <Ionicons name="chevron-down" size={15} color={colors.textMuted} />
              </Pressable>
              {PAYMENTS_ENABLED && (
                <Pressable style={styles.goalChip} onPress={() => router.push('/recharge')}>
                  <CoinIcon size={15} />
                  <Text style={styles.goalText}>{wallet ? formatCoins(wallet.balance) : '–'}</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* La prochaine chose à faire pour un meilleur profil, comme une
              question qu'on a envie de toucher. À 100 %, on invite à voir le
              résultat. */}
          <View style={styles.promptWrap}>
            <Pressable
              style={({ pressed }) => [styles.prompt, pressed && { opacity: 0.85 }]}
              onPress={() => {
                haptic.tap();
                if (completion < 100) router.push('/(tabs)/profile/edit');
                else setPreviewing(true);
              }}
            >
              <View style={styles.promptIcon}>
                <Ionicons
                  name={completion < 100 ? 'sparkles' : 'eye'}
                  size={20}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.promptText}>
                {completion < 100 ? nextTip : 'Ton profil est complet. Regarde-le comme les autres le voient.'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </Pressable>
          </View>

          {/* Deux boutons sur la même ligne, collés en haut quand on fait
              défiler. Celui qui est ouvert est plein, en rose. */}
          <View style={styles.tabs}>
            <View style={styles.tabsTrack} accessibilityRole="tablist">
              {(['atouts', 'securite'] as const).map((t) => {
                const on = tab === t;
                return (
                  <Pressable
                    key={t}
                    style={({ pressed }) => [
                      styles.tab,
                      on && styles.tabOn,
                      pressed && { opacity: 0.85 },
                    ]}
                    onPress={() => {
                      haptic.select();
                      setTab(t);
                    }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                  >
                    <Ionicons
                      name={t === 'atouts' ? 'sparkles' : 'shield-checkmark'}
                      size={17}
                      color={on ? '#ffffff' : colors.primary}
                    />
                    <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                      {t === 'atouts' ? 'Mes atouts' : 'Sécurité'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Animated.View key={tab} entering={FadeIn.duration(220)} style={styles.panel}>
            {tab === 'atouts' ? (
              <>
                {/* La vérification, tant que le profil n'est pas vérifié. Les
                    photos se gèrent depuis Modifier mon profil, en haut, pas
                    besoin d'un second accès ici. */}
                {!isVerified && (
                  <View style={styles.tiles}>
                    <MiniTile
                      icon="shield-checkmark"
                      label="Vérification"
                      value={verification?.status === 'pending' ? 'En cours' : 'À faire'}
                      accent={verification?.status !== 'pending'}
                      onPress={() => router.push('/verify-profile')}
                    />
                  </View>
                )}

                {/* Programme testeur : le tableau des 14 jours. Les soirées
                    sont passées en haut de l'écran (icône QR). */}
                <TesterProgramCard />

                {PAYMENTS_ENABLED && (
                  <ActionCard
                    icon="wallet"
                    title="Mon portefeuille"
                    text={wallet ? `Solde ${formatCoins(wallet.balance)}` : 'Ton solde et tes achats.'}
                    onPress={() => router.push('/(tabs)/profile/wallet')}
                  />
                )}
              </>
            ) : (
              <>
                <ActionCard
                  icon="eye-off"
                  dark
                  title={profile.incognito ? 'Mode Invisible activé' : 'Activer le mode Invisible'}
                  text={
                    profile.incognito
                      ? 'Tu n’apparais plus dans Rencontres. Touche pour redevenir visible.'
                      : !PAYMENTS_ENABLED
                        ? 'Passe en toute discrétion, ton profil sort de Rencontres. Offert pendant le lancement.'
                        : incognitoUntil
                          ? `Abonnement valable jusqu’au ${incognitoUntil}.`
                          : 'Passe en toute discrétion, ton profil sort de Rencontres.'
                  }
                  busy={togglingIncognito}
                  onPress={onIncognitoPress}
                />
                <ActionCard
                  icon="lock-closed"
                  title="Code secret"
                  text="Verrouille l’app avec un code à l’ouverture."
                  onPress={() => router.push('/app-lock')}
                />
                <ActionCard
                  icon="shield-half"
                  title="Gérer ta confidentialité"
                  text="Qui te voit, qui peut t’écrire, tes blocages et tes données."
                  onPress={() => router.push('/privacy')}
                />
                <ActionCard
                  icon="book"
                  title="Conseils et sécurité"
                  text="Nos conseils pour rencontrer quelqu’un en toute confiance."
                  onPress={() => WebBrowser.openBrowserAsync(`${SITE}/conseils.html`).catch(() => {})}
                />
              </>
            )}
          </Animated.View>
        </ScrollView>
      </SafeAreaView>

      {/* Intention : une carte par intention, enregistrée au bouton
          « Ajouter à mon profil ». */}
      <GoalSheet
        visible={goalOpen}
        current={profile.relationship_goal ?? null}
        saving={savingGoal}
        onClose={() => !savingGoal && setGoalOpen(false)}
        onSave={(value) => void saveGoal(value)}
      />

      {/* Aperçu public : même composant que la fiche vue par les autres. */}
      <ProfileDetailModal
        profile={previewing ? publicPreview : null}
        onClose={() => setPreviewing(false)}
        isSelf
      />

      {/* Introduction Incognito : ce que le mode apporte, ce qu'il ne change
          pas, et pourquoi il est ouvert. C'est elle qui déclenche
          l'activation. */}
      <IncognitoIntroModal
        visible={incognitoIntro}
        activating={togglingIncognito}
        untilLabel={incognitoUntil}
        photoPath={photos[0]?.storage_path ?? null}
        displayName={profile.display_name ?? ''}
        onActivate={onIncognitoActivate}
        onClose={() => {
          if (!togglingIncognito) setIncognitoIntro(false);
        }}
      />
    </View>
  );
}

// Raccourci rond de l'en-tête : grande cible, icône pleine.
function TopIcon({
  icon,
  label,
  onPress,
  badge = 0,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  // Pastille rose avec le nombre de nouveautés (cloche des notifications).
  badge?: number;
}) {
  return (
    <Pressable
      hitSlop={6}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={badge > 0 ? `${label}, ${badge} nouvelle(s)` : label}
      style={({ pressed }) => [styles.topIcon, pressed && { opacity: 0.55 }]}
    >
      <Ionicons name={icon} size={26} color={colors.text} />
      {badge > 0 && (
        <View style={styles.topBadge}>
          <Text style={styles.topBadgeText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Tuile d'état : rond teinté avec l'icône, petit libellé gris, valeur en gras.
function MiniTile({
  icon,
  label,
  value,
  accent,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  accent?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
    >
      <View style={styles.tileIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.tileBody}>
        <Text style={styles.tileLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.tileValue, accent && { color: colors.primary }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

// Carte d'action : rond avec l'icône (teinté, ou sombre pour Incognito),
// titre, explication grise, chevron. Toute la carte est cliquable.
function ActionCard({
  icon,
  title,
  text,
  onPress,
  busy,
  dark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  onPress: () => void;
  busy?: boolean;
  dark?: boolean;
}) {
  return (
    <Pressable
      disabled={busy}
      style={({ pressed }) => [styles.actionCard, (pressed || busy) && { opacity: 0.85 }]}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
    >
      <View style={[styles.actionIcon, dark && styles.actionIconDark]}>
        <Ionicons name={icon} size={22} color={dark ? '#ffffff' : colors.primary} />
      </View>
      <View style={styles.actionBody}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionText}>{text}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Ionicons name="chevron-forward" size={20} color={colors.text} />
      )}
    </Pressable>
  );
}

// Anneau de remplissage autour de la photo : un arc en dégradé flamme
// proportionnel au pourcentage, sur un cercle gris.
const RING_STROKE = 6;
function CompletionRing({ percent, size: RING }: { percent: number; size: number }) {
  const r = (RING - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={RING} height={RING} style={styles.ring}>
      <Defs>
        <SvgLinearGradient id="ringFlame" x1="0" y1="1" x2="1" y2="0">
          <Stop offset="0" stopColor={flame[0]} />
          <Stop offset="1" stopColor={flame[1]} />
        </SvgLinearGradient>
      </Defs>
      <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.border} strokeWidth={RING_STROKE} fill="none" />
      <Circle
        cx={RING / 2}
        cy={RING / 2}
        r={r}
        stroke="url(#ringFlame)"
        strokeWidth={RING_STROKE}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        strokeDashoffset={c * (1 - Math.min(Math.max(percent, 0), 100) / 100)}
        transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
      />
    </Svg>
  );
}
