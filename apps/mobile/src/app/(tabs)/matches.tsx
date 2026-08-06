import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
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
import { archiveMatch, getMyMatches, photoUrl } from '../../api';
import { cacheGet, cacheSet } from '../../lib/cache';
import { prefetchPhotos } from '../../lib/preload';
import { Button, Centered, HeaderBand } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { colors, spacing } from '../../theme';
import { timeAgo, type MatchSummary } from '../../types';

export default function Matches() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await getMyMatches();
      // Les invitations DM en attente vivent dans Activité (Reçus / Envoyés) ;
      // ici, uniquement les vraies conversations : une invitation rejoint
      // Discussions quand la personne répond et que le match devient actif.
      const visible = data.filter((m) => m.status !== 'pending');
      setMatches(visible);
      cacheSet('matches', visible);
      // Les avatars partent en cache dès la liste reçue : ouvrir une
      // conversation ou revenir ici n'affiche plus de ronds vides.
      prefetchPhotos(visible.map((m) => m.photo_path));
    } catch {
      // silencieux, pull-to-refresh disponible
    } finally {
      setLoading(false);
    }
  }, []);

  // Affichage immédiat depuis le cache local, le réseau corrige ensuite.
  useEffect(() => {
    cacheGet<MatchSummary[]>('matches').then((cached) => {
      if (cached && cached.length) {
        setMatches((prev) => (prev.length ? prev : cached));
        setLoading(false);
      }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Nouveaux messages / matchs en temps réel → on rafraîchit la liste
  useEffect(() => {
    const channel = supabase
      .channel('matches-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  if (loading) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Centered>
    );
  }

  // Les conversations archivées vivent dans l'écran Archives.
  const visible = matches.filter((m) => !m.is_archived);
  const archivedCount = matches.length - visible.length;
  // Un match sans le moindre message reste en haut dans « Matchs Récents » ;
  // il ne descend dans la liste des conversations qu'au premier message.
  const isFresh = (m: MatchSummary) => !m.last_message && m.status === 'active';
  const freshMatches = visible.filter(isFresh);
  const conversations = visible.filter((m) => !isFresh(m));
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

  // Appui long sur une conversation : rangement dans les archives.
  const confirmArchive = (item: MatchSummary) => {
    Alert.alert(
      'Archiver',
      `Ranger la conversation avec ${item.display_name} dans les archives ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Archiver',
          onPress: async () => {
            setMatches((prev) =>
              prev.map((m) =>
                m.match_id === item.match_id ? { ...m, is_archived: true } : m,
              ),
            );
            try {
              await archiveMatch(item.match_id);
            } catch {
              setMatches((prev) =>
                prev.map((m) =>
                  m.match_id === item.match_id ? { ...m, is_archived: false } : m,
                ),
              );
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <HeaderBand
        title="Discussions"
        right={
          <Pressable
            onPress={() => router.push('/archives')}
            hitSlop={8}
            style={styles.archiveBtn}
          >
            <Ionicons name="archive-outline" size={22} color={colors.textOnPrimary} />
            {archivedCount > 0 && (
              <View style={styles.archiveDot}>
                <Text style={styles.archiveDotText}>{archivedCount}</Text>
              </View>
            )}
          </Pressable>
        }
      >
        {freshMatches.length > 0 && (
          <View style={styles.freshBlock}>
            <Text style={styles.freshTitle}>Matchs Récents</Text>
            <FlatList
              horizontal
              data={freshMatches}
              keyExtractor={(m) => m.match_id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: spacing.md, paddingHorizontal: spacing.md }}
              renderItem={({ item }) => (
                <Pressable style={styles.freshItem} onPress={() => openChat(item)}>
                  {item.photo_path ? (
                    <Image
                      source={{ uri: photoUrl(item.photo_path) }}
                      style={styles.freshAvatar}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.freshAvatar, styles.avatarFallback]}>
                      <Text style={styles.avatarLetter}>
                        {item.display_name?.[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <Text style={styles.freshName} numberOfLines={1}>
                    {item.display_name}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        )}
      </HeaderBand>
      <View style={styles.content}>
      {conversations.length === 0 ? (
        <Centered>
          <View style={styles.emptyIcon}>
            <Ionicons name="chatbubbles" size={28} color={colors.textOnAccent} />
          </View>
          {freshMatches.length > 0 ? (
            <>
              {/* Des matchs attendent en haut : inutile de renvoyer vers Rencontres. */}
              <Text style={styles.emptyTitle}>Fais le premier pas.</Text>
              <Text style={styles.emptyText}>
                Tes nouveaux matchs sont en haut. Écris-leur : la conversation viendra se ranger
                ici dès le premier message.
              </Text>
              <View style={styles.emptyActions}>
                <Button title="Actualiser" variant="ghost" onPress={load} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>Tu n'as pas de nouveaux matchs.</Text>
              <Text style={styles.emptyText}>
                Pas encore de discussion. Fais un tour dans Rencontres, ton match t'attend quelque part !
              </Text>
              <View style={styles.emptyActions}>
                <Button title="Trouve des matchs" onPress={() => router.push('/(tabs)')} />
                <Button title="Actualiser" variant="ghost" onPress={load} />
              </View>
            </>
          )}
        </Centered>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(m) => m.match_id}
          refreshing={loading}
          onRefresh={load}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => openChat(item)}
              onLongPress={() => confirmArchive(item)}
              delayLongPress={350}
            >
              {item.photo_path ? (
                <Image
                  source={{ uri: photoUrl(item.photo_path) }}
                  style={styles.avatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>
                    {item.display_name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              <View style={styles.rowBody}>
                <View style={styles.rowNameLine}>
                  <Text style={styles.rowName}>{item.display_name}</Text>
                </View>
                <Text
                  style={[styles.rowPreview, item.unread_count > 0 && styles.rowPreviewUnread]}
                  numberOfLines={1}
                >
                  {item.last_message ?? `Fais le premier pas avec ${item.display_name} !`}
                </Text>
              </View>
              <View style={styles.rowMeta}>
                <Text style={styles.rowTime}>
                  {timeAgo(item.last_message_at ?? item.matched_at)}
                </Text>
                {item.unread_count > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unread_count}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          )}
        />
      )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.primary },
  content: { flex: 1, backgroundColor: colors.background },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 300,
    lineHeight: 22,
  },
  emptyActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  freshBlock: {
    marginHorizontal: -spacing.md,
    paddingTop: spacing.sm,
  },
  freshTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textOnPrimary,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  freshItem: { alignItems: 'center', width: 68 },
  freshAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  freshName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textOnPrimary,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: '700' },
  rowBody: { flex: 1 },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowPreview: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  rowPreviewUnread: { color: colors.text, fontWeight: '600' },
  rowMeta: { alignItems: 'flex-end', gap: 4 },
  rowTime: { fontSize: 12, color: colors.textMuted },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { color: colors.textOnAccent, fontSize: 12, fontWeight: '700' },
  archiveBtn: { padding: 2 },
  archiveDot: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  archiveDotText: { fontSize: 10, fontWeight: '800', color: colors.textOnAccent },
});
