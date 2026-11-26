// Icônes tracées en SVG (style Lucide, ISC), jamais en caractères Unicode :
// un glyphe absent d'Inter serait rendu par une police de repli, différente
// d'une machine à l'autre. Un tracé est identique partout.
const TRACES: Record<string, string[]> = {
  coeur: [
    "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  ],
  croix: ["M18 6 6 18", "m6 6 12 12"],
  bulle: ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z"],
  coche: ["M20 6 9 17l-5-5"],
  badge: [
    "M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z",
    "m9 12 2 2 4-4",
  ],
  bouclier: [
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
  ],
  drapeau: ["M4 22V4a1 1 0 0 1 1-1h11.5a.5.5 0 0 1 .4.8L14 8l2.9 4.2a.5.5 0 0 1-.4.8H5"],
  epingle: ["M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z", "M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  micro: [
    "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z",
    "M19 10v2a7 7 0 0 1-14 0v-2",
    "M12 19v3",
  ],
  grille: [
    "M3 3h7v7H3z",
    "M14 3h7v7h-7z",
    "M14 14h7v7h-7z",
    "M3 14h7v7H3z",
  ],
  personne: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"],
  scan: [
    "M3 7V5a2 2 0 0 1 2-2h2",
    "M17 3h2a2 2 0 0 1 2 2v2",
    "M21 17v2a2 2 0 0 1-2 2h-2",
    "M7 21H5a2 2 0 0 1-2-2v-2",
    "M7 12h10",
  ],
  lecture: ["m6 3 14 9-14 9V3z"],
  telecharger: ["M12 15V3", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5"],
  ajuster: ["M21 4h-7", "M10 4H3", "M21 12h-9", "M8 12H3", "M21 20h-5", "M12 20H3", "M14 2v4", "M8 10v4", "M16 18v4"],
  image: ["M18 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3Z", "M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"],
  plus: ["M5 12h14", "M12 5v14"],
  envoyer: ["M14.5 9.5 21 3", "M21 3 13.5 21a.5.5 0 0 1-.9 0L10 14l-7-2.6a.5.5 0 0 1 0-.9Z"],
};

type Props = {
  nom: keyof typeof TRACES;
  taille: number;
  couleur: string;
  epaisseur?: number;
  plein?: boolean;
};

export const Icone: React.FC<Props> = ({ nom, taille, couleur, epaisseur = 2, plein = false }) => {
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill={plein ? couleur : "none"}
      stroke={couleur}
      strokeWidth={epaisseur}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: "block", flexShrink: 0 }}
    >
      {TRACES[nom].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
};
