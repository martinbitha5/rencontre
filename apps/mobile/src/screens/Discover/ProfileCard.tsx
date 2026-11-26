import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { photoUrl } from '@/services/api';
import { VerifiedBadgeButton } from '@/components/ui';
import { GOAL_OPTIONS, goalIcon, labelFor } from '@/profileOptions';
import { colors, flame, onLight, radius, spacing } from '@/theme';
import { ageFromBirthDate, isNewMember, presenceOf, type FeedProfile } from '@/types';

export function ProfileCard({
  profile,
  onOpenDetail,
  favorite,
  onToggleFavorite,
  photoIndex = 0,
  photoPos,
  pageWidth = 0,
}: {
  profile: FeedProfile;
  // Ouvre la vue profil complète (photos, bio, infos) avant de liker.
  onOpenDetail?: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  // Photo affichée (repères et compteur), mise à jour au calage.
  photoIndex?: number;
  // Carte du dessus : position continue du carrousel, pilotée par le doigt
  // dans le paquet, et largeur d'une page. Les cartes en attente n'en ont pas
  // et montrent simplement leur première photo.
  photoPos?: SharedValue<number>;
  pageWidth?: number;
}) {
  const photos = profile.photos ?? [];
  const carousel = !!photoPos && photos.length > 1 && pageWidth > 0;
  const current = photos[Math.min(photoIndex, Math.max(photos.length - 1, 0))];

  const goal = labelFor(GOAL_OPTIONS, profile.relationship_goal);
  const presence = presenceOf(profile.last_active_at);
  // La ville seule : la commune a été retirée du produit (déclaratif peu
  // fiable), la ville est vérifiée par la localisation à l'onboarding.
  const place = profile.city_name ?? '';

  // La carte montre la MÊME chose sur toutes ses photos : intention centrée,
  // nom et âge suivis du badge bleu s'il y a lieu, ville, étoile de favori.
  // Les strates par photo (à propos sur la deuxième, centres d'intérêt sur la
  // troisième) ont été retirées : elles recouvraient la photo et changeaient
  // la carte sous le doigt en cours de feuilletage. Bio, métier et intérêts
  // se lisent dans le profil détaillé, ouvert d'un appui sur la photo.
  //
  // Le badge certifié est posé après l'âge, sans libellé : le pictogramme
  // bleu se lit seul, et une pastille « Profil certifié » masquait la photo.

  return (
    <View style={styles.card}>
      {carousel ? (
        <PhotoStrip photos={photos} pos={photoPos} width={pageWidth} />
      ) : current ? (
        <Image
          source={{ uri: photoUrl(current.path) }}
          style={styles.photo}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={[styles.photo, styles.noPhoto]}>
          <Text style={styles.noPhotoText}>
            {profile.display_name?.[0]?.toUpperCase() ?? '?'}
          </Text>
        </View>
      )}

      {/* Voiles haut et bas : le texte du haut et les boutons du bas restent
          lisibles sur n'importe quelle photo. */}
      <LinearGradient colors={TOP_SCRIM} style={styles.topScrim} pointerEvents="none" />
      <LinearGradient colors={BOTTOM_SCRIM} style={styles.bottomScrim} pointerEvents="none" />

      {/* Toucher la photo, n'importe où, ouvre le profil complet. Le
          glissement horizontal, lui, fait défiler les photos. */}
      {onOpenDetail && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onOpenDetail}
          accessibilityRole="button"
          accessibilityLabel={`Voir le profil de ${profile.display_name}`}
        />
      )}

      {/* En haut à gauche : prénom, âge, présence, puis les pastilles. */}
      <Pressable style={styles.info} onPress={onOpenDetail}>
        {/* Ligne 1 : certification, prénom et âge, puis le statut en ligne. */}
        <View style={styles.nameRow}>
          {profile.is_verified && <VerifiedBadgeButton size={20} />}
          <Text style={styles.name} numberOfLines={1}>
            {profile.display_name}, {ageFromBirthDate(profile.birth_date)}
          </Text>
          {!!presence && (
            <View style={styles.presence}>
              <View
                style={[styles.presenceDot, presence !== 'En ligne' && styles.presenceDotRecent]}
              />
              <Text style={styles.presenceText}>{presence}</Text>
            </View>
          )}
        </View>
        {/* Ligne 2 : « Vient de s'inscrire » la première semaine, puis
            l'intention. */}
        <View style={styles.pills}>
          {isNewMember(profile.created_at) && (
            <View style={styles.newPill}>
              <LinearGradient
                colors={flame}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="sparkles" size={11} color="#ffffff" />
              <Text style={styles.newPillText}>Vient de s’inscrire</Text>
            </View>
          )}
          {!!goal && (
            <View style={styles.pill}>
              <Ionicons name={goalIcon(profile.relationship_goal)} size={11} color={onLight.ink} />
              <Text style={styles.pillText} numberOfLines={1}>
                {goal}
              </Text>
            </View>
          )}
        </View>
        {!!place && (
          <View style={styles.placeRow}>
            <Ionicons name="location" size={12} color="#ffffff" />
            <Text style={styles.place} numberOfLines={1}>
              {place}
            </Text>
          </View>
        )}
      </Pressable>

      {/* En haut à droite : repères de photos et favori. */}
      <View style={styles.topRight}>
        {photos.length > 1 && (
          <Text style={styles.counter}>
            {Math.min(photoIndex, photos.length - 1) + 1} sur {photos.length}
          </Text>
        )}
        {onToggleFavorite && (
          <Pressable
            style={styles.favoriteBtn}
            onPress={onToggleFavorite}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Ionicons
              name={favorite ? 'star' : 'star-outline'}
              size={20}
              color={favorite ? colors.gold : '#ffffff'}
            />
          </Pressable>
        )}
      </View>

      {/* Repères de photos, en traits verticaux sur le bord droit. */}
      {photos.length > 1 && (
        <View style={styles.dashes} pointerEvents="none">
          {photos.map((p, i) => (
            <View key={p.id} style={[styles.dash, i === photoIndex && styles.dashActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

// Bande de photos côte à côte, décalée selon la position du carrousel : la
// photo glisse sous le doigt et la suivante arrive déjà visible.
function PhotoStrip({
  photos,
  pos,
  width,
}: {
  photos: { id: string; path: string }[];
  pos: SharedValue<number>;
  width: number;
}) {
  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -pos.value * width }],
  }));
  return (
    <Animated.View style={[styles.strip, { width: width * photos.length }, stripStyle]}>
      {photos.map((p) => (
        <Image
          key={p.id}
          source={{ uri: photoUrl(p.path) }}
          style={{ width, height: '100%' }}
          contentFit="cover"
          transition={150}
        />
      ))}
    </Animated.View>
  );
}

const TOP_SCRIM = ['rgba(16, 17, 19, 0.6)', 'rgba(16, 17, 19, 0)'] as const;
const BOTTOM_SCRIM = ['rgba(16, 17, 19, 0)', 'rgba(16, 17, 19, 0.45)'] as const;

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photo: { ...StyleSheet.absoluteFill },
  noPhoto: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoText: { fontSize: 96, color: 'rgba(255,255,255,.6)', fontWeight: '700' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: 170 },
  bottomScrim: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 140 },
  strip: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row' },
  info: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: 96,
    gap: 6,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Statut en ligne : pastille sombre translucide, point vert (en ligne) ou
  // orange (actif il y a peu). Lisible sur n'importe quelle photo.
  presence: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 17, 19, 0.45)',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3DD67C',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  presenceDotRecent: { backgroundColor: '#ffb020' },
  presenceText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  newPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  newPillText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderRadius: radius.full,
    paddingHorizontal: 9,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  pillText: { color: onLight.ink, fontSize: 11, fontWeight: '700', flexShrink: 1 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  place: { color: '#ffffff', fontSize: 13, fontWeight: '600' },
  topRight: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  counter: { color: 'rgba(255,255,255,.9)', fontSize: 12, fontWeight: '700' },
  favoriteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashes: {
    position: 'absolute',
    right: 6,
    top: '35%',
    gap: 4,
  },
  dash: { width: 3, height: 18, borderRadius: 2, backgroundColor: 'rgba(255,255,255,.4)' },
  dashActive: { backgroundColor: '#ffffff' },
});
