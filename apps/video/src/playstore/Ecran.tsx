import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import { Empreinte } from "../pub/components/Empreinte";
import { montserrat } from "./police";

// Une capture d'écran de la fiche Play Store, 1080 x 1920 (9:16, le format
// qui rend la fiche éligible aux emplacements mis en avant de Google Play).
//
// En haut, une étiquette en petites capitales et un titre court, dans le
// style du site (Montserrat très gras). En dessous, un téléphone qui montre
// une VRAIE capture de l'app, rendue par le code de l'app lui-même (voir
// README, « Fiche Play Store »). Trois fonds tournent d'un visuel à l'autre :
// le dégradé flamme du site, le rose très clair de ses sections, et le bloc
// sombre à halo rose.

export const ecranSchema = z.object({
  capture: z.string(),
  etiquette: z.string(),
  titre: z.string(),
  // Mots du titre mis en couleur : rose sur fond clair ou sombre, noir sur la
  // flamme.
  accent: z.string().optional(),
  fond: z.enum(["flamme", "clair", "sombre"]),
});

const ROSE = "#fd267a";
const ORANGE = "#ff6036";
const NOIR = "#101113";

const W = 1080;
const PHONE_W = 640;
const BEZEL = 16;
const SCREEN_W = PHONE_W - BEZEL * 2;
const SCREEN_H = Math.round((SCREEN_W * 2532) / 1170);
const PHONE_H = SCREEN_H + BEZEL * 2;

export const Ecran: React.FC<z.infer<typeof ecranSchema>> = ({
  capture,
  etiquette,
  titre,
  accent,
  fond,
}) => {
  const clair = fond === "clair";
  const encre = clair ? NOIR : "#ffffff";

  // Le titre, avec les mots d'accent mis en valeur.
  const morceaux = accent && titre.includes(accent) ? titre.split(accent) : [titre];

  return (
    <AbsoluteFill style={{ fontFamily: montserrat, overflow: "hidden" }}>
      {/* Fond */}
      {fond === "flamme" && (
        <AbsoluteFill style={{ background: `linear-gradient(160deg, ${ROSE} 0%, ${ORANGE} 100%)` }} />
      )}
      {fond === "clair" && (
        <AbsoluteFill style={{ background: "linear-gradient(180deg, #fff1f5 0%, #ffffff 70%)" }} />
      )}
      {fond === "sombre" && (
        <AbsoluteFill style={{ backgroundColor: NOIR }}>
          <div
            style={{
              position: "absolute",
              width: 1100,
              height: 1100,
              borderRadius: 550,
              top: 380,
              left: -10,
              background: `radial-gradient(circle, rgba(253,38,122,0.55) 0%, rgba(253,38,122,0) 65%)`,
            }}
          />
        </AbsoluteFill>
      )}

      {/* Filigrane : l'empreinte du logo, très légère, en haut à droite. */}
      <div style={{ position: "absolute", top: -120, right: -160, opacity: clair ? 0.05 : 0.1 }}>
        <Empreinte taille={620} couleur={clair ? ROSE : "#ffffff"} epaisseur={1.6} />
      </div>

      {/* Étiquette et titre */}
      <div
        style={{
          position: "absolute",
          top: 120,
          left: 80,
          right: 80,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 26,
        }}
      >
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: 6,
            color: clair ? ROSE : "rgba(255,255,255,0.92)",
            padding: "10px 24px",
            borderRadius: 999,
            backgroundColor: clair ? "#ffe1ea" : "rgba(255,255,255,0.16)",
          }}
        >
          {etiquette}
        </div>
        <div
          style={{
            fontSize: 68,
            lineHeight: 1.1,
            fontWeight: 900,
            letterSpacing: -1.5,
            color: encre,
            textAlign: "center",
          }}
        >
          {morceaux.length === 2 ? (
            <>
              {morceaux[0]}
              <span
                style={{ color: fond === "flamme" ? NOIR : ROSE }}
              >
                {accent}
              </span>
              {morceaux[1]}
            </>
          ) : (
            titre
          )}
        </div>
      </div>

      {/* Téléphone */}
      <div
        style={{
          position: "absolute",
          left: (W - PHONE_W) / 2,
          top: 1920 - PHONE_H - 60,
          width: PHONE_W,
          height: PHONE_H,
          borderRadius: 84,
          backgroundColor: "#0b0b0c",
          padding: BEZEL,
          boxShadow: clair
            ? "0 40px 90px rgba(16,17,19,0.22), 0 0 0 2px rgba(16,17,19,0.06)"
            : "0 40px 100px rgba(0,0,0,0.45)",
        }}
      >
        <div
          style={{
            width: SCREEN_W,
            height: SCREEN_H,
            borderRadius: 70,
            overflow: "hidden",
            position: "relative",
            backgroundColor: "#ffffff",
          }}
        >
          <Img src={staticFile(`playstore/${capture}`)} style={{ width: SCREEN_W, height: SCREEN_H, display: "block" }} />
          {/* Caméra frontale en poinçon, comme sur la plupart des Android. */}
          <div
            style={{
              position: "absolute",
              top: 16,
              left: SCREEN_W / 2 - 13,
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: "#0b0b0c",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
