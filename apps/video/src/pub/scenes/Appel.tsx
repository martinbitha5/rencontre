import { AbsoluteFill, Easing, Img, Interactive, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Empreinte } from "../components/Empreinte";
import { Fond } from "../components/Fond";
import { Icone } from "../components/Icones";
import { MotsAnimes } from "../components/MotsAnimes";

// Scène 8, l'appel. La marque, l'argument (gratuit), les deux magasins, le
// site. `disponible` bascule le message le jour de la mise en ligne : tant
// que l'app n'est pas publiée, on annonce, on ne renvoie pas vers un lien
// qui n'existe pas.
type Props = {
  disponible: boolean;
};

export const Appel: React.FC<Props> = ({ disponible }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Appel">
      <Fond chaleur={1} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 100px" }}>
        <Interactive.Div
          name="Tuile"
          style={{
            width: 220,
            height: 220,
            borderRadius: 58,
            backgroundImage: "linear-gradient(160deg, #E0428A 0%, #B8306E 55%, #9B2C6A 100%)",
            boxShadow: "0 30px 70px rgba(155, 63, 122, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 40,
            scale: interpolate(frame, [0, 30], [0.7, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [0, 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Empreinte taille={136} couleur="#FFFFFF" epaisseur={2.1} />
        </Interactive.Div>

        <Interactive.Div name="Titre" style={{ marginBottom: 22, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <MotsAnimes texte="Gratuit." depart={14} taille={104} couleur="#FFFFFF" />
          <MotsAnimes texte="Pour de vrai." depart={24} decalage={7} taille={104} couleur="#EDBBD7" />
        </Interactive.Div>
        <Interactive.Div
          name="Sous-titre"
          style={{
            fontSize: 46,
            fontWeight: 500,
            color: "#EDBBD7",
            textAlign: "center",
            lineHeight: 1.3,
            marginBottom: 70,
            opacity: interpolate(frame, [40, 58], [0, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [40, 60], ["0px 24px", "0px 0px"], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Aucun abonnement, aucun achat pour matcher ou discuter.
        </Interactive.Div>

        <Interactive.Div
          name="Appel"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "30px 60px",
            borderRadius: 999,
            borderBottomRightRadius: 20,
            backgroundColor: "#FAF7F9",
            color: "#481A46",
            fontSize: 50,
            fontWeight: 800,
            letterSpacing: -1,
            boxShadow: "0 30px 70px rgba(23, 18, 23, 0.5)",
            marginBottom: 34,
            scale: interpolate(frame, [62, 86], [0.6, 1], {
              easing: Easing.spring({ damping: 13, stiffness: 150 }),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            opacity: interpolate(frame, [62, 70], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Icone nom="telecharger" taille={50} couleur="#481A46" epaisseur={2.6} />
          {disponible ? "Télécharge Zola" : "Bientôt disponible"}
        </Interactive.Div>

        <Interactive.Div
          name="Magasins"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 22,
            marginBottom: 80,
            opacity: interpolate(frame, [80, 96], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [80, 100], ["0px 20px", "0px 0px"], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {/* Badges officiels, français, non modifiés (Apple : App Store
              Marketing Guidelines ; Google : Brand Guidelines). Le PNG de
              Google porte une marge transparente, d'où sa hauteur plus
              grande pour un rendu visuel égal aux deux. */}
          <Img src={staticFile("badges/app-store.svg")} style={{ height: 112, width: "auto", display: "block" }} />
          <Img src={staticFile("badges/google-play.png")} style={{ height: 122, width: "auto", display: "block" }} />
        </Interactive.Div>

        <Interactive.Div
          name="Site"
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#FFFFFF",
            letterSpacing: 1,
            opacity: interpolate(frame, [96, 112], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          zola-rdc.com
        </Interactive.Div>
        <Interactive.Div
          name="Mention"
          style={{
            marginTop: 18,
            fontSize: 28,
            fontWeight: 500,
            color: "rgba(237, 187, 215, 0.7)",
            opacity: interpolate(frame, [104, 118], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          Réservé aux personnes majeures.
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
