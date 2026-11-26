import { AbsoluteFill } from "remotion";
import { Montage } from "./Montage";

// Aperçu App Store : 886x1920, l'une des tailles d'app preview acceptées par
// App Store Connect pour les grands iPhone. La hauteur est la même que le
// montage (1920), seule la largeur est plus étroite : on recadre donc de 97 px
// de chaque côté au lieu de redessiner une seconde mise en page.
//
// C'est la raison pour laquelle toutes les scènes tiennent leur contenu entre
// x=180 et x=900 dans le repère 1080 : après recadrage il reste 83 px de marge
// de chaque côté.
export const ApercuAppStore: React.FC = () => {
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: "#171217" }}>
      <AbsoluteFill style={{ width: 1080, height: 1920, left: -97 }}>
        <Montage appel={false} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
