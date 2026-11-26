# Fiche Google Play de Zola

Tout ce qu'il faut pour remplir la fiche dans la Play Console, rubrique
« Présence sur le Play Store », puis « Fiche principale du Play Store ».

## Les images

| Dossier | Fichier | Où le déposer dans la Play Console | Format |
| --- | --- | --- | --- |
| `0-icone` | `icone-512.png` | Icône de l'application | 512 x 512, PNG 32 bits, 218 Ko |
| `1-visuel-principal` | `visuel-principal-1024x500.png` | Image de présentation | 1024 x 500, PNG 24 bits |
| `2-captures-telephone` | `capture-1.png` à `capture-8.png` | Captures d'écran du téléphone, dans cet ordre | 1080 x 1920 (9:16), PNG 24 bits |
| `3-captures-brutes` | les écrans de l'app sans montage | à garder pour d'autres usages (site, réseaux) | 1170 x 2532 |

Ordre des captures, les deux premières sont celles qu'on voit sans faire défiler.

1. Rencontres, « Des Congolais qui cherchent la même chose que toi »
2. Fiche d'un profil, « Découvre la personne avant de liker »
3. Likes reçus, « Vois qui a craqué pour toi »
4. Discussion, « Discute en toute confiance »
5. Message direct, « Ose écrire le premier mot »
6. Intentions, « Dis clairement ce que tu cherches »
7. Ton profil, « Un profil vérifié qui te ressemble »
8. Confidentialité, « Ta vie privée, tes règles »

Le format 9:16 en 1080 x 1920 rend la fiche éligible aux emplacements mis en
avant de Google Play (il faut au moins 4 captures de ce format, il y en a 8).

## Nom de l'application (30 caractères maximum)

Zola Rencontres RDC

## Description courte (80 caractères maximum)

Rencontre des Congolais qui cherchent la même chose que toi, en toute confiance.

## Description complète (4000 caractères maximum)

Zola est l'application de rencontre pensée pour la RDC. Ici, chacun dit clairement ce qu'il cherche, les profils sont vérifiés, et tu restes maître de ta vie privée.

DIS CE QUE TU CHERCHES
Relation sérieuse, mariage, amitié, rien de sérieux ou simplement te laisser surprendre. Ton intention s'affiche sur ton profil, et tu peux filtrer les profils selon la leur. Fini les malentendus.

DES PROFILS VÉRIFIÉS
Pour obtenir le badge bleu, chaque membre prend un selfie en reproduisant un geste tiré au sort. Notre équipe le compare aux photos du profil, puis le selfie est supprimé. Tu sais à qui tu parles.

RENCONTRE PRÈS DE CHEZ TOI
Découvre des profils à Kinshasa, Lubumbashi, Goma et dans les grandes villes du pays. Glisse pour voir toutes les photos, touche la carte pour lire le profil en entier, puis like, passe ou écris directement.

OSE LE PREMIER MOT
Un profil te plaît ? Envoie-lui un message direct, même avant le match. Pas de numéro ni de réseaux sociaux dans le premier message, juste des mots, pour que chacun fasse connaissance en sécurité.

DISCUTE EN TOUTE CONFIANCE
Quand c'est un match, la conversation s'ouvre. Messages, notes vocales, photos et vidéos, tout se passe dans Zola, sans donner ton numéro.

VOIS QUI S'INTÉRESSE À TOI
Retrouve les personnes qui t'ont liké, celles qui ont regardé ton profil et tes favoris. Un like en retour et c'est un match.

ZOLA EN SOIRÉE
Dans une soirée partenaire, scanne le code QR affiché à l'entrée et découvre uniquement les personnes présentes. Les matchs restent, la soirée s'efface à la fin.

TA VIE PRIVÉE, TES RÈGLES
• Mode Invisible, ton profil sort de Rencontres et tu continues à voir tout le monde
• Statut en ligne masquable
• Messages directs réservés aux profils qui correspondent à tes critères
• Code secret pour verrouiller l'application
• Blocage et signalement en un geste, avec une équipe de modération qui traite chaque signalement
• Ton e-mail, ton numéro et ta position exacte ne sont jamais montrés aux autres, seule ta ville apparaît

GRATUIT
Zola est gratuit. Certaines soirées partenaires peuvent avoir une entrée payante, réglée en ligne ou auprès de l'organisateur.

Zola est réservé aux personnes de 18 ans et plus.

Une question, une remarque ? Écris-nous à support@zola-rdc.com ou passe sur zola-rdc.com.

## Catégorie et coordonnées

- Type d'application, Application
- Catégorie, Rencontres
- Adresse e-mail, support@zola-rdc.com
- Site web, https://zola-rdc.com
- Règles de confidentialité, https://zola-rdc.com/confidentialite

## À vérifier avant d'envoyer la fiche

Ces rubriques de la Play Console demandent ta propre déclaration, je ne peux
pas les remplir à ta place.

- Classification du contenu, une application de rencontre est classée pour
  adultes, et le public cible doit être fixé à 18 ans et plus.
- Sécurité des données, l'application traite au moins l'e-mail ou le numéro
  de téléphone, les photos, la ville (position approximative au moment de
  l'inscription), les messages, et le selfie de vérification (supprimé après
  examen). Déclare-les tels qu'ils sont réellement utilisés.
- Accès à l'application, Google demande un compte de test pour examiner une
  application avec connexion. Crée un compte dédié à l'examen.
- Normes de sécurité des enfants, la page
  https://zola-rdc.com/securite-enfants peut servir de lien.

## D'où viennent les images

Les écrans montrés dans les captures sont les vrais écrans de l'application,
rendus par son propre code. Seuls les profils affichés sont des données de
démonstration (prénoms fictifs), avec des photos libres de droit.

- `grace.jpg`, `nadege.jpg`, `yannick.jpg`, licence Pexels,
  https://www.pexels.com/license/ (sources dans `apps/video/README.md`)
- La femme au rire et la femme au bar, ainsi que la photo de couple du visuel
  principal, licence Unsplash, https://unsplash.com/license (sources dans
  `apps/web/public/img/CREDITS.txt` et `apps/mobile/assets/images/CREDITS.txt`)

Les licences Pexels et Unsplash autorisent l'usage commercial. Elles ne
garantissent pas qu'un accord de modèle a été signé et interdisent de laisser
croire qu'une personne photographiée recommande le produit. Les prénoms sont
inventés. Pour une campagne de grande ampleur, le plus sûr reste des photos de
personnes ayant signé une autorisation d'image.

## Refaire les images

Les montages sont faits avec Remotion, dans `apps/video/src/playstore/`.
Après une modification (titre, ordre, couleurs), relancer depuis `apps/video`

```
node scripts/rendre-play-store.mjs
```
