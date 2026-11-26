import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Empreinte } from "../components/Empreinte";
import { Fond } from "../components/Fond";

// Scène 2, la marque. L'empreinte se dessine ligne à ligne comme au
// démarrage de l'app (IntroSplash), la tuile magenta de l'icône apparaît
// dans un éclat, puis le nom et la signature.
const DEPART_DESSIN = 2;
const ECLAT = 44;

export const Marque: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Marque">
      <Fond chaleur={0.6} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 0 }}>
        <div style={{ position: "relative", width: 340, height: 340, marginBottom: 54 }}>
          <Interactive.Div
            name="Éclat"
            style={{
              position: "absolute",
              left: -230,
              top: -230,
              width: 800,
              height: 800,
              borderRadius: 999,
              backgroundImage: "radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(241, 203, 221, 0.5) 22%, rgba(241, 203, 221, 0) 60%)",
              scale: interpolate(frame, [ECLAT, ECLAT + 22], [0.2, 1.6], {
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                output: "perceptual-scale",
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              opacity: interpolate(frame, [ECLAT, ECLAT + 4, ECLAT + 24], [0, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />
          <Interactive.Div
            name="Tuile"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 88,
              backgroundImage: "linear-gradient(160deg, #E0428A 0%, #B8306E 55%, #9B2C6A 100%)",
              boxShadow: "0 40px 90px rgba(155, 63, 122, 0.55)",
              opacity: interpolate(frame, [ECLAT + 2, ECLAT + 10], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              scale: interpolate(frame, [ECLAT + 2, ECLAT + 24], [0.86, 1], {
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                output: "perceptual-scale",
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Empreinte taille={210} couleur="#FFFFFF" epaisseur={2.1} depart={DEPART_DESSIN} />
          </div>
        </div>

        <Interactive.Div
          name="Nom"
          style={{
            fontSize: 168,
            fontWeight: 800,
            color: "#FFFFFF",
            letterSpacing: -9,
            lineHeight: 1,
            opacity: interpolate(frame, [ECLAT + 8, ECLAT + 26], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [ECLAT + 8, ECLAT + 30], ["0px 50px", "0px 0px"], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Zola
        </Interactive.Div>
        <Interactive.Div
          name="Signature"
          style={{
            marginTop: 22,
            fontSize: 46,
            fontWeight: 500,
            color: "#EDBBD7",
            letterSpacing: -0.5,
            opacity: interpolate(frame, [ECLAT + 22, ECLAT + 40], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [ECLAT + 22, ECLAT + 42], ["0px 30px", "0px 0px"], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          La même ville, la même envie.
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
