// Rend les visuels de la fiche Play Store dans <racine>/play-store/.
//   node scripts/rendre-play-store.mjs
// Un seul bundle, puis une image fixe par composition du dossier PlayStore.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ici = path.dirname(fileURLToPath(import.meta.url));
const racine = path.resolve(ici, "..", "..", "..");
const sortie = path.join(racine, "play-store");

const seul = process.argv[2]; // ex. « Pliable » pour ne rendre que ceux-là
const toutes = [
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `PlayStore-${i + 1}`,
    fichier: path.join(sortie, "2-captures-telephone", `capture-${i + 1}.png`),
  })),
  { id: "PlayStore-VisuelPrincipal", fichier: path.join(sortie, "1-visuel-principal", "visuel-principal-1024x500.png") },
  ...[
    "1-deplie-1x1",
    "2-deplie-4x3",
    "3-externe-10x16",
    "4-deplie-4x3",
    "5-deplie-1x1",
    "6-externe-10x16",
  ].map((nom, i) => ({
    id: `PlayStore-Pliable-${i + 1}`,
    fichier: path.join(sortie, "4-captures-pliables", `pliable-${nom}.png`),
  })),
  { id: "PlayStore-Icone", fichier: path.join(sortie, "0-icone", "icone-512.png") },
];

const cibles = seul ? toutes.filter((c) => c.id.includes(seul)) : toutes;

const serveUrl = await bundle({ entryPoint: path.join(ici, "..", "src", "index.ts") });
for (const c of cibles) {
  mkdirSync(path.dirname(c.fichier), { recursive: true });
  const composition = await selectComposition({ serveUrl, id: c.id });
  await renderStill({ composition, serveUrl, output: c.fichier, imageFormat: "png", overwrite: true });
  console.log("ok", path.relative(racine, c.fichier));
}
