import { Audio } from "@remotion/media";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill, interpolate, staticFile, useVideoConfig } from "remotion";
import { fontFamily } from "../police";
import { Grain } from "./components/Grain";
import { Accroche } from "./scenes/Accroche";
import { Appel } from "./scenes/Appel";
import { Confiance } from "./scenes/Confiance";
import { Conversation } from "./scenes/Conversation";
import { Intentions } from "./scenes/Intentions";
import { Marque } from "./scenes/Marque";
import { Soirees } from "./scenes/Soirees";
import { Ville } from "./scenes/Ville";

// La pub réseaux, 30 s en 1080x1920.
//
// Durées : 105 + 90 + 150 + 120 + 150 + 105 + 105 + 159 = 984 images, moins
// sept transitions de 12 images = 900 images, soit 30 s à 30 i/s. Si une
// durée change ici, corriger `durationInFrames` dans Root.tsx.
//
// `disponible` : voir Appel.tsx. `musique` : nom d'un fichier dans public/
// (ex. « musique.mp3 »), ou vide pour un montage muet. Aucune piste n'est
// fournie : en choisir une sous licence explicite avant diffusion, voir le
// README.
type Props = {
  disponible: boolean;
  musique: string;
};

export const Pub: React.FC<Props> = ({ disponible, musique }) => {
  const { durationInFrames, fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: "#171217", fontFamily }}>
      {musique ? (
        <Audio
          src={staticFile(musique)}
          volume={(f) =>
            interpolate(f, [0, 1 * fps, durationInFrames - 2 * fps, durationInFrames], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      ) : null}
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={105} name="Accroche">
          <Accroche />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={90} name="Marque">
          <Marque />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={150} name="Intentions">
          <Intentions />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={120} name="Ville">
          <Ville />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={150} name="Conversation">
          <Conversation />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={linearTiming({ durationInFrames: 12 })}
        />
        <TransitionSeries.Sequence durationInFrames={105} name="Confiance">
          <Confiance />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={105} name="Soirées">
          <Soirees />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 12 })} />
        <TransitionSeries.Sequence durationInFrames={159} name="Appel">
          <Appel disponible={disponible} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Grain />
    </AbsoluteFill>
  );
};
