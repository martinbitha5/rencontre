import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getFavorites,
  getLikers,
  getMyMatches,
  getProfileView,
  getProfileViews,
  likeBack,
  photoUrl,
  removeFavorite,
  sendSwipe,
  unmatch,
} from '@/services/api';
import { InsufficientCoinsModal } from '@/components/coins';
import { DirectMessageModal } from '@/components/DirectMessageModal';
import { DoweMark } from '@/components/DoweLogo';
import { UnicornMascot, type MascotVariant } from '@/components/mascot';
import { ProfileDetailModal } from '@/components/ProfileDetailModal';
import { ReplyModal } from './ReplyModal';
import { Centered, VerifiedBadge } from '@/components/ui';
import { formatCoins } from '@/config/economy';
import { PAYMENTS_ENABLED } from '@/config/features';
import { useAuth } from '@/providers/auth';
import { cacheGet, cacheSet } from '@/utils/cache';
import { prefetchPhotos } from '@/utils/preload';
import { haptic } from '@/utils/haptics';
import { useWallet } from '@/providers/wallet';
import { colors } from '@/theme';
import { styles } from './Activity.styles';
import {
  activeLabel,
  ageFromBirthDate,
  timeAgo,
  type DirectMessageResult,
  type FavoriteProfile,
  type Liker,
  type MatchSummary,
  type ProfileView,
  type ViewableProfile,
} from '@/types';

// L'onglet Activité regroupe tout ce qui bouge autour
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

// Avatar rond des rangées de liste : photo ou initiale, badge bleu certifié
// qui mord sur le coin quand le profil est vérifié.
function RowAvatar({
  path,
  name,
  verified,
}: {
  path?: string | null;
  name?: string | null;
  verified?: boolean;
}) {
  return (
    <View>
      {path ? (
        <Image
          source={{ uri: photoUrl(path) }}
          style={styles.rowAvatar}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.rowAvatar, styles.noPhoto]}>
          <Text style={styles.rowAvatarLetter}>{name?.[0]?.toUpperCase() ?? '?'}</Text>
        </View>
      )}
      {verified && (
        <View style={styles.rowBadge}>
          <VerifiedBadge size={16} />
        </View>
      )}
    </View>
  );
}

// Séparateur hairline entre les rangées, aligné après l'avatar.
function RowSeparator() {
  return <View style={styles.rowSeparator} />;
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
  // Ouverture sur les DMs : c'est la section la plus consultée, elle prime
  // sur les likes.
  const [section, setSection] = useState<Section>('requests');
  // DMs : demandes reçues / invitations envoyées (l'option payante).
  // Les deux vues vivent ici, dans Activité.
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
  // Fiche de l'autre personne d'un DM. MatchSummary ne porte que le nom, la
  // photo et le badge : la fiche complète se demande au serveur.
  const [sentDetail, setSentDetail] = useState<ViewableProfile | null>(null);
  // Invitation reçue à laquelle on est en train de répondre.
  const [replyTarget, setReplyTarget] = useState<MatchSummary | null>(null);
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

  // Fiche de l'autre personne d'un DM, reçu comme envoyé. Consultation et
  // rien d'autre : la modale s'ouvre SANS action d'écriture, ni like ni
  // message. Regarder quelqu'un et lui écrire sont deux choses distinctes,
  // et seule la seconde passe par la règle du DM.
  const openMatchProfile = async (item: MatchSummary) => {
    try {
      const profile = await getProfileView(item.other_user_id);
      if (profile) setSentDetail(profile);
    } catch {
      // profil indisponible : on ne bloque pas l'écran pour autant
    }
  };

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
    // Un DM était déjà parti vers cette personne : le serveur a refusé sans
    // rien débiter. C'est le cas atteignable depuis Vues, Favoris ou J'aime,
    // où la fiche d'un profil déjà contacté reste ouvrable.
    if (result.status === 'already_sent') {
      apply({ balance: result.balance });
      Alert.alert(
        'Message déjà envoyé',
        `Tu as déjà écrit à ${target.display_name}. Retrouve ton message dans DMs, partie Envoyés — tu pourras lui répondre dès qu’elle aura répondu.`,
      );
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
  // Pager : les quatre pages défilent au balayage horizontal. Toucher un
  // onglet fait défiler le pager au même endroit ; à la fin d'un balayage,
  // l'onglet actif se cale sur la page affichée.
  // ------------------------------------------------------------------
  const { width } = useWindowDimensions();
  const pagerRef = useRef<ScrollView>(null);
  const didInitScroll = useRef(false);

  const syncSection = useCallback((index: number) => {
    const next = SECTIONS[Math.max(0, Math.min(SECTIONS.length - 1, index))];
    setSection((prev) => (prev === next ? prev : next));
  }, []);

  const goToSection = (key: Section) => {
    haptic.select();
    setSection(key);
    pagerRef.current?.scrollTo({ x: SECTIONS.indexOf(key) * width, animated: true });
  };

  if (loading) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Centered>
    );
  }

  const tabs: { key: Section; label: string }[] = [
    { key: 'requests', label: 'DMs' },
    { key: 'likers', label: 'Likes' },
    { key: 'views', label: 'Vues' },
    { key: 'favorites', label: 'Favoris' },
  ];

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      {/* En-tête éditorial Velours : grand titre café aligné à gauche sur
          l'ivoire, filigrane d'empreinte qui déborde du coin haut droit. */}
      <View style={styles.header}>
        <View style={styles.watermark} pointerEvents="none">
          <DoweMark size={84} color={colors.primaryDeep} />
        </View>
        <Text style={styles.headerTitle}>Activité</Text>
        {/* Onglets texte sous le titre, posés sur l'ivoire : actif en encre
            café avec un trait souligné corail arrondi centré sous le libellé,
            inactifs gris. La rangée défile horizontalement si elle dépasse. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          {tabs.map((t) => {
            const active = section === t.key;
            return (
              <Pressable key={t.key} style={styles.tab} onPress={() => goToSection(t.key)}>
                <Text style={active ? styles.tabTextActive : styles.tabText}>{t.label}</Text>
                <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.pagerWrap}>
        {/* Les quatre pages défilent au balayage horizontal ; toucher un
            onglet amène à la même page. Toutes les pages restent montées :
            les listes sont déjà chargées, changer d'onglet est instantané. */}
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: SECTIONS.indexOf('requests') * width, y: 0 }}
          // contentOffset initial n'est pas fiable sur Android : on cale la
          // page de départ à la première mise en page, sans animation.
          onLayout={() => {
            if (didInitScroll.current) return;
            didInitScroll.current = true;
            pagerRef.current?.scrollTo({
              x: SECTIONS.indexOf('requests') * width,
              animated: false,
            });
          }}
          onMomentumScrollEnd={(e) =>
            syncSection(Math.round(e.nativeEvent.contentOffset.x / width))
          }
        >
        <View style={{ width }}>
          {/* Page DMs : Reçus / Envoyés,  Envoyés = les
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
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={RowSeparator}
              renderItem={({ item }) => (
                // Une invitation reçue se LIT ici ; elle ne mène pas à l'écran
                // de conversation. Tant que personne n'a répondu, il n'y a pas
                // de conversation : c'est la réponse qui crée le match. Le nom
                // ouvre la fiche, la pilule ouvre le composeur, l'aperçu du
                // message ne fait rien.
                <View style={styles.row}>
                  <RowAvatar
                    path={item.photo_path}
                    name={item.display_name}
                    verified={item.is_verified}
                  />
                  <Pressable
                    style={({ pressed }) => [
                      { flex: 1, minWidth: 0 },
                      pressed && { opacity: 0.6 },
                    ]}
                    onPress={() => openMatchProfile(item)}
                    accessibilityRole="button"
                    accessibilityLabel={`Voir le profil de ${item.display_name}`}
                  >
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.display_name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.last_message ?? 'Nouveau message'}
                    </Text>
                  </Pressable>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowTime}>
                      {timeAgo(item.last_message_at ?? item.matched_at)}
                    </Text>
                    <Pressable
                      style={({ pressed }) => [styles.accentPill, pressed && { opacity: 0.8 }]}
                      onPress={() => setReplyTarget(item)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Répondre à ${item.display_name}`}
                    >
                      <Text style={styles.accentPillText}>Répondre</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            />
          ) : (
            /* Envoyés : cartes — avatar badgé, « Envoyé il y a X »,
               le message, puis l'état de lecture et la corbeille. */
            <FlatList
              data={sent}
              keyExtractor={(m) => m.match_id}
              style={styles.pageList}
              contentContainerStyle={styles.sentContent}
              renderItem={({ item }) => (
                // Carte volontairement INERTE : un DM parti se consulte, il ne
                // s'ouvre pas. L'appui menait à l'écran de conversation, ce qui
                // rendait un fil complet accessible sans payer le message
                // suivant. Seule la corbeille reste active.
                <View style={styles.sentCard}>
                  <View style={styles.sentHead}>
                    <RowAvatar
                      path={item.photo_path}
                      name={item.display_name}
                      verified={item.is_verified}
                    />
                    {/* Seule zone active de la carte avec la corbeille : le nom
                        mène à la FICHE, jamais à la conversation. Consulter
                        quelqu'un et lui écrire sont deux choses distinctes, et
                        seule la seconde se paie. Le message, lui, reste inerte. */}
                    <Pressable
                      style={({ pressed }) => [{ flex: 1, minWidth: 0 }, pressed && { opacity: 0.6 }]}
                      onPress={() => openMatchProfile(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`Voir le profil de ${item.display_name}`}
                    >
                      <Text style={styles.rowName} numberOfLines={1}>
                        {item.display_name}
                      </Text>
                      <Text style={styles.sentTime}>
                        Envoyé {timeAgo(item.last_message_at ?? item.matched_at)}
                      </Text>
                    </Pressable>
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
                </View>
              )}
            />
          )}
        </View>

        <View style={{ width }}>
          {/* Page Likes : rangées blanches, avatar badgé, like retour en
              pilule accent avec son coût. */}
          {likers.length === 0 ? (
            <EmptyState variant="likes" text="Personne pour l'instant. Continue à liker, ça finit toujours par matcher." />
          ) : (
            <FlatList
              data={likers}
              keyExtractor={(l) => l.user_id}
              style={styles.pageList}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={RowSeparator}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: colors.surface },
                  ]}
                  onPress={() => setLikerDetail(item)}
                >
                  <RowAvatar
                    path={item.photos?.[0]?.path}
                    name={item.display_name}
                    verified={item.is_verified}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.display_name}, {ageFromBirthDate(item.birth_date)}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {timeAgo(item.liked_at)}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.accentPill}
                    onPress={() => doLikeBack(item)}
                    hitSlop={6}
                  >
                    <Ionicons name="heart" size={16} color={colors.textOnAccent} />
                    {/* Le coût du like en retour n'a plus lieu d'être annoncé
                        quand il ne coûte rien : reste le cœur. */}
                    {PAYMENTS_ENABLED && (
                      <Text style={styles.accentPillText}>
                        {formatCoins(costs.like_back_cost)}
                      </Text>
                    )}
                  </Pressable>
                </Pressable>
              )}
            />
          )}
        </View>

        <View style={{ width }}>
          {/* Page Vues : rangées blanches, heure de la visite à droite. */}
          {views.length === 0 ? (
            <EmptyState
              variant="views"
              text="Personne n'a encore ouvert ton profil aujourd'hui. Complète tes photos pour attirer les regards."
            />
          ) : (
            <FlatList
              data={views}
              keyExtractor={(v) => v.user_id}
              style={styles.pageList}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={RowSeparator}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.row,
                    pressed && { backgroundColor: colors.surface },
                  ]}
                  onPress={() => setViewDetail(item)}
                >
                  <RowAvatar
                    path={item.photos?.[0]?.path}
                    name={item.display_name}
                    verified={item.is_verified}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.display_name}, {ageFromBirthDate(item.birth_date)}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      A consulté ton profil
                    </Text>
                  </View>
                  <Text style={styles.rowTime}>{timeAgo(item.viewed_at)}</Text>
                </Pressable>
              )}
            />
          )}
        </View>

        <View style={{ width }}>
          {/* Page Favoris : rangées blanches, présence en sous-texte, retrait
              par la croix à droite. */}
          {favorites.length === 0 ? (
            <EmptyState
              variant="favorites"
              text="Aucun favori. Appuie sur l'étoile d'un profil dans Rencontres pour le garder sous la main."
            />
          ) : (
            <FlatList
              data={favorites}
              keyExtractor={(f) => f.user_id}
              style={styles.pageList}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={RowSeparator}
              renderItem={({ item }) => {
                const online = activeLabel(item.last_active_at);
                return (
                  <Pressable
                    style={({ pressed }) => [
                      styles.row,
                      pressed && { backgroundColor: colors.surface },
                    ]}
                    onPress={() => setFavoriteDetail(item)}
                  >
                    <RowAvatar
                      path={item.photos?.[0]?.path}
                      name={item.display_name}
                      verified={item.is_verified}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={1}>
                        {item.display_name}, {ageFromBirthDate(item.birth_date)}
                      </Text>
                      {!!online && (
                        <View style={styles.onlineRow}>
                          {online === 'En ligne' && <View style={styles.onlineDot} />}
                          <Text style={styles.rowSub} numberOfLines={1}>
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
                      <Ionicons name="close" size={16} color={colors.textMuted} />
                    </Pressable>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
        </ScrollView>
      </View>

      {/* Détail d'un profil qui m'a liké : like retour payant (gratuit tant
          que PAYMENTS_ENABLED est false — la pastille de coût disparaît). */}
      <ProfileDetailModal
        profile={likerDetail}
        onClose={() => setLikerDetail(null)}
        onBlocked={dropBlocked}
        onLike={likerDetail ? () => doLikeBack(likerDetail) : undefined}
        likeCost={PAYMENTS_ENABLED ? costs.like_back_cost : undefined}
      />

      {/* Détail d'un visiteur : consultation libre, l'action reste payante */}
      <ProfileDetailModal
        profile={viewDetail}
        onClose={() => setViewDetail(null)}
        onBlocked={dropBlocked}
      />

      {/* Fiche de l'autre personne d'un DM, reçu ou envoyé : consultation
          SEULE. Aucun onLike ni onMessage — proposer d'écrire ici rouvrirait
          par la bande le chemin que le verrouillage du DM vient de fermer. */}
      <ProfileDetailModal
        profile={sentDetail}
        onClose={() => setSentDetail(null)}
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

      {/* Répondre à une invitation reçue. La réponse crée le match côté
          serveur ; c'est seulement à ce moment que la conversation existe et
          qu'on y emmène la personne. */}
      <ReplyModal
        target={replyTarget}
        onClose={() => setReplyTarget(null)}
        onSent={(match) => {
          setReplyTarget(null);
          haptic.success();
          // L'invitation quitte la liste des demandes : ce n'en est plus une.
          setRequests((prev) => prev.filter((r) => r.match_id !== match.match_id));
          reloadActivity().catch(() => {});
          openChat(match);
        }}
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
