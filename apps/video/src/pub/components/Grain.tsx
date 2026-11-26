import { AbsoluteFill, useCurrentFrame } from "remotion";

// Grain argentique très léger posé sur toute la pub. Le bruit change à
// chaque image (la graine suit le compteur), ce qui donne cette vie
// imperceptible qu'ont les images tournées et qu'un aplat numérique n'a pas.
export const Grain: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill name="Grain" style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity: 0.16 }}>
      <svg width="100%" height="100%">
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame % 40} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};
