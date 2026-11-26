import { AbsoluteFill, Interactive, interpolate, useCurrentFrame } from "remotion";

// Fond de marque Velours : la montée du noir prune vers le prune vif, la même
// que `brandRamp` dans apps/mobile/src/theme.ts (#171217 -> #2F1130 -> #6E2A63).
// Un voile rose respire lentement par-dessus pour que le fond ne soit jamais
// plat sur vingt secondes. Aucune autre teinte identitaire n'est inventée ici.
export const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      name="Fond de marque"
      style={{
        backgroundImage: "linear-gradient(180deg, #171217 0%, #2F1130 52%, #6E2A63 100%)",
      }}
    >
      <Interactive.Div
        name="Voile rose"
        style={{
          position: "absolute",
          left: 40,
          top: 240,
          width: 1000,
          height: 1000,
          borderRadius: 999,
          backgroundImage: "radial-gradient(circle, rgba(241, 203, 221, 0.34) 0%, rgba(241, 203, 221, 0) 68%)",
          filter: "blur(40px)",
          opacity: interpolate(frame, [0, 90, 300, 420], [0.5, 0.9, 0.9, 0.55], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [0, 600], ["0px 0px", "0px -160px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <Interactive.Div
        name="Halo magenta"
        style={{
          position: "absolute",
          left: 260,
          top: 1180,
          width: 900,
          height: 900,
          borderRadius: 999,
          backgroundImage: "radial-gradient(circle, rgba(155, 63, 122, 0.42) 0%, rgba(155, 63, 122, 0) 70%)",
          filter: "blur(60px)",
          opacity: interpolate(frame, [0, 120], [0, 0.85], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <AbsoluteFill
        name="Vignette"
        style={{
          backgroundImage:
            "radial-gradient(120% 70% at 50% 45%, rgba(23, 18, 23, 0) 40%, rgba(23, 18, 23, 0.72) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
