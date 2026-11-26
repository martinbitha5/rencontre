import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Fond } from "../components/Fond";
import { MotsAnimes } from "../components/MotsAnimes";

// Scène 1, l'accroche. Trois lignes, mot à mot, sans image : la promesse
// avant la marque. Le bloc grandit imperceptiblement pendant toute la scène
// pour que l'image ne soit jamais figée.
export const Accroche: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Accroche">
      <Fond chaleur={0.2} />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          padding: "0 90px",
          scale: interpolate(frame, [0, 105], [1, 1.05], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <Interactive.Div name="Ligne 1" style={{ marginBottom: 10 }}>
          <MotsAnimes texte="Dans ta ville," depart={4} taille={94} couleur="#FFFFFF" />
        </Interactive.Div>
        <Interactive.Div name="Ligne 2" style={{ marginBottom: 10 }}>
          <MotsAnimes texte="quelqu'un cherche" depart={26} taille={94} couleur="#EDBBD7" />
        </Interactive.Div>
        <Interactive.Div name="Ligne 3" style={{ marginBottom: 10 }}>
          <MotsAnimes texte="la même chose" depart={48} taille={94} couleur="#FFFFFF" />
        </Interactive.Div>
        <Interactive.Div name="Ligne 4">
          <MotsAnimes texte="que toi." depart={62} taille={94} couleur="#FFFFFF" />
        </Interactive.Div>
        <Interactive.Div
          name="Trait"
          style={{
            marginTop: 56,
            height: 6,
            borderRadius: 999,
            backgroundColor: "#9B3F7A",
            boxShadow: "0 0 30px rgba(155, 63, 122, 0.9)",
            width: interpolate(frame, [78, 100], [0, 220], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
