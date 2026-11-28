import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { THUMB_EDGE, THUMB_QUALITY } from '@/services/api';
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
//
// Économie de données : 1080 pixels suffisent à l'écran d'un téléphone, même
// en plein écran, et une compression à 0,75 reste nette à l'oeil. Une photo
// pèse ainsi environ 120 Ko au lieu de 250 à 500 Ko, à l'envoi comme pour
// chaque personne qui la regarde. Une miniature de 400 pixels (une vingtaine
// de Ko) est produite en même temps, pour les vignettes et les listes.
const MAX_EDGE = 1080;
const QUALITY = 0.75;

export type PickPhotoResult =
  | { status: 'ok'; base64: string; thumbBase64?: string }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'camera_denied' }
  | { status: 'error'; message: string };

// D'où vient la photo : la galerie du téléphone ou l'appareil photo.
export type PhotoSource = 'library' | 'camera';

export async function pickProfilePhoto(source: PhotoSource = 'library'): Promise<PickPhotoResult> {
  // Permission explicite : sans elle, la galerie (ou la caméra) se referme
  // aussitôt et l'utilisateur croit que le bouton est mort.
  const perm =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return { status: source === 'camera' ? 'camera_denied' : 'denied' };

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    // Pas de base64 ici : c'est justement lui qui échouait.
    base64: false,
  };
  let picked: ImagePicker.ImagePickerResult;
  try {
    picked =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ ...options, cameraType: ImagePicker.CameraType.front })
        : await ImagePicker.launchImageLibraryAsync(options);
  } catch (e) {
    // Simulateur sans caméra, appareil photo occupé : on le dit au lieu de
    // laisser le bouton sans effet.
    const detail = (e as { message?: string })?.message ?? '';
    return {
      status: 'error',
      message: source === 'camera' ? "L'appareil photo n'est pas disponible." : detail || 'Galerie indisponible.',
    };
  }
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
    // Miniature : best effort, la photo part même si elle échoue.
    let thumbBase64: string | undefined;
    try {
      const small = ImageManipulator.manipulate(asset.uri);
      const portrait = (asset.height ?? 0) >= (asset.width ?? 0);
      small.resize(portrait ? { width: THUMB_EDGE } : { height: THUMB_EDGE });
      const t = await (await small.renderAsync()).saveAsync({
        format: SaveFormat.JPEG,
        compress: THUMB_QUALITY,
        base64: true,
      });
      thumbBase64 = t.base64 ?? undefined;
    } catch {
      thumbBase64 = undefined;
    }
    return { status: 'ok', base64: out.base64, thumbBase64 };
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
  if (res.status === 'camera_denied') {
    return "Autorise l'accès à l'appareil photo dans les réglages pour prendre une photo.";
  }
  return res.message;
}
