import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill } from "remotion";
import { fontFamily } from "./police";
import { Cloture } from "./scenes/Cloture";
import { Intentions } from "./scenes/Intentions";
import { Match } from "./scenes/Match";
import { Ouverture } from "./scenes/Ouverture";
import { Soirees } from "./scenes/Soirees";

// Le montage, dessiné une seule fois pour les deux sorties.
//
// Durées : 90 + 150 + 150 + 135 + 135 = 660 images, moins les quatre
// transitions de 15 images = 600 images, soit 20 s à 30 i/s. Si une durée
// change ici, corriger `durationInFrames` des compositions dans Root.tsx,
// Remotion ne le déduit pas tout seul.
//
// `appel` : voir Cloture.tsx. Réseaux = avec appel, App Store = sans.
type Props = {
  appel: boolean;
};

export const Montage: React.FC<Props> = ({ appel }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#171217", fontFamily }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={90} name="Ouverture">
          <Ouverture />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={150} name="Intentions">
          <Intentions />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={150} name="Match">
          <Match />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={135} name="Soirées">
          <Soirees />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: 15 })}
        />
        <TransitionSeries.Sequence durationInFrames={135} name="Clôture">
          <Cloture appel={appel} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
