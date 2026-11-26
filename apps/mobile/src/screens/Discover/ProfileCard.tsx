import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { photoUrl } from '@/services/api';
import { VerifiedBadgeButton } from '@/components/ui';
import { GOAL_OPTIONS, goalIcon, labelFor } from '@/profileOptions';
import { colors, onLight, radius, spacing } from '@/theme';
import { activeLabel, ageFromBirthDate, type FeedProfile } from '@/types';

export function ProfileCard({
  profile,
  onOpenDetail,
  favorite,
  onToggleFavorite,
  photoIndex = 0,
  onStepPhoto,
}: {
  profile: FeedProfile;
  // Ouvre la vue profil complète (photos, bio, infos) avant de liker.
  onOpenDetail?: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  // Photo affichée, pilotée par le paquet.
  photoIndex?: number;
  // Toucher le bord gauche ou droit de la photo change de photo ; le centre
  // ouvre le profil. Le glissement, lui, est réservé au like et au non.
  onStepPhoto?: (dir: 1 | -1) => void;
}) {
  const photos = profile.photos ?? [];
  const canStep = !!onStepPhoto && photos.length > 1;
  const current = photos[Math.min(photoIndex, Math.max(photos.length - 1, 0))];

  const goal = labelFor(GOAL_OPTIONS, profile.relationship_goal);
  // Présence : « En ligne » dans les 15 dernières minutes, sinon « En ligne
  // récemment » tant que la dernière activité reste dans la fenêtre servie
  // par activeLabel. Au-delà, pas de pilule.
  const active = activeLabel(profile.last_active_at);
  const presence = active === 'En ligne' ? 'En ligne' : active ? 'En ligne récemment' : null;
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
      {current ? (
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

      {/* Bords : photo précédente ou suivante. Centre : le profil complet. */}
      {/* Trois zones côte à côte plutôt qu'un calcul de position : même
          comportement sur iOS, Android et le web. */}
      {(onOpenDetail || canStep) && (
        <View style={styles.tapZones}>
          <Pressable
            style={canStep ? styles.tapEdge : styles.tapNone}
            onPress={() => onStepPhoto?.(-1)}
            accessibilityLabel="Photo précédente"
          />
          <Pressable style={styles.tapCenter} onPress={onOpenDetail} accessibilityLabel="Voir le profil" />
          <Pressable
            style={canStep ? styles.tapEdge : styles.tapNone}
            onPress={() => onStepPhoto?.(1)}
            accessibilityLabel="Photo suivante"
          />
        </View>
      )}

      {/* En haut à gauche : prénom, âge, présence, puis les pastilles. */}
      <Pressable style={styles.info} onPress={onOpenDetail}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {profile.display_name}, {ageFromBirthDate(profile.birth_date)}
          </Text>
          {presence === 'En ligne' && <View style={styles.onlineDot} />}
          {profile.is_verified && <VerifiedBadgeButton size={20} />}
        </View>
        <View style={styles.pills}>
          {presence === 'En ligne récemment' && (
            <View style={styles.pill}>
              <Ionicons name="time-outline" size={11} color={onLight.ink} />
              <Text style={styles.pillText}>En ligne récemment</Text>
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
  tapZones: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 110,
    flexDirection: 'row',
  },
  tapEdge: { width: '30%' },
  tapCenter: { flex: 1 },
  tapNone: { width: 0 },
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
  onlineDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#3DD67C' },
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
