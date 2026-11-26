import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Backdrop } from "../components/Backdrop";

// Motif décoratif : ce n'est pas un vrai QR code, seulement sa silhouette.
// Un code lisible pointerait vers une URL réelle, ce qu'une vidéo de teaser
// ne doit pas faire.
const MOTIF = [
  "111011101",
  "100010001",
  "101110101",
  "100000101",
  "111011111",
  "001010001",
  "110111011",
  "010001010",
  "111011101",
];

// Scène 4, les soirées. La seule passerelle de l'app vers le hors-ligne.
export const Soirees: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill name="Soirées">
      <Backdrop />

      <Interactive.Div
        name="Titre de scène"
        style={{
          position: "absolute",
          left: 180,
          top: 300,
          width: 720,
          fontSize: 84,
          fontWeight: 700,
          color: "#FFFFFF",
          textAlign: "center",
          letterSpacing: -2,
          opacity: interpolate(frame, [0, 18], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Les soirées
      </Interactive.Div>

      <Interactive.Div
        name="Carte QR"
        style={{
          position: "absolute",
          left: 270,
          top: 560,
          width: 540,
          height: 540,
          borderRadius: 56,
          borderBottomRightRadius: 18,
          backgroundColor: "#FAF7F9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxShadow: "0 40px 90px rgba(23, 18, 23, 0.6)",
          scale: interpolate(frame, [0, 1 * fps], [0.82, 1], {
            easing: Easing.spring({ damping: 200 }),
            output: "perceptual-scale",
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          opacity: interpolate(frame, [0, 14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(9, 40px)", gap: 8 }}>
          {MOTIF.flatMap((ligne, y) =>
            ligne.split("").map((cellule, x) => (
              <div
                key={`${y}-${x}`}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  backgroundColor: cellule === "1" ? "#481A46" : "transparent",
                }}
              />
            )),
          )}
        </div>
        <Interactive.Div
          name="Ligne de scan"
          style={{
            position: "absolute",
            left: 0,
            width: 540,
            height: 8,
            backgroundColor: "#9B3F7A",
            boxShadow: "0 0 40px rgba(155, 63, 122, 0.9)",
            top: interpolate(frame, [0.6 * fps, 2.4 * fps], [40, 500], {
              easing: Easing.bezier(0.65, 0, 0.35, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [0.6 * fps, 0.9 * fps, 2.2 * fps, 2.5 * fps], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
      </Interactive.Div>

      <Interactive.Div
        name="Légende"
        style={{
          position: "absolute",
          left: 180,
          top: 1200,
          width: 720,
          fontSize: 48,
          fontWeight: 500,
          color: "#F6EDF3",
          textAlign: "center",
          lineHeight: 1.3,
          opacity: interpolate(frame, [1.6 * fps, 2.2 * fps], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [1.6 * fps, 2.2 * fps], ["0px 30px", "0px 0px"], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Scanne le code à l'entrée d'une soirée partenaire et découvre qui est sur place.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
