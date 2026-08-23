import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyMatches, photoUrl, unarchiveMatch } from '@/services/api';
import { Centered, ScreenHeader } from '@/components/ui';
import { colors, spacing } from '@/theme';
import { timeAgo, type MatchSummary } from '@/types';
import { styles } from './Archives.styles';

// Conversations archivées : rangement personnel, tout reste actif.
// Désarchiver ramène la conversation dans Discussions.
export default function Archives() {
  const router = useRouter();
  const [archived, setArchived] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getMyMatches()
        .then((data) => {
          if (!cancelled) setArchived(data.filter((m) => m.is_archived));
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const openChat = (item: MatchSummary) =>
    router.push({
      pathname: '/chat/[matchId]',
      params: {
        matchId: item.match_id,
        name: item.display_name,
        otherUserId: item.other_user_id,
        photoPath: item.photo_path ?? '',
      },
    });

  const restore = async (item: MatchSummary) => {
    setArchived((prev) => prev.filter((m) => m.match_id !== item.match_id));
    try {
      await unarchiveMatch(item.match_id);
    } catch {
      setArchived((prev) => [item, ...prev]);
      Alert.alert('Erreur', "Impossible de désarchiver pour l'instant.");
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Archives" />
      <Text style={styles.subtitle}>
        Tes conversations rangées. Elles restent actives : désarchive pour les revoir dans
        Discussions.
      </Text>
      {loading ? (
        <Centered>
          <ActivityIndicator size="large" color={colors.primary} />
        </Centered>
      ) : archived.length === 0 ? (
        <Centered>
          <View style={styles.emptyIcon}>
            <Ionicons name="archive" size={28} color={colors.textOnAccent} />
          </View>
          <Text style={styles.emptyText}>
            Aucune conversation archivée. Fais un appui long sur une conversation dans
            Discussions pour la ranger ici.
          </Text>
        </Centered>
      ) : (
        <FlatList
          data={archived}
          keyExtractor={(m) => m.match_id}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xl }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => openChat(item)}>
              {item.photo_path ? (
                <Image
                  source={{ uri: photoUrl(item.photo_path) }}
                  style={styles.avatar}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>
                    {item.display_name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              <View style={styles.rowBody}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text style={styles.rowPreview} numberOfLines={1}>
                  {item.last_message ?? 'Conversation archivée'}
                </Text>
                <Text style={styles.rowTime}>
                  {timeAgo(item.last_message_at ?? item.matched_at)}
                </Text>
              </View>
              <Pressable style={styles.restoreBtn} onPress={() => restore(item)} hitSlop={6}>
                <Text style={styles.restoreBtnText}>Désarchiver</Text>
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}
