import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef } from 'react';
import { hideToast, showToast } from '@/components/TopToast';
import { useAuth } from '@/providers/auth';
import { onPushReceived } from '@/services/notifications';
import { onIntroDone } from '@/utils/introState';
import { emitReconnect, onNetworkSignal } from '@/utils/network';
import { refreshUnreadNotices } from '@/utils/noticeSignal';
import { refreshBadges } from '@/utils/badgeSignal';

// Garde l'app synchronisée avec le serveur sans qu'il faille la relancer, et
// prévient quand le réseau lâche.
//
// 1. Notification reçue app ouverte : le compteur de la cloche est relu, et
//    le profil aussi quand la décision le change (vérification, photo
//    retirée, mode Invisible). L'annonce du badge passe
//    ensuite par VerifiedAnnouncer, le refus par un bandeau ici.
// 2. Plus de connexion : bandeau qui reste affiché tant que le réseau ne
//    revient pas. Au retour, bandeau « connexion rétablie » et relecture du
//    profil et des écrans qui écoutent onReconnect.
// 3. Réseau instable (requêtes très lentes ou en échec alors que le téléphone
//    se croit connecté) : bandeau d'avertissement, au plus une fois par
//    minute pour ne pas harceler.
//
// Rien ne s'affiche pendant l'intro de démarrage : les bandeaux attendent
// qu'elle soit terminée.

const UNSTABLE_EVERY_MS = 60 * 1000;
const NETWORK_KEY = 'network';

// Notifications qui changent le profil : on le relit à la réception.
const SYNC_TYPES = new Set([
  'verification_approved',
  'verification_rejected',
  'photo_removed',
  'incognito_granted',
  'incognito_revoked',
]);

export function LiveSync() {
  const { session, refreshProfile } = useAuth();
  const signedIn = !!session;

  // Toujours la dernière fonction, sans réabonner les écouteurs à chaque rendu.
  const refreshRef = useRef(refreshProfile);
  useEffect(() => {
    refreshRef.current = refreshProfile;
  }, [refreshProfile]);
  const signedInRef = useRef(signedIn);
  useEffect(() => {
    signedInRef.current = signedIn;
  }, [signedIn]);

  // 1. Notifications reçues app ouverte.
  useEffect(() => {
    if (!signedIn) return;
    // Compteur de la cloche, à l'ouverture de l'app.
    refreshUnreadNotices();
    return onPushReceived((type) => {
      // Toute notification peut en avoir créé une dans le centre.
      refreshUnreadNotices();
      // Nouveau message, like ou visite : les pastilles des onglets bougent.
      refreshBadges();
      if (!type || !SYNC_TYPES.has(type)) return;
      refreshRef.current().catch(() => {});
      if (type === 'verification_rejected') {
        showToast({
          tone: 'error',
          text: 'Ta vérification n’a pas abouti. Tu peux réessayer avec un nouveau geste depuis ton profil.',
          duration: 6000,
        });
      }
    });
  }, [signedIn]);

  // 2 et 3. État du réseau.
  useEffect(() => {
    let offline = false;
    let ready = false;
    let lastUnstable = 0;
    let pendingOffline = false;

    const showOffline = () => {
      showToast({
        tone: 'offline',
        key: NETWORK_KEY,
        duration: 0,
        text: 'Pas de connexion internet. Zola reprendra dès que le réseau revient.',
      });
    };

    const stopIntro = onIntroDone(() => {
      ready = true;
      if (pendingOffline) showOffline();
    });

    const stopNet = NetInfo.addEventListener((state) => {
      // isInternetReachable vaut null tant que le test n'est pas fait : seul
      // un false franc compte comme coupure.
      const isOffline = state.isConnected === false || state.isInternetReachable === false;
      if (isOffline === offline) return;
      offline = isOffline;
      if (offline) {
        pendingOffline = true;
        if (ready) showOffline();
        return;
      }
      pendingOffline = false;
      if (!ready) return;
      hideToast(NETWORK_KEY);
      showToast({ tone: 'success', text: 'Connexion rétablie.', duration: 2500 });
      if (signedInRef.current) {
        refreshRef.current().catch(() => {});
        refreshUnreadNotices();
        refreshBadges();
      }
      emitReconnect();
    });

    const stopSignal = onNetworkSignal(() => {
      if (!ready || offline) return;
      const now = Date.now();
      if (now - lastUnstable < UNSTABLE_EVERY_MS) return;
      lastUnstable = now;
      showToast({
        tone: 'unstable',
        text: 'Réseau instable. Le chargement peut prendre un peu plus de temps.',
        duration: 4500,
      });
    });

    return () => {
      stopIntro();
      stopNet();
      stopSignal();
    };
  }, []);

  return null;
}
