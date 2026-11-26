import { isRunningInExpoGo } from 'expo';

// Vrai dans l'app Expo Go (tests sur téléphone), faux dans une vraie build.
// Avant, on testait Constants.executionEnvironment === 'storeClient' : ce
// test ne détecte plus Expo Go avec le SDK 58, si bien que les fonctions
// réservées aux vraies builds (fondu de l'écran de démarrage, notifications
// push) s'y exécutaient quand même et remplissaient le terminal
// d'avertissements. isRunningInExpoGo() est la détection officielle d'Expo.
export const IS_EXPO_GO = isRunningInExpoGo();
