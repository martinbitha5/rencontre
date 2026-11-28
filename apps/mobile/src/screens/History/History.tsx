
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  getEventPassedProfiles,
  getPassedProfiles,
  hidePassedProfile,
  isEventOverError,
  likeFromEventHistory,
  likeFromHistory,
} from '@/services/api';
import { InsufficientCoinsModal } from '@/components/coins';
import { DirectMessageModal } from '@/components/DirectMessageModal';
import { ProfileDetailModal } from '@/components/ProfileDetailModal';
import { Centered, ScreenHeader } from '@/components/ui';
import { useWallet } from '@/providers/wallet';
import { colors, onLight, spacing } from '@/theme';
import { ageFromBirthDate, timeAgo, type DirectMessageResult, type PassedProfile } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './History.styles';
import { safeBack } from '@/utils/safeBack';
import { Photo } from '@/components/Photo';

// Historique des profils passés : on peut se raviser et liker (gratuit, et
// soumis à la même règle que partout — illimité si le profil est vérifié,
// quota quotidien sinon), ou écrire directement un premier message, comme
// depuis Rencontres.
//
// Deux historiques, deux durées de vie. Sans paramètre, c'est celui de
// Rencontres, permanent. Avec `eventId`, c'est celui de la soirée en cours :
// il ne contient que ce qu'on y a recalé ce soir, et il s'efface quand la
// soirée se termine. Les deux ne se mélangent jamais.
export default function History() {
  const router = useRouter();
  const { eventId, eventName } = useLocalSearchParams<{ eventId?: string; eventName?: string }>();
  const { wallet, apply, consumeLike, refresh: refreshWallet } = useWallet();
  const [passed, setPassed] = useState<PassedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<PassedProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [dmTarget, setDmTarget] = useState<PassedProfile | null>(null);
  const [insufficientCost, setInsufficientCost] = useState<number | null>(null);

  // Soirée terminée pendant qu'on regardait la liste : elle n'existe plus, on
  // le dit et on referme.
  const eventOver = useCallback(() => {
    Alert.alert(
      'Soirée terminée',
      'La soirée est finie : son historique s’est effacé avec elle. Les matchs, eux, restent.',
      [{ text: 'OK', onPress: () => safeBack(router) }],
    );
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const data = eventId ? await getEventPassedProfiles(eventId) : await getPassedProfiles();
          if (!cancelled) setPassed(data);
        } catch (error) {
          if (!cancelled && isEventOverError(error)) eventOver();
          // sinon liste vide en cas d'erreur réseau
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [eventId, eventOver]),
  );

  // Croix sur une carte : retire l'entrée de l'historique (le profil ne
  // revient pas pour autant dans le feed Découvrir). Pas de croix en soirée :
  // cet historique-là s'efface tout seul à la fin.
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
      const result = eventId
        ? await likeFromEventHistory(eventId, profile.user_id)
        : await likeFromHistory(profile.user_id);
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
    } catch (error) {
      if (isEventOverError(error)) {
        setDetail(null);
        eventOver();
        return;
      }
      Alert.alert('Erreur', "Impossible de liker ce profil pour l'instant.");
    } finally {
      setBusy(false);
    }
  };

  // Même traitement que dans Rencontres : une fois le message parti, la
  // conversation existe et le profil quitte l'historique.
  const onDmResult = (result: DirectMessageResult, target: { user_id: string; display_name: string }) => {
    setDmTarget(null);
    if (result.status === 'insufficient_coins') {
      apply({ balance: result.balance });
      setInsufficientCost(result.cost);
      return;
    }
    setPassed((prev) => prev.filter((p) => p.user_id !== target.user_id));
    if (result.status === 'already_sent') {
      apply({ balance: result.balance });
      Alert.alert(
        'Message déjà envoyé',
        `Tu as déjà écrit à ${target.display_name}. Ton message est dans DMs, partie Envoyés.`,
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
    Alert.alert(
      'Message envoyé',
      result.already_matched
        ? `Vous êtes déjà en match avec ${target.display_name} : ton message est parti dans votre conversation.`
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
      <ScreenHeader title={eventId ? 'Ce soir' : 'Historique'} />
      <Text style={styles.subtitle}>
        {eventId
          ? `Les profils que tu as passés à « ${eventName ?? 'la soirée'} ». Tu peux te raviser tant que la soirée dure : après, cette liste s’efface.`
          : 'Voici les profils que tu as passés. Tu as une deuxième chance : like-les ou écris-leur directement.'}
      </Text>
      {loading ? (
        <Centered>
          <ActivityIndicator size="large" color={colors.primary} />
        </Centered>
      ) : passed.length === 0 ? (
        <Centered>
          <Text style={styles.emptyText}>
            {eventId
              ? 'Tu n’as encore passé personne ce soir. Ceux que tu passes dans le paquet de la soirée apparaîtront ici.'
              : "Aucun profil passé pour l'instant. Ceux que tu passes dans Rencontres apparaîtront ici."}
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
                <Photo
                  path={item.photos[0].path}
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
              {!eventId && (
                <Pressable style={styles.removeBtn} onPress={() => hide(item)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={onLight.ink} />
                </Pressable>
              )}
            </Pressable>
          )}
        />
      )}

      <ProfileDetailModal
        profile={detail}
        onClose={() => setDetail(null)}
        onLike={detail ? () => like(detail) : undefined}
        onMessage={
          detail
            ? () => {
                // Une seule Modal visible à la fois : la fiche se ferme avant.
                setDetail(null);
                setDmTarget(detail);
              }
            : undefined
        }
      />

      <DirectMessageModal
        target={dmTarget}
        onClose={() => setDmTarget(null)}
        onResult={onDmResult}
      />

      <InsufficientCoinsModal cost={insufficientCost} onClose={() => setInsufficientCost(null)} />
    </SafeAreaView>
  );
}
