import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import { Empreinte } from "../pub/components/Empreinte";
import { montserrat } from "./police";

// Captures « appareils pliables » de la fiche Play Store.
//
// Google demande au moins un écran déplié en 1:1, un écran déplié en 4:3 et
// l'écran externe plié, en portrait, en 10:16. Écran déplié : deux vraies
// captures de l'app côte à côte, séparées par le pli. Écran externe : un seul
// téléphone, plus étroit. Mêmes fonds et même typographie que les captures
// téléphone (Ecran.tsx).

export const pliableSchema = z.object({
  format: z.enum(["carre", "paysage", "externe"]),
  captures: z.array(z.string()).min(1).max(2),
  etiquette: z.string(),
  titre: z.string(),
  accent: z.string().optional(),
  fond: z.enum(["flamme", "clair", "sombre"]),
});

export type PliableProps = z.infer<typeof pliableSchema>;

// Taille de rendu de chaque format (chaque côté entre 960 et 3840 px).
export const TAILLES = {
  carre: { width: 2048, height: 2048 },
  paysage: { width: 2048, height: 1536 },
  externe: { width: 1200, height: 1920 },
} as const;

const ROSE = "#fd267a";
const ORANGE = "#ff6036";
const NOIR = "#101113";
const RATIO = 1170 / 2532; // largeur / hauteur d'une capture brute

const Fond: React.FC<{ fond: PliableProps["fond"]; w: number; h: number }> = ({ fond, w, h }) => {
  if (fond === "flamme") {
    return <AbsoluteFill style={{ background: `linear-gradient(160deg, ${ROSE} 0%, ${ORANGE} 100%)` }} />;
  }
  if (fond === "clair") {
    return <AbsoluteFill style={{ background: "linear-gradient(180deg, #fff1f5 0%, #ffffff 75%)" }} />;
  }
  const d = Math.max(w, h) * 1.05;
  return (
    <AbsoluteFill style={{ backgroundColor: NOIR }}>
      <div
        style={{
          position: "absolute",
          width: d,
          height: d,
          borderRadius: d / 2,
          left: w / 2 - d / 2,
          top: h * 0.62 - d / 2,
          background: "radial-gradient(circle, rgba(253,38,122,0.5) 0%, rgba(253,38,122,0) 62%)",
        }}
      />
    </AbsoluteFill>
  );
};

const Titre: React.FC<{
  etiquette: string;
  titre: string;
  accent?: string;
  fond: PliableProps["fond"];
  taille: number;
  align: "center" | "left";
}> = ({ etiquette, titre, accent, fond, taille, align }) => {
  const clair = fond === "clair";
  const morceaux = accent && titre.includes(accent) ? titre.split(accent) : [titre];
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        gap: taille * 0.4,
      }}
    >
      <div
        style={{
          fontSize: taille * 0.38,
          fontWeight: 800,
          letterSpacing: taille * 0.09,
          color: clair ? ROSE : "rgba(255,255,255,0.92)",
          padding: `${taille * 0.15}px ${taille * 0.36}px`,
          borderRadius: 999,
          backgroundColor: clair ? "#ffe1ea" : "rgba(255,255,255,0.16)",
        }}
      >
        {etiquette}
      </div>
      <div
        style={{
          fontSize: taille,
          lineHeight: 1.1,
          fontWeight: 900,
          letterSpacing: -taille * 0.022,
          color: clair ? NOIR : "#ffffff",
          textAlign: align,
        }}
      >
        {morceaux.length === 2 ? (
          <>
            {morceaux[0]}
            <span style={{ color: fond === "flamme" ? NOIR : ROSE }}>{accent}</span>
            {morceaux[1]}
          </>
        ) : (
          titre
        )}
      </div>
    </div>
  );
};

// L'appareil : un ou deux panneaux d'écran dans un cadre noir. `hauteur` est
// la hauteur de l'écran, sans le cadre.
const Appareil: React.FC<{ captures: string[]; hauteur: number; clair: boolean }> = ({
  captures,
  hauteur,
  clair,
}) => {
  const panneau = Math.round(hauteur * RATIO);
  const deplie = captures.length === 2;
  const cadre = Math.round(hauteur * 0.022);
  const rayon = Math.round(hauteur * (deplie ? 0.045 : 0.06));
  const largeur = panneau * captures.length;
  return (
    <div
      style={{
        width: largeur + cadre * 2,
        height: hauteur + cadre * 2,
        padding: cadre,
        borderRadius: rayon + cadre,
        backgroundColor: "#0b0b0c",
        boxShadow: clair
          ? "0 50px 110px rgba(16,17,19,0.22), 0 0 0 2px rgba(16,17,19,0.06)"
          : "0 50px 120px rgba(0,0,0,0.45)",
      }}
    >
      <div
        style={{
          width: largeur,
          height: hauteur,
          borderRadius: rayon,
          overflow: "hidden",
          position: "relative",
          display: "flex",
          backgroundColor: "#ffffff",
        }}
      >
        {captures.map((c) => (
          <Img
            key={c}
            src={staticFile(`playstore/${c}`)}
            style={{ width: panneau, height: hauteur, display: "block" }}
          />
        ))}
        {deplie && (
          // Le pli : une ombre douce de part et d'autre du milieu.
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: panneau - hauteur * 0.012,
              width: hauteur * 0.024,
              background:
                "linear-gradient(90deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.16) 45%, rgba(255,255,255,0.18) 52%, rgba(0,0,0,0.12) 58%, rgba(0,0,0,0) 100%)",
            }}
          />
        )}
      </div>
    </div>
  );
};

export const Pliable: React.FC<PliableProps> = ({ format, captures, etiquette, titre, accent, fond }) => {
  const { width: w, height: h } = TAILLES[format];
  const clair = fond === "clair";

  const filigrane = (
    <div style={{ position: "absolute", top: -h * 0.06, right: -w * 0.12, opacity: clair ? 0.05 : 0.1 }}>
      <Empreinte taille={Math.max(w, h) * 0.42} couleur={clair ? ROSE : "#ffffff"} epaisseur={1.6} />
    </div>
  );

  if (format === "paysage") {
    // Titre à gauche, écran déplié à droite.
    const hauteur = 1240;
    return (
      <AbsoluteFill style={{ fontFamily: montserrat, overflow: "hidden" }}>
        <Fond fond={fond} w={w} h={h} />
        {filigrane}
        <div
          style={{
            position: "absolute",
            left: 130,
            top: 0,
            bottom: 0,
            width: 540,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Titre etiquette={etiquette} titre={titre} accent={accent} fond={fond} taille={86} align="left" />
        </div>
        <div style={{ position: "absolute", right: 110, top: (h - hauteur) / 2 - 28 }}>
          <Appareil captures={captures} hauteur={hauteur} clair={clair} />
        </div>
      </AbsoluteFill>
    );
  }

  // Carré (déplié) et externe (plié) : titre en haut, appareil en bas.
  const carre = format === "carre";
  const hauteur = 1380;
  const taille = carre ? 96 : 72;
  return (
    <AbsoluteFill style={{ fontFamily: montserrat, overflow: "hidden" }}>
      <Fond fond={fond} w={w} h={h} />
      {filigrane}
      <div style={{ position: "absolute", top: carre ? 120 : 110, left: 90, right: 90 }}>
        <Titre etiquette={etiquette} titre={titre} accent={accent} fond={fond} taille={taille} align="center" />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: carre ? 90 : 70,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <Appareil captures={captures} hauteur={hauteur} clair={clair} />
      </div>
    </AbsoluteFill>
  );
};
