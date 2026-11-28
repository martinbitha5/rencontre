import { Directory, File, Paths } from 'expo-file-system';
import { voiceUrl } from '@/services/api';

// Cache des notes vocales sur le téléphone.
//
// Avant, une note ne se téléchargeait qu'à l'appui sur « lire » : le lecteur
// partait chercher le fichier sur le serveur puis attendait d'en avoir assez
// pour démarrer, d'où une à plusieurs secondes de silence (plus encore sur
// une connexion lente). Une note pèse environ 240 Ko par minute : on la
// télécharge dès que sa bulle s'affiche, en tâche de fond, et l'appui sur
// « lire » joue le fichier local, tout de suite. Les fichiers d'un message
// ne changent jamais (nom unique) : une fois en cache, ils y restent, et le
// système vide le dossier cache s'il manque de place.

const ready = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function isLocal(path: string): boolean {
  return path.startsWith('file:') || path.startsWith('/');
}

function cacheFile(path: string): File {
  const dir = new Directory(Paths.cache, 'voice');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return new File(dir, path.replace(/#d\d+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_'));
}

// L'adresse à lire tout de suite : le fichier local s'il est déjà là, sinon
// celle du serveur (le lecteur la lira en flux).
export function voicePlayUri(path: string): string {
  if (isLocal(path)) return voiceUrl(path);
  return ready.get(path) ?? voiceUrl(path);
}

// Télécharge la note en tâche de fond. Sans effet si elle est déjà en cache
// ou en cours. Ne lève jamais : en cas d'échec, la lecture passera en flux.
export function prefetchVoice(path: string): Promise<string | null> {
  if (isLocal(path)) return Promise.resolve(voiceUrl(path));
  const done = ready.get(path);
  if (done) return Promise.resolve(done);
  const running = pending.get(path);
  if (running) return running;

  const job = (async () => {
    try {
      const file = cacheFile(path);
      if (!file.exists || file.size === 0) {
        await File.downloadFileAsync(voiceUrl(path), file, { idempotent: true });
      }
      ready.set(path, file.uri);
      return file.uri;
    } catch {
      return null;
    } finally {
      pending.delete(path);
    }
  })();
  pending.set(path, job);
  return job;
}
