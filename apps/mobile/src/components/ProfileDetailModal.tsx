import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  blockUser,
  getActiveMatchWith,
  photoUrl,
  recordProfileView,
  reportUser,
} from '@/services/api';
import { COIN_COLOR, COIN_ON_GOLD } from '@/config/economy';
import { CoinIcon } from '@/components/coins';
import { PressableScale } from '@/components/motion';
import { PAYMENTS_ENABLED } from '@/config/features';
import { COUNTRIES, useCountryOfCity } from '@/utils/countries';
import { VerifiedBadge } from '@/components/ui';
import { InterestLabel } from '@/components/InterestIcon';
import { PhotoViewer } from '@/components/PhotoViewer';
import { ReportModal } from '@/components/ReportModal';
import {
  EDUCATION_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_OPTIONS,
  goalIcon,
  HAS_CHILDREN_OPTIONS,
  WANTS_CHILDREN_OPTIONS,
  labelFor,
} from '@/profileOptions';
import { colors, onLight, photoScrim, radius, shadows, sigCorner, spacing } from '@/theme';
import { activeLabel, ageFromBirthDate, type ViewableProfile } from '@/types';

interface Props {
  profile: ViewableProfile | null;
  onClose: () => void;
  // Appelé après un blocage ou un signalement : l'écran appelant retire le
  // profil de sa liste sans attendre le prochain rafraîchissement.
  onBlocked?: (userId: string) => void;
  // Chaque action est optionnelle : la barre ne montre que ce qui est fourni.
  onLike?: () => void;
  onDislike?: () => void;
  onMessage?: () => void;
  // Coût affiché sur le bouton like (like retour payant depuis "J'aime").
  likeCost?: number;
  // Aperçu de MON propre profil : exactement la fiche publique que voient les
  // autres, sans compter de vue et sans les actions signaler / bloquer.
  isSelf?: boolean;
  // Fiche ouverte depuis la conversation elle-même : le bouton du bandeau
  // ferme simplement la fiche, on est déjà dans le chat.
  inConversation?: boolean;
  // Match déjà connu de l'écran appelant (onglet Discussions) : le bandeau
  // s'affiche tout de suite, sans requête.
  knownMatchId?: string;
  // Avec knownMatchId : la conversation a-t-elle déjà au moins un message ?
  knownHasMessages?: boolean;
}

// Rangée d'infos Velours : cercle à liseré corail avec icône corail,
// libellé gris à gauche, valeur encre alignée à droite sur une seule ligne.
function DetailLine({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Ionicons name={icon} size={16} color={colors.accent} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="tail">
        {value}
      </Text>
    </View>
  );
}

// Colonne de la bande de stats : grand cercle corail à icône blanche, libellé
// encre puis valeur terracotta. Une valeur absente fait disparaître la colonne.
function StatColumn({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <View style={styles.stat}>
      <View style={styles.statCircle}>
        <Ionicons name={icon} size={26} color="#ffffff" />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

// Espace laissé entre le haut de l'écran (sous l'encoche) et la feuille quand
// elle est montée au maximum : une bande de photo reste visible, la fiche ne
// « décolle » jamais tout à fait de la personne.
const SHEET_TOP_GAP = 12;

// Vue profil complète, structure fiche : la PHOTO EST FIXE en haut, elle ne
// défile pas. La feuille arrondie (présence, intention, à propos, stats,
// infos, sécurité) glisse par-dessus, jusqu'à un niveau haut où elle
// s'arrête, puis son contenu continue de défiler sous cette ligne. La photo
// reste donc toujours en fond, comme une couverture.
export function ProfileDetailModal({
  profile,
  onClose,
  onBlocked,
  onLike,
  onDislike,
  onMessage,
  likeCost,
  isSelf,
  inConversation,
  knownMatchId,
  knownHasMessages,
}: Props) {
  const router = useRouter();
  // Galerie plein écran ouverte sur cette photo (null = fermée).
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Géométrie de la couverture fixe : au format 3/4 de la largeur, bornée
  // aux deux tiers de l'écran pour qu'un bout de feuille reste toujours
  // visible à l'ouverture, même sur un téléphone très étroit.
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const coverH = Math.round(Math.min((winW * 4) / 3, winH * 0.66));
  // Ligne d'arrêt de la feuille : sous l'encoche, plus un petit espace.
  const sheetTop = insets.top + SHEET_TOP_GAP;
  // Pays de la personne, déduit de sa ville : RDC ou Congo-Brazzaville.
  const country = useCountryOfCity(profile?.city_name);
  const [reporting, setReporting] = useState(false);
  // Toutes les photos vivent sur la grande photo du profil : un balayage
  // horizontal dessus passe à la suivante, sans animation, l'image change
  // d'un coup. Pas de section galerie séparée.
  const [photoIndex, setPhotoIndex] = useState(0);
  // Abscisse de départ du geste : seul un glissement parti du bord gauche
  // ferme la fiche, sinon balayer les photos la fermerait à chaque photo
  // suivante.
  const gestureStartX = useSharedValue(0);

  // Nouvelle fiche ouverte : on repart de la première photo.
  const shownId = profile?.user_id ?? null;
  useEffect(() => {
    setPhotoIndex(0);
  }, [shownId]);

  // Bloquer coupe la visibilité DANS LES DEUX SENS et désactive la
  // conversation s'il y en avait une : c'est block_user() côté serveur qui s'en
  // charge, tous les fils filtrent la table blocks dans les deux directions.
  const blockAndClose = async () => {
    if (!profile) return;
    try {
      await blockUser(profile.user_id);
      onBlocked?.(profile.user_id);
      onClose();
    } catch {
      Alert.alert('Erreur', "Le blocage n'a pas pu être enregistré. Réessaie.");
    }
  };

  const confirmBlock = () => {
    if (!profile) return;
    Alert.alert(
      `Bloquer ${profile.display_name} ?`,
      "Vous ne verrez plus vos profils respectifs et toute conversation en cours sera fermée. La personne n'est pas prévenue.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Bloquer', style: 'destructive', onPress: blockAndClose },
      ],
    );
  };

  // Signaler bloque aussi : on ne garde pas sous les yeux quelqu'un qu'on vient
  // de dénoncer. La personne signalée n'en sait rien, ni par notification ni
  // par un changement visible — l'équipe traite depuis le backoffice.
  const submitReport = async (reason: string, details: string) => {
    if (!profile) return;
    setReporting(false);
    try {
      await reportUser(profile.user_id, reason, details, null);
      await blockUser(profile.user_id);
      onBlocked?.(profile.user_id);
      onClose();
      Alert.alert(
        'Signalement envoyé',
        "Notre équipe examine chaque signalement. Le profil a aussi été bloqué.",
      );
    } catch {
      Alert.alert('Erreur', "Le signalement n'a pas pu être envoyé. Réessaie.");
    }
  };

  // Ouvrir une fiche, c'est la « vue » qui alimente l'onglet Vues. Enregistré
  // ici pour tenir depuis n'importe quel écran, avant le retour anticipé pour
  // que le hook reste inconditionnel. Le serveur ignore l'appel si je suis en
  // incognito : explorer sans laisser de trace fait partie de l'abonnement.
  // Prévisualiser sa propre fiche ne compte évidemment pas comme une vue.
  const viewedId = isSelf ? null : (profile?.user_id ?? null);
  useEffect(() => {
    if (viewedId) recordProfileView(viewedId).catch(() => {});
  }, [viewedId]);

  // Déjà en conversation avec cette personne ? On le lit sur le serveur à
  // chaque fiche ouverte. Le bandeau remplace alors les boutons d'action :
  // liker ou écrire en premier n'a plus de sens, la conversation existe.
  const [matchId, setMatchId] = useState<string | null>(null);
  // Matché sans aucun message : on ne dit pas « tu discutes déjà ».
  const [hasMessages, setHasMessages] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const lookupId = viewedId;
  useEffect(() => {
    setMatchId(knownMatchId ?? null);
    setHasMessages(!!knownHasMessages);
    setBannerDismissed(false);
    if (!lookupId || knownMatchId) return;
    let alive = true;
    getActiveMatchWith(lookupId)
      .then((m) => {
        if (!alive) return;
        setMatchId(m?.matchId ?? null);
        setHasMessages(!!m?.hasMessages);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lookupId, knownMatchId, knownHasMessages]);

  if (!profile) {
    return null;
  }
  const photos = profile.photos ?? [];
  // Photo affichée : bornée au cas où la liste change sous l'index.
  const shownIndex = Math.min(photoIndex, Math.max(photos.length - 1, 0));
  const cover = photos[shownIndex];
  // La ville seule : la commune a été retirée du produit (déclaratif peu
  // fiable), la ville est vérifiée par la localisation à l'onboarding.
  const place = profile.city_name ?? '';
  const goal = labelFor(GOAL_OPTIONS, profile.relationship_goal);
  const online = activeLabel(profile.last_active_at);
  const showMatchBanner = !!matchId && !bannerDismissed;
  const hasActions = !showMatchBanner && !!(onLike || onDislike || onMessage);

  const openConversation = () => {
    if (!matchId) return;
    onClose();
    if (inConversation) return;
    router.push({
      pathname: '/chat/[matchId]',
      params: {
        matchId,
        name: profile.display_name,
        otherUserId: profile.user_id,
        photoPath: photos[0]?.path ?? '',
      },
    });
  };
  const age = ageFromBirthDate(profile.birth_date);

  // Valeurs affichables des deux blocs de rangées, humanisées via labelFor :
  // jamais une valeur brute type « peut_etre » à l'écran. Calculées ici pour
  // masquer un bloc entier quand aucune de ses rangées n'a de valeur.
  const jobValue = profile.job_title || null;
  const educationValue = labelFor(EDUCATION_OPTIONS, profile.education);
  const religionValue = profile.religion || null;
  const languagesValue = (profile.languages ?? []).length
    ? profile.languages.join(', ')
    : null;
  const placeValue = place || null;
  const hasEssentials = !!(
    jobValue || educationValue || religionValue || languagesValue || placeValue
  );
  const smokingValue = labelFor(FREQUENCY_OPTIONS, profile.smoking);
  const drinkingValue = labelFor(FREQUENCY_OPTIONS, profile.drinking);
  const hasChildrenValue = labelFor(HAS_CHILDREN_OPTIONS, profile.has_children);
  const wantsChildrenValue = labelFor(WANTS_CHILDREN_OPTIONS, profile.wants_children);
  const hasLifestyle = !!(
    smokingValue || drinkingValue || hasChildrenValue || wantsChildrenValue
  );

  // Glissement depuis le bord gauche pour fermer, comme un retour système.
  // Partout ailleurs le geste horizontal appartient aux photos.
  const swipeToClose = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onBegin((e) => {
      gestureStartX.set(e.absoluteX);
    })
    .onEnd((e) => {
      if (gestureStartX.value > 40) return;
      if (e.translationX > 70 || e.velocityX > 800) {
        runOnJS(onClose)();
      }
    });

  // Balayage sur la photo : gauche = suivante, droite = précédente. Aucune
  // animation, l'image change d'un coup (demande explicite).
  const stepPhoto = (dir: 1 | -1) => {
    setPhotoIndex((i) => Math.min(Math.max(i + dir, 0), Math.max(photos.length - 1, 0)));
  };
  const photoSwipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-16, 16])
    .onEnd((e) => {
      if (e.translationX < -40) runOnJS(stepPhoto)(1);
      else if (e.translationX > 40) runOnJS(stepPhoto)(-1);
    });

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <GestureDetector gesture={swipeToClose}>
          <View style={styles.safe}>
            {/* Couverture FIXE : la photo ne bouge pas, la feuille glisse
                dessus. Toutes les photos vivent ici (repères en tirets) ; les
                gestes (balayer, toucher) sont portés par l'espace transparent
                de la feuille qui la recouvre, voir plus bas. */}
            <View style={[styles.coverWrap, { height: coverH }]} pointerEvents="none">
              {cover ? (
                <Image
                  source={{ uri: photoUrl(cover.path) }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  transition={120}
                />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.noPhoto]}>
                  <Text style={styles.noPhotoText}>
                    {profile.display_name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              {photos.length > 1 && (
                <View style={[styles.coverDashes, { top: insets.top + spacing.sm }]}>
                  {photos.map((p, i) => (
                    <View
                      key={p.id}
                      style={[styles.coverDash, i === shownIndex && styles.coverDashActive]}
                    />
                  ))}
                </View>
              )}
              {/* Identité posée sur la photo : prénom, âge, badge, ville.
                  La fiche en dessous ne répète rien de tout ça. */}
              <LinearGradient colors={photoScrim} style={styles.coverInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>
                    {profile.display_name}, {age}
                  </Text>
                  {profile.is_verified && <VerifiedBadge size={22} />}
                </View>
                {!!place && (
                  <View style={styles.coverMetaRow}>
                    <Ionicons name="location-outline" size={14} color="rgba(255,255,255,.9)" />
                    <Text style={styles.coverMeta}>{place}</Text>
                  </View>
                )}
              </LinearGradient>
            </View>

            {/* La feuille défile dans une fenêtre qui commence à `sheetTop` :
                elle monte par-dessus la photo jusqu'à cette ligne, puis son
                contenu continue de défiler dessous. Au-dessus de la ligne, la
                photo reste visible. */}
            <ScrollView
              style={[styles.scroller, { top: sheetTop }]}
              contentContainerStyle={{
                paddingBottom:
                  (showMatchBanner ? 190 : hasActions ? 104 : spacing.lg) + insets.bottom,
              }}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={16}
            >
              {/* Espace transparent au-dessus de la feuille : c'est lui qui
                  porte les gestes de la photo. Balayer à l'horizontale change
                  de photo (le glissement vertical échoue le geste et rend la
                  main au défilement), toucher ouvre le plein écran. */}
              <GestureDetector gesture={photoSwipe}>
                <Pressable
                  // La feuille mord sur le bas de la photo de la valeur de
                  // son arrondi, comme avant : l'identité posée sur la photo
                  // garde sa marge basse pour ne pas passer dessous.
                  style={{ height: coverH - sheetTop - radius.lg }}
                  onPress={cover ? () => setViewerIndex(shownIndex) : undefined}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Photo de ${profile.display_name}, ouvrir en plein écran`}
                />
              </GestureDetector>

              {/* Feuille arrondie. Ordre de lecture : présence, intention,
                  à propos, stats, l'essentiel, mode de vie, centres
                  d'intérêt, pays d'origine, sécurité. */}
              <View style={[styles.sheet, { minHeight: winH - sheetTop }]}>
                <View style={styles.sheetHandle} />

                {/* 1. Ce qui reste de l'identité : la présence. Le prénom,
                    l'âge, le badge et la ville vivent déjà sur la photo. */}
                {!!online && (
                  <View style={styles.metaRow}>
                    <View
                      style={[
                        styles.onlineDot,
                        online !== 'En ligne' && { backgroundColor: colors.textMuted },
                      ]}
                    />
                    <Text style={styles.metaText}>{online}</Text>
                  </View>
                )}

                {/* 2. L'intention, affirmée d'entrée : pilule corail pleine,
                    la promesse de la fiche avant tout le reste. */}
                {!!goal && (
                  <View style={styles.goalPill}>
                    <Ionicons
                      name={goalIcon(profile.relationship_goal)}
                      size={14}
                      color={colors.textOnAccent}
                    />
                    <Text style={styles.goalPillText}>{goal}</Text>
                  </View>
                )}

                {/* 3. À propos */}
                {!!profile.bio && (
                  <>
                    <Text style={styles.sectionTitle}>{"À propos"}</Text>
                    <Text style={styles.bio}>{profile.bio}</Text>
                  </>
                )}

                {/* 4. Bande de stats pleine largeur : Sexe / Âge / Taille sur
                    voile sable dégradé, la feuille compense son propre padding. */}
                <LinearGradient
                  colors={[colors.washFrom, colors.washTo]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.statsBand}
                >
                  <StatColumn
                    icon="person"
                    label="Sexe"
                    value={
                      profile.gender ? (profile.gender === 'homme' ? 'Homme' : 'Femme') : null
                    }
                  />
                  <StatColumn icon="calendar" label="Âge" value={age ? `${age} ans` : null} />
                  <StatColumn
                    icon="shirt-outline"
                    label="Taille"
                    value={profile.height_cm ? `${(profile.height_cm / 100).toFixed(2)} m` : null}
                  />
                </LinearGradient>

                {/* 5. L'essentiel : qui est cette personne dans la vie. Le bloc
                    disparaît en entier si aucune rangée n'a de valeur. */}
                {hasEssentials && (
                  <>
                    <Text style={styles.sectionTitle}>{"L'essentiel"}</Text>
                    <View style={styles.detailCard}>
                      <DetailLine icon="briefcase-outline" label="Profession" value={jobValue} />
                      <DetailLine icon="school-outline" label="Études" value={educationValue} />
                      <DetailLine icon="book-outline" label="Religion" value={religionValue} />
                      <DetailLine
                        icon="globe-outline"
                        label="Langues parlées"
                        value={languagesValue}
                      />
                      <DetailLine icon="location" label="Localisation" value={placeValue} />
                    </View>
                  </>
                )}

                {/* 6. Mode de vie : les habitudes, séparées de l'essentiel. */}
                {hasLifestyle && (
                  <>
                    <Text style={styles.sectionTitle}>{"Mode de vie"}</Text>
                    <View style={styles.detailCard}>
                      <DetailLine icon="flame-outline" label="Tabac" value={smokingValue} />
                      <DetailLine icon="wine-outline" label="Alcool" value={drinkingValue} />
                      <DetailLine
                        icon="people-outline"
                        label="A des enfants"
                        value={hasChildrenValue}
                      />
                      <DetailLine
                        icon="heart-circle-outline"
                        label="Veut des enfants"
                        value={wantsChildrenValue}
                      />
                    </View>
                  </>
                )}

                {/* 7. Centres d'intérêt */}
                {(profile.interests ?? []).length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>{"Centres d'intérêt"}</Text>
                    <View style={styles.chips}>
                      {profile.interests.map((i) => (
                        <View key={i} style={styles.chip}>
                          <InterestLabel interest={i} color={colors.text} textStyle={styles.chipText} />
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* 8. Pays d'origine */}
                <Text style={styles.sectionTitle}>{"Pays d'origine"}</Text>
                <Text style={styles.countryValue}>
                  {`${COUNTRIES[country].name} ${COUNTRIES[country].flag}`}
                </Text>

                {/* Sécurité : accessible depuis n'importe quel profil, y compris
                    sans match. Discret en bas de fiche — présent quand on en a
                    besoin, jamais mis en avant. Absent de l'aperçu de mon
                    propre profil : on ne se signale pas soi-même. */}
                {!isSelf && (
                <View style={styles.safety}>
                  <Pressable
                    style={({ pressed }) => [styles.safetyRow, pressed && { opacity: 0.55 }]}
                    onPress={() => setReporting(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`Signaler le profil de ${profile.display_name}`}
                  >
                    <Text style={styles.safetyAction}>SIGNALER CE PROFIL</Text>
                    <Text style={styles.safetyHint}>
                      {"L'utilisateur ne verra jamais ce message."}
                    </Text>
                  </Pressable>

                  <View style={styles.safetyDivider} />

                  <Pressable
                    style={({ pressed }) => [styles.safetyRow, pressed && { opacity: 0.55 }]}
                    onPress={confirmBlock}
                    accessibilityRole="button"
                    accessibilityLabel={`Bloquer ${profile.display_name}`}
                  >
                    <Text style={styles.safetyAction}>BLOQUER</Text>
                    <Text style={styles.safetyHint}>
                      {"Tu ne verras plus son profil et il/elle ne verra plus le tien."}
                    </Text>
                  </Pressable>
                </View>
                )}
              </View>
            </ScrollView>

            <Pressable
              style={[styles.closeBtn, { top: insets.top + spacing.sm }]}
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Fermer le profil"
            >
              {/* Pastille blanche posée sur la photo : encre fixe. */}
              <Ionicons name="chevron-back" size={24} color={onLight.ink} />
            </Pressable>

            {/* Les mêmes trois ronds blancs que sur Rencontres : Passer, DM,
                Like, icônes à l'encre. Une seule façon de décider, où qu'on
                soit dans l'app. */}
            {hasActions && (
              <View style={styles.actions} pointerEvents="box-none">
                {onDislike && (
                  <PressableScale
                    style={styles.actionBtn}
                    scaleTo={0.9}
                    onPress={onDislike}
                    accessibilityRole="button"
                    accessibilityLabel="Passer ce profil"
                  >
                    <View style={styles.actionInner}>
                      <Ionicons name="close" size={30} color={onLight.ink} />
                    </View>
                  </PressableScale>
                )}
                {onMessage && (
                  <PressableScale
                    style={[styles.actionBtn, styles.msgBtn]}
                    scaleTo={0.9}
                    onPress={onMessage}
                    accessibilityRole="button"
                    accessibilityLabel="Envoyer un message direct"
                  >
                    <View style={styles.actionInner}>
                      <Ionicons name="chatbubble-ellipses" size={24} color={onLight.ink} />
                      {/* Pastille de coût : rien à signaler quand écrire est libre. */}
                      {PAYMENTS_ENABLED && (
                        <View style={styles.msgCoin}>
                          <CoinIcon size={12} />
                        </View>
                      )}
                    </View>
                  </PressableScale>
                )}
                {onLike && (
                  <PressableScale
                    style={styles.actionBtn}
                    scaleTo={0.9}
                    onPress={onLike}
                    accessibilityRole="button"
                    accessibilityLabel="Liker ce profil"
                  >
                    <View style={styles.actionInner}>
                      <Ionicons name="heart" size={28} color={onLight.ink} />
                      {PAYMENTS_ENABLED && !!likeCost && (
                        <View style={styles.costBadge}>
                          <CoinIcon size={10} color={COIN_ON_GOLD} />
                          <Text style={styles.costText}>{likeCost}</Text>
                        </View>
                      )}
                    </View>
                  </PressableScale>
                )}
              </View>
            )}

            {/* Déjà en conversation : on le dit, et on propose d'y aller. */}
            {showMatchBanner && (
              <View
                style={[styles.matchBar, { paddingBottom: spacing.md + insets.bottom }]}
              >
                <View style={styles.matchHead}>
                  <View style={styles.matchIcon}>
                    <Ionicons name="chatbubbles" size={18} color={colors.textOnAccent} />
                  </View>
                  <Text style={styles.matchText} numberOfLines={2}>
                    {hasMessages ? 'Tu discutes déjà avec ' : 'Vous avez matché avec '}
                    <Text style={styles.matchName}>{profile.display_name}</Text>
                  </Text>
                </View>
                <PressableScale
                  style={styles.matchPrimary}
                  scaleTo={0.97}
                  onPress={openConversation}
                  accessibilityRole="button"
                  accessibilityLabel={
                    hasMessages
                      ? `Ouvrir la conversation avec ${profile.display_name}`
                      : `Envoyer un message à ${profile.display_name}`
                  }
                >
                  <Text style={styles.matchPrimaryText}>
                    {hasMessages ? 'Ouvrir la conversation' : 'Envoyer un message'}
                  </Text>
                </PressableScale>
                <Pressable
                  style={({ pressed }) => [styles.matchSecondary, pressed && { opacity: 0.55 }]}
                  onPress={() => setBannerDismissed(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Ignorer"
                >
                  <Text style={styles.matchSecondaryText}>Ignorer</Text>
                </Pressable>
              </View>
            )}

            <ReportModal
              visible={reporting}
              name={profile.display_name}
              onSubmit={submitReport}
              onCancel={() => setReporting(false)}
            />

            {/* Galerie plein écran : défilement, zoom, glisser pour fermer */}
            <PhotoViewer
              uris={viewerIndex === null ? null : photos.map((p) => photoUrl(p.path))}
              index={viewerIndex ?? 0}
              // La fiche reprend sur la dernière photo regardée.
              onIndexChange={setPhotoIndex}
              onClose={() => setViewerIndex(null)}
            />
          </View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  // Couverture fixe : collée en haut, la hauteur est posée en ligne.
  coverWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
  },
  // Fenêtre de défilement de la feuille : du niveau d'arrêt jusqu'en bas.
  // Fond transparent, la photo se voit à travers l'espace du haut.
  scroller: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  noPhoto: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoText: { fontSize: 96, color: 'rgba(255,255,255,.6)', fontWeight: '700' },
  coverInfo: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    paddingBottom: spacing.lg + spacing.sm,
    paddingTop: spacing.xl,
  },
  // Pilule d'intention dans la feuille : corail plein, coin signature en bas
  // à droite, assez généreuse pour se lire d'un coup d'oeil.
  goalPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    borderBottomRightRadius: sigCorner,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: spacing.md,
  },
  goalPillText: { fontSize: 13, fontWeight: '800', color: colors.textOnAccent },
  name: { fontSize: 28, fontWeight: '800', color: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  coverMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  coverMeta: { color: 'rgba(255,255,255,.9)', fontSize: 14 },
  // La feuille : fond opaque, angles hauts arrondis, ombre vers le haut pour
  // se détacher de la photo. Sa hauteur minimale (posée en ligne) lui permet
  // d'atteindre la ligne d'arrêt même quand la fiche est courte.
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    paddingTop: spacing.sm,
    ...shadows.floating,
    shadowOffset: { width: 0, height: -6 },
  },
  // Petite poignée grise centrée, langage bottom sheet.
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  metaText: { color: colors.textMuted, fontSize: 15 },
  onlineDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.success,
  },
  // Titres de section en petites capitales éditoriales : discrets, espacés,
  // la valeur porte le contraste.
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  bio: { fontSize: 17, color: colors.text, lineHeight: 24 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  // Chips crème à liseré fin : emoji + libellé encre, coin signature en bas
  // à droite.
  chip: {
    backgroundColor: colors.cardSolid,
    borderRadius: 16,
    borderBottomRightRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  // Bande de stats pleine largeur : compense le padding horizontal de la
  // feuille pour toucher les deux bords de l'écran.
  statsBand: {
    flexDirection: 'row',
    marginHorizontal: -spacing.md,
    marginTop: spacing.lg,
    paddingVertical: 20,
    paddingHorizontal: spacing.md,
    borderBottomRightRadius: sigCorner,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  statCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  statValue: { fontSize: 14, fontWeight: '600', color: colors.primary },
  countryValue: { fontSize: 16, color: colors.text },
  // Tirets de progression des photos, posés en haut de la grande photo,
  // même langage que le deck Rencontres.
  coverDashes: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: 6,
  },
  coverDash: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,.4)',
  },
  coverDashActive: { backgroundColor: '#ffffff' },
  detailCard: { gap: spacing.sm + 2 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  // Cercle à liseré corail, fond transparent : l'icône corail respire dedans.
  detailIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLabel: { fontSize: 15, color: colors.textMuted, flex: 1 },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
    textAlign: 'right',
    maxWidth: '55%',
  },
  // La position verticale (sous l'encoche) est posée en ligne.
  closeBtn: {
    position: 'absolute',
    left: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,.92)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  safety: { marginTop: spacing.xl },
  safetyRow: {
    alignItems: 'center',
    // Cible tactile largement au-dessus du minimum : ces deux actions doivent
    // être atteignables sans hésitation.
    minHeight: 56,
    paddingVertical: spacing.sm,
    gap: 4,
  },
  safetyAction: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.danger,
    textAlign: 'center',
  },
  safetyHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  safetyDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  // Copie conforme des boutons de Rencontres (Discover.styles) : trois ronds
  // blancs flottants, la bulle un peu plus petite au milieu.
  actions: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  actionBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    ...shadows.floating,
  },
  actionInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgBtn: { width: 50, height: 50, borderRadius: 25 },
  msgCoin: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  costBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: COIN_COLOR,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  costText: { color: COIN_ON_GOLD, fontSize: 11, fontWeight: '800' },
  // Bandeau « déjà en conversation » : posé en bas, par-dessus la feuille.
  matchBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
    ...shadows.floating,
    shadowOffset: { width: 0, height: -6 },
  },
  matchHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 4 },
  matchIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchText: { flex: 1, fontSize: 16, color: colors.text },
  matchName: { fontWeight: '800' },
  matchPrimary: {
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchPrimaryText: { fontSize: 16, fontWeight: '800', color: colors.textOnAccent },
  matchSecondary: { height: 44, alignItems: 'center', justifyContent: 'center' },
  matchSecondaryText: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
});
