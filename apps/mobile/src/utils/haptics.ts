// Retour haptique de l'app : désactivé (demande du 25/11/2026).
//
// Les appels restent en place dans les écrans, mais ne font plus vibrer le
// téléphone. Pour le réactiver, il suffit de remettre ici les appels à
// expo-haptics (impactAsync, selectionAsync, notificationAsync), toujours
// installé :
//   tap      impactAsync(Light)          appui sur un bouton, une chip
//   select   selectionAsync()            choix dans une liste
//   impact   impactAsync(Medium)         like envoyé, message envoyé
//   success  notificationAsync(Success)  match, vérification validée
//   message  impactAsync(Light)          message reçu, conversation ouverte
//   warning  notificationAsync(Warning)  occasion manquée
//   error    notificationAsync(Error)    action refusée
const off = () => {};

export const haptic = {
  tap: off,
  select: off,
  impact: off,
  success: off,
  message: off,
  warning: off,
  error: off,
};
