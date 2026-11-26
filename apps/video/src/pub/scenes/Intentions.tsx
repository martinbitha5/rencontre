import { AbsoluteFill, Easing, Interactive, interpolate, useCurrentFrame } from "remotion";
import { EcranRencontres } from "../components/EcranRencontres";
import { Fond } from "../components/Fond";
import { MotsAnimes } from "../components/MotsAnimes";
import { Telephone } from "../components/Telephone";

// Scène 3, ce que Zola montre en premier : l'intention. Le téléphone arrive
// en trois quarts et se redresse, les quatre intentions de l'app flottent
// autour de lui, puis le like part et la carte suivante prend la place.
const LIKE_A = 96;

const ETIQUETTES = [
  { texte: "Relation sérieuse", left: 40, top: 640, angle: "-7deg", depart: 34 },
  { texte: "Mariage", left: 720, top: 800, angle: "6deg", depart: 48 },
  { texte: "Amitié", left: 60, top: 1240, angle: "5deg", depart: 62 },
  { texte: "Rien de sérieux", left: 600, top: 1500, angle: "-6deg", depart: 76 },
];

export const Intentions: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Intentions">
      <Fond chaleur={0.4} />

      <Interactive.Div name="Titre" style={{ position: "absolute", left: 100, top: 210, width: 880 }}>
        <MotsAnimes texte="Chacun dit ce qu'il cherche." depart={0} taille={88} couleur="#FFFFFF" />
      </Interactive.Div>

      <div style={{ position: "absolute", left: 266, top: 470, perspective: 2000 }}>
        <Interactive.Div
          name="Téléphone"
          style={{
            rotate: `y ${interpolate(frame, [0, 45], [-28, -7], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}deg`,
            translate: interpolate(frame, [0, 45], ["0px 260px", "0px 0px"], {
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
            <EcranRencontres
              profil={{
                prenom: "Grâce",
                age: 26,
                ville: "Kinshasa, Gombe",
                intention: "Relation sérieuse",
                photo: "personnes/grace.jpg",
                cadrage: "50% 22%",
                verifie: true,
              }}
              suivant={{
                prenom: "Nadège",
                age: 24,
                ville: "Kinshasa, Ngaliema",
                intention: "Mariage",
                photo: "personnes/nadege.jpg",
                cadrage: "50% 12%",
              }}
              likeA={LIKE_A}
            />
          </Telephone>
        </Interactive.Div>
      </div>

      {ETIQUETTES.map((e) => (
        <Interactive.Div
          key={e.texte}
          name={`Étiquette ${e.texte}`}
          style={{
            position: "absolute",
            left: e.left,
            top: e.top,
            padding: "22px 40px",
            borderRadius: 999,
            borderBottomRightRadius: 14,
            backgroundColor: "#F1CBDD",
            color: "#481A46",
            fontSize: 40,
            fontWeight: 700,
            whiteSpace: "nowrap",
            boxShadow: "0 30px 60px rgba(23, 18, 23, 0.45)",
            rotate: e.angle,
            scale: interpolate(frame, [e.depart, e.depart + 24], [0.4, 1], {
              easing: Easing.spring({ damping: 14, stiffness: 140 }),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [e.depart, e.depart + 8], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {e.texte}
        </Interactive.Div>
      ))}
    </AbsoluteFill>
  );
};
