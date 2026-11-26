import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Backdrop } from "../components/Backdrop";
import { Coeur } from "../components/Coeur";
import { ProfileCard } from "../components/ProfileCard";

// Scène 2, ce que Zola montre en premier : l'intention. La carte arrive,
// la pastille d'intention se lit, le like part vers la droite.
export const Intentions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill name="Intentions">
      <Backdrop />

      <Interactive.Div
        name="Titre de scène"
        style={{
          position: "absolute",
          left: 180,
          top: 230,
          width: 720,
          fontSize: 84,
          fontWeight: 700,
          color: "#FFFFFF",
          lineHeight: 1.08,
          letterSpacing: -2,
          opacity: interpolate(frame, [0, 18], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [0, 24], ["0px 30px", "0px 0px"], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Des intentions claires
      </Interactive.Div>

      <Interactive.Div
        name="Carte suivante"
        style={{
          position: "absolute",
          left: 214,
          top: 466,
          width: 652,
          height: 964,
          borderRadius: 56,
          borderBottomRightRadius: 18,
          backgroundColor: "rgba(241, 203, 221, 0.16)",
          opacity: interpolate(frame, [10, 30], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />

      <Interactive.Div
        name="Carte de profil"
        style={{
          position: "absolute",
          left: 180,
          top: 430,
          width: 720,
          height: 960,
          opacity: interpolate(frame, [8, 26], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [3 * fps, 5 * fps], ["0px 0px", "900px -60px"], {
            easing: Easing.bezier(0.32, 0, 0.67, 0),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          rotate: interpolate(frame, [3 * fps, 5 * fps], ["0deg", "16deg"], {
            easing: Easing.bezier(0.32, 0, 0.67, 0),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <ProfileCard
          prenom="Grâce"
          age={26}
          ville="Kinshasa, Gombe"
          intention="Relation sérieuse"
          initiale="G"
          vignetteFrom="#6E2A63"
          vignetteTo="#9B3F7A"
        />
      </Interactive.Div>

      <Interactive.Div
        name="Bouton like"
        style={{
          position: "absolute",
          left: 460,
          top: 1470,
          width: 160,
          height: 160,
          borderRadius: 999,
          backgroundColor: "#9B3F7A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 20px 44px rgba(23, 18, 23, 0.5)",
          scale: interpolate(frame, [2.6 * fps, 3 * fps, 3.4 * fps], [1, 1.28, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          opacity: interpolate(frame, [20, 38], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <Coeur taille={80} couleur="#FFFFFF" />
      </Interactive.Div>
    </AbsoluteFill>
  );
};
