import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { photoUrl } from '../api';
import { VerifiedBadge } from './ui';
import { EDUCATION_OPTIONS, GOAL_OPTIONS, labelFor } from '../profileOptions';
import { colors, radius, spacing } from '../theme';
import { activeLabel, ageFromBirthDate, type FeedProfile } from '../types';

export function ProfileCard({
  profile,
  onOpenDetail,
  favorite,
  onToggleFavorite,
  photoIndex = 0,
}: {
  profile: FeedProfile;
  // Ouvre la vue profil complète (photos, bio, infos) avant de liker.
  onOpenDetail?: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  // Photo affichée. Pilotée par le paquet : c'est lui qui tient le geste, et
  // un petit glissement latéral y fait défiler les photos sans que la carte
  // parte en like. La carte ne décide donc pas seule de ce qu'elle montre.
  photoIndex?: number;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const photos = profile.photos ?? [];
  const current = photos[Math.min(photoIndex, Math.max(photos.length - 1, 0))];

  const goal = labelFor(GOAL_OPTIONS, profile.relationship_goal);
  const online = activeLabel(profile.last_active_at) === 'En ligne';
  // La ville seule : la commune a été retirée du produit (déclaratif peu
  // fiable), la ville est vérifiée par la localisation à l'onboarding.
  const place = profile.city_name ?? '';
  const facts = [
    profile.height_cm ? `${profile.height_cm} cm` : null,
    ...(profile.interests ?? []).slice(0, 3),
  ].filter(Boolean) as string[];

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

      {/* Repères de photos. Pas de flèches ni de zones de tap : elles volaient
          la moitié de la carte, si bien qu'un appui pour ouvrir le profil
          changeait de photo une fois sur deux. */}
      {photos.length > 1 && (
        <View style={styles.dots} pointerEvents="none">
          {photos.map((p, i) => (
            <View key={p.id} style={[styles.dot, i === photoIndex && styles.dotActive]} />
          ))}
        </View>
      )}

      {/* Toute la photo ouvre le profil. */}
      {onOpenDetail && <Pressable style={styles.tapFull} onPress={onOpenDetail} />}

      {online && (
        <View style={styles.onlineBadge} pointerEvents="none">
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>En ligne</Text>
        </View>
      )}

      {onToggleFavorite && (
        <Pressable style={styles.favoriteBtn} onPress={onToggleFavorite} hitSlop={8}>
          <Ionicons
            name={favorite ? 'star' : 'star-outline'}
            size={22}
            color={favorite ? colors.accent : 'rgba(255,255,255,.95)'}
          />
        </Pressable>
      )}

      <LinearGradient
        colors={['transparent', 'rgba(14,15,12,0.55)', 'rgba(14,15,12,0.9)']}
        style={styles.info}
      >
        <Pressable onPress={onOpenDetail ?? (() => setShowDetails((v) => !v))}>
          {!!goal && (
            <View style={styles.goalBadge}>
              <Ionicons name="heart" size={12} color={colors.textOnAccent} />
              <Text style={styles.goalText}>{goal}</Text>
            </View>
          )}
          <View style={styles.nameRow}>
            <Text style={styles.name}>
              {profile.display_name}, {ageFromBirthDate(profile.birth_date)}
            </Text>
            {profile.is_verified && <VerifiedBadge size={20} />}
            <Ionicons
              name={
                onOpenDetail
                  ? 'chevron-up-circle'
                  : showDetails
                    ? 'chevron-down-circle'
                    : 'chevron-up-circle'
              }
              size={26}
              color="rgba(255,255,255,.85)"
              style={{ marginLeft: 'auto' }}
            />
          </View>

          {!!profile.job_title && (
            <View style={styles.metaRow}>
              <Ionicons name="briefcase-outline" size={14} color="rgba(255,255,255,.85)" />
              <Text style={styles.metaText}>{profile.job_title}</Text>
            </View>
          )}
          {!!place && (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={14} color="rgba(255,255,255,.85)" />
              <Text style={styles.metaText}>{place}</Text>
            </View>
          )}

          {facts.length > 0 && (
            <View style={styles.chips}>
              {facts.map((f) => (
                <View key={f} style={styles.chip}>
                  <Text style={styles.chipText}>{f}</Text>
                </View>
              ))}
            </View>
          )}

          {!!profile.bio && (
            <Text style={styles.bio} numberOfLines={showDetails ? 6 : 2}>
              {profile.bio}
            </Text>
          )}

          {showDetails && (
            <View style={styles.detailBlock}>
              {(profile.languages ?? []).length > 0 && (
                <Text style={styles.detailLine}>Langues : {profile.languages.join(', ')}</Text>
              )}
              {!!profile.religion && (
                <Text style={styles.detailLine}>Religion : {profile.religion}</Text>
              )}
              {!!profile.education && (
                <Text style={styles.detailLine}>
                  Études : {labelFor(EDUCATION_OPTIONS, profile.education)}
                </Text>
              )}
            </View>
          )}
        </Pressable>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.card,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  photo: { flex: 1 },
  noPhoto: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoText: { fontSize: 96, color: 'rgba(255,255,255,.6)', fontWeight: '700' },
  dots: {
    position: 'absolute',
    top: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,.4)',
  },
  dotActive: { backgroundColor: colors.accent },
  tapFull: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 160 },
  onlineBadge: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(14,15,12,.45)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  onlineText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  goalBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
  },
  goalText: { color: colors.textOnAccent, fontSize: 12, fontWeight: '800' },
  favoriteBtn: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.md,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(14,15,12,.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    paddingTop: spacing.xl,
  },
  // Le badge bleu se colle au nom (gap fixe) ; seul le chevron est repoussé
  // au bord droit. L'ancien `space-between` répartissait les trois éléments
  // sur toute la largeur et laissait le badge orphelin au milieu.
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: { color: '#fff', fontSize: 26, fontWeight: '800', flexShrink: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  metaText: { color: 'rgba(255,255,255,.92)', fontSize: 14 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
  },
  chip: {
    backgroundColor: 'rgba(249,168,212,.22)',
    borderWidth: 1,
    borderColor: 'rgba(249,168,212,.55)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipText: { color: '#fde7f3', fontSize: 12, fontWeight: '600' },
  bio: { color: 'rgba(255,255,255,.88)', fontSize: 14, marginTop: spacing.sm, lineHeight: 19 },
  detailBlock: { marginTop: spacing.sm, gap: 2 },
  detailLine: { color: 'rgba(255,255,255,.85)', fontSize: 13, lineHeight: 19 },
});
