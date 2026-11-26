# Zola, atelier vidéo

Atelier vidéo du projet, en [Remotion](https://remotion.dev) : des compositions
React rendues en MP4. Paquet indépendant, il ne partage rien avec
`apps/mobile` ni `apps/web` : ni dépendances, ni build, ni déploiement.

La charte suivie est celle de `apps/mobile/src/theme.ts` (identité « Velours ») :
noir prune `#171217`, prune `#481A46`, magenta `#9B3F7A`, rose pâle `#F1CBDD`,
blanc cassé `#FAF7F9`, et le coin signature en bas à droite des cartes. Les
couleurs sont écrites en clair dans chaque scène plutôt qu'importées d'un
fichier de constantes : c'est ce que demande Remotion pour que le Studio puisse
les modifier visuellement et réécrire le code.

## Compositions

| Identifiant | Format | Durée | Usage |
| --- | --- | --- | --- |
| `PubReseaux` | 1080x1920 | 30 s | **La pub principale** pour Instagram Reels, TikTok, Facebook, YouTube Shorts. Voir la section dédiée plus bas. |
| `TeaserReseaux` | 1080x1920 | 20 s | Teaser court, première version. Se termine par un appel au téléchargement. |
| `ApercuPlayStore` | 1080x1920 | 20 s | Vidéo promotionnelle Google Play. Sans appel au téléchargement. |
| `ApercuAppStore` | 886x1920 | 20 s | App preview App Store. Sans appel au téléchargement. |
| `CarteMatch` | 1080x1920 | 6 s | Vidéo personnalisée, paramétrée, destinée au rendu serveur. |

Les cinq scènes du montage (`Ouverture`, `Intentions`, `Match`, `Soirées`,
`Clôture`) sont aussi enregistrées seules dans le dossier « Scenes » du Studio,
pour les travailler sans rejouer les vingt secondes.

Un seul montage alimente les trois premières : `src/Montage.tsx`. La différence
entre la bande-annonce et les aperçus tient à un booléen, `appel`.

## La pub réseaux (`PubReseaux`)

Huit scènes dans `src/pub/scenes/`, montées dans `src/pub/Pub.tsx` :

| # | Scène | Durée | Ce qu'elle dit |
| --- | --- | --- | --- |
| 1 | Accroche | 3,5 s | « Dans ta ville, quelqu'un cherche la même chose que toi. » Typographie seule, mot à mot. |
| 2 | Marque | 3 s | L'empreinte se dessine ligne à ligne (mêmes tracés que l'intro de l'app), tuile, nom, signature. |
| 3 | Intentions | 5 s | Téléphone en trois quarts sur l'onglet Rencontres, les quatre intentions flottent, le like part. |
| 4 | Ville | 4 s | Roue de douze villes congolaises qui s'arrête sur Kinshasa. « 26 villes de RDC. » |
| 5 | Conversation | 5 s | Écran de match, puis la discussion : message reçu, saisie, réponse, note vocale. |
| 6 | Confiance | 3,5 s | Badge de vérification, puis trois garanties réelles : selfie, modération, signalement. |
| 7 | Soirées | 3,5 s | Billet, viseur, ligne de lecture, « Entrée validée ». |
| 8 | Appel | 5,3 s | « Gratuit. Pour de vrai. », bouton, magasins, zola-rdc.com, mention majeurs. |

Deux réglages dans les `defaultProps` de Root.tsx, modifiables aussi depuis
le panneau de droite du Studio :

- `disponible` (`false`) : le bouton final dit « Bientôt disponible ». Passer
  à `true` le jour de la publication sur les stores, il dira « Télécharge Zola ».
- `musique` (`""`) : nom d'un fichier audio déposé dans `public/`. **Aucune
  piste n'est fournie.** La vidéo est rendue muette ; une pub réseaux sans
  musique perd beaucoup, donc choisir un titre sous licence explicite
  (Artlist, Epidemic Sound, ou une piste libre de droits documentée), le
  déposer sous `public/musique.mp3`, et rendre avec
  `--props="{\"musique\":\"musique.mp3\"}"`. Le montage applique un fondu
  d'entrée de 1 s et un fondu de sortie de 2 s.

Composants propres à la pub, dans `src/pub/components/` : `Telephone`
(maquette d'appareil, écran 520x1128), `EcranRencontres` et `EcranDiscussion`
(les deux écrans de l'app redessinés en thème clair), `Empreinte` (le logo,
animable), `MotsAnimes` (le geste typographique de toute la pub), `Fond`,
`Grain`, `Icones` (tracés SVG, jamais de caractères Unicode).

Tout ce qui est affiché existe dans le produit : vérification par selfie,
équipe de modération, signalement et blocage, soirées par QR, 26 villes en
base, gratuité totale (voir CLAUDE.md, système de paiement désactivé). Si
l'une de ces promesses change, la scène correspondante est à revoir.

Rendu :

```bash
cd apps/video && npx remotion render PubReseaux out/pub-reseaux.mp4
```

Déclinaisons à prévoir si besoin : un 1080x1080 pour le fil Facebook et
Instagram demande une remise en page (les scènes sont dessinées pour le
9:16), ce n'est pas un simple recadrage.

## Commandes

Studio (aperçu interactif, port 3010) :

```bash
cd apps/video && npx remotion studio --no-open --port 3010
```

Une image fixe, pour vérifier une mise en page sans rendre la vidéo entière :

```bash
cd apps/video && npx remotion still TeaserReseaux out/controle.png --frame=150 --scale=0.4
```

Un rendu complet :

```bash
cd apps/video && npx remotion render TeaserReseaux out/teaser.mp4
```

La carte de match, avec ses paramètres :

```bash
cd apps/video && npx remotion render CarteMatch out/carte.mp4 --props="{\"prenomA\":\"Grâce\",\"prenomB\":\"Yannick\",\"ville\":\"Kinshasa\",\"date\":\"27 août 2026\"}"
```

## Deux décisions de conception

**Le recadrage plutôt qu'une seconde mise en page.** Le montage est dessiné
dans un repère 1080x1920. L'aperçu App Store fait 886x1920 : même hauteur,
largeur plus étroite. `ApercuAppStore` recadre donc de 97 px de chaque côté au
lieu de dupliquer le montage. C'est la raison de la règle qui traverse toutes
les scènes : **tout contenu utile reste entre x=180 et x=900**. Après recadrage
il reste 83 px de marge de chaque côté. Une scène qui déborde de cette zone
sera coupée sur l'App Store sans que rien ne prévienne.

**Inter plutôt que la police système.** L'app laisse chaque plateforme afficher
la sienne. Une vidéo est rendue dans un Chrome sans interface, sur une machine
dont on ne connaît pas les polices : Inter est embarquée par le rendu, donc le
fichier de sortie est identique partout. Un seul fichier à changer si la marque
adopte une police propre : `src/police.ts`.

## Visuels

**Teaser (`TeaserReseaux`, `Apercu*`)** : aucune photo de personne, les cartes
portent un dégradé et une initiale (`src/components/ProfileCard.tsx`).

**Pub (`PubReseaux`)** : trois portraits dans `public/personnes/`, tous sous
[licence Pexels](https://www.pexels.com/license/) (usage commercial autorisé,
attribution non obligatoire mais notée ici par honnêteté) :

| Fichier | Personnage | Photographe | Source |
| --- | --- | --- | --- |
| `grace.jpg` | Grâce (carte, match, discussion, vérification) | Jaye Iyanu | https://www.pexels.com/photo/33646629/ |
| `nadege.jpg` | Nadège (carte suivante) | Nicole Benewaah | https://www.pexels.com/photo/31887155/ |
| `yannick.jpg` | Yannick (match) | August de Richelieu | https://www.pexels.com/photo/7432863/ |

Les badges de la clôture, dans `public/badges/`, sont les fichiers officiels
en français, non modifiés : `app-store.svg` vient de l'API de badges Apple
(`tools.applemediaservices.com/api/badges/download-on-the-app-store/black/fr-fr`),
`google-play.png` de `play.google.com/intl/fr_fr/badges/`. Apple et Google
n'autorisent leur usage que pour une app effectivement publiée sur leur
magasin : tant que `disponible` vaut `false`, la vidéo ne doit pas être
diffusée publiquement avec ces badges, ou alors les retirer de `Appel.tsx`.

Les prénoms sont fictifs et n'ont aucun rapport avec les personnes
photographiées. Deux réserves à connaître avant diffusion : la licence Pexels
ne garantit pas qu'un accord de modèle a été signé, et elle interdit de
présenter une personne identifiable sous un jour défavorable ou de laisser
croire qu'elle recommande le produit. Une pub d'app de rencontre est un cas
sensible sur ce second point. Pour être inattaquable, remplacer ces trois
fichiers par des photos de personnes ayant signé une autorisation d'image,
sans rien changer d'autre : les composants lisent `personnes/*.jpg`.

Le motif de la scène « Soirées » ressemble à un QR code mais n'en est pas un :
il n'encode rien et n'est pas scannable. C'est voulu : un code lisible dans une
vidéo publique pointerait vers une URL réelle.

## Publication sur les stores, à vérifier avant de livrer

**App Store.** Apple attend d'un app preview qu'il montre l'application
réellement en fonctionnement, avec des images capturées sur l'appareil. Un
aperçu entièrement composé en motion design s'expose à un refus en revue.
`ApercuAppStore` est donc à considérer comme un habillage, pas comme le livrable
final : la suite normale est d'enregistrer l'écran de l'app sur un vrai iPhone
et d'insérer ces captures dans les scènes (`<Video>` de `@remotion/media`), en
gardant l'ouverture et la clôture. Vérifier aussi la taille exigée dans App
Store Connect selon la classe d'appareil déclarée : 886x1920 est une taille
d'app preview acceptée pour les grands iPhone, mais Apple fait évoluer cette
liste.

**Google Play.** La console ne reçoit pas de fichier vidéo : elle demande une
URL YouTube. `ApercuPlayStore` est donc un fichier à téléverser sur la chaîne
YouTube de Zola, dont on colle ensuite le lien.

Durée : les deux stores tolèrent 15 à 30 s. Vingt secondes tombent bien.

## Rendu serveur

`CarteMatch` est paramétrée par un schéma Zod et rendue par
`scripts/rendre-carte-match.mjs`, qui appelle `@remotion/bundler` et
`@remotion/renderer` depuis Node.

**Rien n'est déployé.** Le script tourne en local, il n'est pas exposé en HTTP
et ne téléverse rien. Trois points restent à trancher avant d'en faire un
service :

1. **Où.** Le rendu a besoin d'un Chrome sans interface et de plusieurs
   centaines de Mo de RAM : une fonction Edge Supabase (Deno, mémoire
   contrainte) ne peut pas l'héberger. Les voies praticables sont Remotion
   Lambda, un conteneur (Cloud Run, Fly, Render), ou un worker sur une machine
   à nous. La fonction Edge, elle, ne fait qu'appeler ce service et suivre
   l'état de la tâche.
2. **La file d'attente.** Un rendu prend des secondes de CPU. Un point d'entrée
   qui rend à la demande, sans file ni quota, s'épuise au premier pic. Prévoir
   une table de tâches et un worker qui les dépile.
3. **Le stockage et les droits.** Une carte de match porte deux prénoms : c'est
   une donnée personnelle. Décider où le fichier atterrit (Supabase Storage,
   bucket privé), qui peut le lire, et au bout de combien de temps il est
   effacé. Ne pas servir ces vidéos depuis une URL publique devinable.

En production, ne pas laisser `bundle()` recompiler à chaque rendu : compiler
une fois au déploiement avec `npx remotion bundle` et pointer `serveUrl` sur le
résultat.

## Licence Remotion

Remotion est gratuit pour les personnes seules et les équipes jusqu'à trois
personnes ; au-delà, une licence d'entreprise est requise
(https://remotion.pro/license). À revoir si l'équipe Zola s'agrandit.
