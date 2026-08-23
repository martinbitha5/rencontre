import { Image } from 'expo-image';
import { photoUrl } from '@/services/api';

// Préchargement des photos de profil : dès qu'une liste arrive du réseau, ses
// images partent en cache disque avant même d'être affichées. Ouvrir l'écran
// suivant montre alors des photos déjà là, sans apparition progressive.
//
// expo-image déduplique les téléchargements et n'y retouche pas si l'image est
// déjà en cache : appeler large ne coûte presque rien.
export function prefetchPhotos(paths: Array<string | null | undefined>): void {
  const urls = [...new Set(paths.filter((p): p is string => !!p))].map(photoUrl);
  if (urls.length) Image.prefetch(urls).catch(() => {});
}
