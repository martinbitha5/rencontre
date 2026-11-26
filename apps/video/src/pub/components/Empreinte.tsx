import { Easing, interpolate, useCurrentFrame } from "remotion";

// Le logo Zola : l'empreinte digitale. Mêmes tracés que
// apps/mobile/src/components/ZolaLogo.tsx (Lucide « fingerprint », ISC),
// dans le même ordre de dessin : les deux arches, les crêtes, les finitions,
// puis le point qui signe.
//
// `pathLength={1}` normalise chaque tracé : un pointillé de longueur 1 et un
// décalage qui va de 1 à 0 dessinent la ligne progressivement, sans avoir à
// connaître sa longueur réelle.
const TRACES = [
  "M2 12a10 10 0 0 1 18-6",
  "M9 6.8a6 6 0 0 1 9 5.2v2",
  "M21.8 16c.2-2 .131-5.354 0-6",
  "M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2",
  "M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4",
  "M14 13.12c0 2.38 0 6.38-1 8.88",
  "M8.65 22c.21-.66.45-1.32.57-2",
  "M17.29 21.02c.12-.6.43-2.3.5-3.02",
];
const POINT = "M2 16h.01";

type Props = {
  taille: number;
  couleur: string;
  epaisseur?: number;
  // Image à laquelle le dessin commence. Omis : logo déjà formé.
  depart?: number;
  // Durée du tracé d'une ligne, et décalage entre deux lignes (images).
  dureeTrait?: number;
  decalage?: number;
};

export const Empreinte: React.FC<Props> = ({
  taille,
  couleur,
  epaisseur = 2,
  depart,
  dureeTrait = 26,
  decalage = 4,
}) => {
  const frame = useCurrentFrame();
  const anime = depart !== undefined;

  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke={couleur}
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block" }}
    >
      {TRACES.map((d, i) => {
        const debut = (depart ?? 0) + i * decalage;
        return (
          <path
            key={d}
            d={d}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={
              anime
                ? interpolate(frame, [debut, debut + dureeTrait], [1, 0], {
                    easing: Easing.bezier(0.22, 1, 0.36, 1),
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  })
                : 0
            }
          />
        );
      })}
      <path
        d={POINT}
        style={{
          opacity: anime
            ? interpolate(
                frame,
                [(depart ?? 0) + TRACES.length * decalage + 8, (depart ?? 0) + TRACES.length * decalage + 14],
                [0, 1],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              )
            : 1,
        }}
      />
    </svg>
  );
};

// Image à laquelle le logo est entièrement formé, point compris.
export const finDessin = (depart: number, dureeTrait = 26, decalage = 4) =>
  depart + TRACES.length * decalage + 14 + Math.max(0, dureeTrait - 14);
