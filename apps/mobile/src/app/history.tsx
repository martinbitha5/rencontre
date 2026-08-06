import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getPassedProfiles, hidePassedProfile, likeFromHistory, photoUrl } from '../api';
import { ProfileDetailModal } from '../components/ProfileDetailModal';
import { Centered, ScreenHeader } from '../components/ui';
import { useWallet } from '../lib/wallet';
import { colors, onLight, radius, spacing } from '../theme';
import { ageFromBirthDate, timeAgo, type PassedProfile } from '../types';
import { Ionicons } from '@expo/vector-icons';

// Historique des profils passés : on peut se raviser et liker (gratuit, et
// soumis à la même règle que partout — illimité si le profil est vérifié,
// quota quotidien sinon).
export default function History() {
  const router = useRouter();
  const { consumeLike } = useWallet();
  const [passed, setPassed] = useState<PassedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PassedProfile | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const data = await getPassedProfiles();
          if (!cancelled) setPassed(data);
        } catch {
          // liste vide en cas d'erreur réseau
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // Croix sur une carte : retire l'entrée de l'historique (le profil ne
  // revient pas pour autant dans le feed Découvrir).
  const hide = async (profile: PassedProfile) => {
    setPassed((prev) => prev.filter((p) => p.user_id !== profile.user_id));
    try {
      await hidePassedProfile(profile.user_id);
    } catch {
      setPassed((prev) => [profile, ...prev]);
    }
  };

  const like = async (profile: PassedProfile) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await likeFromHistory(profile.user_id);
      if (result.status === 'limit_reached') {
        Alert.alert(
          'Limite atteinte',
          `Tu as utilisé tes ${result.limit} likes du jour. Fais vérifier ton profil pour liker sans limite, c'est gratuit.`,
          [
            { text: 'Faire vérifier', onPress: () => router.push('/verify-profile') },
            { text: 'Plus tard', style: 'cancel' },
          ],
        );
        return;
      }
      consumeLike();
      setDetail(null);
      setPassed((prev) => prev.filter((p) => p.user_id !== profile.user_id));
      if (result.status === 'match') {
        Alert.alert("C'est un match !", `${profile.display_name} et toi pouvez discuter.`);
        return;
      }
      Alert.alert('Like envoyé', `Si ${profile.display_name} te like aussi, c'est un match.`);
    } catch {
      Alert.alert('Erreur', "Impossible de liker ce profil pour l'instant.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Historique" />
      <Text style={styles.subtitle}>
        Voici les profils que tu as passés. Tu as une deuxième chance de revenir sur tes pas.
      </Text>
      {loading ? (
        <Centered>
          <ActivityIndicator size="large" color={colors.primary} />
        </Centered>
      ) : passed.length === 0 ? (
        <Centered>
          <Text style={styles.emptyText}>
            Aucun profil passé pour l'instant. Ceux que tu passes dans Rencontres apparaîtront
            ici.
          </Text>
        </Centered>
      ) : (
        <FlatList
          data={passed}
          numColumns={2}
          keyExtractor={(p) => p.user_id}
          columnWrapperStyle={{ gap: spacing.sm }}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
          ListFooterComponent={<Text style={styles.endText}>Fin de la liste</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.cell} onPress={() => setDetail(item)}>
              {item.photos?.[0] ? (
                <Image
                  source={{ uri: photoUrl(item.photos[0].path) }}
                  style={styles.photo}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.photo, styles.noPhoto]}>
                  <Text style={styles.noPhotoText}>
                    {item.display_name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              <View style={styles.cellOverlay}>
                <Text style={styles.cellName} numberOfLines={1}>
                  {item.display_name}, {ageFromBirthDate(item.birth_date)}
                </Text>
                <Text style={styles.cellTime} numberOfLines={1}>
                  {timeAgo(item.swiped_at)}
                </Text>
              </View>
              <Pressable style={styles.removeBtn} onPress={() => hide(item)} hitSlop={8}>
                <Ionicons name="close" size={16} color={onLight.ink} />
              </Pressable>
            </Pressable>
          )}
        />
      )}

      <ProfileDetailModal
        profile={detail}
        onClose={() => setDetail(null)}
        onLike={detail ? () => like(detail) : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  cell: {
    flex: 1,
    maxWidth: '48.5%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: { aspectRatio: 3 / 4 },
  noPhoto: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoText: { fontSize: 38, color: 'rgba(255,255,255,.6)', fontWeight: '700' },
  cellOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(14,15,12,.55)',
  },
  cellName: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  cellTime: { fontSize: 11, color: 'rgba(255,255,255,.75)', marginTop: 1 },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endText: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
  },
});
