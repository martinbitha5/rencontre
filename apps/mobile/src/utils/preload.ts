import { Image } from 'expo-image';
import { photoUrl } from '@/services/api';
import { isSavingData } from '@/utils/dataSaver';

// Préchargement des photos de profil : dès qu'une liste arrive du réseau, ses
// images partent en cache disque avant même d'être affichées. Ouvrir l'écran
// suivant montre alors des photos déjà là, sans apparition progressive.
//
// Par défaut on précharge les MINIATURES : les listes (likes, discussions,
// profil) n'affichent que des vignettes. En économie de données, seules les
// premières de la liste partent, celles qui seront vues à coup sûr.
//
// expo-image déduplique les téléchargements et n'y retouche pas si l'image est
// déjà en cache.
const SAVER_MAX = 8;

export function prefetchPhotos(
  paths: (string | null | undefined)[],
  variant: 'thumb' | 'full' = 'thumb',
): void {
  let list = [...new Set(paths.filter((p): p is string => !!p))];
  if (isSavingData()) list = list.slice(0, SAVER_MAX);
  const urls = list.map((p) => photoUrl(p, variant));
  if (urls.length) Image.prefetch(urls).catch(() => {});
}
