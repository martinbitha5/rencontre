import { Composition, Folder, Still } from "remotion";
import "./index.css";
import { ApercuAppStore } from "./ApercuAppStore";
import { CarteMatch, carteMatchSchema } from "./CarteMatch";
import { Montage } from "./Montage";
import { Pub } from "./pub/Pub";
import { Ecran, ecranSchema } from "./playstore/Ecran";
import { ECRANS } from "./playstore/ecrans";
import { Icone } from "./playstore/Icone";
import { Pliable, pliableSchema, TAILLES } from "./playstore/Pliable";
import { PLIABLES } from "./playstore/pliables";
import { VisuelPrincipal } from "./playstore/VisuelPrincipal";
import { Accroche } from "./pub/scenes/Accroche";
import { Appel } from "./pub/scenes/Appel";
import { Confiance } from "./pub/scenes/Confiance";
import { Conversation } from "./pub/scenes/Conversation";
import { Intentions as PubIntentions } from "./pub/scenes/Intentions";
import { Marque } from "./pub/scenes/Marque";
import { Soirees as PubSoirees } from "./pub/scenes/Soirees";
import { Ville } from "./pub/scenes/Ville";
import { Cloture } from "./scenes/Cloture";
import { Intentions } from "./scenes/Intentions";
import { Match } from "./scenes/Match";
import { Ouverture } from "./scenes/Ouverture";
import { Soirees } from "./scenes/Soirees";

// Trois sorties du même montage, plus une vidéo paramétrée.
//
// TeaserReseaux    1080x1920  20 s  Instagram, TikTok, Facebook. Avec appel.
// ApercuPlayStore  1080x1920  20 s  App preview Google Play. Sans appel.
// ApercuAppStore    886x1920  20 s  App preview App Store, recadré. Sans appel.
// CarteMatch       1080x1920   6 s  Vidéo personnalisée, rendue côté serveur.
//
// Les scènes sont aussi enregistrées une à une dans le dossier « Scenes » :
// double-cliquer une séquence du montage dans le Studio y amène directement.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* La pub réseaux, 30 s : la sortie principale. Voir src/pub/Pub.tsx. */}
      <Composition
        id="PubReseaux"
        component={Pub}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ disponible: false, musique: "" }}
      />
      <Folder name="Pub-Scenes">
        <Composition id="Pub-Accroche" component={Accroche} durationInFrames={105} fps={30} width={1080} height={1920} />
        <Composition id="Pub-Marque" component={Marque} durationInFrames={90} fps={30} width={1080} height={1920} />
        <Composition id="Pub-Intentions" component={PubIntentions} durationInFrames={150} fps={30} width={1080} height={1920} />
        <Composition id="Pub-Ville" component={Ville} durationInFrames={120} fps={30} width={1080} height={1920} />
        <Composition id="Pub-Conversation" component={Conversation} durationInFrames={150} fps={30} width={1080} height={1920} />
        <Composition id="Pub-Confiance" component={Confiance} durationInFrames={105} fps={30} width={1080} height={1920} />
        <Composition id="Pub-Soirees" component={PubSoirees} durationInFrames={105} fps={30} width={1080} height={1920} />
        <Composition
          id="Pub-Appel"
          component={Appel}
          durationInFrames={159}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ disponible: false }}
        />
      </Folder>

      <Composition
        id="TeaserReseaux"
        component={Montage}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ appel: true }}
      />
      <Composition
        id="ApercuPlayStore"
        component={Montage}
        durationInFrames={600}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ appel: false }}
      />
      <Composition
        id="ApercuAppStore"
        component={ApercuAppStore}
        durationInFrames={600}
        fps={30}
        width={886}
        height={1920}
      />
      <Composition
        id="CarteMatch"
        component={CarteMatch}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        schema={carteMatchSchema}
        defaultProps={{
          prenomA: "Grâce",
          prenomB: "Yannick",
          ville: "Kinshasa",
          date: "27 août 2026",
        }}
      />

      {/* Remotion impose a-z A-Z 0-9 et le tiret dans un nom de dossier :
          pas d'accent ici, contrairement aux noms de séquences. */}
      <Folder name="Scenes">
        <Composition
          id="Scene-Ouverture"
          component={Ouverture}
          durationInFrames={90}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="Scene-Intentions"
          component={Intentions}
          durationInFrames={150}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="Scene-Match"
          component={Match}
          durationInFrames={150}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="Scene-Soirees"
          component={Soirees}
          durationInFrames={135}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="Scene-Cloture"
          component={Cloture}
          durationInFrames={135}
          fps={30}
          width={1080}
          height={1920}
          defaultProps={{ appel: true }}
        />
      </Folder>

      {/* Fiche Play Store : images fixes, rendues par
          scripts/rendre-play-store.mjs dans le dossier play-store/. */}
      <Folder name="PlayStore">
        {ECRANS.map((e, i) => (
          <Still
            key={e.capture}
            id={`PlayStore-${i + 1}`}
            component={Ecran}
            schema={ecranSchema}
            width={1080}
            height={1920}
            defaultProps={e}
          />
        ))}
        <Still id="PlayStore-VisuelPrincipal" component={VisuelPrincipal} width={1024} height={500} />
        <Still id="PlayStore-Icone" component={Icone} width={512} height={512} />
        {PLIABLES.map((p, i) => (
          <Still
            key={`pliable-${i}`}
            id={`PlayStore-Pliable-${i + 1}`}
            component={Pliable}
            schema={pliableSchema}
            {...TAILLES[p.format]}
            defaultProps={p}
          />
        ))}
      </Folder>
    </>
  );
};
