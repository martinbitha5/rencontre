import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { EcranDiscussion } from "../components/EcranDiscussion";
import { Fond } from "../components/Fond";
import { Icone } from "../components/Icones";
import { MotsAnimes } from "../components/MotsAnimes";
import { Portrait } from "../components/Portrait";
import { Telephone } from "../components/Telephone";

// Scène 5, le match puis la conversation. Dans l'écran du téléphone : les
// deux avatars se rejoignent, le coeur bat, puis l'écran de match se retire
// et la discussion démarre, avec une note vocale pour finir.
const FIN_MATCH = 46;

export const Conversation: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Conversation">
      <Fond chaleur={0.5} />

      <Interactive.Div name="Titre" style={{ position: "absolute", left: 100, top: 210, width: 880 }}>
        <MotsAnimes texte="Le match. Puis la vraie discussion." depart={0} taille={88} couleur="#FFFFFF" />
      </Interactive.Div>

      <div style={{ position: "absolute", left: 266, top: 470, perspective: 2000 }}>
        <Interactive.Div
          name="Téléphone"
          style={{
            rotate: `y ${interpolate(frame, [0, 45], [24, 6], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}deg`,
            translate: interpolate(frame, [0, 45], ["0px 220px", "0px 0px"], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [0, 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Telephone>
            <EcranDiscussion prenom="Grâce" photo="personnes/grace.jpg" recuA={FIN_MATCH + 8} saisieA={FIN_MATCH + 30} envoyeA={FIN_MATCH + 54} vocalA={FIN_MATCH + 82} />

            <AbsoluteFill
              style={{
                backgroundImage: "linear-gradient(180deg, #2F1130 0%, #6E2A63 100%)",
                alignItems: "center",
                justifyContent: "center",
                opacity: interpolate(frame, [FIN_MATCH - 8, FIN_MATCH + 4], [1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
              }}
            >
              <div style={{ position: "relative", width: 400, height: 220, marginBottom: 40 }}>
                <Portrait
                  photo="personnes/grace.jpg"
                  taille={220}
                  ancre="55% 30%"
                  zoom={1.9}
                  bordure="8px solid #FAF7F9"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    boxShadow: "0 20px 40px rgba(23, 18, 23, 0.4)",
                    translate: interpolate(frame, [4, 30], ["-260px 0px", "0px 0px"], {
                      easing: Easing.bezier(0.16, 1, 0.3, 1),
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                />
                <Portrait
                  photo="personnes/yannick.jpg"
                  taille={220}
                  ancre="50% 30%"
                  zoom={1.4}
                  bordure="8px solid #FAF7F9"
                  style={{
                    position: "absolute",
                    left: 180,
                    top: 0,
                    boxShadow: "0 20px 40px rgba(23, 18, 23, 0.4)",
                    translate: interpolate(frame, [4, 30], ["260px 0px", "0px 0px"], {
                      easing: Easing.bezier(0.16, 1, 0.3, 1),
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 145,
                    top: 60,
                    width: 110,
                    height: 110,
                    borderRadius: 999,
                    backgroundColor: "#9B3F7A",
                    boxShadow: "0 0 60px rgba(155, 63, 122, 0.95)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    scale: interpolate(frame, [22, 34, 44], [0, 1.35, 1], {
                      easing: Easing.bezier(0.16, 1, 0.3, 1),
                      output: "perceptual-scale",
                      extrapolateLeft: "clamp",
                      extrapolateRight: "clamp",
                    }),
                  }}
                >
                  <Icone nom="coeur" taille={56} couleur="#FFFFFF" plein epaisseur={0} />
                </div>
              </div>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 800,
                  color: "#FFFFFF",
                  letterSpacing: -1.5,
                  opacity: interpolate(frame, [26, 38], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                  translate: interpolate(frame, [26, 40], ["0px 20px", "0px 0px"], {
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                C'est un match
              </div>
            </AbsoluteFill>
          </Telephone>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Légende"
        style={{
          position: "absolute",
          left: 120,
          top: 1690,
          width: 840,
          textAlign: "center",
          fontSize: 42,
          fontWeight: 500,
          color: "#EDBBD7",
          opacity: interpolate(frame, [110, 126], [0, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        Messages, notes vocales, photos.
      </Interactive.Div>
    </AbsoluteFill>
  );
};
