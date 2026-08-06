import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

// Choix d'une photo puis préparation pour l'envoi.
//
// Le base64 demandé directement à ImagePicker n'est PAS fiable sur les photos
// pleine résolution des téléphones récents : sur une image de plusieurs
// dizaines de mégapixels il revient parfois vide, et le code appelant se
// contentait de sortir en silence — d'où le « ça ne marche pas » sans le
// moindre message. On lit donc l'image choisie, on la redimensionne, et c'est
// le manipulateur qui produit le base64.
//
// Le redimensionnement ne recadre RIEN : seules les proportions d'origine
// sont conservées, on borne la plus grande dimension. Cela garantit aussi un
// vrai JPEG (les iPhone livrent du HEIC) et un fichier largement sous la
// limite de 5 Mo du bucket.
const MAX_EDGE = 1600;
const QUALITY = 0.85;

export type PickPhotoResult =
  | { status: 'ok'; base64: string }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'error'; message: string };

export async function pickProfilePhoto(): Promise<PickPhotoResult> {
  // Permission explicite : sans elle, la galerie se referme aussitôt et
  // l'utilisateur croit que le bouton est mort.
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { status: 'denied' };

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    // Pas de base64 ici : c'est justement lui qui échouait.
    base64: false,
  });
  if (picked.canceled) return { status: 'cancelled' };

  const asset = picked.assets?.[0];
  if (!asset?.uri) return { status: 'error', message: 'Photo illisible.' };

  try {
    const context = ImageManipulator.manipulate(asset.uri);

    // On ne borne que si l'image dépasse : jamais d'agrandissement.
    const longest = Math.max(asset.width ?? 0, asset.height ?? 0);
    if (longest > MAX_EDGE) {
      const portrait = (asset.height ?? 0) >= (asset.width ?? 0);
      context.resize(portrait ? { height: MAX_EDGE } : { width: MAX_EDGE });
    }
    const rendered = await context.renderAsync();
    const out = await rendered.saveAsync({
      format: SaveFormat.JPEG,
      compress: QUALITY,
      base64: true,
    });
    if (!out.base64) {
      return { status: 'error', message: 'La photo est trop lourde à préparer.' };
    }
    return { status: 'ok', base64: out.base64 };
  } catch (e) {
    const detail = (e as { message?: string })?.message ?? '';
    return { status: 'error', message: detail || 'Préparation de la photo impossible.' };
  }
}

// Message prêt à afficher pour les cas qui ne sont pas un succès.
export function pickPhotoMessage(res: Exclude<PickPhotoResult, { status: 'ok' }>): string | null {
  if (res.status === 'cancelled') return null;
  if (res.status === 'denied') {
    return "Autorise l'accès à tes photos dans les réglages pour en ajouter.";
  }
  return res.message;
}
