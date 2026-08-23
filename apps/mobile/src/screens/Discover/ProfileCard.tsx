import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { photoUrl } from '@/services/api';
import { VerifiedBadge } from '@/components/ui';
import { EDUCATION_OPTIONS, GOAL_OPTIONS, interestEmoji, labelFor } from '@/profileOptions';
import { colors, onLight, photoScrim, radius, sigCorner, spacing } from '@/theme';
import { activeLabel, ageFromBirthDate, type FeedProfile } from '@/types';

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
  const photos = profile.photos ?? [];
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

  // La carte se lit en feuilletant : chaque photo porte une strate
  // d'information, de la plus identifiante à la plus personnelle. On ne voit
  // donc jamais tout d'un coup, et la photo garde de la place.
  //
  //   photo 1 → certification et intention
  //   photo 2 → à propos
  //   photo 3 → centres d'intérêt
  //   au-delà → rien, la photo seule
  //
  // Le nom, la ville et l'étoile de favori restent sur TOUTES les photos :
  // sans eux on ne saurait plus de qui il s'agit en cours de feuilletage, et
  // le geste de mise en favori deviendrait tributaire de la photo affichée.
  // Le profil détaillé, lui, ne feuillette rien : il présente tout d'un bloc.
  const about = (profile.bio ?? '').trim();
  const facts = [profile.job_title, labelFor(EDUCATION_OPTIONS, profile.education)].filter(
    (f): f is string => !!f && f.trim().length > 0,
  );
  const interests = (profile.interests ?? []).slice(0, 6);
  const showAbout = photoIndex === 1 && (!!about || facts.length > 0);
  const showInterests = photoIndex === 2 && interests.length > 0;

  return (
    <View style={styles.card}>
      {/* La photo est insérée dans la carte avec une fine marge : le cadre
          crème Velours, dont le coin signature reste visible en bas à
          droite. */}
      <View style={styles.photoFrame}>
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

        {/* Toute la photo ouvre le profil. */}
        {onOpenDetail && <Pressable style={styles.tapFull} onPress={onOpenDetail} />}

        {/* Repères de photos, en tirets dans le coin haut droit. Pas de
            flèches ni de zones de tap : le geste feuillette, l'appui ouvre. */}
        {photos.length > 1 && (
          <View style={styles.dashes} pointerEvents="none">
            {photos.map((p, i) => (
              <View key={p.id} style={[styles.dash, i === photoIndex && styles.dashActive]} />
            ))}
          </View>
        )}

        {presence && (
          <View style={styles.presencePill} pointerEvents="none">
            <Text style={styles.presenceText}>{presence}</Text>
            <View style={styles.presenceDot} />
          </View>
        )}

        <LinearGradient
          colors={photoScrim}
          style={styles.info}
        >
          <Pressable onPress={onOpenDetail}>
            {showAbout && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>{'À propos'}</Text>
                {!!about && (
                  <Text style={styles.panelText} numberOfLines={3}>
                    {about}
                  </Text>
                )}
                {facts.length > 0 && (
                  <View style={styles.chips}>
                    {facts.map((fact) => (
                      <View key={fact} style={styles.chip}>
                        <Text style={styles.chipText}>{fact}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {showInterests && (
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>{'Centres d’intérêt'}</Text>
                <View style={styles.chips}>
                  {interests.map((interest) => (
                    <View key={interest} style={styles.chip}>
                      <Text style={styles.chipText}>
                        {interestEmoji(interest)} {interest}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* La rangée reste montée quelle que soit la photo : c'est elle qui
                fixe la position de l'étoile de favori. Seuls les badges
                apparaissent et disparaissent. */}
            <View style={styles.badgeRow}>
              {photoIndex === 0 && profile.is_verified && (
                <View style={styles.verifiedPill}>
                  <VerifiedBadge size={16} />
                  <Text style={styles.verifiedText}>Profil certifié</Text>
                </View>
              )}
              {photoIndex === 0 && !!goal && (
                <View style={styles.goalPill}>
                  <Ionicons name="heart" size={12} color="#ffffff" />
                  <Text style={styles.goalText} numberOfLines={1}>
                    {goal}
                  </Text>
                </View>
              )}
              {onToggleFavorite && (
                <Pressable style={styles.favoriteBtn} onPress={onToggleFavorite} hitSlop={8}>
                  <Ionicons
                    name={favorite ? 'star' : 'star-outline'}
                    size={20}
                    color={favorite ? colors.accent : 'rgba(255,255,255,.95)'}
                  />
                </Pressable>
              )}
            </View>

            <Text style={styles.name} numberOfLines={1}>
              {profile.display_name}, {ageFromBirthDate(profile.birth_date)}
            </Text>
            <Text style={styles.place} numberOfLines={1}>
              {place ? `${place}, ` : ''}République démocratique du Congo
            </Text>
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Grande carte crème au coin signature ; la photo, arrondie elle aussi, y
  // est posée avec une fine marge qui dessine le cadre.
  card: {
    flex: 1,
    borderRadius: 24,
    borderBottomRightRadius: sigCorner,
    padding: 6,
    backgroundColor: colors.cardSolid,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  // La photo reprend la même grammaire, un cran plus serrée : le coin
  // signature se lit aussi sur le cadre intérieur.
  photoFrame: {
    flex: 1,
    borderRadius: 18,
    borderBottomRightRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photo: { flex: 1 },
  noPhoto: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoText: { fontSize: 96, color: 'rgba(255,255,255,.6)', fontWeight: '700' },
  tapFull: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 200 },
  dashes: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    gap: 4,
  },
  dash: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,.45)',
  },
  dashActive: { backgroundColor: '#ffffff' },
  // Pastille crème quasi opaque posée sur la photo : encres fixes (onLight),
  // le point vert (success) signale la présence à droite du texte.
  presencePill: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,252,254,0.92)',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  presenceText: { color: onLight.ink, fontSize: 12, fontWeight: '700' },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: onLight.success,
  },
  info: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    paddingTop: spacing.xl,
  },
  // Strate d'information de la photo courante (à propos, centres d'intérêt),
  // posée au-dessus de l'identité.
  panel: { marginBottom: spacing.sm, gap: 6 },
  panelTitle: {
    color: 'rgba(255,255,255,.75)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  panelText: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 20,
    textShadowColor: 'rgba(0,0,0,.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // Chips d'intérêts : pilules translucides teintées ivoire, encre fixe.
  chip: {
    backgroundColor: 'rgba(255,252,254,0.85)',
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: { color: onLight.ink, fontSize: 13, fontWeight: '600' },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.sm,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,.92)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  verifiedText: { color: onLight.ink, fontSize: 12, fontWeight: '700' },
  // Corail de la marque : l'intention porte la couleur d'action de Dowe.
  // flexShrink + minWidth : sur 360 dp, badge certifié + intention + étoile
  // tiennent sur la rangée, le libellé d'intention s'abrège au besoin.
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexShrink: 1,
    minWidth: 0,
  },
  goalText: { color: '#ffffff', fontSize: 12, fontWeight: '800', flexShrink: 1 },
  favoriteBtn: {
    marginLeft: 'auto',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  place: {
    color: 'rgba(255,255,255,.95)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 2,
  },
});
