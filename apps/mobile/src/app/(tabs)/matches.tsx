import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
import { Button, Centered, VerifiedBadge } from '../../components/ui';
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
    <View style={styles.screen}>
      {/* En-tête plein-bleed : le dégradé magenta passe derrière la barre de
          statut, la SafeArea vit à l'intérieur. */}
      <LinearGradient
        colors={[colors.headerGradFrom, colors.headerGradTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.headerGrad}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Discussions</Text>
            <Pressable
              onPress={() => router.push('/archives')}
              hitSlop={8}
              style={styles.archiveBtn}
            >
              <Ionicons name="archive-outline" size={24} color="#ffffff" />
              {archivedCount > 0 && (
                <View style={styles.archiveDot}>
                  <Text style={styles.archiveDotText}>{archivedCount}</Text>
                </View>
              )}
            </Pressable>
          </View>

          <Text style={styles.freshTitle}>Matchs Récents</Text>
          <View style={styles.freshRow}>
            {/* Tuile compteur : coeur blanc et nombre de nouveaux matchs. */}
            <View style={styles.freshCounterTile}>
              <Ionicons name="heart" size={28} color="#ffffff" />
              <Text style={styles.freshCounterText}>{freshMatches.length}</Text>
            </View>
            {freshMatches.length === 0 ? (
              <Text style={styles.freshEmptyText}>
                {"Tu n'as pas de nouveaux matchs."}
              </Text>
            ) : (
              <FlatList
                horizontal
                data={freshMatches}
                keyExtractor={(m) => m.match_id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.freshListContent}
                renderItem={({ item }) => (
                  <Pressable onPress={() => openChat(item)}>
                    {item.photo_path ? (
                      <Image
                        source={{ uri: photoUrl(item.photo_path) }}
                        style={styles.freshAvatar}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={[styles.freshAvatar, styles.freshAvatarFallback]}>
                        <Text style={styles.freshAvatarLetter}>
                          {item.display_name?.[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                )}
              />
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Feuille claire aux coins très arrondis, posée sur le bas du dégradé. */}
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.totalRow}>
          <Text style={styles.totalText}>Total: {conversations.length}</Text>
          <Pressable onPress={load} hitSlop={8}>
            <Text style={styles.refreshText}>Actualiser</Text>
          </Pressable>
        </View>

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
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>Pas encore de discussion.</Text>
                <Text style={styles.emptyText}>
                  {"Fais un tour dans Rencontres, ton match t'attend quelque part !"}
                </Text>
                <View style={styles.emptyActions}>
                  <Button title="Trouve des matchs" onPress={() => router.push('/(tabs)')} />
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
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            ListFooterComponent={
              <Text style={styles.endText}>Fin de la liste 🎉</Text>
            }
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => openChat(item)}
                onLongPress={() => confirmArchive(item)}
                delayLongPress={350}
              >
                <View style={styles.avatarWrap}>
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
                  {item.is_verified && (
                    <View style={styles.verifiedWrap}>
                      <VerifiedBadge size={16} />
                    </View>
                  )}
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.display_name}
                  </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.headerGradFrom },
  // Le dégradé descend sous la feuille : ses derniers points sont recouverts
  // par les coins arrondis, comme sur la maquette.
  headerGrad: { paddingBottom: spacing.lg + 28 },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  archiveBtn: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.sm,
    bottom: 0,
    justifyContent: 'center',
  },
  archiveDot: {
    position: 'absolute',
    top: 4,
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
  freshTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  freshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.md,
  },
  freshCounterTile: {
    width: 92,
    height: 92,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  freshCounterText: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  freshEmptyText: { flex: 1, fontSize: 16, color: '#ffffff' },
  freshListContent: { gap: spacing.md, paddingRight: spacing.md },
  freshAvatar: { width: 92, height: 92, borderRadius: 22 },
  freshAvatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  freshAvatarLetter: { color: '#ffffff', fontSize: 30, fontWeight: '800' },
  // Feuille de contenu : coins hauts très arrondis, elle recouvre le dégradé.
  sheet: {
    flex: 1,
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm + 2,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  totalText: { fontSize: 15, fontWeight: '700', color: colors.text },
  refreshText: { fontSize: 15, fontWeight: '600', color: colors.accent },
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    gap: spacing.md,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 54 + spacing.md,
  },
  avatarWrap: { width: 54, height: 54 },
  avatar: { width: 54, height: 54, borderRadius: 27 },
  avatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: '700' },
  // Badge bleu superposé en bas à gauche de l'avatar, sur pastille du fond
  // pour rester net posé sur la photo.
  verifiedWrap: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    backgroundColor: colors.background,
    borderRadius: 9,
  },
  rowBody: { flex: 1 },
  rowName: { fontSize: 17, fontWeight: '700', color: colors.text },
  rowPreview: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  rowPreviewUnread: { color: colors.text, fontWeight: '600' },
  rowMeta: { alignItems: 'flex-end', gap: 4 },
  rowTime: { fontSize: 13, color: colors.textMuted },
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
  endText: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    paddingVertical: spacing.lg,
  },
});
