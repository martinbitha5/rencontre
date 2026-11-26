import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { Fond } from "../components/Fond";
import { Icone } from "../components/Icones";
import { MotsAnimes } from "../components/MotsAnimes";

// Scène 7, les soirées : la passerelle de l'app vers le hors-ligne. Un
// billet, un motif qui ressemble à un QR code sans en être un (il n'encode
// rien, une vidéo publique ne doit pas pointer vers une URL réelle), un
// viseur qui se referme et une ligne de lecture.
const MOTIF = [
  "1111111010111",
  "1000001001101",
  "1011101110101",
  "1011101011001",
  "1011101100101",
  "1000001010001",
  "1111111010111",
  "0000000110000",
  "1101011001110",
  "0110100111001",
  "1011110010110",
  "0001001101011",
  "1110110110101",
];

export const Soirees: React.FC = () => {
  const frame = useCurrentFrame();
  const ecart = interpolate(frame, [6, 40], [110, 0], {
    easing: Easing.bezier(0.16, 1, 0.3, 1),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill name="Soirées">
      <Fond chaleur={0.45} />

      <Interactive.Div name="Titre" style={{ position: "absolute", left: 100, top: 210, width: 880 }}>
        <MotsAnimes texte="Scanne. Entre. Rencontre." depart={0} decalage={9} taille={92} couleur="#FFFFFF" />
      </Interactive.Div>

      <div style={{ position: "absolute", left: 250, top: 560, width: 580, height: 580 }}>
        <Interactive.Div
          name="Billet"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 60,
            borderBottomRightRadius: 20,
            backgroundColor: "#FAF7F9",
            boxShadow: "0 50px 110px rgba(23, 18, 23, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            scale: interpolate(frame, [0, 34], [0.8, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [0, 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(13, 30px)", gap: 4 }}>
            {MOTIF.flatMap((ligne, y) =>
              ligne.split("").map((c, x) => (
                <div
                  key={`${y}-${x}`}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 6,
                    backgroundColor: c === "1" ? "#481A46" : "transparent",
                  }}
                />
              )),
            )}
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 10,
              backgroundColor: "#9B3F7A",
              boxShadow: "0 0 50px rgba(155, 63, 122, 1), 0 0 14px rgba(155, 63, 122, 1)",
              top: interpolate(frame, [30, 74], [40, 540], {
                easing: Easing.bezier(0.65, 0, 0.35, 1),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              opacity: interpolate(frame, [30, 36, 70, 76], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />
        </Interactive.Div>

        {[
          { left: -ecart, top: -ecart, rotate: "0deg" },
          { left: 470 + ecart, top: -ecart, rotate: "90deg" },
          { left: 470 + ecart, top: 470 + ecart, rotate: "180deg" },
          { left: -ecart, top: 470 + ecart, rotate: "270deg" },
        ].map((c, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: c.left - 30,
              top: c.top - 30,
              width: 170,
              height: 170,
              borderTop: "12px solid #F1CBDD",
              borderLeft: "12px solid #F1CBDD",
              borderTopLeftRadius: 50,
              rotate: c.rotate,
              transformOrigin: "85px 85px",
              opacity: interpolate(frame, [4, 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          />
        ))}

        <Interactive.Div
          name="Entrée validée"
          style={{
            position: "absolute",
            left: 90,
            top: 620,
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "22px 38px",
            borderRadius: 999,
            backgroundColor: "#2C8A57",
            color: "#FFFFFF",
            fontSize: 40,
            fontWeight: 700,
            boxShadow: "0 20px 50px rgba(44, 138, 87, 0.45)",
            scale: interpolate(frame, [76, 96], [0.5, 1], {
              easing: Easing.spring({ damping: 13, stiffness: 150 }),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [76, 82], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Icone nom="coche" taille={40} couleur="#FFFFFF" epaisseur={3} />
          Entrée validée
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Légende"
        style={{
          position: "absolute",
          left: 120,
          top: 1400,
          width: 840,
          textAlign: "center",
          fontSize: 44,
          fontWeight: 500,
          lineHeight: 1.3,
          color: "#EDBBD7",
          opacity: interpolate(frame, [40, 58], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [40, 60], ["0px 30px", "0px 0px"], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Des soirées partenaires où tu découvres qui est sur place.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
