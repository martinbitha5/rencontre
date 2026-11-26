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
import { Backdrop } from "../components/Backdrop";

// Scène 1, l'ouverture. Le logo se pose, la promesse arrive.
// Tout le contenu reste entre x=180 et x=900 : c'est la zone qui survit au
// recadrage 886x1920 de l'App Store (voir ApercuAppStore.tsx).
export const Ouverture: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill name="Ouverture">
      <Backdrop />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          padding: 180,
        }}
      >
        <Img
          name="Logo Zola"
          src={staticFile("zola-icon.png")}
          style={{
            width: 260,
            height: 260,
            borderRadius: 68,
            scale: interpolate(frame, [0, 1 * fps], [0.6, 1], {
              easing: Easing.spring({ damping: 200 }),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [0, 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
        <Interactive.Div
          name="Titre"
          style={{
            fontSize: 92,
            fontWeight: 700,
            color: "#FFFFFF",
            textAlign: "center",
            lineHeight: 1.1,
            letterSpacing: -2,
            opacity: interpolate(frame, [12, 32], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [12, 40], ["0px 40px", "0px 0px"], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          La même ville, la même envie.
        </Interactive.Div>
        <Interactive.Div
          name="Sous-titre"
          style={{
            fontSize: 44,
            fontWeight: 500,
            color: "#EDBBD7",
            textAlign: "center",
            opacity: interpolate(frame, [28, 48], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Rencontres en RDC
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
