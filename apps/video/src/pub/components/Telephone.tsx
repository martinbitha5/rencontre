import type { CSSProperties, ReactNode } from "react";

// Maquette de téléphone. L'écran fait 520x1128 (le ratio 19,5:9 des iPhone
// récents), le corps déborde de 14 px tout autour. Le contenu d'écran est
// dessiné à l'échelle 1,33 d'un point iOS : un titre de 24 pt fait 32 px ici.
export const ECRAN_LARGEUR = 520;
export const ECRAN_HAUTEUR = 1128;
const BORD = 14;

type Props = {
  children: ReactNode;
  style?: CSSProperties;
};

export const Telephone: React.FC<Props> = ({ children, style }) => {
  return (
    <div
      style={{
        width: ECRAN_LARGEUR + BORD * 2,
        height: ECRAN_HAUTEUR + BORD * 2,
        borderRadius: 88,
        padding: BORD,
        backgroundColor: "#0E0A0F",
        boxShadow:
          "inset 0 0 0 2px rgba(255, 255, 255, 0.14), inset 0 0 0 5px #1E171F, 0 60px 120px rgba(23, 18, 23, 0.75), 0 20px 40px rgba(23, 18, 23, 0.5)",
        ...style,
      }}
    >
      <div
        style={{
          width: ECRAN_LARGEUR,
          height: ECRAN_HAUTEUR,
          borderRadius: 74,
          overflow: "hidden",
          position: "relative",
          backgroundColor: "#FAF7F9",
        }}
      >
        {children}
        <div
          style={{
            position: "absolute",
            top: 18,
            left: (ECRAN_LARGEUR - 156) / 2,
            width: 156,
            height: 46,
            borderRadius: 999,
            backgroundColor: "#0E0A0F",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 26,
            left: 48,
            fontSize: 22,
            fontWeight: 600,
            color: "#171217",
            letterSpacing: -0.3,
          }}
        >
          9:41
        </div>
        <div style={{ position: "absolute", top: 32, right: 48, display: "flex", gap: 8, alignItems: "flex-end" }}>
          {[8, 12, 16, 20].map((h) => (
            <div key={h} style={{ width: 5, height: h, borderRadius: 2, backgroundColor: "#171217" }} />
          ))}
          <div
            style={{
              marginLeft: 6,
              width: 36,
              height: 18,
              borderRadius: 6,
              border: "2px solid #171217",
              padding: 2,
            }}
          >
            <div style={{ width: "80%", height: "100%", borderRadius: 2, backgroundColor: "#171217" }} />
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: (ECRAN_LARGEUR - 180) / 2,
            width: 180,
            height: 7,
            borderRadius: 999,
            backgroundColor: "rgba(23, 18, 23, 0.7)",
          }}
        />
      </div>
    </div>
  );
};
