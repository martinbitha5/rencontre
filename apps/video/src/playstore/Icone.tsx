import { AbsoluteFill } from "remotion";
import { Empreinte } from "../pub/components/Empreinte";

// Icône haute résolution de la fiche Play Store : 512 x 512, carré plein
// (Google applique lui-même l'arrondi). L'empreinte blanche du logo sur le
// dégradé flamme du site, à la même échelle que l'icône adaptative de l'app.
export const Icone: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #fd267a 0%, #ff6036 100%)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Empreinte taille={300} couleur="#ffffff" epaisseur={2.1} />
    </AbsoluteFill>
  );
};
