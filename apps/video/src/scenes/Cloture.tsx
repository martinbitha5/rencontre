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

// Scène 5, la clôture.
//
// `appel` porte la seule différence entre les deux montages : la bande-annonce
// réseaux se termine par un appel à télécharger, l'aperçu App Store non.
// Apple demande qu'un app preview montre l'app en usage, sans incitation au
// téléchargement ni mention de prix (App Preview Guidelines), d'où le
// commutateur plutôt qu'une seconde scène recopiée.
type Props = {
  appel: boolean;
};

export const Cloture: React.FC<Props> = ({ appel }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill name="Clôture">
      <Backdrop />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
          padding: 180,
        }}
      >
        <Img
          name="Logo Zola"
          src={staticFile("zola-icon.png")}
          style={{
            width: 240,
            height: 240,
            borderRadius: 62,
            scale: interpolate(frame, [0, 1 * fps], [0.72, 1], {
              easing: Easing.spring({ damping: 200 }),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [0, 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
        <Interactive.Div
          name="Promesse"
          style={{
            fontSize: 84,
            fontWeight: 700,
            color: "#FFFFFF",
            textAlign: "center",
            lineHeight: 1.12,
            letterSpacing: -2,
            opacity: interpolate(frame, [14, 34], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [14, 40], ["0px 36px", "0px 0px"], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Rencontre des Congolais de ta ville.
        </Interactive.Div>
        {appel ? (
          <Interactive.Div
            name="Appel"
            style={{
              fontSize: 46,
              fontWeight: 600,
              color: "#481A46",
              backgroundColor: "#F1CBDD",
              padding: "28px 56px",
              borderRadius: 999,
              textAlign: "center",
              opacity: interpolate(frame, [1.4 * fps, 2 * fps], [0, 1], {
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              scale: interpolate(frame, [1.4 * fps, 2 * fps], [0.9, 1], {
                easing: Easing.spring({ damping: 200 }),
                output: "perceptual-scale",
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            Bientôt sur l'App Store et Google Play
          </Interactive.Div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
