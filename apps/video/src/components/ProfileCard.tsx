import { AbsoluteFill } from "remotion";

// Carte de profil Velours. Trois signatures reprises de l'app :
// le coin signature (l'angle bas-droit est nettement plus petit que les trois
// autres), le voile prune posé sur la photo pour que le texte blanc tienne,
// et la pastille d'intention en rose pâle sur encre prune.
//
// Aucune photo réelle n'est utilisée : la vignette est un dégradé porteur de
// l'initiale. Remplacer par un <Img> quand des visuels libres de droits
// seront disponibles (voir README, section « Visuels »).

// `compact` : la même carte à deux échelles. En grand (scène Intentions) elle
// occupe 720x960 ; en petit (scène Match) elle tombe à 360x480, et la
// typographie doit suivre, sinon le prénom passe à la ligne et recouvre la
// ville. Deux jeux de valeurs valent mieux qu'un facteur d'échelle CSS :
// une carte réduite par `scale` réduirait aussi le rayon des coins et
// l'épaisseur de l'ombre, et le coin signature disparaîtrait.
type Props = {
  prenom: string;
  age: number;
  ville: string;
  intention: string;
  initiale: string;
  vignetteFrom: string;
  vignetteTo: string;
  compact?: boolean;
};

export const ProfileCard: React.FC<Props> = ({
  prenom,
  age,
  ville,
  intention,
  initiale,
  vignetteFrom,
  vignetteTo,
  compact = false,
}) => {
  return (
    <AbsoluteFill
      style={{
        borderRadius: compact ? 34 : 56,
        borderBottomRightRadius: compact ? 12 : 18,
        overflow: "hidden",
        backgroundColor: "#241C24",
        boxShadow: "0 40px 80px rgba(23, 18, 23, 0.55)",
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(150deg, ${vignetteFrom} 0%, ${vignetteTo} 100%)`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: compact ? 170 : 340,
            fontWeight: 700,
            color: "rgba(255, 255, 255, 0.22)",
            letterSpacing: -8,
          }}
        >
          {initiale}
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(23, 18, 23, 0) 42%, rgba(23, 18, 23, 0.48) 68%, rgba(23, 18, 23, 0.86) 100%)",
        }}
      />

      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          padding: compact ? 26 : 48,
          gap: compact ? 10 : 18,
        }}
      >
        <div
          style={{
            alignSelf: "flex-start",
            backgroundColor: "#F1CBDD",
            color: "#481A46",
            fontSize: compact ? 20 : 32,
            fontWeight: 600,
            padding: compact ? "8px 16px" : "14px 28px",
            borderRadius: 999,
          }}
        >
          {intention}
        </div>
        <div
          style={{
            fontSize: compact ? 38 : 68,
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: -1,
            whiteSpace: "nowrap",
          }}
        >
          {prenom}, {age}
        </div>
        <div
          style={{
            fontSize: compact ? 22 : 36,
            fontWeight: 500,
            color: "rgba(246, 237, 243, 0.82)",
          }}
        >
          {ville}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
