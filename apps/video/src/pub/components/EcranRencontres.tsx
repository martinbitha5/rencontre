import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Icone } from "./Icones";

// L'onglet Rencontres tel qu'il se présente dans l'app, en thème clair :
// titre prune, pilule de ville, carte au coin signature, trois boutons
// (passer, like, message direct), barre d'onglets. Les photos viennent de
// public/personnes/ (licence Pexels, sources dans le README, « Visuels »).
export type Profil = {
  prenom: string;
  age: number;
  ville: string;
  intention: string;
  // Fichier dans public/, et point d'ancrage du recadrage (object-position).
  photo: string;
  cadrage?: string;
  verifie?: boolean;
};

type Props = {
  profil: Profil;
  suivant: Profil;
  // Image à laquelle le like est pressé : le bouton pulse, la carte s'envole.
  likeA: number;
};

const Carte: React.FC<{ profil: Profil }> = ({ profil }) => (
  <AbsoluteFill
    style={{
      borderRadius: 44,
      borderBottomRightRadius: 14,
      overflow: "hidden",
      backgroundColor: "#241C24",
      boxShadow: "0 24px 50px rgba(72, 26, 70, 0.28)",
    }}
  >
    <Img
      src={staticFile(profil.photo)}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: profil.cadrage ?? "50% 30%",
      }}
    />
    <AbsoluteFill
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(23, 18, 23, 0) 45%, rgba(23, 18, 23, 0.55) 70%, rgba(23, 18, 23, 0.9) 100%)",
      }}
    />
    <div style={{ position: "absolute", top: 22, left: 22, display: "flex", gap: 8 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            width: 46,
            height: 5,
            borderRadius: 999,
            backgroundColor: i === 0 ? "#FFFFFF" : "rgba(255, 255, 255, 0.4)",
          }}
        />
      ))}
    </div>
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: 30, gap: 10 }}>
      <div
        style={{
          alignSelf: "flex-start",
          backgroundColor: "#F1CBDD",
          color: "#481A46",
          fontSize: 22,
          fontWeight: 700,
          padding: "10px 20px",
          borderRadius: 999,
        }}
      >
        {profil.intention}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 46, fontWeight: 800, color: "#FFFFFF", letterSpacing: -1.2, whiteSpace: "nowrap" }}>
          {profil.prenom}, {profil.age}
        </div>
        {profil.verifie ? <Icone nom="badge" taille={36} couleur="#1D9BF0" epaisseur={2.4} /> : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(246, 237, 243, 0.85)", fontSize: 24, fontWeight: 500 }}>
        <Icone nom="epingle" taille={24} couleur="rgba(246, 237, 243, 0.85)" />
        {profil.ville}
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

export const EcranRencontres: React.FC<Props> = ({ profil, suivant, likeA }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: "#FAF7F9" }}>
      <div
        style={{
          position: "absolute",
          top: 96,
          left: 30,
          right: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 800, color: "#2E0F2D", letterSpacing: -1 }}>Rencontres</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            backgroundColor: "rgba(72, 26, 70, 0.08)",
            borderRadius: 999,
            padding: "10px 18px",
            fontSize: 22,
            fontWeight: 600,
            color: "#481A46",
          }}
        >
          <Icone nom="epingle" taille={22} couleur="#481A46" />
          Kinshasa
          <Icone nom="ajuster" taille={22} couleur="#481A46" />
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 176,
          left: 26,
          width: 468,
          height: 660,
          scale: interpolate(frame, [likeA + 6, likeA + 30], [0.94, 1], {
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          opacity: interpolate(frame, [likeA + 6, likeA + 20], [0.6, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <Carte profil={suivant} />
      </div>

      <div
        style={{
          position: "absolute",
          top: 176,
          left: 26,
          width: 468,
          height: 660,
          translate: interpolate(frame, [likeA + 6, likeA + 30], ["0px 0px", "760px -90px"], {
            easing: Easing.bezier(0.5, 0, 0.75, 0),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          rotate: interpolate(frame, [likeA + 6, likeA + 30], ["0deg", "20deg"], {
            easing: Easing.bezier(0.5, 0, 0.75, 0),
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <Carte profil={profil} />
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 30,
            padding: "10px 22px",
            border: "5px solid #9B3F7A",
            borderRadius: 16,
            color: "#9B3F7A",
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: 2,
            backgroundColor: "rgba(250, 247, 249, 0.85)",
            rotate: "-14deg",
            opacity: interpolate(frame, [likeA, likeA + 6], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            scale: interpolate(frame, [likeA, likeA + 8], [1.6, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          LIKE
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 868,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 30,
        }}
      >
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 999,
            backgroundColor: "#FFFCFE",
            boxShadow: "0 10px 24px rgba(72, 26, 70, 0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icone nom="croix" taille={34} couleur="#6B5468" epaisseur={2.6} />
        </div>
        <div
          style={{
            width: 104,
            height: 104,
            borderRadius: 999,
            borderBottomRightRadius: 30,
            backgroundColor: "#9B3F7A",
            boxShadow: "0 14px 30px rgba(155, 63, 122, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            scale: interpolate(frame, [likeA - 6, likeA, likeA + 10], [1, 0.82, 1.12], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <Icone nom="coeur" taille={48} couleur="#FFFFFF" plein epaisseur={0} />
        </div>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 999,
            backgroundColor: "#FFFCFE",
            boxShadow: "0 10px 24px rgba(72, 26, 70, 0.14)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icone nom="bulle" taille={34} couleur="#A8752A" epaisseur={2.4} />
        </div>
      </div>

      <BarreOnglets actif={0} />
    </AbsoluteFill>
  );
};

export const BarreOnglets: React.FC<{ actif: number }> = ({ actif }) => {
  const onglets: { nom: string; icone: "grille" | "bulle" | "coeur" | "personne" }[] = [
    { nom: "Rencontres", icone: "grille" },
    { nom: "Discussions", icone: "bulle" },
    { nom: "Activité", icone: "coeur" },
    { nom: "Profil", icone: "personne" },
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 118,
        paddingBottom: 22,
        backgroundColor: "rgba(255, 252, 254, 0.96)",
        borderTop: "1px solid rgba(72, 26, 70, 0.1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-around",
      }}
    >
      {onglets.map((o, i) => (
        <div key={o.nom} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Icone nom={o.icone} taille={30} couleur={i === actif ? "#481A46" : "#B09AAB"} epaisseur={i === actif ? 2.4 : 2} />
          <div style={{ fontSize: 16, fontWeight: i === actif ? 700 : 500, color: i === actif ? "#481A46" : "#B09AAB" }}>
            {o.nom}
          </div>
        </div>
      ))}
    </div>
  );
};
