export type Gender = 'homme' | 'femme';

export interface City {
  id: number;
  name: string;
  province: string;
}

// Champs de profil détaillés, partagés entre mon profil et les profils du feed.
export interface ProfileDetails {
  height_cm: number | null;
  job_title: string | null;
  education: string | null;
  relationship_goal: string | null;
  has_children: string | null;
  wants_children: string | null;
  smoking: string | null;
  drinking: string | null;
  religion: string | null;
  commune: string | null;
  languages: string[];
  interests: string[];
}

export interface Profile extends ProfileDetails {
  user_id: string;
  display_name: string | null;
  birth_date: string | null;
  gender: Gender | null;
  looking_for: Gender | null;
  city_id: number | null;
  bio: string | null;
  age_min: number;
  age_max: number;
  is_onboarded: boolean;
  incognito: boolean;
  last_active_at: string;
  // Badge posé par l'équipe après vérification du selfie (migration 024).
  is_verified: boolean;
  // Filtres de recherche avancés (migration 017). null = pas de préférence.
  search_whole_country: boolean;
  filter_goals: string[] | null;
  filter_religions: string[] | null;
  filter_has_children: 'oui' | 'non' | null;
  filter_smoking: 'oui' | 'non' | null;
  filter_online_only: boolean;
  filter_dm_strict: boolean;
  // Ne montrer que les profils au badge bleu (migration 046). Gratuit.
  filter_verified_only: boolean;
}

export interface PhotoRef {
  id: string;
  path: string;
}

export interface FeedProfile extends ProfileDetails {
  user_id: string;
  display_name: string;
  birth_date: string;
  gender: Gender;
  city_name: string;
  bio: string;
  photos: PhotoRef[];
  last_active_at: string;
  is_verified: boolean;
}

// Statut de ma demande de vérification (RPC get_my_verification).
export interface VerificationState {
  is_verified: boolean;
  has_photo: boolean;
  status: 'pending' | 'approved' | 'rejected' | null;
  gesture: string | null;
  created_at: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
}

// Profil affichable dans la vue détaillée : identique au feed, mais la ville
// peut manquer (get_likers / get_passed_profiles font un left join sur cities).
export type ViewableProfile = Omit<FeedProfile, 'city_name'> & {
  city_name: string | null;
};

export interface Liker extends ViewableProfile {
  liked_at: string;
}

export interface PassedProfile extends ViewableProfile {
  swiped_at: string;
}

export interface FavoriteProfile extends ViewableProfile {
  favorited_at: string;
}

// Quelqu'un qui a ouvert mon profil dans les dernières 24 h.
export interface ProfileView extends ViewableProfile {
  viewed_at: string;
}

export type FavoriteResult = { status: 'ok' } | { status: 'limit_reached' };

// `limit` : le quota appliqué par le serveur, renvoyé avec le refus pour que le
// message affiché ne puisse pas contredire la règle réellement en vigueur.
export type SwipeResult =
  | { status: 'ok' }
  | { status: 'limit_reached'; limit: number }
  | { status: 'match'; match_id: string };

// ---------- Économie de coins ----------

export interface Wallet {
  // Solde total. expiring_balance en est la part périssable (pack DIAMOND),
  // dépensée en premier et perdue à expiring_at.
  balance: number;
  expiring_balance: number;
  expiring_at: string | null;
  free_dms_used: number;
  free_dm_quota: number;
  like_back_cost: number;
  dm_cost: number;
  incognito_cost: number;
  // Échéance de l'abonnement Incognito, null si aucun.
  incognito_until: string | null;
  filter_online_cost: number;
  filter_goals_cost: number;
  filter_dm_cost: number;
  // Quota de likes. Un compte vérifié like sans limite : dans ce cas
  // daily_like_limit et likes_left sont null, il n'y a aucun compteur à montrer.
  likes_unlimited: boolean;
  daily_like_limit: number | null;
  likes_left: number | null;
}

export type SetIncognitoResult =
  | { status: 'ok'; incognito: boolean; incognito_until: string | null }
  | { status: 'subscription_required' };

// Récompenses en pièces. 'referral' n'est jamais réclamable à la main :
// le serveur la crédite quand un filleul fait vérifier son compte.
export type RewardKind = 'referral' | 'share_app' | 'verify_account';

export interface Reward {
  kind: RewardKind;
  amount: number;
  claimed: boolean;
}

export interface RewardsState {
  balance: number;
  referral_code: string;
  has_sponsor: boolean;
  is_verified: boolean;
  referrals_paid: number;
  // Bonus crédité au FILLEUL à la vérification de son compte (migration 048).
  referred_bonus: number;
  rewards: Reward[];
}

export type ClaimRewardResult =
  | { status: 'granted'; amount: number; balance: number }
  | { status: 'already_claimed' }
  | { status: 'not_eligible' }
  | { status: 'unavailable' };

export type RedeemReferralResult = {
  status: 'ok' | 'already_referred' | 'unknown_code' | 'self_referral' | 'too_late';
};

export type SearchFiltersResult =
  | { status: 'ok'; charged: number; balance: number }
  | { status: 'insufficient_coins'; cost: number; balance: number };

export interface CoinTransaction {
  id: number;
  user_id: string;
  amount: number;
  kind:
    | 'welcome'
    | 'recharge'
    | 'like_back'
    | 'dm'
    | 'event'
    | 'admin'
    | 'filter'
    | 'filter_online'
    | 'filter_goals'
    | 'filter_dm'
    | 'reward'
    | 'expire';
  ref_user_id: string | null;
  created_at: string;
}

export type LikeBackResult =
  | { status: 'match'; match_id: string; balance?: number }
  | { status: 'insufficient_coins'; cost: number; balance: number };

export type DirectMessageResult =
  | {
      status: 'sent';
      match_id: string;
      balance: number;
      free_dms_left: number;
      charged: boolean;
      // true : la conversation existait déjà (match actif), le message est
      // parti dedans au lieu de créer une invitation DM en attente.
      already_matched?: boolean;
    }
  | { status: 'insufficient_coins'; cost: number; balance: number };

export type HistoryLikeResult =
  | { status: 'ok' }
  | { status: 'limit_reached'; limit: number }
  | { status: 'match'; match_id: string };

export interface MatchSummary {
  match_id: string;
  // Badge bleu de l'autre personne, posé sur son avatar (migration 047).
  is_verified: boolean;
  // Mon dernier message envoyé dans ce match a-t-il été lu ? null si je n'ai
  // encore rien envoyé. Alimente « Message reçu / lu » des DMs envoyés.
  sent_read: boolean | null;
  other_user_id: string;
  display_name: string;
  photo_path: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread_count: number;
  matched_at: string;
  status: 'pending' | 'active';
  initiated_by: string | null;
  is_archived: boolean;
}

export interface Message {
  id: number;
  match_id: string;
  sender_id: string;
  content: string;
  kind: 'text' | 'audio' | 'image' | 'video';
  media_path: string | null;
  created_at: string;
  read_at: string | null;
  // Vrai uniquement côté client, le temps que le serveur confirme l'envoi :
  // la bulle apparaît sous le doigt avec une petite horloge, puis la ligne
  // serveur la remplace. Jamais présent sur une ligne venue de la base.
  pending?: boolean;
}

// ---------- Soirées ----------

export interface EventSummary {
  event_id: string;
  name: string;
  ends_at: string | null;
  joined_at: string;
}

// Verdict de scan_event(). L'entrée se paie en francs sur le portail web, pas
// en pièces : la fonction ne débite rien, elle valide le QR et annonce le prix.
//   invalid          : aucune soirée ouverte derrière ce code
//   ok               : accès acquis (déjà sur la liste, ou entrée libre)
//   payment_required : il reste à payer, prix fixé au backoffice
export type ScanEventResult =
  | { status: 'invalid' }
  | { status: 'ok'; already: boolean; event_id: string; name: string; price_cdf: number }
  | { status: 'payment_required'; event_id: string; name: string; price_cdf: number };

export interface Reaction {
  message_id: number;
  match_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface MyPhoto {
  id: string;
  user_id: string;
  storage_path: string;
  position: number;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

// Statut de présence à partir de last_active_at.
export function activeLabel(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 15) return 'En ligne';
  if (mins < 60) return `En ligne il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `En ligne il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `En ligne il y a ${days} j`;
  return null;
}

export function ageFromBirthDate(birthDate: string): number {
  const birth = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}
