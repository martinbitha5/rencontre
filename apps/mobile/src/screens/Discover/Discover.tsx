import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  addFavorite,
  getDiscoveryFeed,
  getEventFeed,
  getFavorites,
  getLikers,
  getMyEvents,
  removeFavorite,
  sendSwipe,
  updateSearchFilters,
} from '@/services/api';
import { useAuth } from '@/providers/auth';
import { CoinIcon, InsufficientCoinsModal } from '@/components/coins';
import { formatCoins } from '@/config/economy';
import { PAYMENTS_ENABLED } from '@/config/features';
import { haptic } from '@/utils/haptics';
import { onPartyAccessChanged } from '@/utils/partySignal';
import { DirectMessageModal } from '@/components/DirectMessageModal';
import { DoweMark, FingerprintDraw } from '@/components/DoweLogo';
import { PressableScale } from '@/components/motion';
import { ProfileDetailModal } from '@/components/ProfileDetailModal';
import { SwipeDeck, type SwipeDeckHandle } from './SwipeDeck';
import { Button, Centered } from '@/components/ui';
import { useWallet } from '@/providers/wallet';
import { colors, onLight, spacing } from '@/theme';
import type { DirectMessageResult, EventSummary, FeedProfile } from '@/types';
import { styles } from './Discover.styles';

// Au-delà de cette absence en arrière-plan, ce que sert l'écran (soirée en
// cours et paquet de profils) est considéré comme périmé et rechargé au retour
// dans l'app. En deçà, et surtout d'un onglet à l'autre, rien ne se relance :
// on retrouve ses cartes là où on les avait laissées.
const STALE_AFTER_MS = 10 * 60 * 1000;

export default function Discover() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const { wallet, apply, likeQuota, consumeLike, refresh: refreshWallet } = useWallet();
  const [profiles, setProfiles] = useState<FeedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  // Porte la limite renvoyée par le serveur, pas un simple booléen : le message
  // affiché cite alors le quota réellement appliqué.
  const [limitReached, setLimitReached] = useState<number | null>(null);
  const [matchedName, setMatchedName] = useState<string | null>(null);
  // Nom du profil qui t'avait liké et que tu viens de passer. Purement
  // informatif : aucune action proposée, le profil reste dans l'historique.
  const [missedLiker, setMissedLiker] = useState<string | null>(null);
  const [detailProfile, setDetailProfile] = useState<FeedProfile | null>(null);
  const [dmTarget, setDmTarget] = useState<FeedProfile | null>(null);
  const [insufficientCost, setInsufficientCost] = useState<number | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [likeExplainer, setLikeExplainer] = useState<string | null>(null);
  // Soirée en cours : quand elle existe, le deck ne montre que les personnes
  // présentes à l'événement. Aucun sélecteur : l'algorithme décide seul.
  const [activeEvent, setActiveEvent] = useState<EventSummary | null>(null);
  // Le premier chargement du deck attend de savoir s'il y a une soirée : sans
  // cette barrière, on chargerait le fil classique puis, la soirée détectée,
  // le fil soirée — deux requêtes pour un seul affichage.
  const [eventsReady, setEventsReady] = useState(false);
  const refilling = useRef(false);
  const lastLoadedAt = useRef(0);
  // Qui m'a déjà liké, en mémoire. Le fil de découverte n'exclut pas ces
  // personnes : elles peuvent donc apparaître dans le paquet et être passées
  // sans qu'on sache ce qu'on laisse filer. On garde leurs identifiants pour
  // pouvoir le dire APRÈS coup — jamais avant, sinon le deck trahirait la
  // liste des likes reçus et biaiserait le choix.
  const likerIds = useRef<Set<string>>(new Set());
  // Poignée du paquet de cartes : les boutons Like / Passer déclenchent
  // l'animation d'envol au lieu de retirer la carte sèchement.
  const deck = useRef<SwipeDeckHandle>(null);

  // Détecte la soirée en cours. Appelé au premier lancement, au retour au
  // premier plan après une longue absence, sur rafraîchissement manuel et sur
  // signal de l'écran Scan — jamais sur un simple changement d'onglet.
  const syncEvent = useCallback(async () => {
    try {
      const events = await getMyEvents();
      const current = events[0] ?? null;
      // On ne remplace l'objet que si la soirée a réellement changé : le
      // remplacer à chaque lecture ferait repartir un chargement complet.
      setActiveEvent((prev) =>
        prev?.event_id === current?.event_id ? prev : current,
      );
    } catch {
      // échec réseau : on garde le mode courant
    } finally {
      setEventsReady(true);
    }
  }, []);

  // Premier lancement uniquement.
  useEffect(() => {
    syncEvent();
  }, [syncEvent]);

  // QR scanné dans l'écran Scan : la soirée démarre sans attendre.
  useEffect(() => onPartyAccessChanged(syncEvent), [syncEvent]);

  // Dépend de l'identifiant, pas de l'objet : deux lectures successives de la
  // même soirée ne doivent pas compter comme un changement.
  const eventId = activeEvent?.event_id ?? null;
  const fetchFeed = useCallback(
    (limit: number) =>
      eventId ? getEventFeed(eventId, limit) : getDiscoveryFeed(limit),
    [eventId],
  );

  useEffect(() => {
    getFavorites()
      .then((favs) => setFavoriteIds(new Set(favs.map((f) => f.user_id))))
      .catch(() => {});
  }, []);

  const toggleFavorite = useCallback(async (profile: FeedProfile) => {
    if (favoriteIds.has(profile.user_id)) {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        next.delete(profile.user_id);
        return next;
      });
      await removeFavorite(profile.user_id).catch(() => {});
      return;
    }
    try {
      const result = await addFavorite(profile.user_id);
      if (result.status === 'limit_reached') {
        Alert.alert('Maximum atteint', 'Tu peux garder 10 favoris. Retire-en un pour continuer.');
        return;
      }
      setFavoriteIds((prev) => new Set(prev).add(profile.user_id));
    } catch {
      // silencieux, l'étoile restera vide
    }
  }, [favoriteIds]);

  const loadFeed = useCallback(async () => {
    setLoading(true);
    // Rafraîchi avec le paquet, et pas dans son propre effet : un jeu de
    // cartes neuf mérite une liste de likes reçus à jour, et les deux requêtes
    // partent alors ensemble.
    getLikers()
      .then((likers) => {
        likerIds.current = new Set(likers.map((l) => l.user_id));
      })
      .catch(() => {});
    try {
      const feed = await fetchFeed(20);
      setProfiles(feed);
      lastLoadedAt.current = Date.now();
    } catch {
      // le feed peut être vide en cas d'erreur réseau, l'utilisateur peut rafraîchir
    } finally {
      setLoading(false);
    }
  }, [fetchFeed]);

  // Premier affichage (une fois la soirée connue), et bascule automatique
  // quand la soirée en cours change (elle commence ou se termine).
  useEffect(() => {
    if (eventsReady) loadFeed();
  }, [eventsReady, loadFeed]);

  // Retour dans l'app après une longue absence : la soirée a pu se terminer et
  // les profils servis datent, on repart de zéro. Une absence courte, et à plus
  // forte raison une navigation entre onglets, ne déclenchent rien.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastLoadedAt.current > STALE_AFTER_MS) {
        syncEvent();
        loadFeed();
      }
    });
    return () => sub.remove();
  }, [syncEvent, loadFeed]);

  // Le filtre « profils en ligne » peut vider la file sans que rien ne
  // l'explique : on propose de le couper depuis l'écran vide.
  const disableOnlineFilter = useCallback(async () => {
    try {
      await updateSearchFilters({
        onlineOnly: false,
        goals: profile?.filter_goals ?? null,
        dmStrict: !!profile?.filter_dm_strict,
      });
      await refreshProfile();
      loadFeed();
    } catch {
      Alert.alert('Erreur', "Le filtre n'a pas pu être modifié. Réessaie.");
    }
  }, [profile, refreshProfile, loadFeed]);

  // L'haptique part au moment de l'appui sur le bouton, pas ici : le retour
  // sous le doigt doit être immédiat, pas au terme de l'animation.
  const handleSwipe = useCallback(
    async (profile: FeedProfile, liked: boolean) => {
      setDetailProfile(null);
      setProfiles((prev) => prev.filter((p) => p.user_id !== profile.user_id));
      // Première fois qu'on like : petite explication du fonctionnement du match.
      if (liked) {
        AsyncStorage.getItem('dowe:like-explainer').then((seen) => {
          if (!seen) {
            AsyncStorage.setItem('dowe:like-explainer', '1').catch(() => {});
            setLikeExplainer(profile.display_name);
          }
        });
      }
      try {
        const result = await sendSwipe(profile.user_id, liked);
        if (result.status === 'limit_reached') {
          setLimitReached(result.limit);
          // le swipe n'a pas été compté : on remet le profil dans le paquet
          setProfiles((prev) => [profile, ...prev]);
          return;
        }
        if (liked) consumeLike();
        if (result.status === 'match') {
          haptic.success();
          setMatchedName(profile.display_name);
        } else if (!liked && likerIds.current.has(profile.user_id)) {
          // Averti seulement une fois le passage enregistré côté serveur : sur
          // un échec réseau la carte revient dans le paquet, il n'y a alors
          // rien de manqué à annoncer.
          haptic.warning();
          setMissedLiker(profile.display_name);
        }
      } catch {
        // en cas d'échec réseau on remet la carte
        setProfiles((prev) => [profile, ...prev]);
      }
    },
    [consumeLike],
  );

  // Recharge quand le paquet devient petit
  useEffect(() => {
    if (!loading && profiles.length === 2 && !refilling.current) {
      refilling.current = true;
      fetchFeed(20)
        .then((feed) => {
          setProfiles((prev) => {
            const known = new Set(prev.map((p) => p.user_id));
            return [...prev, ...feed.filter((p) => !known.has(p.user_id))];
          });
        })
        .catch(() => {})
        .finally(() => {
          refilling.current = false;
        });
    }
  }, [profiles.length, loading, fetchFeed]);

  const top = profiles[0];

  const onDmResult = (result: DirectMessageResult, target: { user_id: string; display_name: string }) => {
    setDmTarget(null);
    if (result.status === 'insufficient_coins') {
      apply({ balance: result.balance });
      setInsufficientCost(result.cost);
      return;
    }
    // Un DM était déjà parti vers cette personne : le serveur a refusé sans
    // rien débiter. Le profil sort quand même du paquet, il n'y a plus rien
    // à en faire ici.
    if (result.status === 'already_sent') {
      apply({ balance: result.balance });
      setDetailProfile(null);
      setProfiles((prev) => prev.filter((p) => p.user_id !== target.user_id));
      Alert.alert(
        'Message déjà envoyé',
        `Tu as déjà écrit à ${target.display_name}. Tu pourras lui répondre dès qu’elle aura répondu — ton message est dans DMs, partie Envoyés.`,
      );
      return;
    }
    setDetailProfile(null);
    // le serveur renvoie le solde et le quota restant : on synchronise sans refetch
    if (wallet) {
      apply({
        balance: result.balance,
        free_dms_used: wallet.free_dm_quota - result.free_dms_left,
      });
    } else {
      refreshWallet();
    }
    // le profil sort du feed : la conversation existe désormais
    setProfiles((prev) => prev.filter((p) => p.user_id !== target.user_id));
    // « Voir la conversation » n'a de sens que s'il y en a une : le raccourci
    // n'apparaît que lorsqu'un match actif existait déjà. Après un DM initial,
    // il n'y a rien à ouvrir — le message se retrouve dans DMs, partie
    // Envoyés, et la conversation naîtra de la réponse.
    Alert.alert(
      'Message envoyé',
      result.already_matched
        ? `Vous êtes déjà en match avec ${target.display_name} : ton message est parti dans votre conversation (onglet Messages).`
        : `${target.display_name} recevra ton message. Retrouve ton invitation dans DMs, partie Envoyés.`,
      result.already_matched
        ? [
            {
              text: 'Voir la conversation',
              onPress: () =>
                router.push({
                  pathname: '/chat/[matchId]',
                  params: {
                    matchId: result.match_id,
                    name: target.display_name,
                    otherUserId: target.user_id,
                  },
                }),
            },
            { text: 'Continuer', style: 'cancel' },
          ]
        : [{ text: 'Continuer', style: 'cancel' }],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Filigrane Velours : l'empreinte du logo, à peine visible, déborde du
          bord droit de l'écran. Décoratif uniquement, jamais interactif. */}
      <View style={styles.watermark} pointerEvents="none">
        <DoweMark size={84} color={colors.primaryDeep} />
      </View>
      <View style={styles.header}>
        <Text style={styles.brand}>Dowe</Text>
        {/* Conteneur solde + boutons carrés : crème posé sur l'ivoire, coin
            signature en bas à droite. Mêmes actions qu'avant, seul
            l'habillage change. */}
        <View style={styles.headerGroup}>
          {/* Solde et recharge : masqués tant que l'app est gratuite. */}
          {PAYMENTS_ENABLED && (
            <Pressable
              onPress={() => router.push('/recharge')}
              hitSlop={8}
              style={styles.balance}
              accessibilityRole="button"
              accessibilityLabel="Recharger mes pièces"
            >
              <Text style={styles.balanceText}>
                {wallet ? formatCoins(wallet.balance) : '–'}
              </Text>
              <CoinIcon size={16} />
            </Pressable>
          )}
          <Pressable
            onPress={() => router.push('/history')}
            hitSlop={4}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Historique des profils vus"
          >
            <Ionicons name="arrow-undo-outline" size={20} color={colors.primaryDeep} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/(tabs)/profile/preferences')}
            hitSlop={4}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Préférences de recherche"
          >
            <Ionicons name="search" size={20} color={colors.primaryDeep} />
          </Pressable>
        </View>
      </View>

      {/* Compteur de likes : montré uniquement quand il reste peu de likes à un
          compte non vérifié. Un compte vérifié n'a pas de quota, donc pas de
          compteur ; et tant qu'il reste large, le rappel serait du bruit. */}
      {!likeQuota.unlimited && likeQuota.left !== null && likeQuota.left <= 10 && (
        <Pressable style={styles.quotaBanner} onPress={() => router.push('/verify-profile')}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
          <Text style={styles.quotaText} numberOfLines={1}>
            {likeQuota.left > 0
              ? `Il te reste ${likeQuota.left} like${likeQuota.left > 1 ? 's' : ''} aujourd'hui`
              : 'Plus de likes aujourd’hui'}
          </Text>
          <Text style={styles.quotaAction}>Liker sans limite</Text>
        </Pressable>
      )}

      {loading ? (
        // Pas de spinner : le logo empreinte se dessine, puis respire tant que
        // le paquet de profils n'est pas arrivé. Signature de marque plutôt
        // qu'attente.
        <Centered>
          <FingerprintDraw size={110} color={colors.accent} strokeWidth={2} pulse />
        </Centered>
      ) : profiles.length === 0 ? (
        <Centered>
          <Text style={styles.emptyTitle}>
            {eventId ? 'Personne d’autre pour l’instant' : "Personne pour l'instant"}
          </Text>
          <Text style={styles.emptyText}>
            {eventId
              ? 'Tu as vu tout le monde à cette soirée. Reviens quand elle se remplit !'
              : profile?.filter_online_only
                ? 'Ton filtre « profils en ligne » ne montre que les personnes connectées dans les 15 dernières minutes. Il n’y en a aucune pour le moment.'
                : "Reviens plus tard ou élargis tes préférences d'âge dans ton profil."}
          </Text>
          <View style={{ height: spacing.md }} />
          {!eventId && profile?.filter_online_only && (
            <Button title="Voir tout le monde" onPress={disableOnlineFilter} />
          )}
          <Button
            title="Actualiser"
            variant={!eventId && profile?.filter_online_only ? 'ghost' : 'primary'}
            onPress={() => {
              // Rafraîchissement manuel : seul autre cas où l'on re-vérifie la
              // soirée en cours en plus du paquet de profils.
              syncEvent();
              loadFeed();
            }}
          />
        </Centered>
      ) : (
        <>
          {/* Le paquet arrive en fondu : transition fluide depuis l'animation
              du logo, pas d'apparition sèche. */}
          <Animated.View entering={FadeIn.duration(350)} style={styles.deck}>
            <SwipeDeck
              ref={deck}
              profiles={profiles}
              onSwipe={handleSwipe}
              onOpenProfile={setDetailProfile}
              isFavorite={(p) => favoriteIds.has(p.user_id)}
              onToggleFavorite={toggleFavorite}
            />
          </Animated.View>
          {/* Les trois seules décisions possibles : Passer, DM, Like. Le geste
              sur la carte ne fait que feuilleter les photos. */}
          <Animated.View entering={FadeIn.duration(350)} style={styles.actions}>
            <PressableScale
              style={styles.actionBtn}
              scaleTo={0.9}
              onPress={() => {
                if (!top) return;
                // Un passage reste discret sous le doigt.
                haptic.tap();
                deck.current?.swipeOut(false);
              }}
              accessibilityRole="button"
              accessibilityLabel="Passer ce profil"
            >
              <View style={styles.actionInner}>
                <Ionicons name="close" size={32} color={onLight.ink} />
              </View>
            </PressableScale>
            <PressableScale
              style={[styles.actionBtn, styles.msgBtn]}
              scaleTo={0.9}
              onPress={() => top && setDmTarget(top)}
              accessibilityRole="button"
              accessibilityLabel="Envoyer un message direct"
            >
              <View style={styles.actionInner}>
                <Ionicons name="chatbubble-ellipses" size={28} color={colors.textOnPrimary} />
                {/* Pastille de coût : rien à signaler quand écrire est libre. */}
                {PAYMENTS_ENABLED && (
                  <View style={styles.msgCostBadge}>
                    <CoinIcon size={12} />
                  </View>
                )}
              </View>
            </PressableScale>
            <PressableScale
              style={[styles.actionBtn, styles.likeBtn]}
              scaleTo={0.9}
              onPress={() => {
                if (!top) return;
                // Un like se sent franchement.
                haptic.impact();
                deck.current?.swipeOut(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Liker ce profil"
            >
              <View style={styles.actionInner}>
                <Ionicons name="heart" size={30} color={colors.textOnAccent} />
              </View>
            </PressableScale>
          </Animated.View>
        </>
      )}

      {/* Vue profil complète avant de se décider */}
      <ProfileDetailModal
        profile={detailProfile}
        onClose={() => setDetailProfile(null)}
        // Blocage ou signalement : le profil quitte le deck tout de suite,
        // sans attendre le prochain chargement.
        onBlocked={(id) => setProfiles((p) => p.filter((x) => x.user_id !== id))}
        onLike={
          detailProfile
            ? () => {
                haptic.impact();
                handleSwipe(detailProfile, true);
              }
            : undefined
        }
        onDislike={
          detailProfile
            ? () => {
                haptic.tap();
                handleSwipe(detailProfile, false);
              }
            : undefined
        }
        onMessage={
          detailProfile
            ? () => {
                // un seul Modal RN visible à la fois : on ferme la vue détail
                setDetailProfile(null);
                setDmTarget(detailProfile);
              }
            : undefined
        }
      />

      {/* Premier message sans match */}
      <DirectMessageModal
        target={dmTarget}
        onClose={() => setDmTarget(null)}
        onResult={onDmResult}
      />

      <InsufficientCoinsModal
        cost={insufficientCost}
        onClose={() => setInsufficientCost(null)}
      />

      {/* Modal : explication au premier like */}
      <Modal visible={likeExplainer !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="heart" size={30} color={colors.textOnAccent} />
            </View>
            <Text style={styles.matchTitle}>{likeExplainer} te plaît !</Text>
            <Text style={styles.matchText}>
              {"Tu as montré ton intérêt. Si tu reçois un like en retour, c'est un match : vous pourrez alors discuter dans l'onglet Matchs."}
            </Text>
            <Button title="C'est compris !" onPress={() => setLikeExplainer(null)} />
          </View>
        </View>
      </Modal>

      {/* Modal : c'est un match */}
      <Modal visible={matchedName !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="heart" size={30} color={colors.textOnAccent} />
            </View>
            <Text style={styles.matchTitle}>{"C'est un match !"}</Text>
            <Text style={styles.matchText}>
              {matchedName} et toi vous êtes likés mutuellement.
            </Text>
            <Button
              title="Envoyer un message"
              onPress={() => {
                setMatchedName(null);
                router.push('/(tabs)/matches');
              }}
            />
            <Button title="Continuer à découvrir" variant="ghost" onPress={() => setMatchedName(null)} />
          </View>
        </View>
      </Modal>

      {/* Modal : tu viens de passer quelqu'un qui t'avait liké. Informative,
          sans bouton de rattrapage : le profil reste dans l'historique, joignable
          par la flèche de retour en haut de l'écran. */}
      <Modal visible={missedLiker !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Pastille rose pâle, pas magenta : rien n'est à faire ici. */}
            <View style={styles.modalIconSoft}>
              <Ionicons name="heart-dislike" size={30} color={colors.selectedInk} />
            </View>
            <Text style={styles.matchTitle}>Oups !</Text>
            <Text style={styles.matchText}>
              {missedLiker} t’avait liké, et tu viens de passer. Ce profil reste dans ton
              historique.
            </Text>
            <Button title="Continuer" onPress={() => setMissedLiker(null)} />
          </View>
        </View>
      </Modal>

      {/* Modal : limite quotidienne */}
      <Modal visible={limitReached !== null} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="shield-checkmark-outline" size={30} color={colors.textOnAccent} />
            </View>
            <Text style={styles.matchTitle}>Limite atteinte</Text>
            <Text style={styles.matchText}>
              Tu as utilisé tes {limitReached ?? likeQuota.limit} likes du jour. Fais vérifier ton
              profil et like sans limite, tous les jours.{' '}
              {"C'est gratuit, et ça rassure les personnes que tu likes."}
            </Text>
            <Button
              title="Faire vérifier mon profil"
              onPress={() => {
                setLimitReached(null);
                router.push('/verify-profile');
              }}
            />
            <Button title="Revenir demain" variant="ghost" onPress={() => setLimitReached(null)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
