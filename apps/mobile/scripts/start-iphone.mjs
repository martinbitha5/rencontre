// Lance l'app pour Expo Go sur un téléphone du même Wi-Fi, sans compte Expo
// côté ordinateur.
//
// - `--go` : expo-dev-client est installé, sans ce drapeau le QR code ouvrirait
//   une « development build » au lieu d'Expo Go.
// - EXPO_OFFLINE est retiré pour ce lancement : s'il vaut 1 (variable posée
//   dans Windows), Expo ne peut pas lire la liste des champs « asset » de la
//   config, l'icône n'est pas résolue et Metro journalise des erreurs
//   « scandir .../images ». Sans compte, Expo sert de toute façon un projet
//   anonyme : aucune connexion n'est demandée.
import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env.EXPO_OFFLINE;

// Une seule ligne de commande : sous Windows, npx est un script .cmd qui
// demande un shell, et Node refuse désormais de concaténer des arguments
// séparés dans ce cas.
const extra = process.argv.slice(2).filter((a) => /^[\w=:.\/-]+$/.test(a)).join(' ');
const child = spawn(`npx expo start --go ${extra}`.trim(), { stdio: 'inherit', env, shell: true });
child.on('exit', (code) => process.exit(code ?? 0));
