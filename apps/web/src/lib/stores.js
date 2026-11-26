// Liens des stores, au même endroit pour tout le site (accueil, pied de page,
// blog). Le site est passé « grand public » le 24/11/2026, avant la sortie de
// l'app prévue fin novembre : tant qu'un lien est vide, son badge s'affiche
// sans être cliquable et la mention SOON_NOTE annonce la date.
//
// LE JOUR DE LA SORTIE : coller ici les deux liens publics, puis reconstruire
// le site et redéposer l'archive.
//   ios      https://apps.apple.com/app/zola/id<numéro donné par App Store Connect>
//   android  https://play.google.com/store/apps/details?id=com.zolardc.app
export const STORES = {
  ios: null,
  android: null,
};

export const SOON_NOTE = 'Disponible fin novembre, sur iPhone et Android.';
export const LIVE_NOTE = 'Gratuit, sur iPhone et Android.';

export const storesLive = () => Boolean(STORES.ios || STORES.android);
export const storeNote = () => (STORES.ios && STORES.android ? LIVE_NOTE : SOON_NOTE);
