import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Fond } from "../components/Fond";
import { Icone } from "../components/Icones";
import { MotsAnimes } from "../components/MotsAnimes";
import { Portrait } from "../components/Portrait";

// Scène 6, la confiance. Le badge bleu de vérification se pose sur un profil,
// puis trois garanties réelles de l'app : vérification par selfie, équipe de
// modération, signalement et blocage. Rien qui n'existe pas dans le produit.
const BADGE_A = 30;

const GARANTIES: { icone: "badge" | "bouclier" | "drapeau"; texte: string; depart: number }[] = [
  { icone: "badge", texte: "Profils vérifiés par selfie", depart: 46 },
  { icone: "bouclier", texte: "Une équipe de modération", depart: 58 },
  { icone: "drapeau", texte: "Signaler et bloquer en un geste", depart: 70 },
];

export const Confiance: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Confiance">
      <Fond chaleur={0.25} />

      <Interactive.Div name="Titre" style={{ position: "absolute", left: 100, top: 210, width: 880 }}>
        <MotsAnimes texte="Des vraies personnes." depart={0} taille={92} couleur="#FFFFFF" />
      </Interactive.Div>

      <div style={{ position: "absolute", left: 370, top: 500, width: 340, height: 340 }}>
        <Portrait
          photo="personnes/grace.jpg"
          taille={340}
          ancre="55% 30%"
          zoom={1.9}
          bordure="10px solid rgba(250, 247, 249, 0.9)"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            boxShadow: "0 40px 90px rgba(23, 18, 23, 0.5)",
            scale: interpolate(frame, [4, 34], [0.7, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [4, 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
        <Interactive.Div
          name="Onde"
          style={{
            position: "absolute",
            left: 230,
            top: 230,
            width: 130,
            height: 130,
            borderRadius: 999,
            border: "6px solid #1D9BF0",
            scale: interpolate(frame, [BADGE_A + 4, BADGE_A + 34], [0.8, 2.4], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [BADGE_A + 4, BADGE_A + 34], [0.9, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
        <Interactive.Div
          name="Badge vérifié"
          style={{
            position: "absolute",
            left: 230,
            top: 230,
            width: 130,
            height: 130,
            borderRadius: 999,
            backgroundColor: "#FAF7F9",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 20px 40px rgba(23, 18, 23, 0.45)",
            scale: interpolate(frame, [BADGE_A, BADGE_A + 22], [0, 1], {
              easing: Easing.spring({ damping: 12, stiffness: 160 }),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Icone nom="badge" taille={90} couleur="#1D9BF0" epaisseur={2.2} />
        </Interactive.Div>
      </div>

      <div style={{ position: "absolute", left: 130, top: 1010, width: 820, display: "flex", flexDirection: "column", gap: 28 }}>
        {GARANTIES.map((g) => (
          <Interactive.Div
            key={g.texte}
            name={`Garantie ${g.texte}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 30,
              padding: "26px 34px",
              borderRadius: 40,
              borderBottomRightRadius: 14,
              backgroundColor: "rgba(241, 203, 221, 0.12)",
              border: "1px solid rgba(241, 203, 221, 0.18)",
              opacity: interpolate(frame, [g.depart, g.depart + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(frame, [g.depart, g.depart + 20], ["0px 40px", "0px 0px"], {
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <div
              style={{
                width: 90,
                height: 90,
                borderRadius: 999,
                backgroundColor: "#F1CBDD",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icone nom={g.icone} taille={44} couleur="#481A46" epaisseur={2.2} />
            </div>
            <div style={{ fontSize: 44, fontWeight: 600, color: "#F6EDF3", letterSpacing: -0.5 }}>{g.texte}</div>
          </Interactive.Div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
