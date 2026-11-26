import { Appearance, Platform } from 'react-native';

// Couleurs de Zola : exactement celles du site public (apps/web/public/theme.css),
// pour que l'app et le site se reconnaissent au premier coup d'oeil
// (demande du 25/11/2026, qui remplace la palette « Velours » prune).
//
//   accent        #fd267a   rose de marque : boutons, like, états actifs
//   accent hover  #e6175f   appui
//   flamme        #fd267a -> #ff6036   dégradé rose vers orange (--flame)
//   rose pâle     #ffe1ea   pastilles d'icônes, sélection (--accent-soft)
//   rose voile    #fff1f5   fonds de section doux de l'accueil du site
//   texte         #24262a   corps de texte
//   titres        #101113   titres et fonds sombres (--heading, --dark)
//   gris          #656a78   texte secondaire (--muted)
//   lignes        #e7e9ee   bordures (--line)
//   fond doux     #f0f1f4   champs, segments (--bg-soft)
//
// Le rose ne sert qu'à ce qui appelle un geste ou signale un état actif. Tout
// le reste respire en blanc, comme sur le site.
//
// Deux déclinaisons, claire et sombre. Le choix se fait UNE FOIS au chargement
// du module : les StyleSheet des écrans figent les valeurs à la création, un
// changement de thème passe donc par un rechargement du bundle (voir
// utils/themePreference.ts), jamais par une mutation à chaud.

const ROSE = '#fd267a';
const ROSE_HOVER = '#e6175f';
const ORANGE = '#ff6036';
const ROSE_PALE = '#ffe1ea';
const ROSE_VOILE = '#fff1f5';
const ENCRE = '#24262a';
const NOIR = '#101113';
const GRIS = '#656a78';
const LIGNE = '#e7e9ee';
const FOND_DOUX = '#f0f1f4';

// Dégradé signature du site (--flame) : boutons forts, anneaux, cartes vedettes.
export const flame = [ROSE, ORANGE] as const;

const light = {
  primary: ROSE, // boutons, navigation active, indicateurs
  primaryDark: ROSE_HOVER,
  primaryDeep: NOIR, // titres
  accent: ROSE, // like, bouton d'action
  accentPressed: ROSE_HOVER,
  // Voile rose des rares fonds d'en-tête dégradés : le rose doux du site.
  headerGradFrom: ROSE_VOILE,
  headerGradTo: '#ffffff',
  // Ambre : tout ce qui touche à l'économie de pièces (masquée tant que le
  // paiement est désactivé). Les clés gardent leur nom historique.
  purple: '#A8752A',
  purpleDark: '#8A5D1E',
  gold: '#D4AF37',
  background: '#ffffff',
  surface: FOND_DOUX, // champs, segments
  card: 'rgba(255, 255, 255, 0.92)',
  cardSolid: '#ffffff',
  // Dégradé des cartes mises en avant : rose pâle vers rose voile.
  washFrom: ROSE_PALE,
  washTo: ROSE_VOILE,
  selected: ROSE_PALE,
  selectedInk: ROSE_HOVER,
  text: ENCRE,
  textMuted: GRIS,
  textOnPrimary: '#ffffff',
  textOnAccent: '#ffffff',
  danger: '#dc2626',
  success: '#16a34a',
  border: LIGNE,
  inputBg: '#f9f9fb', // fond des cartes du site
};

// Mode sombre : le fond sombre du pied de page du site (#101113), le même rose.
// Le rose garde ses deux rôles (encre posée sur le fond, aplat qui porte du
// blanc) : #fd267a tient environ 5:1 sur #101113 et porte le blanc comme sur
// les boutons du site.
const dark: typeof light = {
  primary: ROSE,
  primaryDark: ROSE_HOVER,
  primaryDeep: '#ffffff', // titres
  accent: '#ff3d8b',
  accentPressed: ROSE,
  headerGradFrom: '#2a1019',
  headerGradTo: NOIR,
  purple: '#DFB362',
  purpleDark: '#C0954A',
  gold: '#E5C25A',
  background: NOIR,
  surface: 'rgba(255, 255, 255, 0.07)',
  card: 'rgba(255, 255, 255, 0.08)',
  cardSolid: '#1b1c20',
  washFrom: '#3a1424',
  washTo: '#1f1418',
  selected: '#3a1424',
  selectedInk: '#ff8fb5',
  text: '#f3f4f6',
  textMuted: '#9ca3af',
  textOnPrimary: '#ffffff',
  textOnAccent: '#ffffff',
  danger: '#f87171',
  success: '#4ade80',
  border: 'rgba(255, 255, 255, 0.12)',
  inputBg: 'rgba(255, 255, 255, 0.06)',
};

export const isDark = Appearance.getColorScheme() === 'dark';
export const colors = isDark ? dark : light;

// Clavier iOS accordé au thème : sans ça, un clavier blanc s'ouvrait sur les
// écrans sombres. À poser sur chaque TextInput (Android suit le système).
export const keyboardAppearance: 'dark' | 'light' = isDark ? 'dark' : 'light';

// Encres pour les surfaces qui restent CLAIRES quel que soit le thème : le
// bouton blanc des écrans de connexion (posé sur une vidéo sombre), les
// pastilles rondes posées sur les photos, les tampons du deck, la pastille de
// verdict du scan. Leur contenu ne doit surtout pas suivre le thème : `text`
// vaut presque blanc en mode sombre, ce qui donnait du blanc sur blanc.
export const onLight = {
  ink: NOIR,
  danger: '#dc2626',
  success: '#16a34a',
};

// Le symétrique : les surfaces qui restent SOMBRES quel que soit le thème —
// la vidéo de l'accueil, le dégradé de marque, la feuille de message direct.
// Le magenta y perd trop de lumière pour porter du texte : sur une photo, un
// mot écrit en `accent` se devine au lieu de se lire. C'est le rose clair qui
// tient ce rôle, la même teinte que les titres du mode sombre.
export const onDark = {
  brand: '#ff5c95',
};

// Fond de marque plein : la seule surface qui se donne entièrement à la
// couleur — l'écran de choix du mode de connexion, et le repli derrière la
// vidéo d'accueil si elle ne charge pas. Contrairement à `primary`, elle
// reste PROFONDE dans les deux thèmes : c'est un fond qui porte du texte
// clair, jamais une encre. Sans ce jeton, le mode sombre repeignait ces deux
// écrans en rose pâle sur toute leur hauteur, texte blanc compris.
export const brandSurface = NOIR;

// Dégradé de marque : le noir du site qui chauffe vers un rose profond. C'est le fond
// de l'intro, de l'écran de chargement, de l'accueil d'onboarding et de la
// feuille de message direct. Une seule définition pour que ces quatre surfaces
// ne dérivent jamais l'une de l'autre.
export const brandRamp = [NOIR, '#1d1015', '#3a0f22'] as const;

// Voile posé sur les photos de profil pour que le texte blanc reste lisible
// par-dessus. Même noir que les voiles du site, posé en dégradé : la photo entre dans
// la marque au lieu d'être simplement assombrie.
export const photoScrim = [
  'transparent',
  'rgba(16, 17, 19, 0.48)',
  'rgba(16, 17, 19, 0.86)',
] as const;

// L'app parle la langue de sa plateforme : Liquid Glass sur iOS (verre, flou,
// profondeur), Material 3 sur Android (surfaces toniques, ripple, formes M3).
// Même marque, mêmes couleurs, deux grammaires. Le web suit la branche
// Material : c'est la grammaire qui se dégrade le mieux sans flou natif.
export const isIOS = Platform.OS === 'ios';

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

// Mouvement : un seul rythme pour toute l'app. Une animation qui ne pioche pas
// ici jure avec le reste. La sortie est plus rapide que l'entrée (~65 %) :
// ce qui part ne doit jamais faire attendre ce qui arrive.
export const motion = {
  duration: { instant: 100, fast: 180, base: 260, slow: 420, exit: 170 },
  // Ressorts préférés aux courbes pour tout ce qui suit le doigt.
  spring: {
    // Retour d'appui : vif, sans rebond visible.
    snappy: { damping: 26, stiffness: 420, mass: 0.7 },
    // Changement d'état (sélection, coche, pastille).
    base: { damping: 18, stiffness: 260, mass: 0.9 },
    // Grandes entrées (feuilles, héros).
    gentle: { damping: 22, stiffness: 140, mass: 1.1 },
  },
  // Échelle sous le doigt. Jamais de translation : ça décale les voisins.
  pressScale: 0.97,
  // Cascade d'entrée de liste : 40 ms par élément, plafonnée à 8.
  stagger: (index: number) => Math.min(index, 8) * 40,
} as const;

// Rayons par plateforme : courbes généreuses du verre iOS, échelle de formes
// Material sur Android (small 8, medium 12, extra-large 28).
export const radius = isIOS
  ? { sm: 14, md: 20, lg: 28, full: 999 }
  : { sm: 8, md: 12, lg: 28, full: 999 };

// Coin signature : sur les cartes et boutons, un des quatre angles
// (en bas à droite) est nettement plus petit que les autres — la découpe qui
// rend une carte Zola reconnaissable entre mille. À poser via
// borderBottomRightRadius sur un conteneur déjà arrondi.
export const sigCorner = 10;

// Rôles de couleur Material 3, dérivés de la palette du site. Utilisés
// uniquement par la branche Android des composants ; iOS reste sur les
// translucides. `secondaryContainer` porte la pilule de l'onglet actif : c'est
// le rose pâle en état sélectionné, exactement son rôle.
const m3Light = {
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f9f9fb',
  surfaceContainer: FOND_DOUX,
  surfaceContainerHigh: LIGNE,
  primaryContainer: ROSE_PALE,
  onPrimaryContainer: ROSE_HOVER,
  secondaryContainer: ROSE_PALE,
  onSecondaryContainer: ROSE_HOVER,
  outline: 'rgba(16, 17, 19, 0.38)',
  outlineVariant: LIGNE,
  ripple: 'rgba(253, 38, 122, 0.12)',
  rippleOnPrimary: 'rgba(255, 255, 255, 0.22)',
};

const m3Dark: typeof m3Light = {
  surfaceContainerLowest: '#0b0c0d',
  surfaceContainerLow: '#16171a',
  surfaceContainer: '#1b1c20',
  surfaceContainerHigh: '#25262b',
  primaryContainer: '#5a0f2e',
  onPrimaryContainer: ROSE_PALE,
  secondaryContainer: '#3a1424',
  onSecondaryContainer: '#ff8fb5',
  outline: 'rgba(255, 255, 255, 0.38)',
  outlineVariant: 'rgba(255, 255, 255, 0.14)',
  ripple: 'rgba(253, 38, 122, 0.18)',
  rippleOnPrimary: 'rgba(255, 255, 255, 0.24)',
};

export const m3 = isDark ? m3Dark : m3Light;

// Tokens du verre iOS : teinte posée sur le flou, et reflet spéculaire (bord
// haut plus clair) qui donne l'épaisseur du verre.
export const glass = isDark
  ? {
      tint: 'rgba(16, 17, 19, 0.52)',
      tintStrong: 'rgba(16, 17, 19, 0.72)',
      highlight: 'rgba(255, 255, 255, 0.22)',
      border: 'rgba(255, 255, 255, 0.14)',
    }
  : {
      tint: 'rgba(255, 255, 255, 0.5)',
      tintStrong: 'rgba(255, 255, 255, 0.72)',
      highlight: 'rgba(255, 255, 255, 0.95)',
      border: 'rgba(255, 255, 255, 0.55)',
    };

// Échelle d'élévation unique pour toute l'app : même lumière partout, teintée
// avec le noir du site. `card` pour
// les surfaces posées (cartes, listes), `floating` pour ce qui flotte (barres
// fixes, boutons, modales).
export const shadows = {
  card: {
    shadowColor: isDark ? '#000000' : NOIR,
    shadowOpacity: isDark ? 0.35 : 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: isDark ? '#000000' : NOIR,
    shadowOpacity: isDark ? 0.5 : 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;
