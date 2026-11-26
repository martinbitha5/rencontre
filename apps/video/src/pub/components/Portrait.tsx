import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";

// Avatar rond recadré sur le visage. Les portraits de public/personnes/ sont
// des plans américains en 2:3 : dans un rond, le visage tomberait bas et
// petit. `ancre` place le point de la photo qui doit tenir le centre du rond
// (object-position), `zoom` resserre dessus. Le zoom porte sur l'image, pas
// sur le cadre : le rond, sa bordure et son ombre gardent leur taille.
type Props = {
  photo: string;
  taille: number;
  ancre?: string;
  zoom?: number;
  bordure?: string;
  style?: CSSProperties;
};

export const Portrait: React.FC<Props> = ({ photo, taille, ancre = "50% 32%", zoom = 1.6, bordure, style }) => {
  return (
    <div
      style={{
        width: taille,
        height: taille,
        borderRadius: 999,
        overflow: "hidden",
        border: bordure,
        boxSizing: "border-box",
        backgroundColor: "#241C24",
        ...style,
      }}
    >
      <Img
        src={staticFile(photo)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: ancre,
          scale: String(zoom),
          transformOrigin: "50% 50%",
        }}
      />
    </div>
  );
};
