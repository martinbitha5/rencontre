import { Easing, interpolate, useCurrentFrame } from "remotion";

// Typographie cinétique : chaque mot arrive à son tour, du bas, en sortant
// d'un flou. C'est le geste typographique de toute la pub, d'où un seul
// composant. `depart` est l'image du premier mot, `decalage` l'écart entre
// deux mots, `duree` le temps d'arrivée d'un mot.
type Props = {
  texte: string;
  depart: number;
  taille: number;
  couleur: string;
  poids?: number;
  decalage?: number;
  duree?: number;
  interligne?: number;
  espacement?: number;
  alignement?: "center" | "left";
  largeur?: number;
  // Image à laquelle le texte commence à s'effacer. Omis : il reste.
  sortie?: number;
};

export const MotsAnimes: React.FC<Props> = ({
  texte,
  depart,
  taille,
  couleur,
  poids = 800,
  decalage = 4,
  duree = 16,
  interligne = 1.06,
  espacement = -0.03,
  alignement = "center",
  largeur,
  sortie,
}) => {
  const frame = useCurrentFrame();
  const mots = texte.split(" ");

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: alignement === "center" ? "center" : "flex-start",
        columnGap: taille * 0.26,
        rowGap: 0,
        width: largeur,
        fontSize: taille,
        fontWeight: poids,
        color: couleur,
        lineHeight: interligne,
        letterSpacing: taille * espacement,
        textAlign: alignement,
        opacity:
          sortie === undefined
            ? 1
            : interpolate(frame, [sortie, sortie + 12], [1, 0], {
                easing: Easing.bezier(0.4, 0, 1, 1),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
        translate:
          sortie === undefined
            ? "0px 0px"
            : interpolate(frame, [sortie, sortie + 12], ["0px 0px", "0px -30px"], {
                easing: Easing.bezier(0.4, 0, 1, 1),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
      }}
    >
      {mots.map((mot, i) => {
        const debut = depart + i * decalage;
        return (
          <span
            key={`${mot}-${i}`}
            style={{
              display: "inline-block",
              whiteSpace: "nowrap",
              opacity: interpolate(frame, [debut, debut + duree], [0, 1], {
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              translate: interpolate(frame, [debut, debut + duree], ["0px 44px", "0px 0px"], {
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              filter: `blur(${interpolate(frame, [debut, debut + duree], [14, 0], {
                easing: Easing.bezier(0.16, 1, 0.3, 1),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              })}px)`,
            }}
          >
            {mot}
          </span>
        );
      })}
    </div>
  );
};
