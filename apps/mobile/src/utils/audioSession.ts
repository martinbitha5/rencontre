import { setAudioModeAsync, setIsAudioActiveAsync, type AudioMode } from 'expo-audio';

// Politique audio de l'app vis-à-vis des autres apps (Musique, Spotify,
// Boomplay...).
//
// Au repos, Zola ne dérange jamais la musique : la session est en
// « mixWithOthers », rien n'est activé. Une note vocale (lecture ou
// enregistrement) ou une vidéo avec son prend le focus le temps de jouer,
// ce qui met la musique en pause ; à la fin, le focus est rendu et iOS /
// Android reprennent la musique là où elle en était.
//
// Sans ce module, le premier lecteur venu prenait le focus exclusif dès le
// démarrage (vidéo d'accueil muette comprise) et ne le rendait jamais.

const REST: AudioMode = {
  playsInSilentMode: true,
  interruptionMode: 'mixWithOthers',
  allowsRecording: false,
  shouldPlayInBackground: false,
  allowsBackgroundRecording: false,
  shouldRouteThroughEarpiece: false,
};

// Nombre de lecteurs / enregistreurs qui tiennent le focus. Le focus n'est
// rendu que quand le dernier a fini : une note vocale qui se termine ne
// coupe pas une autre encore en cours.
let holders = 0;

async function apply(mode: AudioMode) {
  try {
    await setAudioModeAsync(mode);
  } catch {
    // web ou plateforme sans session audio : rien à configurer
  }
}

async function setActive(active: boolean) {
  try {
    await setIsAudioActiveAsync(active);
  } catch {
    // session déjà dans cet état, ou plateforme sans session audio
  }
}

// Les changements de session sont enchaînés les uns après les autres : un
// « rendre » encore en vol ne doit jamais désactiver l'audio après qu'un
// « prendre » plus récent l'a réactivé (cas d'une note relancée juste après
// la fin de la précédente).
let queue: Promise<void> = Promise.resolve();
function serial(task: () => Promise<void>): Promise<void> {
  const next = queue.then(task, task);
  queue = next.catch(() => {});
  return next;
}

// Au démarrage : posture de repos, aucune interruption.
export function restAudioSession(): Promise<void> {
  holders = 0;
  return serial(() => apply(REST));
}

// À appeler AVANT play() / record() : la catégorie de session doit être
// exclusive au moment où le natif active la session.
export function claimAudioFocus(opts: { recording?: boolean } = {}): Promise<void> {
  holders += 1;
  return serial(async () => {
    await apply({
      ...REST,
      interruptionMode: 'doNotMix',
      allowsRecording: !!opts.recording,
    });
    // setIsAudioActiveAsync(false) (voir releaseAudioFocus) coupe l'audio de
    // l'app côté natif : sur iOS, tout play() est ensuite ignoré en silence
    // tant qu'on ne réactive pas. Sans cette ligne, une note vocale ne se
    // lisait qu'une fois, le second appui ne donnait rien.
    await setActive(true);
  });
}

// À appeler quand la lecture / l'enregistrement s'arrête (fin, pause,
// démontage). Une fois le dernier détenteur parti, la session est désactivée
// en prévenant les autres apps (notifyOthersOnDeactivation sur iOS, abandon
// du focus sur Android), ce qui relance leur musique.
export function releaseAudioFocus(): Promise<void> {
  holders = Math.max(0, holders - 1);
  return serial(async () => {
    // Un nouveau détenteur a pu arriver pendant l'attente dans la file.
    if (holders > 0) return;
    await setActive(false);
    await apply(REST);
    // La désactivation coupe aussi le droit de lire (iOS et Android) : on le
    // rend aussitôt, le focus lui-même reste abandonné et la musique des
    // autres apps reprend.
    await setActive(true);
  });
}
