import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";

// Fond de marque Velours pour la pub : la montée du noir prune vers le prune
// vif (brandRamp de apps/mobile/src/theme.ts), deux halos qui dérivent
// lentement pour que l'image respire, et une vignette qui ramène l'oeil au
// centre. `chaleur` pousse le magenta : 0 pour les scènes de lecture,
// 1 pour l'appel final.
type Props = {
  chaleur?: number;
};

export const Fond: React.FC<Props> = ({ chaleur = 0.5 }) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Fond"
      style={{
        backgroundImage: `linear-gradient(180deg, #171217 0%, #2A1129 ${62 - chaleur * 18}%, #6E2A63 100%)`,
      }}
    >
      <Interactive.Div
        name="Halo rose"
        style={{
          position: "absolute",
          left: -120,
          top: 120,
          width: 1100,
          height: 1100,
          borderRadius: 999,
          backgroundImage:
            "radial-gradient(circle, rgba(241, 203, 221, 0.30) 0%, rgba(241, 203, 221, 0) 66%)",
          filter: "blur(50px)",
          translate: `${Math.sin(frame / 70) * 60}px ${Math.cos(frame / 90) * 40 - frame * 0.5}px`,
          opacity: 0.55 + chaleur * 0.3,
        }}
      />
      <Interactive.Div
        name="Halo magenta"
        style={{
          position: "absolute",
          left: 260,
          top: 1050,
          width: 1000,
          height: 1000,
          borderRadius: 999,
          backgroundImage:
            "radial-gradient(circle, rgba(155, 63, 122, 0.55) 0%, rgba(155, 63, 122, 0) 68%)",
          filter: "blur(70px)",
          translate: `${Math.cos(frame / 80) * 50}px ${Math.sin(frame / 60) * 30}px`,
          opacity: interpolate(frame, [0, 40], [0.4, 0.6 + chaleur * 0.4], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <AbsoluteFill
        name="Vignette"
        style={{
          backgroundImage:
            "radial-gradient(115% 70% at 50% 46%, rgba(23, 18, 23, 0) 42%, rgba(23, 18, 23, 0.7) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
