import { Appearance, Platform } from 'react-native';

// Identité « Velours » : prune profond, magenta d'accent, rose pâle en voile,
// blanc cassé et noir prune. C'est le langage propre de Dowe — aucune
// référence extérieure. Trois signatures traversent toute l'app : le coin
// signature (un des quatre angles des cartes est plus petit, comme la courbe
// d'une empreinte), le filigrane d'empreinte du logo, et le dégradé de marque
// qui monte du noir prune vers le prune vif.
//
// La règle qui tient toute la palette : le PRUNE porte l'identité (navigation,
// titres, boutons principaux, états actifs), le MAGENTA ne sert qu'à ce qui
// appelle un geste (like, action forte, indicateur), le ROSE PÂLE ne touche
// que les surfaces secondaires et les états sélectionnés. Tout le reste
// respire en blanc cassé. Une couleur forte qui apparaît partout ne signale
// plus rien : si un écran a besoin de trois magentas, c'est l'écran qu'il faut
// revoir, pas la palette.
//
// Deux déclinaisons, claire et sombre. Le choix se fait UNE FOIS au chargement
// du module : les StyleSheet des écrans figent les valeurs à la création, un
// changement de thème passe donc par un rechargement du bundle (voir
// utils/themePreference.ts), jamais par une mutation à chaud.

// Palette officielle, les cinq couleurs de marque. Tout le reste du fichier en
// dérive ; aucune autre teinte identitaire ne doit être inventée ailleurs.
const PRUNE = '#481A46';
const MAGENTA = '#9B3F7A';
const ROSE = '#F1CBDD';
const BLANC_CASSE = '#FAF7F9';
const NOIR_PRUNE = '#171217';

const light = {
  primary: PRUNE, // prune — texte fort, navigation, éléments actifs
  primaryDark: '#331132',
  primaryDeep: '#2E0F2D', // titres : prune presque noir
  accent: MAGENTA, // magenta — like, bouton d'action, coeur du deck
  accentPressed: '#82305F',
  // Voile rose des rares fonds d'en-tête encore dégradés : discret, il se
  // fond dans le blanc cassé au lieu de crier une couleur.
  headerGradFrom: '#F6E2EC',
  headerGradTo: BLANC_CASSE,
  // Or doux : bouton DM et tout ce qui touche à l'économie de pièces. Le
  // troisième ton de la marque, et le seul qui ne soit pas dans la famille
  // prune : une pièce doit se lire comme une valeur, jamais comme un like.
  // Les clés gardent leur nom historique (« purple ») pour ne pas casser les
  // écrans, mais la valeur est dorée.
  purple: '#A8752A',
  purpleDark: '#8A5D1E',
  gold: '#D4AF37',
  background: BLANC_CASSE, // blanc cassé
  surface: 'rgba(72, 26, 70, 0.06)', // voile prune léger : inputs, segments
  card: 'rgba(255, 252, 254, 0.9)',
  cardSolid: '#FFFCFE', // blanc rosé opaque : cartes, barres système
  // Dégradé « voile rose » des cartes mises en avant (solde, incognito,
  // récompenses). C'est là que le rose pâle a le droit d'exister en grand.
  washFrom: ROSE,
  washTo: '#FBF2F7',
  // Rose pâle plein : état sélectionné, badge, petite surface décorative.
  selected: ROSE,
  selectedInk: PRUNE,
  text: NOIR_PRUNE,
  textMuted: '#6B5468',
  textOnPrimary: '#ffffff',
  textOnAccent: '#ffffff',
  danger: '#C2372F',
  success: '#2C8A57',
  border: 'rgba(72, 26, 70, 0.14)',
  inputBg: 'rgba(255, 252, 254, 0.85)',
};

// Le prune est trop sombre pour porter du texte sur fond sombre : en mode
// nuit, l'identité s'éclaircit juste assez pour rester visible sans agresser
// l'oeil.
//
// `primary` tient DEUX rôles à la fois dans l'app : encre (une valeur, une
// icône, un indicateur de chargement posés sur le fond) et aplat (pastille,
// bandeau, avatar de repli qui portent du texte blanc). En clair, le prune
// répond aux deux. En sombre, les deux tirent en sens inverse : une encre
// veut être claire, un aplat qui porte du blanc veut rester soutenu. La
// valeur retenue est le point d'équilibre — 4,2:1 dans les deux sens — plutôt
// qu'un rose pâle qui lirait bien en encre et laisserait du blanc sur blanc
// dans les pastilles. Les titres, eux, sont toujours de l'encre pure : c'est
// `primaryDeep` qui monte au rose clair.
const dark: typeof light = {
  primary: '#B85C93',
  primaryDark: '#A44E82',
  primaryDeep: '#EDBBD7', // titres : rose clair sur fond noir prune
  accent: '#C2478A',
  accentPressed: '#D45C9C',
  headerGradFrom: '#2A1728',
  headerGradTo: NOIR_PRUNE,
  purple: '#DFB362',
  purpleDark: '#C0954A',
  gold: '#E5C25A',
  background: NOIR_PRUNE, // noir prune, jamais un noir pur
  surface: 'rgba(241, 203, 221, 0.07)',
  card: 'rgba(241, 203, 221, 0.10)',
  cardSolid: '#241C24', // prune élevé, opaque
  washFrom: '#3A1B36',
  washTo: '#241624',
  selected: '#4A2145',
  selectedInk: '#EDBBD7',
  text: '#F6EDF3',
  textMuted: '#B39BAE',
  textOnPrimary: '#ffffff',
  textOnAccent: '#ffffff',
  danger: '#F08078',
  success: '#5FC98A',
  border: 'rgba(241, 203, 221, 0.16)',
  inputBg: 'rgba(241, 203, 221, 0.08)',
};

export const isDark = Appearance.getColorScheme() === 'dark';
export const colors = isDark ? dark : light;

// Encres pour les surfaces qui restent CLAIRES quel que soit le thème : le
// bouton blanc des écrans de connexion (posé sur une vidéo sombre), les
// pastilles rondes posées sur les photos, les tampons du deck, la pastille de
// verdict du scan. Leur contenu ne doit surtout pas suivre le thème : `text`
// vaut presque blanc en mode sombre, ce qui donnait du blanc sur blanc.
export const onLight = {
  ink: NOIR_PRUNE,
  danger: '#C2372F',
  success: '#2C8A57',
};

// Le symétrique : les surfaces qui restent SOMBRES quel que soit le thème —
// la vidéo de l'accueil, le dégradé de marque, la feuille de message direct.
// Le magenta y perd trop de lumière pour porter du texte : sur une photo, un
// mot écrit en `accent` se devine au lieu de se lire. C'est le rose clair qui
// tient ce rôle, la même teinte que les titres du mode sombre.
export const onDark = {
  brand: '#EDBBD7',
};

// Fond de marque plein : la seule surface qui se donne entièrement à la
// couleur — l'écran de choix du mode de connexion, et le repli derrière la
// vidéo d'accueil si elle ne charge pas. Contrairement à `primary`, elle
// reste PROFONDE dans les deux thèmes : c'est un fond qui porte du texte
// clair, jamais une encre. Sans ce jeton, le mode sombre repeignait ces deux
// écrans en rose pâle sur toute leur hauteur, texte blanc compris.
export const brandSurface = isDark ? '#3A1436' : PRUNE;

// Dégradé de marque : la montée du noir prune vers le prune vif. C'est le fond
// de l'intro, de l'écran de chargement, de l'accueil d'onboarding et de la
// feuille de message direct. Une seule définition pour que ces quatre surfaces
// ne dérivent jamais l'une de l'autre.
export const brandRamp = [NOIR_PRUNE, '#2F1130', '#6E2A63'] as const;

// Voile posé sur les photos de profil pour que le texte blanc reste lisible
// par-dessus. Teinté noir prune plutôt que noir neutre : la photo entre dans
// la marque au lieu d'être simplement assombrie.
export const photoScrim = ['transparent', 'rgba(23, 18, 23, 0.48)', 'rgba(23, 18, 23, 0.86)'] as const;

// L'app parle la langue de sa plateforme : Liquid Glass sur iOS (verre, flou,
// profondeur), Material 3 sur Android (surfaces toniques, ripple, formes M3).
// Même marque, mêmes couleurs, deux grammaires. Le web suit la branche
// Material : c'est la grammaire qui se dégrade le mieux sans flou natif.
export const isIOS = Platform.OS === 'ios';

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

// Rayons par plateforme : courbes généreuses du verre iOS, échelle de formes
// Material sur Android (small 8, medium 12, extra-large 28).
export const radius = isIOS
  ? { sm: 14, md: 20, lg: 28, full: 999 }
  : { sm: 8, md: 12, lg: 28, full: 999 };

// Coin signature : sur les cartes et boutons Velours, un des quatre angles
// (en bas à droite) est nettement plus petit que les autres — la découpe qui
// rend une carte Dowe reconnaissable entre mille. À poser via
// borderBottomRightRadius sur un conteneur déjà arrondi.
export const sigCorner = 10;

// Rôles de couleur Material 3, dérivés de la palette Velours. Utilisés
// uniquement par la branche Android des composants ; iOS reste sur les
// translucides. `secondaryContainer` porte la pilule de l'onglet actif : c'est
// le rose pâle en état sélectionné, exactement son rôle.
const m3Light = {
  surfaceContainerLowest: '#FFFCFE',
  surfaceContainerLow: '#F8F0F5',
  surfaceContainer: '#F2E5EE',
  surfaceContainerHigh: '#EBD8E5',
  primaryContainer: ROSE,
  onPrimaryContainer: PRUNE,
  secondaryContainer: ROSE,
  onSecondaryContainer: PRUNE,
  outline: 'rgba(72, 26, 70, 0.42)',
  outlineVariant: 'rgba(72, 26, 70, 0.16)',
  ripple: 'rgba(72, 26, 70, 0.12)',
  rippleOnPrimary: 'rgba(255, 255, 255, 0.22)',
};

const m3Dark: typeof m3Light = {
  surfaceContainerLowest: '#120E12',
  surfaceContainerLow: '#1D161D',
  surfaceContainer: '#241C24',
  surfaceContainerHigh: '#2E232E',
  primaryContainer: '#5A2456',
  onPrimaryContainer: ROSE,
  secondaryContainer: '#3A1B36',
  onSecondaryContainer: '#EDBBD7',
  outline: 'rgba(237, 187, 215, 0.45)',
  outlineVariant: 'rgba(237, 187, 215, 0.18)',
  ripple: 'rgba(206, 133, 175, 0.16)',
  rippleOnPrimary: 'rgba(255, 255, 255, 0.24)',
};

export const m3 = isDark ? m3Dark : m3Light;

// Tokens du verre iOS : teinte posée sur le flou, et reflet spéculaire (bord
// haut plus clair) qui donne l'épaisseur du verre.
export const glass = isDark
  ? {
      tint: 'rgba(23, 18, 23, 0.52)',
      tintStrong: 'rgba(23, 18, 23, 0.72)',
      highlight: 'rgba(241, 203, 221, 0.28)',
      border: 'rgba(241, 203, 221, 0.16)',
    }
  : {
      tint: 'rgba(255, 252, 254, 0.5)',
      tintStrong: 'rgba(255, 252, 254, 0.72)',
      highlight: 'rgba(255, 255, 255, 0.95)',
      border: 'rgba(255, 255, 255, 0.55)',
    };

// Échelle d'élévation unique pour toute l'app : même lumière partout, teintée
// prune pour rester dans la palette. Une ombre grise sur un fond rosé grise
// aussi le fond ; une ombre prune l'assombrit sans le désaturer. `card` pour
// les surfaces posées (cartes, listes), `floating` pour ce qui flotte (barres
// fixes, boutons, modales).
export const shadows = {
  card: {
    shadowColor: isDark ? '#000000' : PRUNE,
    shadowOpacity: isDark ? 0.35 : 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: isDark ? '#000000' : PRUNE,
    shadowOpacity: isDark ? 0.5 : 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;
