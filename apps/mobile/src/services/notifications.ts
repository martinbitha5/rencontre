import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import type { NotificationResponse } from 'expo-notifications';
import { supabase } from '@/services/supabase';
import { IS_EXPO_GO } from '@/utils/expoGo';

// Expo Go ne supporte plus les notifications push depuis le SDK 53 : le simple
// import d'expo-notifications y déclenche une erreur au démarrage (son module
// d'auto-enregistrement du token s'exécute à l'import). On ne charge donc le
// module que hors Expo Go, c'est-à-dire dans un development build ou une app
// compilée, où les push fonctionnent vraiment.
const isExpoGo = IS_EXPO_GO;

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

// Conversation actuellement à l'écran : posée par l'écran de chat, lue par le
// handler de premier plan pour ne pas afficher de bannière quand le message
// concerne la discussion déjà ouverte.
let activeChatMatchId: string | null = null;

export function setActiveChatMatchId(matchId: string | null): void {
  activeChatMatchId = matchId;
}

function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (isExpoGo) {
    cached = null;
    return cached;
  }
  try {
    const mod = require('expo-notifications') as NotificationsModule;
    // Comportement quand une notification arrive app ouverte :
    // on l'affiche quand même (bannière discrète), sans son — sauf si
    // l'utilisateur est déjà dans la conversation concernée.
    mod.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request.content.data as
          | { type?: string; match_id?: string }
          | undefined;
        // Décision de vérification reçue app ouverte : l'app se met à jour et
        // l'annonce dans son propre bandeau (onPushReceived), pas de doublon.
        const handledInApp =
          data?.type === 'verification_approved' || data?.type === 'verification_rejected';
        const muted =
          handledInApp ||
          (data?.type === 'message' &&
            !!data.match_id &&
            data.match_id === activeChatMatchId);
        return {
          shouldShowBanner: !muted,
          shouldShowList: !muted,
          shouldPlaySound: false,
          shouldSetBadge: !muted,
        };
      },
    });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Notification reçue pendant que l'app est ouverte. Sert à synchroniser
 * aussitôt ce que le serveur vient de changer (badge vérifié, photo retirée)
 * au lieu d'attendre une relance de l'app. Renvoie la fonction de nettoyage.
 */
export function onPushReceived(cb: (type: string | undefined) => void): () => void {
  const Notifications = getNotifications();
  if (!Notifications) return () => {};
  const sub = Notifications.addNotificationReceivedListener((n) => {
    const data = n.request.content.data as { type?: string } | undefined;
    cb(data?.type);
  });
  return () => sub.remove();
}

// projectId EAS requis pour un token valide (config extra.eas.projectId).
function easProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId
  );
}

/**
 * Enregistre l'appareil pour les notifications push :
 * permission -> canal Android -> token Expo -> upsert dans push_tokens.
 *
 * Silencieux en cas d'échec : les push sont un plus, jamais bloquants.
 * Ne fait rien dans Expo Go (push non supportés depuis SDK 53) ni sur
 * simulateur — il faut un vrai appareil et un development build.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    const Notifications = getNotifications();
    if (!Notifications || !Device.isDevice) return;

    // Canal Android obligatoire avant de demander un token.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Notifications Zola',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#fd267a',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const res = await Notifications.requestPermissionsAsync();
      status = res.status;
    }
    if (status !== 'granted') return;

    const projectId = easProjectId();
    if (!projectId) return; // pas encore de projet EAS configuré

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId || !token) return;

    await supabase
      .from('push_tokens')
      .upsert({ user_id: userId, token, updated_at: new Date().toISOString() });
  } catch {
    // jamais bloquant
  }
}

/**
 * État de l'autorisation des notifications sur ce téléphone, pour l'écran
 * Paramètres. 'unavailable' : Expo Go, simulateur ou web, où les push
 * n'existent pas.
 */
export async function getPushPermission(): Promise<
  'granted' | 'denied' | 'undetermined' | 'unavailable'
> {
  try {
    const Notifications = getNotifications();
    if (!Notifications || !Device.isDevice) return 'unavailable';
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return 'granted';
    return canAskAgain ? 'undetermined' : 'denied';
  } catch {
    return 'unavailable';
  }
}

// Le tap de démarrage à froid ne doit être rejoué qu'une fois par lancement,
// même si l'effet qui branche la navigation se remonte (changement de session).
let coldStartHandled = false;

/**
 * Branche l'ouverture de l'app au toucher d'une notification : navigue vers
 * `data.url` (posée par la edge function send-push), que l'app soit en
 * arrière-plan ou complètement fermée. Renvoie la fonction de nettoyage.
 */
export function wireNotificationNavigation(navigate: (url: string) => void): () => void {
  const Notifications = getNotifications();
  if (!Notifications || !Device.isDevice) return () => {};

  const open = (response: NotificationResponse | null) => {
    const data = response?.notification.request.content.data as { url?: unknown } | undefined;
    if (typeof data?.url === 'string' && data.url.startsWith('/')) navigate(data.url);
  };

  // App fermée : la réponse qui a lancé l'app est disponible ici.
  if (!coldStartHandled) {
    coldStartHandled = true;
    Notifications.getLastNotificationResponseAsync()
      .then(open)
      .catch(() => {});
  }

  // App ouverte ou en arrière-plan : tap sur la notification.
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}

/** Supprime le token de cet appareil (à appeler à la déconnexion). */
export async function unregisterPushToken(): Promise<void> {
  try {
    const Notifications = getNotifications();
    if (!Notifications || !Device.isDevice) return;
    const projectId = easProjectId();
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;
    await supabase.from('push_tokens').delete().eq('token', token);
  } catch {
    // jamais bloquant
  }
}
