import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/services/supabase';
import { notifyBadgesStale } from '@/utils/badgeEvents';
import type {
  Badges,
  City,
  CountryCode,
  ClaimRewardResult,
  CoinTransaction,
  DirectMessageResult,
  EventSummary,
  FavoriteProfile,
  FavoriteResult,
  FeedProfile,
  HistoryLikeResult,
  LikeBackResult,
  Liker,
  MatchSummary,
  Message,
  MyPhoto,
  PassedProfile,
  Profile,
  ProfileView,
  Reaction,
  RedeemReferralResult,
  RewardKind,
  RewardsState,
  ScanEventResult,
  SearchFiltersResult,
  SetIncognitoResult,
  SwipeResult,
  TesterProgress,
  VerificationState,
  ViewableProfile,
  Wallet,
} from '@/types';

// Identifiant de l'utilisateur connecté, lu dans la session LOCALE.
//
// `auth.getUser()` interroge le serveur à chaque appel : sur un réseau mobile
// capricieux il renvoie `user: null`, et le code appelant plantait dessus
// (« Cannot read property 'id' of null » à l'envoi d'une photo). La session
// est déjà en mémoire, elle porte l'identifiant : aucune raison de le
// redemander au serveur.
async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('Session expirée. Reconnecte-toi.');
  return id;
}

// ---------- Profil ----------

export async function getMyProfile(): Promise<Profile> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function updateMyProfile(patch: Partial<Profile>): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function touchLastActive(): Promise<void> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (!uid) return;
    await supabase
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('user_id', uid);
  } catch {
    // Réseau coupé : le battement suivant réessaiera, rien à signaler.
  }
}

// Zola sert deux pays qui ne se mélangent pas : on ne charge jamais que les
// villes de SON pays. Une lecture par pays et par lancement, partagée par les
// écrans (inscription, profil, préférences). Un échec n'est pas mémorisé,
// l'appel suivant réessaie.
const citiesByCountry = new Map<CountryCode, Promise<City[]>>();

export function getCities(country: CountryCode): Promise<City[]> {
  let p = citiesByCountry.get(country);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase
        .from('cities')
        .select('id, name, province, country')
        .eq('country', country)
        .order('name');
      if (error) throw error;
      return data as City[];
    })().catch((e) => {
      citiesByCountry.delete(country);
      throw e;
    });
    citiesByCountry.set(country, p);
  }
  return p;
}

// Pays d'une ville par son identifiant (une seule ligne lue) : c'est ainsi
// qu'on sait, au lancement, quel catalogue charger pour mon profil.
const countryOfCity = new Map<number, Promise<CountryCode>>();

export function getCityCountry(cityId: number): Promise<CountryCode> {
  let p = countryOfCity.get(cityId);
  if (!p) {
    p = (async () => {
      const { data, error } = await supabase
        .from('cities')
        .select('country')
        .eq('id', cityId)
        .single();
      if (error) throw error;
      return (data?.country as CountryCode) ?? 'CD';
    })().catch((e) => {
      countryOfCity.delete(cityId);
      throw e;
    });
    countryOfCity.set(cityId, p);
  }
  return p;
}

// ---------- Photos ----------

// Miniature d'une photo : même dossier, même nom, suffixe « _t ». Créée à
// l'envoi (uploadPhoto, replacePhoto) ou rattrapée par ensureMyThumbs.
export function thumbPathOf(path: string): string {
  return path.replace(/\.jpg$/i, '_t.jpg');
}

// Les fichiers ne changent jamais une fois envoyés (chaque nom contient
// l'heure d'envoi) : le téléphone peut les garder en cache un an sans
// jamais les retélécharger.
const IMMUTABLE_CACHE = '31536000';

export function photoUrl(path: string, variant: 'full' | 'thumb' = 'full'): string {
  // Les données de démo stockent des URLs complètes ; les vraies photos, un chemin storage.
  if (path.startsWith('http')) return path;
  const p = variant === 'thumb' ? thumbPathOf(path) : path;
  return supabase.storage.from('photos').getPublicUrl(p).data.publicUrl;
}

async function uploadThumb(path: string, thumbBase64?: string): Promise<void> {
  if (!thumbBase64) return;
  // Best effort : sans miniature, l'app affiche la photo en grand.
  await supabase.storage
    .from('photos')
    .upload(thumbPathOf(path), decode(thumbBase64), {
      contentType: 'image/jpeg',
      cacheControl: IMMUTABLE_CACHE,
    })
    .catch(() => {});
}

export async function getMyPhotos(): Promise<MyPhoto[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('photos')
    .select('id, user_id, storage_path, position')
    .eq('user_id', userId)
    .order('position');
  if (error) throw error;
  return data as MyPhoto[];
}

export async function uploadPhoto(
  base64: string,
  position: number,
  thumbBase64?: string,
): Promise<MyPhoto> {
  const userId = await requireUserId();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(path, decode(base64), { contentType: 'image/jpeg', cacheControl: IMMUTABLE_CACHE });
  if (uploadError) throw uploadError;
  await uploadThumb(path, thumbBase64);

  const { data, error } = await supabase
    .from('photos')
    .insert({ user_id: userId, storage_path: path, position })
    .select('id, user_id, storage_path, position')
    .single();
  if (error) throw error;
  return data as MyPhoto;
}

export async function deletePhoto(photo: MyPhoto): Promise<void> {
  const { error } = await supabase.from('photos').delete().eq('id', photo.id);
  if (error) throw error;
  await supabase.storage.from('photos').remove([photo.storage_path, thumbPathOf(photo.storage_path)]);
}

// Remplace l'image d'une photo existante SANS toucher à sa ligne : même
// identifiant, même position, seul le fichier change. Le nouveau fichier est
// envoyé d'abord ; la ligne n'est mise à jour qu'une fois l'envoi réussi, et
// l'ancien fichier n'est retiré qu'après. À aucun moment le profil ne pointe
// vers un fichier absent.
export async function replacePhoto(
  photo: MyPhoto,
  base64: string,
  thumbBase64?: string,
): Promise<MyPhoto> {
  const userId = await requireUserId();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(path, decode(base64), { contentType: 'image/jpeg', cacheControl: IMMUTABLE_CACHE });
  if (uploadError) throw uploadError;
  await uploadThumb(path, thumbBase64);

  const { data, error } = await supabase
    .from('photos')
    .update({ storage_path: path })
    .eq('id', photo.id)
    .select('id, user_id, storage_path, position')
    .single();
  if (error) {
    await supabase.storage.from('photos').remove([path, thumbPathOf(path)]);
    throw error;
  }
  await supabase.storage
    .from('photos')
    .remove([photo.storage_path, thumbPathOf(photo.storage_path)]);
  return data as MyPhoto;
}

// Taille et qualité des miniatures : identiques à celles produites à l'envoi
// (services/photoPicker).
export const THUMB_EDGE = 400;
export const THUMB_QUALITY = 0.6;

// Rattrapage des miniatures de MES photos envoyées avant leur existence. La
// photo en grand est déjà dans le cache du téléphone (préchargement du
// profil) : la miniature est fabriquée sur place et envoyée une fois pour
// toutes. Les autres membres profitent ensuite de la version légère.
export async function ensureMyThumbs(photos: MyPhoto[]): Promise<void> {
  const own = photos.filter((p) => !p.storage_path.startsWith('http'));
  if (!own.length) return;
  for (const p of own) {
    const thumb = thumbPathOf(p.storage_path);
    if (thumb === p.storage_path) continue;
    try {
      // Requête HEAD : aucune image téléchargée, seulement la réponse « elle
      // existe » ou « elle manque ».
      const head = await fetch(photoUrl(p.storage_path, 'thumb'), { method: 'HEAD' });
      if (head.ok) continue;

      const context = ImageManipulator.manipulate(photoUrl(p.storage_path));
      context.resize({ width: THUMB_EDGE });
      const rendered = await context.renderAsync();
      const out = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: THUMB_QUALITY,
        base64: true,
      });
      await uploadThumb(p.storage_path, out.base64 ?? undefined);
    } catch {
      // On réessaiera à la prochaine ouverture.
    }
  }
}

// Réécrit les positions dans l'ordre reçu : la première photo de la liste
// devient la photo principale, celle que le fil et les listes affichent.
export async function reorderPhotos(photos: MyPhoto[]): Promise<MyPhoto[]> {
  await Promise.all(
    photos.map((p, i) =>
      p.position === i
        ? Promise.resolve()
        : supabase
            .from('photos')
            .update({ position: i })
            .eq('id', p.id)
            .then(({ error }) => {
              if (error) throw error;
            }),
    ),
  );
  return photos.map((p, i) => ({ ...p, position: i }));
}

// ---------- Découverte / swipe ----------

// Ajoute la date d'inscription aux profils du fil, pour la pastille « Vient
// de s'inscrire ». Une seule lecture pour tout le paquet ; en cas d'échec, le
// fil reste utilisable, simplement sans pastille.
async function withJoinDates(list: FeedProfile[]): Promise<FeedProfile[]> {
  if (!list.length) return list;
  try {
    const { data } = await supabase
      .from('profiles')
      .select('user_id, created_at')
      .in(
        'user_id',
        list.map((p) => p.user_id),
      );
    const byId = new Map((data ?? []).map((r: { user_id: string; created_at: string }) => [r.user_id, r.created_at]));
    return list.map((p) => ({ ...p, created_at: byId.get(p.user_id) ?? null }));
  } catch {
    return list;
  }
}

export async function getDiscoveryFeed(limit = 20): Promise<FeedProfile[]> {
  const { data, error } = await supabase.rpc('get_discovery_feed', { p_limit: limit });
  if (error) throw error;
  return withJoinDates((data ?? []) as FeedProfile[]);
}

export async function sendSwipe(targetId: string, liked: boolean): Promise<SwipeResult> {
  const { data, error } = await supabase.rpc('swipe', {
    p_target: targetId,
    p_liked: liked,
  });
  if (error) throw error;
  return data as SwipeResult;
}

export async function getLikers(): Promise<Liker[]> {
  const { data, error } = await supabase.rpc('get_likers');
  if (error) throw error;
  return (data ?? []) as Liker[];
}

export async function getPassedProfiles(): Promise<PassedProfile[]> {
  const { data, error } = await supabase.rpc('get_passed_profiles');
  if (error) throw error;
  return (data ?? []) as PassedProfile[];
}

// Re-liker un profil passé depuis l'historique (gratuit, limite quotidienne).
export async function likeFromHistory(targetId: string): Promise<HistoryLikeResult> {
  const { data, error } = await supabase.rpc('like_from_history', { p_target: targetId });
  if (error) throw error;
  return data as HistoryLikeResult;
}

// Retirer une entrée de l'historique (le profil ne revient pas dans le feed).
export async function hidePassedProfile(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('hide_passed_profile', { p_target: targetId });
  if (error) throw error;
}

// ---------- Soirées ----------

// Pastilles des onglets : messages non lus, invitations, likes et vues
// nouveaux, comptés par le serveur.
export async function getMyBadges(): Promise<Badges> {
  const { data, error } = await supabase.rpc('get_my_badges');
  if (error) throw error;
  return data as Badges;
}

// Ouvrir la page Likes ou Vues d'Activité remet sa pastille à zéro.
export async function markActivitySeen(section: 'likes' | 'views'): Promise<void> {
  const { error } = await supabase.rpc('mark_activity_seen', { p_section: section });
  if (error) throw error;
  notifyBadgesStale();
}

// Programme testeur : l'état du défi des 14 jours, et la confirmation du
// jour. Le serveur décide de la date et du compte, rejouer l'appel ne compte
// jamais deux fois.
export async function getTesterProgress(): Promise<TesterProgress> {
  const { data, error } = await supabase.rpc('tester_progress');
  if (error) throw error;
  return data as TesterProgress;
}

export async function testerCheckin(): Promise<TesterProgress> {
  const { data, error } = await supabase.rpc('tester_checkin');
  if (error) throw error;
  return data as TesterProgress;
}

// Scanner le QR d'une soirée. La fonction ne débite rien : elle valide le code
// et annonce le prix de l'entrée en francs. Le paiement se fait ensuite sur le
// portail web, et c'est multipay-return qui pose l'accès. Ré-entrée gratuite.
export async function scanEvent(token: string): Promise<ScanEventResult> {
  const { data, error } = await supabase.rpc('scan_event', { p_token: token });
  if (error) throw error;
  return data as ScanEventResult;
}

export async function getMyEvents(): Promise<EventSummary[]> {
  const { data, error } = await supabase.rpc('get_my_events');
  if (error) throw error;
  return (data ?? []) as EventSummary[];
}

// Deck Rencontres en mode soirée : uniquement les personnes présentes,
// sans les filtres ville / genre / âge.
export async function getEventFeed(eventId: string, limit = 20): Promise<FeedProfile[]> {
  const { data, error } = await supabase.rpc('get_event_feed', {
    p_event: eventId,
    p_limit: limit,
  });
  if (error) throw error;
  return withJoinDates((data ?? []) as FeedProfile[]);
}

// Décider dans la soirée (migration 056). Un recalage reste dans la soirée et
// s'efface avec elle ; un like est une relation, il rejoint swipes et peut
// devenir un match. Lève `evenement_termine` si la soirée s'est fermée entre
// deux cartes : le fil doit alors resynchroniser et repasser en Rencontres.
export async function sendEventSwipe(
  eventId: string,
  targetId: string,
  liked: boolean,
): Promise<SwipeResult> {
  const { data, error } = await supabase.rpc('event_swipe', {
    p_event: eventId,
    p_target: targetId,
    p_liked: liked,
  });
  if (error) throw error;
  return data as SwipeResult;
}

// Historique de la soirée : les profils recalés ce soir, tant qu'elle dure.
export async function getEventPassedProfiles(eventId: string): Promise<PassedProfile[]> {
  const { data, error } = await supabase.rpc('get_event_passed', { p_event: eventId });
  if (error) throw error;
  return (data ?? []) as PassedProfile[];
}

// Se raviser sur un profil recalé en soirée.
export async function likeFromEventHistory(
  eventId: string,
  targetId: string,
): Promise<HistoryLikeResult> {
  const { data, error } = await supabase.rpc('event_like_from_history', {
    p_event: eventId,
    p_target: targetId,
  });
  if (error) throw error;
  return data as HistoryLikeResult;
}

// Vrai quand le serveur signale que la soirée est finie ou qu'on n'en fait
// plus partie : dans les deux cas le fil doit quitter le mode soirée.
export function isEventOverError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? '');
  return message.includes('evenement_termine') || message.includes('non_participant');
}

// ---------- Favoris (privé, max 10) ----------

export async function getFavorites(): Promise<FavoriteProfile[]> {
  const { data, error } = await supabase.rpc('get_favorites');
  if (error) throw error;
  return (data ?? []) as FavoriteProfile[];
}

export async function addFavorite(targetId: string): Promise<FavoriteResult> {
  const { data, error } = await supabase.rpc('add_favorite', { p_target: targetId });
  if (error) throw error;
  return data as FavoriteResult;
}

export async function removeFavorite(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_favorite', { p_target: targetId });
  if (error) throw error;
}

// ---------- Économie de coins ----------

export async function getWallet(): Promise<Wallet> {
  const { data, error } = await supabase.rpc('get_wallet');
  if (error) throw error;
  return data as Wallet;
}

export async function getCoinTransactions(limit = 50): Promise<CoinTransaction[]> {
  const { data, error } = await supabase
    .from('coin_transactions')
    .select('*')
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as CoinTransaction[];
}

// Vues : qui a ouvert mon profil dans les dernières 24 h. Un profil incognito
// ne laisse aucune trace — le serveur n'enregistre simplement pas sa visite.
export async function getProfileViews(): Promise<ProfileView[]> {
  const { data, error } = await supabase.rpc('get_profile_views');
  if (error) throw error;
  return (data ?? []) as ProfileView[];
}

// Silencieux par nature : une visite non enregistrée ne doit jamais casser
// l'ouverture d'un profil.
export async function recordProfileView(targetId: string): Promise<void> {
  await supabase.rpc('record_profile_view', { p_target: targetId });
}

// Mode incognito : réservé aux abonnés, l'abonnement est vérifié côté serveur.
// Couper l'incognito reste toujours possible, même sans abonnement valide.
export async function setIncognito(on: boolean): Promise<SetIncognitoResult> {
  const { data, error } = await supabase.rpc('set_incognito', { p_on: on });
  if (error) throw error;
  return data as SetIncognitoResult;
}

// Récompenses : les conditions et le crédit sont vérifiés côté serveur,
// l'app ne fait qu'afficher et déclencher.
export async function getRewards(): Promise<RewardsState> {
  const { data, error } = await supabase.rpc('get_rewards');
  if (error) throw error;
  return data as RewardsState;
}

export async function claimReward(kind: RewardKind): Promise<ClaimRewardResult> {
  const { data, error } = await supabase.rpc('claim_reward', { p_kind: kind });
  if (error) throw error;
  return data as ClaimRewardResult;
}

export async function redeemReferralCode(code: string): Promise<RedeemReferralResult> {
  const { data, error } = await supabase.rpc('redeem_referral_code', { p_code: code });
  if (error) throw error;
  return data as RedeemReferralResult;
}

// Liker en retour depuis "J'aime" : débité côté serveur.
export async function likeBack(targetId: string): Promise<LikeBackResult> {
  const { data, error } = await supabase.rpc('like_back', { p_target: targetId });
  if (error) throw error;
  return data as LikeBackResult;
}

// Premier message sans match : c'est l'expéditeur qui paie (quota gratuit d'abord).
export async function sendDirectMessage(
  targetId: string,
  content: string,
): Promise<DirectMessageResult> {
  const { data, error } = await supabase.rpc('send_direct_message', {
    p_target: targetId,
    p_content: content,
  });
  if (error) throw error;
  return data as DirectMessageResult;
}

// ---------- Matchs / chat ----------

export async function getMyMatches(): Promise<MatchSummary[]> {
  const { data, error } = await supabase.rpc('get_my_matches');
  if (error) throw error;
  return (data ?? []) as MatchSummary[];
}

// État d'une conversation, lu depuis le serveur et non depuis les paramètres
// de navigation. C'est ce qui permet à l'écran de chat de savoir s'il a le
// droit d'afficher un composeur : un DM initial parti et resté sans réponse
// n'ouvre pas une conversation, quelle que soit la manière dont on est
// arrivé sur l'écran (lien profond, notification, état restauré au
// redémarrage). RLS ne renvoie que les matchs dont je fais partie.
export async function getMatchState(
  matchId: string,
): Promise<{ status: 'pending' | 'active'; initiated_by: string | null } | null> {
  const { data, error } = await supabase
    .from('matches')
    .select('status, initiated_by')
    .eq('id', matchId)
    .maybeSingle();
  if (error) throw error;
  return (data as { status: 'pending' | 'active'; initiated_by: string | null } | null) ?? null;
}

// Conversation déjà ouverte avec cette personne, s'il y en a une. Seul un
// match actif compte : un DM resté sans réponse (status 'pending') n'est pas
// une conversation, et un match défait (is_active = false) non plus. La paire
// est rangée user_a < user_b en base, d'où le tri avant la requête.
export async function getActiveMatchWith(
  otherUserId: string,
): Promise<{ matchId: string; hasMessages: boolean } | null> {
  const me = await requireUserId();
  if (me === otherUserId) return null;
  const [a, b] = me < otherUserId ? [me, otherUserId] : [otherUserId, me];
  const { data, error } = await supabase
    .from('matches')
    .select('id')
    .eq('user_a', a)
    .eq('user_b', b)
    .eq('is_active', true)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  const matchId = (data as { id: string } | null)?.id;
  if (!matchId) return null;
  // Matché ne veut pas dire en discussion : on regarde s'il y a au moins un
  // message pour choisir le bon texte du bandeau.
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', matchId);
  return { matchId, hasMessages: (count ?? 0) > 0 };
}

// Filtres payants : la RPC débite à l'activation (jamais le client).
export async function updateSearchFilters(params: {
  onlineOnly: boolean;
  goals: string[] | null;
  dmStrict: boolean;
}): Promise<SearchFiltersResult> {
  const { data, error } = await supabase.rpc('update_search_filters', {
    p_online_only: params.onlineOnly,
    p_goals: params.goals,
    p_dm_strict: params.dmStrict,
  });
  if (error) throw error;
  return data as SearchFiltersResult;
}

// Archives de conversations : rangement personnel, le match reste actif.
export async function archiveMatch(matchId: string): Promise<void> {
  const userId = await requireUserId();
  if (!userId) throw new Error('non_authentifie');
  const { error } = await supabase
    .from('match_archives')
    .upsert({ match_id: matchId, user_id: userId });
  if (error) throw error;
  notifyBadgesStale();
}

export async function unarchiveMatch(matchId: string): Promise<void> {
  const { error } = await supabase.from('match_archives').delete().eq('match_id', matchId);
  if (error) throw error;
  notifyBadgesStale();
}

export async function getMessages(matchId: string, limit = 50): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('match_id', matchId)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Message[]).reverse();
}

export async function sendMessage(matchId: string, content: string): Promise<Message> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('messages')
    .insert({ match_id: matchId, sender_id: userId, content })
    .select('*')
    .single();
  if (error) throw error;
  return data as Message;
}

export function voiceUrl(path: string): string {
  // Note qui part encore : la bulle provisoire lit le fichier enregistré sur
  // le téléphone (« file:///...m4a#d12 »), sans attendre le serveur.
  if (path.startsWith('file:') || path.startsWith('/')) return path.replace(/#d\d+$/, '');
  return supabase.storage.from('voice').getPublicUrl(path).data.publicUrl;
}

export function chatMediaUrl(path: string): string {
  return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
}

// Note vocale : upload du fichier local (m4a) puis insertion du message.
// Durée d'une note vocale, inscrite dans le nom de son fichier
// (« 1712345678901_d14.m4a » pour 14 secondes). La bulle affiche ainsi la
// durée sans télécharger la note : elle ne se charge qu'au toucher. Les
// notes plus anciennes n'ont pas ce repère.
export function voiceDurationOf(path: string): number | null {
  const m = /(?:_d(\d+)\.m4a|#d(\d+))$/.exec(path);
  if (m) return Number(m[1] ?? m[2]);
  return null;
}

export async function sendAudioMessage(
  matchId: string,
  localUri: string,
  durationSecs?: number,
): Promise<Message> {
  const userId = await requireUserId();
  const secs = durationSecs && durationSecs > 0 ? Math.round(durationSecs) : null;
  const path = `${userId}/${Date.now()}${secs ? `_d${secs}` : ''}.m4a`;

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const { error: uploadError } = await supabase.storage
    .from('voice')
    .upload(path, decode(base64), { contentType: 'audio/m4a', cacheControl: IMMUTABLE_CACHE });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from('messages')
    .insert({
      match_id: matchId,
      sender_id: userId,
      content: 'Note vocale',
      kind: 'audio',
      media_path: path,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Message;
}

// Photo ou vidéo de chat : upload en streaming depuis le fichier local
// (pas de base64 : une vidéo de plusieurs Mo saturerait la mémoire JS).
export async function sendMediaMessage(
  matchId: string,
  localUri: string,
  kind: 'image' | 'video',
  mimeType?: string,
): Promise<Message> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  const userId = sess.session?.user?.id;
  if (!token || !userId) throw new Error('Session expirée. Reconnecte-toi.');

  const contentType = mimeType ?? (kind === 'image' ? 'image/jpeg' : 'video/mp4');
  const ext = kind === 'image' ? 'jpg' : 'mp4';
  const path = `${userId}/${Date.now()}.${ext}`;

  const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/chat-media/${path}`;
  const res = await FileSystem.uploadAsync(uploadUrl, localUri, {
    httpMethod: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.EXPO_PUBLIC_SUPABASE_KEY as string,
      'Content-Type': contentType,
      // Fichier jamais modifié : gardé en cache côté téléphone.
      'cache-control': `max-age=${IMMUTABLE_CACHE}`,
    },
  });
  if (res.status !== 200) throw new Error(`upload_echoue_${res.status}`);

  const { data, error } = await supabase
    .from('messages')
    .insert({
      match_id: matchId,
      sender_id: userId,
      content: kind === 'image' ? 'Photo' : 'Vidéo',
      kind,
      media_path: path,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Message;
}

export async function deleteMessage(messageId: number): Promise<void> {
  const { error } = await supabase.from('messages').delete().eq('id', messageId);
  if (error) throw error;
}

// ---------- Réactions ----------

export async function getReactions(matchId: string): Promise<Reaction[]> {
  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .eq('match_id', matchId);
  if (error) throw error;
  return (data ?? []) as Reaction[];
}

export async function reactToMessage(message: Message, emoji: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('message_reactions').upsert({
    message_id: message.id,
    match_id: message.match_id,
    user_id: userId,
    emoji,
  });
  if (error) throw error;
}

export async function removeReaction(messageId: number): Promise<void> {
  const userId = await requireUserId();
  await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', userId);
}

// Profil complet d'un utilisateur (la RLS n'expose que les profils visibles).
export async function getProfileView(userId: string): Promise<ViewableProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, cities!profiles_city_id_fkey(name)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const { data: photos } = await supabase
    .from('photos')
    .select('id, storage_path')
    .eq('user_id', userId)
    .order('position');
  const d = data as Profile & { cities: { name: string } | null };
  return {
    ...d,
    // Statut caché (mode Invisible ou statut en ligne coupé) : on ne montre
    // pas l'heure de dernière activité, comme le font les fonctions du fil.
    last_active_at: d.incognito || d.show_online === false ? null : d.last_active_at,
    city_name: d.cities?.name ?? null,
    photos: (photos ?? []).map((p) => ({ id: p.id, path: p.storage_path })),
  } as unknown as ViewableProfile;
}

export async function markMessagesRead(matchId: string): Promise<void> {
  await supabase.rpc('mark_messages_read', { p_match_id: matchId });
  // La pastille de Discussions (ou d'Activité pour une invitation) baisse.
  notifyBadgesStale();
}

export async function unmatch(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('unmatch', { p_match_id: matchId });
  if (error) throw error;
  notifyBadgesStale();
}

// ---------- Sécurité ----------

export async function blockUser(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('block_user', { p_target: targetId });
  if (error) throw error;
}

// Le signalement part toujours de l'application : l'équipe ne fait que lire et
// décider depuis le backoffice. `matchId` joint la conversation au dossier pour
// que le modérateur puisse vérifier ce qui s'est réellement dit (le serveur
// refuse le rattachement si l'auteur du signalement n'en fait pas partie).
// Personnes que j'ai bloquées (migration 065), les plus récentes d'abord.
export interface BlockedUser {
  user_id: string;
  display_name: string | null;
  photo: string | null;
  blocked_at: string;
}

export async function getMyBlocks(): Promise<BlockedUser[]> {
  const { data, error } = await supabase.rpc('get_my_blocks');
  if (error) throw error;
  return (data ?? []) as BlockedUser[];
}

// Retire le blocage. Une conversation fermée par le blocage reste fermée.
export async function unblockUser(targetId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_user', { p_target: targetId });
  if (error) throw error;
}

export async function reportUser(
  targetId: string,
  reason: string,
  details?: string,
  matchId?: string | null,
): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase.from('reports').insert({
    reporter_id: userId,
    reported_id: targetId,
    reason,
    details: details?.trim() ? details.trim().slice(0, 1000) : null,
    match_id: matchId ?? null,
  });
  if (error) throw error;
}

// ---------- Vérification de profil ----------

export async function getMyVerification(): Promise<VerificationState> {
  const { data, error } = await supabase.rpc('get_my_verification');
  if (error) throw error;
  return data as VerificationState;
}

// Le selfie part dans un bucket privé, dans le dossier de son auteur. Il est
// supprimé par le serveur dès que l'équipe a tranché.
// Geste imposé par le serveur. L'app ne le choisit pas et ne peut pas le
// rejouer : c'est ce qui empêche de relancer l'application jusqu'à tomber sur
// un geste dont on possède déjà une photo.
export async function getVerificationChallenge(): Promise<{ gesture: string }> {
  const { data, error } = await supabase.rpc('get_verification_challenge');
  if (error) throw error;
  return data as { gesture: string };
}

export async function submitVerification(base64: string): Promise<void> {
  const userId = await requireUserId();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('verifications')
    .upload(path, decode(base64), { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { error } = await supabase.rpc('request_verification', { p_path: path });
  if (error) {
    // La demande n'a pas été enregistrée : on ne laisse pas traîner le selfie.
    await supabase.storage.from('verifications').remove([path]);
    throw error;
  }
}

export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}

// Il n'y a plus d'abonnement « premium » : le like illimité vient de la
// vérification du profil (migration 033) et l'invisibilité de l'abonnement
// Incognito, porté par entitlements.incognito_until. La colonne is_premium
// existe encore en base mais n'est plus lue par personne : ne pas rebrancher
// une fonctionnalité dessus sans lui redonner d'abord une source qui l'écrit.

// ---------- Centre de notifications (migration 068) ----------

// Ce que la modération a décidé pour moi (photo retirée, vérification,
// avertissement, signalement traité...). Les messages et les matchs ont leurs
// propres onglets et n'arrivent pas ici.
export interface UserNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  created_at: string;
  read_at: string | null;
}

export async function getMyNotifications(limit = 50): Promise<UserNotification[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('user_notifications')
    .select('id, type, title, body, url, created_at, read_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as UserNotification[];
}

export async function countUnreadNotifications(): Promise<number> {
  const userId = await requireUserId();
  const { count, error } = await supabase
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function markAllNotificationsRead(): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from('user_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
}
