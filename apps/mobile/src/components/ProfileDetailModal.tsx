import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { blockUser, photoUrl, recordProfileView, reportUser } from '../api';
import { COIN_COLOR, COIN_ON_GOLD } from '../config/economy';
import { CoinIcon } from './coins';
import { GlassSurface, PressableScale } from './motion';
import { VerifiedBadge } from './ui';
import { PhotoViewer } from './PhotoViewer';
import { ReportModal } from './ReportModal';
import {
  EDUCATION_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_OPTIONS,
  HAS_CHILDREN_OPTIONS,
  WANTS_CHILDREN_OPTIONS,
  interestEmoji,
  labelFor,
} from '../profileOptions';
import { colors, isDark, onLight, radius, spacing } from '../theme';
import { activeLabel, ageFromBirthDate, type ViewableProfile } from '../types';

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
}

// Rose des cercles de stats en thème clair : plus clair que l'accent pour
// rester doux sur la bande pâle ; en sombre, l'accent garde le contraste.
const STAT_CIRCLE = isDark ? colors.accent : '#ee76d3';

// Rangée d'infos style Heyama : cercle à liseré rose avec icône accent,
// libellé gris à gauche, valeur alignée à droite sur une seule ligne.
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

// Colonne de la bande de stats : grand cercle rose à icône blanche, libellé
// puis valeur en accent. Une valeur absente fait disparaître la colonne.
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

// Vue profil complète, structure fiche Heyama : photo de couverture avec badge
// d'intention, feuille arrondie (à propos, intérêts, stats, infos), actions.
export function ProfileDetailModal({
  profile,
  onClose,
  onBlocked,
  onLike,
  onDislike,
  onMessage,
  likeCost,
  isSelf,
}: Props) {
  // Photo ouverte en plein écran (zoom au pincement).
  const [viewerUri, setViewerUri] = useState<string | null>(null);
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
  const hasActions = !!(onLike || onDislike || onMessage);
  const age = ageFromBirthDate(profile.birth_date);

  // Glissement depuis le bord gauche pour fermer, comme un retour système.
  // Partout ailleurs le geste horizontal appartient aux photos.
  const swipeToClose = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onBegin((e) => {
      gestureStartX.value = e.absoluteX;
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
          <SafeAreaView style={styles.safe} edges={['bottom']}>
            <ScrollView
              contentContainerStyle={{ paddingBottom: hasActions ? 104 : spacing.lg }}
              showsVerticalScrollIndicator={false}
            >
              {/* Photo du profil : toutes les photos vivent ici. Balayer
                  passe à la suivante (changement sec, sans animation), un
                  appui ouvre le plein écran zoomable. */}
              <View>
                {cover ? (
                  <GestureDetector gesture={photoSwipe}>
                    <Pressable onPress={() => setViewerUri(photoUrl(cover.path))}>
                      <Image
                        source={{ uri: photoUrl(cover.path) }}
                        style={styles.cover}
                        contentFit="cover"
                      />
                      {/* Repères : un tiret par photo, comme sur le deck. */}
                      {photos.length > 1 && (
                        <View style={styles.coverDashes} pointerEvents="none">
                          {photos.map((p, i) => (
                            <View
                              key={p.id}
                              style={[
                                styles.coverDash,
                                i === shownIndex && styles.coverDashActive,
                              ]}
                            />
                          ))}
                        </View>
                      )}
                    </Pressable>
                  </GestureDetector>
                ) : (
                  <View style={[styles.cover, styles.noPhoto]}>
                    <Text style={styles.noPhotoText}>
                      {profile.display_name?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                <LinearGradient
                  colors={['transparent', 'rgba(14,15,12,0.5)', 'rgba(14,15,12,0.85)']}
                  style={styles.coverInfo}
                >
                  {!!goal && (
                    <View style={styles.goalBadge}>
                      <Ionicons name="heart" size={13} color={colors.textOnAccent} />
                      <Text style={styles.goalBadgeText}>{goal}</Text>
                    </View>
                  )}
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

              {/* Feuille arrondie qui recouvre le bas de la photo */}
              <View style={styles.sheet}>
                <View style={styles.sheetHandle} />

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

                {!!profile.bio && (
                  <>
                    <Text style={styles.sectionTitle}>{"À propos"}</Text>
                    <Text style={styles.bio}>{profile.bio}</Text>
                  </>
                )}

                {(profile.interests ?? []).length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>{"Centres d'intérêt"}</Text>
                    <View style={styles.chips}>
                      {profile.interests.map((i) => (
                        <View key={i} style={styles.chip}>
                          <Text style={styles.chipText}>
                            {interestEmoji(i)} {i}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </>
                )}

                {/* Bande de stats pleine largeur : Sexe / Âge / Taille sur
                    fond rose pâle, la feuille compense son propre padding. */}
                <View style={styles.statsBand}>
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
                </View>

                <Text style={styles.sectionTitle}>{"Pays d'origine"}</Text>
                <Text style={styles.countryValue}>
                  {"République démocratique du Congo 🇨🇩"}
                </Text>

                <Text style={styles.sectionTitle}>
                  {"Plus d'infos sur "}
                  {profile.display_name}
                </Text>
                <View style={styles.detailCard}>
                  <DetailLine icon="location" label="Localisation" value={place || null} />
                  <DetailLine
                    icon="globe-outline"
                    label="Langues parlées"
                    value={(profile.languages ?? []).length ? profile.languages.join(', ') : null}
                  />
                  <DetailLine
                    icon="briefcase-outline"
                    label="Profession"
                    value={profile.job_title}
                  />
                  <DetailLine
                    icon="school-outline"
                    label="Études"
                    value={labelFor(EDUCATION_OPTIONS, profile.education)}
                  />
                  <DetailLine icon="book-outline" label="Religion" value={profile.religion} />
                  <DetailLine
                    icon="people-outline"
                    label="A des enfants"
                    value={labelFor(HAS_CHILDREN_OPTIONS, profile.has_children)}
                  />
                  <DetailLine
                    icon="heart-circle-outline"
                    label="Veut des enfants"
                    value={labelFor(WANTS_CHILDREN_OPTIONS, profile.wants_children)}
                  />
                  <DetailLine
                    icon="flame-outline"
                    label="Tabac"
                    value={labelFor(FREQUENCY_OPTIONS, profile.smoking)}
                  />
                  <DetailLine
                    icon="wine-outline"
                    label="Alcool"
                    value={labelFor(FREQUENCY_OPTIONS, profile.drinking)}
                  />
                </View>

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
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Fermer le profil"
            >
              {/* Pastille blanche posée sur la photo : encre fixe. */}
              <Ionicons name="chevron-back" size={24} color={onLight.ink} />
            </Pressable>

            {/* Barre flottante en verre : elle survole le contenu, le flou dit
                que ce qui passe dessous est en retrait. */}
            {hasActions && (
              <GlassSurface intensity={55} style={styles.actions}>
                <View style={styles.actionsRow}>
                  {onDislike && (
                    <PressableScale style={styles.dislikeBtn} onPress={onDislike}>
                      <View style={styles.actionInner}>
                        <Ionicons name="close" size={30} color={onLight.ink} />
                      </View>
                    </PressableScale>
                  )}
                  {onMessage && (
                    <PressableScale style={styles.msgBtn} onPress={onMessage}>
                      <View style={styles.actionInner}>
                        <Ionicons name="chatbubble" size={24} color="#ffffff" />
                        <View style={styles.msgCoin}>
                          <CoinIcon size={10} color={COIN_ON_GOLD} />
                        </View>
                      </View>
                    </PressableScale>
                  )}
                  {onLike && (
                    <PressableScale style={styles.likeBtn} onPress={onLike}>
                      <View style={styles.actionInner}>
                        <Ionicons name="heart" size={28} color="#ffffff" />
                        {!!likeCost && (
                          <View style={styles.costBadge}>
                            <CoinIcon size={10} color={COIN_ON_GOLD} />
                            <Text style={styles.costText}>{likeCost}</Text>
                          </View>
                        )}
                      </View>
                    </PressableScale>
                  )}
                </View>
              </GlassSurface>
            )}

            <ReportModal
              visible={reporting}
              name={profile.display_name}
              onSubmit={submitReport}
              onCancel={() => setReporting(false)}
            />

            {/* Plein écran avec zoom au pincement */}
            <PhotoViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
          </SafeAreaView>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  cover: { width: '100%', aspectRatio: 3 / 4 },
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
  goalBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: spacing.xs,
  },
  goalBadgeText: { fontSize: 12, fontWeight: '800', color: colors.textOnAccent },
  name: { fontSize: 28, fontWeight: '800', color: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  coverMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  coverMeta: { color: 'rgba(255,255,255,.9)', fontSize: 14 },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    marginTop: -radius.lg,
    padding: spacing.md,
    paddingTop: spacing.sm,
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
  // Titres de section discrets : gris, la valeur porte le contraste.
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  bio: { fontSize: 17, color: colors.text, lineHeight: 24 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  // Pilules opaques à liseré fin : emoji + libellé.
  chip: {
    backgroundColor: colors.cardSolid,
    borderRadius: radius.full,
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
    backgroundColor: colors.washTo,
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
    backgroundColor: STAT_CIRCLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  statValue: { fontSize: 14, fontWeight: '600', color: colors.accent },
  countryValue: { fontSize: 16, color: colors.text },
  // Tirets de progression des photos, posés en haut de la grande photo,
  // même langage que le deck Rencontres.
  coverDashes: {
    position: 'absolute',
    top: spacing.sm + 2,
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
  // Cercle à liseré rose, fond transparent : l'icône accent respire dedans.
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
  closeBtn: {
    position: 'absolute',
    top: spacing.xl + spacing.sm,
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
  actions: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    borderRadius: radius.full,
    paddingVertical: spacing.sm + 2,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
  },
  actionInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // X : cercle blanc quel que soit le thème, croix en encre sombre fixe.
  dislikeBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  // Bulle : violet foncé, hors palette rose, pour marquer le message payant.
  msgBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.purpleDark,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  // Pastilles or : les coûts en pièces gardent la couleur de la monnaie,
  // jamais le rose de la marque.
  msgCoin: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COIN_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Coeur : cercle accent plein, coeur blanc.
  likeBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
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
});
