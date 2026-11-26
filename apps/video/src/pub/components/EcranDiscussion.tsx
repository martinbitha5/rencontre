import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Icone } from "./Icones";
import { Portrait } from "./Portrait";

// Une conversation dans l'app : en-tête avec l'avatar et le statut, bulles
// reçues (voile prune) et envoyées (magenta), indicateur de saisie, note
// vocale, composeur. La chronologie est pilotée par des images de départ pour
// que la scène qui l'héberge décide du rythme.
type Props = {
  prenom: string;
  photo: string;
  recuA: number;
  saisieA: number;
  envoyeA: number;
  vocalA: number;
};

const Bulle: React.FC<{
  depart: number;
  cote: "gauche" | "droite";
  children: React.ReactNode;
}> = ({ depart, cote, children }) => {
  const frame = useCurrentFrame();
  const droite = cote === "droite";
  return (
    <div
      style={{
        alignSelf: droite ? "flex-end" : "flex-start",
        maxWidth: 360,
        padding: "18px 24px",
        borderRadius: 30,
        borderBottomLeftRadius: droite ? 30 : 8,
        borderBottomRightRadius: droite ? 8 : 30,
        backgroundColor: droite ? "#9B3F7A" : "rgba(72, 26, 70, 0.08)",
        color: droite ? "#FFFFFF" : "#171217",
        fontSize: 25,
        fontWeight: 500,
        lineHeight: 1.3,
        opacity: interpolate(frame, [depart, depart + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        scale: interpolate(frame, [depart, depart + 14], [0.8, 1], {
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          output: "perceptual-scale",
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
        transformOrigin: droite ? "bottom right" : "bottom left",
      }}
    >
      {children}
    </div>
  );
};

export const EcranDiscussion: React.FC<Props> = ({ prenom, photo, recuA, saisieA, envoyeA, vocalA }) => {
  const frame = useCurrentFrame();
  const saisieVisible = frame >= saisieA && frame < envoyeA;

  return (
    <AbsoluteFill style={{ backgroundColor: "#FAF7F9" }}>
      <div
        style={{
          position: "absolute",
          top: 84,
          left: 0,
          right: 0,
          height: 96,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 30px",
          borderBottom: "1px solid rgba(72, 26, 70, 0.1)",
        }}
      >
        <Portrait photo={photo} taille={64} ancre="55% 30%" zoom={1.9} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 28, fontWeight: 800, color: "#2E0F2D" }}>
            {prenom}
            <Icone nom="badge" taille={26} couleur="#1D9BF0" epaisseur={2.4} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 19, color: "#2C8A57", fontWeight: 600 }}>
            <div style={{ width: 10, height: 10, borderRadius: 999, backgroundColor: "#2C8A57" }} />
            En ligne
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: 210,
          left: 26,
          right: 26,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ alignSelf: "center", fontSize: 18, fontWeight: 600, color: "#B09AAB", marginBottom: 6 }}>
          Vous avez matché aujourd'hui
        </div>
        <Bulle depart={recuA} cote="gauche">
          Salut ! Toi aussi tu es à Gombe ?
        </Bulle>
        {saisieVisible ? (
          <div
            style={{
              alignSelf: "flex-end",
              display: "flex",
              gap: 8,
              padding: "20px 24px",
              borderRadius: 30,
              borderBottomRightRadius: 8,
              backgroundColor: "rgba(155, 63, 122, 0.16)",
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 999,
                  backgroundColor: "#9B3F7A",
                  opacity: 0.35 + 0.65 * Math.max(0, Math.sin((frame - saisieA) / 3 - i * 0.9)),
                }}
              />
            ))}
          </div>
        ) : null}
        <Bulle depart={envoyeA} cote="droite">
          Oui, juste à côté du Grand Marché. On se voit samedi ?
        </Bulle>
        <div
          style={{
            alignSelf: "flex-start",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 22px",
            borderRadius: 30,
            borderBottomLeftRadius: 8,
            backgroundColor: "rgba(72, 26, 70, 0.08)",
            opacity: interpolate(frame, [vocalA, vocalA + 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            scale: interpolate(frame, [vocalA, vocalA + 14], [0.8, 1], {
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            transformOrigin: "bottom left",
          }}
        >
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 999,
              backgroundColor: "#481A46",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icone nom="lecture" taille={20} couleur="#FFFFFF" plein />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, height: 40 }}>
            {[10, 18, 28, 36, 22, 30, 16, 34, 26, 14, 24, 32, 18, 12, 20, 28, 14, 10].map((h, i) => (
              <div
                key={i}
                style={{
                  width: 5,
                  height: h,
                  borderRadius: 999,
                  backgroundColor: i < ((frame - vocalA) / 3) % 20 ? "#9B3F7A" : "rgba(72, 26, 70, 0.3)",
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 19, fontWeight: 600, color: "#6B5468" }}>0:07</div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          bottom: 40,
          height: 84,
          borderRadius: 999,
          backgroundColor: "#FFFCFE",
          border: "1px solid rgba(72, 26, 70, 0.14)",
          display: "flex",
          alignItems: "center",
          padding: "0 12px 0 26px",
          gap: 14,
        }}
      >
        <Icone nom="image" taille={28} couleur="#6B5468" />
        <div style={{ flex: 1, fontSize: 24, color: "#B09AAB" }}>Message</div>
        <Icone nom="micro" taille={28} couleur="#6B5468" />
        <div
          style={{
            width: 62,
            height: 62,
            borderRadius: 999,
            backgroundColor: "#481A46",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icone nom="envoyer" taille={26} couleur="#FFFFFF" />
        </div>
      </div>
    </AbsoluteFill>
  );
};
