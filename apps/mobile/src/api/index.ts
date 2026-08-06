import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import type {
  City,
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
  VerificationState,
  ViewableProfile,
  Wallet,
} from '../types';

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

export async function getCities(): Promise<City[]> {
  const { data, error } = await supabase
    .from('cities')
    .select('id, name, province')
    .order('name');
  if (error) throw error;
  return data as City[];
}

// ---------- Photos ----------

export function photoUrl(path: string): string {
  // Les données de démo stockent des URLs complètes ; les vraies photos, un chemin storage.
  if (path.startsWith('http')) return path;
  return supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;
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

export async function uploadPhoto(base64: string, position: number): Promise<MyPhoto> {
  const userId = await requireUserId();
  const path = `${userId}/${Date.now()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('photos')
    .upload(path, decode(base64), { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

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
  await supabase.storage.from('photos').remove([photo.storage_path]);
}

// ---------- Découverte / swipe ----------

export async function getDiscoveryFeed(limit = 20): Promise<FeedProfile[]> {
  const { data, error } = await supabase.rpc('get_discovery_feed', { p_limit: limit });
  if (error) throw error;
  return (data ?? []) as FeedProfile[];
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
  return (data ?? []) as FeedProfile[];
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
}

export async function unarchiveMatch(matchId: string): Promise<void> {
  const { error } = await supabase.from('match_archives').delete().eq('match_id', matchId);
  if (error) throw error;
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
  return supabase.storage.from('voice').getPublicUrl(path).data.publicUrl;
}

export function chatMediaUrl(path: string): string {
  return supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
}

// Note vocale : upload du fichier local (m4a) puis insertion du message.
export async function sendAudioMessage(matchId: string, localUri: string): Promise<Message> {
  const userId = await requireUserId();
  const path = `${userId}/${Date.now()}.m4a`;

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const { error: uploadError } = await supabase.storage
    .from('voice')
    .upload(path, decode(base64), { contentType: 'audio/m4a' });
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
    .select('*, cities(name)')
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
    city_name: d.cities?.name ?? null,
    photos: (photos ?? []).map((p) => ({ id: p.id, path: p.storage_path })),
  } as unknown as ViewableProfile;
}

export async function markMessagesRead(matchId: string): Promise<void> {
  await supabase.rpc('mark_messages_read', { p_match_id: matchId });
}

export async function unmatch(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('unmatch', { p_match_id: matchId });
  if (error) throw error;
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
