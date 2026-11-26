import {
  AbsoluteFill,
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { Backdrop } from "./components/Backdrop";
import { Coeur } from "./components/Coeur";
import { fontFamily } from "./police";

// Vidéo paramétrée, destinée au rendu serveur : une carte de match que
// l'utilisateur peut partager. Les valeurs arrivent en props, jamais en dur.
//
// Rendu depuis la ligne de commande :
//   npx remotion render CarteMatch out/carte.mp4 \
//     --props='{"prenomA":"Grâce","prenomB":"Yannick","ville":"Kinshasa","date":"27 août 2026"}'
//
// Rendu depuis Node (fonction Edge, worker, tâche planifiée) : voir
// scripts/rendre-carte-match.mjs et la section « Rendu serveur » du README.
//
// Prénoms : ce sont des données personnelles. Ne jamais les journaliser côté
// serveur ni les inclure dans un nom de fichier public devinable.
export const carteMatchSchema = z.object({
  prenomA: z.string(),
  prenomB: z.string(),
  ville: z.string(),
  date: z.string(),
});

export const CarteMatch: React.FC<z.infer<typeof carteMatchSchema>> = ({
  prenomA,
  prenomB,
  ville,
  date,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill name="Carte de match" style={{ fontFamily }}>
      <Backdrop />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 180, gap: 40 }}>
        <Interactive.Div
          name="Sur-titre"
          style={{
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: 6,
            color: "#EDBBD7",
            textTransform: "uppercase",
            opacity: interpolate(frame, [0, 20], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          C'est un match
        </Interactive.Div>

        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: 999,
              backgroundImage: "linear-gradient(150deg, #6E2A63 0%, #9B3F7A 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 120,
              fontWeight: 700,
              color: "#FFFFFF",
              border: "6px solid rgba(241, 203, 221, 0.5)",
            }}
          >
            {prenomA.slice(0, 1).toUpperCase()}
          </div>
          <Interactive.Div
            name="Coeur"
            style={{
              display: "flex",
              scale: interpolate(frame, [0.6 * fps, 1 * fps, 1.4 * fps], [0, 1.35, 1], {
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                output: "perceptual-scale",
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <Coeur taille={96} couleur="#F1CBDD" />
          </Interactive.Div>
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: 999,
              backgroundImage: "linear-gradient(150deg, #481A46 0%, #6E2A63 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 120,
              fontWeight: 700,
              color: "#FFFFFF",
              border: "6px solid rgba(241, 203, 221, 0.5)",
            }}
          >
            {prenomB.slice(0, 1).toUpperCase()}
          </div>
        </div>

        <div
          style={{
            fontSize: 88,
            fontWeight: 700,
            color: "#FFFFFF",
            textAlign: "center",
            lineHeight: 1.15,
            letterSpacing: -2,
          }}
        >
          {prenomA} et {prenomB}
        </div>

        <div style={{ fontSize: 46, fontWeight: 500, color: "rgba(246, 237, 243, 0.86)" }}>
          {ville} · {date}
        </div>

        <Img
          name="Logo Zola"
          src={staticFile("zola-icon.png")}
          style={{
            width: 120,
            height: 120,
            borderRadius: 34,
            marginTop: 40,
            opacity: interpolate(frame, [1.6 * fps, 2.2 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
