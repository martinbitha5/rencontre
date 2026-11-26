// Rendu d'une carte de match depuis Node, sans passer par la ligne de commande
// Remotion. C'est la brique que tout rail serveur réutilise : un worker, une
// tâche planifiée, ou un petit service HTTP appelé par une fonction Edge.
//
//   node scripts/rendre-carte-match.mjs '{"prenomA":"Grâce","prenomB":"Yannick","ville":"Kinshasa","date":"27 août 2026"}'
//
// Ce que ce script ne fait PAS, volontairement :
//   - il ne s'expose pas en HTTP : un point d'entrée public qui rend une vidéo
//     à la demande est une porte d'épuisement de ressources. Mettre une file
//     d'attente et une authentification devant avant de l'ouvrir.
//   - il ne téléverse rien vers Supabase Storage : le rail de stockage et ses
//     droits d'accès restent à décider (voir README, « Rendu serveur »).
//
// Attention au coût : `bundle()` recompile le projet à chaque appel. En
// production, compiler UNE fois au déploiement (`npx remotion bundle`) et
// pointer `serveUrl` sur le résultat.

import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.dirname(fileURLToPath(import.meta.url));
const projet = path.resolve(racine, "..");

const props = JSON.parse(process.argv[2] ?? "{}");
const sortie = process.argv[3] ?? path.join(projet, "out", "carte-match.mp4");

const serveUrl = await bundle({
  entryPoint: path.join(projet, "src", "index.ts"),
  onProgress: (p) => process.stdout.write(`\rCompilation ${p}%`),
});
process.stdout.write("\n");

const composition = await selectComposition({
  serveUrl,
  id: "CarteMatch",
  inputProps: props,
});

await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: sortie,
  inputProps: props,
  onProgress: ({ progress }) => process.stdout.write(`\rRendu ${Math.round(progress * 100)}%`),
});

process.stdout.write("\n");
console.log(sortie);
