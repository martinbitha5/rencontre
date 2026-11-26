import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Fond } from "../components/Fond";
import { Icone } from "../components/Icones";
import { MotsAnimes } from "../components/MotsAnimes";

// Scène 4, la ville. Zola met en relation par ville déclarée, pas par GPS :
// une roue de villes congolaises défile et s'arrête sur Kinshasa. Les noms
// sont ceux de la table `cities` de l'app.
const VILLES = [
  "Boma",
  "Matadi",
  "Uvira",
  "Likasi",
  "Kolwezi",
  "Bukavu",
  "Goma",
  "Kinshasa",
  "Lubumbashi",
  "Kisangani",
  "Kananga",
  "Mbuji-Mayi",
];
const PAS = 140;
const CENTRE = 1000;
const ARRIVEE = 7;

export const Ville: React.FC = () => {
  const frame = useCurrentFrame();
  const defilement = interpolate(frame, [8, 88], [0, ARRIVEE * PAS], {
    easing: Easing.bezier(0.2, 0.9, 0.2, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill name="Ville">
      <Fond chaleur={0.3} />

      <Interactive.Div name="Titre" style={{ position: "absolute", left: 100, top: 210, width: 880 }}>
        <MotsAnimes texte="Ta ville, pas le monde entier." depart={0} taille={88} couleur="#FFFFFF" />
      </Interactive.Div>

      <Interactive.Div
        name="Bande active"
        style={{
          position: "absolute",
          left: 150,
          top: CENTRE - 84,
          width: 780,
          height: 168,
          borderRadius: 999,
          borderBottomRightRadius: 28,
          backgroundColor: "#F1CBDD",
          boxShadow: "0 30px 80px rgba(23, 18, 23, 0.5)",
          opacity: interpolate(frame, [4, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [4, 30], [0.9, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />

      <AbsoluteFill
        style={{
          maskImage: "linear-gradient(180deg, transparent 22%, black 38%, black 64%, transparent 76%)",
        }}
      >
        {VILLES.map((ville, i) => {
          const y = CENTRE + i * PAS - defilement;
          const distance = Math.abs(y - CENTRE) / PAS;
          const active = distance < 0.5;
          return (
            <div
              key={ville}
              style={{
                position: "absolute",
                left: 150,
                width: 780,
                top: y - 84,
                height: 168,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 22,
                fontSize: active ? 78 : 64,
                fontWeight: active ? 800 : 600,
                letterSpacing: -2,
                color: active ? "#481A46" : "#F6EDF3",
                opacity: active ? 1 : Math.max(0.16, 0.7 - distance * 0.22),
                scale: active ? 1 : 0.92,
              }}
            >
              {active ? <Icone nom="epingle" taille={56} couleur="#9B3F7A" epaisseur={2.4} /> : null}
              {ville}
            </div>
          );
        })}
      </AbsoluteFill>

      <Interactive.Div
        name="Légende"
        style={{
          position: "absolute",
          left: 120,
          top: 1540,
          width: 840,
          textAlign: "center",
          fontSize: 44,
          fontWeight: 500,
          lineHeight: 1.3,
          color: "#EDBBD7",
          opacity: interpolate(frame, [70, 88], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [70, 90], ["0px 30px", "0px 0px"], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        26 villes de RDC. Des profils qui habitent vraiment près de chez toi.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
