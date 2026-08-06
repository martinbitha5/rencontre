import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getFavorites,
  getLikers,
  getMyMatches,
  getProfileViews,
  likeBack,
  photoUrl,
  removeFavorite,
  sendSwipe,
  unmatch,
} from '../../api';
import { InsufficientCoinsModal } from '../../components/coins';
import { DirectMessageModal } from '../../components/DirectMessageModal';
import { UnicornMascot, type MascotVariant } from '../../components/mascot';
import { ProfileDetailModal } from '../../components/ProfileDetailModal';
import { Centered, HeaderBand, VerifiedBadge } from '../../components/ui';
import { formatCoins } from '../../config/economy';
import { useAuth } from '../../lib/auth';
import { cacheGet, cacheSet } from '../../lib/cache';
import { prefetchPhotos } from '../../lib/preload';
import { haptic } from '../../lib/haptics';
import { useWallet } from '../../lib/wallet';
import { colors, onLight, radius, shadows, spacing } from '../../theme';
import {
  activeLabel,
  ageFromBirthDate,
  timeAgo,
  type DirectMessageResult,
  type FavoriteProfile,
  type Liker,
  type MatchSummary,
  type ProfileView,
} from '../../types';

// L'onglet Activité regroupe, comme sur Heyama, tout ce qui bouge autour
// de ton profil : les demandes de message reçues, tes favoris, et les likes.
type Section = 'requests' | 'favorites' | 'likers' | 'views';

// L'ordre des pages du pager, identique à celui des onglets du bandeau. On
// navigue au doigt (balayage horizontal) comme au toucher des onglets, les
// deux restent synchronisés par l'index de page.
const SECTIONS: Section[] = ['requests', 'likers', 'views', 'favorites'];

// État vide centré : la licorne mascotte de Dowe, avec le badge propre à
// chaque page (bulle, cœur, œil, étoile), texte gris en dessous.
function EmptyState({
  variant,
  text,
}: {
  variant: MascotVariant;
  text: string;
}) {
  return (
    <Centered>
      <View style={styles.emptyMascot}>
        <UnicornMascot variant={variant} size={190} />
      </View>
      <Text style={styles.emptyText}>{text}</Text>
    </Centered>
  );
}

export default function Activity() {
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id;
  const { wallet, costs, apply, consumeLike, refresh: refreshWallet } = useWallet();

  // Le refus de like ne se termine pas sur « reviens demain » : la vérification
  // est la sortie, et elle est gratuite. Même message partout pour que la règle
  // s'apprenne d'un seul coup.
  const promptVerification = (limit: number) => {
    Alert.alert(
      'Limite atteinte',
      `Tu as utilisé tes ${limit} likes du jour. Fais vérifier ton profil pour liker sans limite, c'est gratuit.`,
      [
        { text: 'Faire vérifier', onPress: () => router.push('/verify-profile') },
        { text: 'Plus tard', style: 'cancel' },
      ],
    );
  };
  const [section, setSection] = useState<Section>('likers');
  // DMs : demandes reçues / invitations envoyées (l'option payante), à la
  // Heyama. Les deux vues vivent ici, dans Activité.
  const [dmView, setDmView] = useState<'received' | 'sent'>('received');
  const [requests, setRequests] = useState<MatchSummary[]>([]);
  const [sent, setSent] = useState<MatchSummary[]>([]);
  const [likers, setLikers] = useState<Liker[]>([]);
  const [favorites, setFavorites] = useState<FavoriteProfile[]>([]);
  const [views, setViews] = useState<ProfileView[]>([]);
  const [viewDetail, setViewDetail] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [likerDetail, setLikerDetail] = useState<Liker | null>(null);
  const [favoriteDetail, setFavoriteDetail] = useState<FavoriteProfile | null>(null);
  const [dmTarget, setDmTarget] = useState<FavoriteProfile | null>(null);
  const [insufficientCost, setInsufficientCost] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Affichage immédiat depuis le cache local, le réseau corrige ensuite.
  useEffect(() => {
    cacheGet<{
      likers: Liker[];
      favorites: FavoriteProfile[];
      requests: MatchSummary[];
      sent?: MatchSummary[];
      views?: ProfileView[];
    }>('activity').then((cached) => {
      if (cached) {
        setLikers((prev) => (prev.length ? prev : cached.likers));
        setFavorites((prev) => (prev.length ? prev : cached.favorites));
        setRequests((prev) => (prev.length ? prev : cached.requests));
        setSent((prev) => (prev.length ? prev : cached.sent ?? []));
        setViews((prev) => (prev.length ? prev : cached.views ?? []));
        setLoading(false);
      }
    });
  }, []);

  // Chargement des listes, réutilisé au focus de l'écran et après un envoi
  // de DM (sinon la vue Envoyés reste sur son ancien état).
  const reloadActivity = useCallback(async () => {
    const [likersData, favoritesData, matchesData, viewsData] = await Promise.all([
      getLikers(),
      getFavorites(),
      getMyMatches(),
      getProfileViews(),
    ]);
    setLikers(likersData);
    setFavorites(favoritesData);
    setViews(viewsData);
    // Demandes = invitations DM reçues ; Envoyés = celles que J'AI initiées
    // (l'option payante). Les deux vivent ici, pas dans Discussions : une
    // invitation sans réponse n'est pas encore une conversation.
    const requestsData = matchesData.filter(
      (m) => m.status === 'pending' && m.initiated_by && m.initiated_by !== myId,
    );
    const sentData = matchesData.filter(
      (m) => m.status === 'pending' && m.initiated_by === myId,
    );
    setRequests(requestsData);
    setSent(sentData);
    cacheSet('activity', {
      likers: likersData,
      favorites: favoritesData,
      requests: requestsData,
      sent: sentData,
      views: viewsData,
    });
    // Les photos des quatre listes partent en cache tout de suite : balayer
    // vers un onglet voisin montre des vignettes déjà chargées.
    prefetchPhotos([
      ...likersData.map((l) => l.photos?.[0]?.path),
      ...favoritesData.map((f) => f.photos?.[0]?.path),
      ...viewsData.map((v) => v.photos?.[0]?.path),
      ...requestsData.map((r) => r.photo_path),
      ...sentData.map((s) => s.photo_path),
    ]);
  }, [myId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      reloadActivity()
        .catch(() => {
          // listes vides en cas d'erreur réseau
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [reloadActivity]),
  );

  // Un profil bloqué ou signalé disparaît de toutes les listes d'un coup :
  // le serveur l'a déjà retiré, l'écran se met au diapason sans recharger.
  const dropBlocked = useCallback((id: string) => {
    setLikers((l) => l.filter((x) => x.user_id !== id));
    setViews((v) => v.filter((x) => x.user_id !== id));
    setFavorites((f) => f.filter((x) => x.user_id !== id));
  }, []);

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

  const doLikeBack = async (liker: Liker) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await likeBack(liker.user_id);
      if (result.status === 'insufficient_coins') {
        apply({ balance: result.balance });
        setLikerDetail(null);
        setInsufficientCost(result.cost);
        return;
      }
      if (typeof result.balance === 'number') apply({ balance: result.balance });
      setLikerDetail(null);
      setLikers((prev) => prev.filter((l) => l.user_id !== liker.user_id));
      // Match créé : le profil sort aussi des favoris, la conversation prend le relais.
      setFavorites((prev) => prev.filter((f) => f.user_id !== liker.user_id));
      Alert.alert("C'est un match !", `${liker.display_name} et toi pouvez discuter.`, [
        {
          text: 'Envoyer un message',
          onPress: () =>
            router.push({
              pathname: '/chat/[matchId]',
              params: {
                matchId: result.match_id,
                name: liker.display_name,
                otherUserId: liker.user_id,
                photoPath: liker.photos?.[0]?.path ?? '',
              },
            }),
        },
        { text: 'Plus tard', style: 'cancel' },
      ]);
    } catch {
      Alert.alert('Erreur', "Impossible de liker ce profil pour l'instant.");
    } finally {
      setBusy(false);
    }
  };

  // Like classique depuis les favoris (le profil est encore dans le pool).
  const likeFavorite = async (profile: FavoriteProfile) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await sendSwipe(profile.user_id, true);
      setFavoriteDetail(null);
      if (result.status === 'limit_reached') {
        promptVerification(result.limit);
        return;
      }
      consumeLike();
      if (result.status === 'match') {
        setLikers((prev) => prev.filter((l) => l.user_id !== profile.user_id));
        // Match créé : le profil sort des favoris, la conversation prend le relais.
        setFavorites((prev) => prev.filter((f) => f.user_id !== profile.user_id));
        Alert.alert("C'est un match !", `${profile.display_name} et toi pouvez discuter.`);
      } else {
        Alert.alert('Like envoyé', `Si ${profile.display_name} te like aussi, c'est un match.`);
      }
    } catch {
      Alert.alert('Erreur', "Impossible de liker ce profil pour l'instant.");
    } finally {
      setBusy(false);
    }
  };

  // Corbeille d'un DM envoyé : l'invitation est retirée pour les deux côtés
  // (le match pending se ferme). Optimiste, avec retour arrière si le serveur
  // refuse. Les pièces dépensées ne sont pas remboursées.
  const withdrawDm = (item: MatchSummary) => {
    Alert.alert(
      "Supprimer l'invitation",
      `Ton DM envoyé à ${item.display_name} sera retiré et ne sera plus visible. Les pièces utilisées ne sont pas remboursées.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setSent((prev) => prev.filter((m) => m.match_id !== item.match_id));
            try {
              await unmatch(item.match_id);
            } catch {
              setSent((prev) =>
                prev.some((m) => m.match_id === item.match_id) ? prev : [item, ...prev],
              );
              Alert.alert('Erreur', "Impossible de supprimer l'invitation pour l'instant.");
            }
          },
        },
      ],
    );
  };

  const unfavorite = async (profile: FavoriteProfile) => {
    setFavorites((prev) => prev.filter((f) => f.user_id !== profile.user_id));
    try {
      await removeFavorite(profile.user_id);
    } catch {
      setFavorites((prev) => [profile, ...prev]);
    }
  };

  const onDmResult = (result: DirectMessageResult, target: { user_id: string; display_name: string }) => {
    setDmTarget(null);
    if (result.status === 'insufficient_coins') {
      apply({ balance: result.balance });
      setInsufficientCost(result.cost);
      return;
    }
    if (wallet) {
      apply({
        balance: result.balance,
        free_dms_used: wallet.free_dm_quota - result.free_dms_left,
      });
    } else {
      refreshWallet();
    }
    // La vue Envoyés doit refléter le DM tout de suite, sans attendre un
    // retour sur l'écran.
    reloadActivity().catch(() => {});
    Alert.alert(
      'Message envoyé',
      result.already_matched
        ? `Vous êtes déjà en match avec ${target.display_name} : ton message est parti dans votre conversation, retrouve-la dans Messages.`
        : `${target.display_name} recevra ton message. Retrouve ton invitation dans DMs, partie Envoyés.`,
    );
  };

  // ------------------------------------------------------------------
  // Pager : les quatre pages défilent au balayage horizontal, et le trait
  // sous les onglets glisse en continu avec le doigt. Toucher un onglet
  // fait défiler le pager au même endroit : une seule source de vérité,
  // la position de défilement.
  // ------------------------------------------------------------------
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const didInitScroll = useRef(false);
  const scrollX = useSharedValue(SECTIONS.indexOf('likers') * width);

  const syncSection = useCallback((index: number) => {
    const next = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, index))];
    setSection((prev) => (prev === next ? prev : next));
  }, []);

  const goToSection = (key: Section) => {
    haptic.select();
    setSection(key);
    pagerRef.current?.scrollTo({ x: SECTIONS.indexOf(key) * width, animated: true });
  };

  // Le trait glisse sous les onglets : sa position suit la page au pixel.
  // Largeur d'un onglet = largeur utile du bandeau divisée par quatre.
  const tabWidth = (width - 2 * spacing.md) / SECTIONS.length;
  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (scrollX.value / width) * tabWidth + spacing.md }],
  }));

  if (loading) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Centered>
    );
  }

  const tabs: { key: Section; label: string }[] = [
    { key: 'requests', label: `DMs${requests.length ? ` (${requests.length})` : ''}` },
    { key: 'likers', label: `Likes${likers.length ? ` (${likers.length})` : ''}` },
    { key: 'views', label: `Vues${views.length ? ` (${views.length})` : ''}` },
    { key: 'favorites', label: `Favoris (${favorites.length}/10)` },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <HeaderBand title="Activité">
        <View style={styles.tabs}>
          {tabs.map((t) => {
            const active = section === t.key;
            return (
              <Pressable key={t.key} style={styles.tab} onPress={() => goToSection(t.key)}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
          {/* Trait unique qui glisse d'un onglet à l'autre, collé au doigt
              pendant le balayage des pages. */}
          <Animated.View
            style={[styles.tabIndicator, { width: tabWidth - 2 * spacing.md }, indicatorStyle]}
          />
        </View>
      </HeaderBand>

      <View style={styles.body}>
        {/* Les quatre pages défilent au balayage horizontal ; toucher un
            onglet amène à la même page. Toutes les pages restent montées :
            les listes sont déjà chargées, changer d'onglet est instantané. */}
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: SECTIONS.indexOf('likers') * width, y: 0 }}
          // contentOffset initial n'est pas fiable sur Android : on cale la
          // page de départ à la première mise en page, sans animation.
          onLayout={() => {
            if (didInitScroll.current) return;
            didInitScroll.current = true;
            pagerRef.current?.scrollTo({
              x: SECTIONS.indexOf('likers') * width,
              animated: false,
            });
          }}
          onScroll={(e) => {
            scrollX.value = e.nativeEvent.contentOffset.x;
          }}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(e) =>
            syncSection(Math.round(e.nativeEvent.contentOffset.x / width))
          }
        >
        <View style={{ width }}>
          {/* Page DMs : Reçus / Envoyés, à la Heyama. Envoyés = les
              invitations payantes que j'ai initiées, en attente de réponse ;
              elles deviennent des conversations dans Discussions dès que la
              personne répond. */}
          <View style={styles.dmSegmentWrap}>
            <View style={styles.dmSegment}>
              {(
                [
                  { key: 'received', label: 'Reçus' },
                  { key: 'sent', label: 'Envoyés' },
                ] as { key: 'received' | 'sent'; label: string }[]
              ).map((o) => {
                const active = dmView === o.key;
                return (
                  <Pressable
                    key={o.key}
                    style={[styles.dmSegmentItem, active && styles.dmSegmentItemActive]}
                    onPress={() => {
                      haptic.select();
                      setDmView(o.key);
                    }}
                  >
                    <Text style={[styles.dmSegmentText, active && styles.dmSegmentTextActive]}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {(dmView === 'received' ? requests : sent).length === 0 ? (
            <EmptyState
              variant="dm"
              text={
                dmView === 'received'
                  ? 'Lorsque d’autres profils t’enverront des DM, tu les verras ici.'
                  : 'Tu n’as pas encore envoyé de DM. Envoie des DM pour entrer rapidement en contact avec d’autres profils.'
              }
            />
          ) : dmView === 'received' ? (
            <FlatList
              data={requests}
              keyExtractor={(m) => m.match_id}
              style={styles.pageList}
              contentContainerStyle={{ paddingVertical: spacing.sm }}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.requestRow,
                    pressed && { backgroundColor: colors.surface },
                  ]}
                  onPress={() => openChat(item)}
                >
                  {item.photo_path ? (
                    <Image
                      source={{ uri: photoUrl(item.photo_path) }}
                      style={styles.requestAvatar}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.requestAvatar, styles.noPhoto]}>
                      <Text style={styles.requestAvatarLetter}>
                        {item.display_name?.[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.requestName}>{item.display_name}</Text>
                    <Text style={styles.requestPreview} numberOfLines={1}>
                      {item.last_message ?? 'Nouveau message'}
                    </Text>
                    <Text style={styles.requestTime}>
                      {timeAgo(item.last_message_at ?? item.matched_at)}
                    </Text>
                  </View>
                  <View style={styles.replyBtn}>
                    <Text style={styles.replyBtnText}>Répondre</Text>
                  </View>
                </Pressable>
              )}
            />
          ) : (
            /* Envoyés : cartes à la Heyama — avatar badgé, « Envoyé il y a X »,
               le message, puis l'état de lecture et la corbeille. */
            <FlatList
              data={sent}
              keyExtractor={(m) => m.match_id}
              style={styles.pageList}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.sentCard, pressed && { opacity: 0.92 }]}
                  onPress={() => openChat(item)}
                >
                  <View style={styles.sentHead}>
                    <View>
                      {item.photo_path ? (
                        <Image
                          source={{ uri: photoUrl(item.photo_path) }}
                          style={styles.sentAvatar}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View style={[styles.sentAvatar, styles.noPhoto]}>
                          <Text style={styles.requestAvatarLetter}>
                            {item.display_name?.[0]?.toUpperCase() ?? '?'}
                          </Text>
                        </View>
                      )}
                      {item.is_verified && (
                        <View style={styles.sentBadge}>
                          <VerifiedBadge size={15} />
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.requestName}>{item.display_name}</Text>
                      <Text style={styles.sentTime}>
                        Envoyé {timeAgo(item.last_message_at ?? item.matched_at)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.sentMessage}>{item.last_message ?? 'Message envoyé'}</Text>
                  <View style={styles.sentFooter}>
                    {/* Double coche grise = distribué, rose = lu. */}
                    <View style={styles.sentStatus}>
                      <Text
                        style={[
                          styles.sentStatusText,
                          item.sent_read === true && { color: colors.accent },
                        ]}
                      >
                        {item.sent_read === true ? 'Message lu' : 'Message reçu'}
                      </Text>
                      <Ionicons
                        name="checkmark-done"
                        size={16}
                        color={item.sent_read === true ? colors.accent : colors.textMuted}
                      />
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.trashBtn, pressed && { opacity: 0.7 }]}
                      onPress={() => withdrawDm(item)}
                      hitSlop={6}
                    >
                      <Ionicons name="trash" size={20} color={colors.danger} />
                    </Pressable>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>

        <View style={{ width }}>
          {/* Page Likes */}
          {likers.length === 0 ? (
            <EmptyState variant="likes" text="Personne pour l'instant. Continue à liker, ça finit toujours par matcher." />
          ) : (
            <FlatList
              data={likers}
              numColumns={2}
              keyExtractor={(l) => l.user_id}
              columnWrapperStyle={{ gap: spacing.sm }}
              style={styles.pageList}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
              renderItem={({ item }) => (
                <Pressable style={styles.cell} onPress={() => setLikerDetail(item)}>
                  {item.photos?.[0] ? (
                    <Image
                      source={{ uri: photoUrl(item.photos[0].path) }}
                      style={styles.photo}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.photo, styles.noPhoto]}>
                      <Text style={styles.noPhotoText}>
                        {item.display_name?.[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cellInfo}>
                    <View style={styles.cellNameRow}>
                      <Text style={styles.cellName} numberOfLines={1}>
                        {item.display_name}, {ageFromBirthDate(item.birth_date)}
                      </Text>
                      {item.is_verified && <VerifiedBadge size={15} />}
                    </View>
                    <Text style={styles.cellCity} numberOfLines={1}>
                      {timeAgo(item.liked_at)}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.likeBackBtn}
                    onPress={() => doLikeBack(item)}
                    hitSlop={6}
                  >
                    <Ionicons name="heart" size={18} color={colors.textOnAccent} />
                    <Text style={styles.likeBackCost}>{formatCoins(costs.like_back_cost)}</Text>
                  </Pressable>
                </Pressable>
              )}
            />
          )}
        </View>

        <View style={{ width }}>
          {/* Page Vues */}
          {views.length === 0 ? (
            <EmptyState
              variant="views"
              text="Personne n'a encore ouvert ton profil aujourd'hui. Complète tes photos pour attirer les regards."
            />
          ) : (
            <FlatList
              data={views}
              numColumns={2}
              keyExtractor={(v) => v.user_id}
              columnWrapperStyle={{ gap: spacing.sm }}
              style={styles.pageList}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
              renderItem={({ item }) => (
                <Pressable style={styles.cell} onPress={() => setViewDetail(item)}>
                  {item.photos?.[0] ? (
                    <Image
                      source={{ uri: photoUrl(item.photos[0].path) }}
                      style={styles.photo}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={[styles.photo, styles.noPhoto]}>
                      <Text style={styles.noPhotoText}>
                        {item.display_name?.[0]?.toUpperCase() ?? '?'}
                      </Text>
                    </View>
                  )}
                  <View style={styles.cellInfo}>
                    <View style={styles.cellNameRow}>
                      <Text style={styles.cellName} numberOfLines={1}>
                        {item.display_name}, {ageFromBirthDate(item.birth_date)}
                      </Text>
                      {item.is_verified && <VerifiedBadge size={15} />}
                    </View>
                    <Text style={styles.cellCity} numberOfLines={1}>
                      {timeAgo(item.viewed_at)}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>

        <View style={{ width }}>
          {/* Page Favoris */}
          {favorites.length === 0 ? (
            <EmptyState
              variant="favorites"
              text="Aucun favori. Appuie sur l'étoile d'un profil dans Rencontres pour le garder sous la main."
            />
          ) : (
            <FlatList
              data={favorites}
              numColumns={2}
              keyExtractor={(f) => f.user_id}
              columnWrapperStyle={{ gap: spacing.sm }}
              style={styles.pageList}
              contentContainerStyle={{ padding: spacing.md, gap: spacing.sm }}
              renderItem={({ item }) => {
                const online = activeLabel(item.last_active_at);
                return (
                  <Pressable style={styles.cell} onPress={() => setFavoriteDetail(item)}>
                    {item.photos?.[0] ? (
                      <Image
                        source={{ uri: photoUrl(item.photos[0].path) }}
                        style={styles.photo}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                      />
                    ) : (
                      <View style={[styles.photo, styles.noPhoto]}>
                        <Text style={styles.noPhotoText}>
                          {item.display_name?.[0]?.toUpperCase() ?? '?'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.cellInfo}>
                      <View style={styles.cellNameRow}>
                        <Text style={styles.cellName} numberOfLines={1}>
                          {item.display_name}, {ageFromBirthDate(item.birth_date)}
                        </Text>
                        {item.is_verified && <VerifiedBadge size={15} />}
                      </View>
                      {!!online && (
                        <View style={styles.onlineRow}>
                          {online === 'En ligne' && <View style={styles.onlineDot} />}
                          <Text style={styles.cellCity} numberOfLines={1}>
                            {online}
                          </Text>
                        </View>
                      )}
                    </View>
                    <Pressable
                      style={styles.removeBtn}
                      onPress={() => unfavorite(item)}
                      hitSlop={8}
                    >
                      <Ionicons name="close" size={14} color={onLight.ink} />
                    </Pressable>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
        </ScrollView>
      </View>

      {/* Détail d'un profil qui m'a liké : like retour payant */}
      <ProfileDetailModal
        profile={likerDetail}
        onClose={() => setLikerDetail(null)}
        onBlocked={dropBlocked}
        onLike={likerDetail ? () => doLikeBack(likerDetail) : undefined}
        likeCost={costs.like_back_cost}
      />

      {/* Détail d'un visiteur : consultation libre, l'action reste payante */}
      <ProfileDetailModal
        profile={viewDetail}
        onClose={() => setViewDetail(null)}
        onBlocked={dropBlocked}
      />

      {/* Détail d'un favori : like classique + message */}
      <ProfileDetailModal
        profile={favoriteDetail}
        onClose={() => setFavoriteDetail(null)}
        onBlocked={dropBlocked}
        onLike={favoriteDetail ? () => likeFavorite(favoriteDetail) : undefined}
        onMessage={
          favoriteDetail
            ? () => {
                setFavoriteDetail(null);
                setDmTarget(favoriteDetail);
              }
            : undefined
        }
      />

      <DirectMessageModal
        target={dmTarget}
        onClose={() => setDmTarget(null)}
        onResult={onDmResult}
      />

      <InsufficientCoinsModal
        cost={insufficientCost}
        onClose={() => setInsufficientCost(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Le haut (inset + bandeau) est vert forêt, le contenu reste blanc.
  safe: { flex: 1, backgroundColor: colors.primary },
  body: { flex: 1, backgroundColor: colors.background },
  // Barre d'onglets dans le bandeau : libellés blancs, un seul trait qui
  // glisse sous l'onglet actif au rythme du balayage des pages.
  // Les quatre onglets se partagent toute la largeur du bandeau.
  tabs: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingBottom: 6,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,.6)',
    paddingBottom: 6,
  },
  tabTextActive: { color: colors.textOnPrimary, fontWeight: '800' },
  tabIndicator: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: colors.textOnPrimary,
  },
  // Chaque page du pager occupe la hauteur disponible : les listes défilent
  // dans leur page, l'état vide se centre.
  pageList: { flex: 1 },
  dmSegmentWrap: { alignItems: 'center', marginTop: spacing.md },
  dmSegment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    padding: 3,
    minWidth: 220,
  },
  dmSegmentItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.full,
    alignItems: 'center',
  },
  dmSegmentItemActive: { backgroundColor: colors.primary },
  dmSegmentText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  dmSegmentTextActive: { color: colors.textOnPrimary },
  // Cartes des DMs envoyés, à la Heyama : la carte porte le message entier,
  // l'état de lecture et la corbeille.
  sentCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  sentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sentAvatar: { width: 46, height: 46, borderRadius: 23 },
  // Le badge bleu mord sur le coin de l'avatar, posé sur une pastille du fond
  // de carte pour rester net sur la photo.
  sentBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    backgroundColor: colors.cardSolid,
    borderRadius: 10,
    padding: 1,
  },
  sentTime: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  sentMessage: { fontSize: 15, color: colors.text, lineHeight: 21 },
  sentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sentStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sentStatusText: { fontSize: 13.5, fontWeight: '600', color: colors.textMuted },
  trashBtn: {
    width: 46,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMascot: { marginBottom: spacing.lg },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  requestAvatar: { width: 56, height: 56, borderRadius: 28 },
  requestAvatarLetter: { color: '#fff', fontSize: 22, fontWeight: '700' },
  requestName: { fontSize: 16, fontWeight: '700', color: colors.text },
  requestPreview: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  requestTime: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  replyBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  replyBtnText: { fontSize: 13, fontWeight: '800', color: colors.textOnAccent },
  cell: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  photo: { aspectRatio: 3 / 4 },
  noPhoto: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoText: { fontSize: 44, color: 'rgba(255,255,255,.6)', fontWeight: '700' },
  cellInfo: { padding: spacing.sm },
  cellNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cellName: { fontSize: 15, fontWeight: '700', color: colors.text, flexShrink: 1 },
  cellCity: { fontSize: 13, color: colors.textMuted },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  likeBackBtn: {
    position: 'absolute',
    right: spacing.sm,
    bottom: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  likeBackCost: { fontSize: 13, fontWeight: '800', color: colors.textOnAccent },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
