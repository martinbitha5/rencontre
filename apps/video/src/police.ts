import { loadFont } from "@remotion/google-fonts/Inter";

// L'app mobile n'embarque aucune police : elle laisse chaque plateforme
// afficher la sienne (SF Pro sur iOS, Roboto sur Android). Une vidéo n'a pas
// ce luxe : le rendu se fait dans un Chrome sans interface, sur une machine
// dont on ne connaît pas les polices installées. Inter est retenue parce
// qu'elle est la plus proche de ces deux grotesques système, et parce qu'elle
// est embarquée par le rendu : le fichier de sortie est identique quelle que
// soit la machine.
//
// Si la marque adopte un jour une police propre, c'est le seul fichier à
// changer.
export const { fontFamily } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});
