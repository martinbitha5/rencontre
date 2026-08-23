import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, InteractionManager, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { archiveMatch, getMessages, getMyMatches, photoUrl } from '@/services/api';
import { cacheGet, cacheSet } from '@/utils/cache';
import { prefetchPhotos } from '@/utils/preload';
import { Button, Centered, VerifiedBadge } from '@/components/ui';
import { DoweMark } from '@/components/DoweLogo';
import { realtimeChannel, supabase } from '@/services/supabase';
import { colors } from '@/theme';
import { timeAgo, type MatchSummary } from '@/types';
import { styles } from './Matches.styles';

export default function Matches() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Préchauffage une seule fois par vie de l'écran : inutile de relancer
  // ces requêtes à chaque retour d'onglet ou événement temps réel.
  const prefetchedChats = useRef(false);

  // Les derniers messages des premières conversations partent en cache local
  // en arrière-plan : ouvrir un chat affiche l'historique sans attendre le
  // réseau (l'écran de conversation rafraîchit ensuite lui-même son cache).
  const prefetchConversations = useCallback((list: MatchSummary[]) => {
    if (prefetchedChats.current) return;
    prefetchedChats.current = true;
    const targets = list.filter((m) => m.last_message && !m.is_archived).slice(0, 8);
    InteractionManager.runAfterInteractions(() => {
      for (const m of targets) {
        getMessages(m.match_id)
          .then((msgs) => cacheSet(`messages:${m.match_id}`, msgs.slice(-50)))
          .catch(() => {});
      }
    });
  }, []);

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
      prefetchConversations(visible);
    } catch {
      // silencieux, pull-to-refresh disponible
    } finally {
      setLoading(false);
    }
  }, [prefetchConversations]);

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

  // Le rechargement passe par une ref : l'abonnement temps réel ne doit
  // jamais se recréer parce que `load` a changé d'identité.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Nouveaux messages / matchs en temps réel → on rafraîchit la liste.
  // Un seul abonnement pour toute la vie de l'écran, sur un canal au nom
  // unique (voir realtimeChannel) : rouvrir l'onglet pendant qu'un canal
  // précédent se ferme ne doit pas réutiliser un canal déjà souscrit.
  useEffect(() => {
    const refresh = () => loadRef.current();
    const channel = realtimeChannel('matches-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'matches' }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

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
  // Un match sans le moindre message reste en haut dans « Matchs récents » ;
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
    <SafeAreaView edges={['top']} style={styles.screen}>
      {/* En-tête éditorial Velours : grand titre café aligné à gauche sur
          l'ivoire, filigrane d'empreinte qui déborde du coin haut droit. */}
      <View style={styles.header}>
        <View style={styles.watermark} pointerEvents="none">
          <DoweMark size={84} color={colors.primaryDeep} />
        </View>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Discussions</Text>
          <Pressable
            onPress={() => router.push('/archives')}
            hitSlop={8}
            style={styles.archiveBtn}
          >
            <Ionicons name="archive-outline" size={20} color={colors.primaryDeep} />
            {archivedCount > 0 && (
              <View style={styles.archiveDot}>
                <Text style={styles.archiveDotText}>{archivedCount}</Text>
              </View>
            )}
          </Pressable>
        </View>
      </View>

      <Text style={styles.freshTitle}>Matchs récents</Text>
      <View style={styles.freshRow}>
        {/* Tuile compteur : coeur corail et nombre de nouveaux matchs, sur
            tuile crème au coin signature. */}
        <View style={styles.freshTile}>
          <Ionicons name="heart" size={28} color={colors.accent} />
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
                  <View style={[styles.freshTile, styles.freshAvatarFallback]}>
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
    </SafeAreaView>
  );
}
