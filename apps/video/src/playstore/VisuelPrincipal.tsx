import { AbsoluteFill, Img, staticFile } from "remotion";
import { Empreinte } from "../pub/components/Empreinte";
import { montserrat } from "./police";

// Visuel principal (feature graphic) de la fiche Play Store : 1024 x 500.
// À gauche, le dégradé flamme du site, le logo, le nom et la promesse. À
// droite, une vraie photo de couple (Unsplash, licence libre, voir
// public/playstore/CREDITS.txt), fondue dans le dégradé. Rien d'essentiel
// près des bords : Google peut recadrer ou superposer un bouton lecture.
export const VisuelPrincipal: React.FC = () => {
  return (
    <AbsoluteFill style={{ fontFamily: montserrat, overflow: "hidden", backgroundColor: "#fd267a" }}>
      <Img
        src={staticFile("playstore/couple.jpg")}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 520,
          height: 500,
          objectFit: "cover",
          objectPosition: "50% 30%",
        }}
      />
      {/* Fondu du dégradé sur la photo, de gauche à droite. */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(90deg, #fd267a 0%, #fe3a68 42%, rgba(255,80,72,0.85) 52%, rgba(255,96,54,0.0) 72%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 70,
          top: 0,
          bottom: 0,
          width: 500,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Empreinte taille={78} couleur="#ffffff" epaisseur={2} />
          <div style={{ fontSize: 76, fontWeight: 900, color: "#ffffff", letterSpacing: 14 }}>ZOLA</div>
        </div>
        <div style={{ fontSize: 34, lineHeight: 1.18, fontWeight: 800, color: "#ffffff", letterSpacing: -0.5 }}>
          Rencontre des Congolais qui cherchent la même chose que toi.
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          {["Profils vérifiés", "Gratuit", "100 % RDC"].map((t) => (
            <div
              key={t}
              style={{
                fontSize: 17,
                fontWeight: 800,
                color: "#fd267a",
                backgroundColor: "#ffffff",
                borderRadius: 999,
                padding: "8px 16px",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
