import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Expo Go ne supporte plus les notifications push depuis le SDK 53 : le simple
// import d'expo-notifications y déclenche une erreur au démarrage (son module
// d'auto-enregistrement du token s'exécute à l'import). On ne charge donc le
// module que hors Expo Go, c'est-à-dire dans un development build ou une app
// compilée, où les push fonctionnent vraiment.
const isExpoGo = Constants.executionEnvironment === 'storeClient';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

function getNotifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (isExpoGo) {
    cached = null;
    return cached;
  }
  try {
    const mod = require('expo-notifications') as NotificationsModule;
    // Comportement quand une notification arrive app ouverte :
    // on l'affiche quand même (bannière discrète), sans son.
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: true,
      }),
    });
    cached = mod;
  } catch {
    cached = null;
  }
  return cached;
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
        name: 'Notifications Dowe',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8b3fa8',
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
