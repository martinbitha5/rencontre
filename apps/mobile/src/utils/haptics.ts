import * as Haptics from 'expo-haptics';

// Retour haptique de toute l'app, centralisé pour garder un langage cohérent :
// même geste, même sensation, partout. Chaque appel avale ses erreurs : un
// téléphone sans vibreur ou un réglage système coupé ne doit jamais casser
// une action.
export const haptic = {
  // Appui sur un bouton, une chip, une rangée de menu.
  tap: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  // Choix dans une liste ou un segmented (plus discret qu'un impact).
  select: () => {
    Haptics.selectionAsync().catch(() => {});
  },
  // Action marquante : like envoyé, envoi d'un message.
  impact: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  },
  // Événement heureux : match, paiement accepté, vérification validée.
  success: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
  // Message reçu pendant que la conversation est ouverte.
  message: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  // Occasion manquée : rien n'a échoué, mais il y a quelque chose à savoir.
  // Plus doux qu'`error`, qui sanctionne une action refusée.
  warning: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  // Refus, erreur, action impossible.
  error: () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  },
};
