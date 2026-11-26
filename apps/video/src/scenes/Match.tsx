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

// Scène 3, le like réciproque ouvre la conversation. Les deux cartes se
// rejoignent, le coeur bat, les deux premières bulles arrivent.
export const Match: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill name="Match">
      <Backdrop />

      <Interactive.Div
        name="Carte gauche"
        style={{
          position: "absolute",
          left: 182,
          top: 400,
          width: 344,
          height: 464,
          rotate: interpolate(frame, [0, 1 * fps], ["-14deg", "-7deg"], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [0, 1 * fps], ["-180px 0px", "0px 0px"], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <ProfileCard
          prenom="Grâce"
          age={26}
          ville="Gombe"
          intention="Sérieuse"
          initiale="G"
          vignetteFrom="#6E2A63"
          vignetteTo="#9B3F7A"
          compact
        />
      </Interactive.Div>

      <Interactive.Div
        name="Carte droite"
        style={{
          position: "absolute",
          left: 548,
          top: 452,
          width: 344,
          height: 464,
          rotate: interpolate(frame, [0, 1 * fps], ["14deg", "7deg"], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [0, 1 * fps], ["180px 0px", "0px 0px"], {
            easing: Easing.spring({ damping: 200 }),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <ProfileCard
          prenom="Yannick"
          age={29}
          ville="Limete"
          intention="Sérieuse"
          initiale="Y"
          vignetteFrom="#481A46"
          vignetteTo="#6E2A63"
          compact
        />
      </Interactive.Div>

      <Interactive.Div
        name="Coeur du match"
        style={{
          position: "absolute",
          left: 470,
          top: 512,
          width: 140,
          height: 140,
          borderRadius: 999,
          backgroundColor: "#9B3F7A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 80px rgba(155, 63, 122, 0.9)",
          scale: interpolate(frame, [0.8 * fps, 1.2 * fps, 1.6 * fps], [0, 1.3, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <Coeur taille={72} couleur="#FFFFFF" />
      </Interactive.Div>

      <Interactive.Div
        name="Titre de scène"
        style={{
          position: "absolute",
          left: 180,
          top: 1000,
          width: 720,
          fontSize: 84,
          fontWeight: 700,
          color: "#FFFFFF",
          textAlign: "center",
          letterSpacing: -2,
          opacity: interpolate(frame, [1.2 * fps, 1.8 * fps], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [1.2 * fps, 1.8 * fps], [0.9, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        C'est un match
      </Interactive.Div>

      <Interactive.Div
        name="Bulle reçue"
        style={{
          position: "absolute",
          left: 180,
          top: 1190,
          maxWidth: 560,
          padding: "30px 40px",
          borderRadius: 40,
          borderBottomLeftRadius: 14,
          backgroundColor: "rgba(241, 203, 221, 0.16)",
          color: "#F6EDF3",
          fontSize: 42,
          fontWeight: 500,
          opacity: interpolate(frame, [2.2 * fps, 2.6 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [2.2 * fps, 2.7 * fps], ["0px 30px", "0px 0px"], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Salut, on se croise souvent au Grand Marché non ?
      </Interactive.Div>

      <Interactive.Div
        name="Bulle envoyée"
        style={{
          position: "absolute",
          left: 420,
          top: 1400,
          maxWidth: 480,
          padding: "30px 40px",
          borderRadius: 40,
          borderBottomRightRadius: 14,
          backgroundColor: "#9B3F7A",
          color: "#FFFFFF",
          fontSize: 42,
          fontWeight: 500,
          textAlign: "right",
          opacity: interpolate(frame, [3.1 * fps, 3.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [3.1 * fps, 3.6 * fps], ["0px 30px", "0px 0px"], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Tout le temps. Tu bois quoi, ce samedi ?
      </Interactive.Div>
    </AbsoluteFill>
  );
};
