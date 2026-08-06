import { Appearance, Platform } from 'react-native';

// Palette rose « champ de fleurs » : rose franc pour l'action, prune profonde
// pour le texte fort. Les surfaces sont des translucides posés sur le fond :
// c'est ce qui donne l'effet verre dépoli dans toute l'app.
//
// Deux déclinaisons, claire et sombre. Le choix se fait UNE FOIS au chargement
// du module : les StyleSheet des écrans figent les valeurs à la création, un
// changement de thème passe donc par un rechargement du bundle (voir
// lib/theme-preference.ts), jamais par une mutation à chaud.

const light = {
  primary: '#9d174d', // prune rose — texte fort, éléments actifs
  primaryDark: '#831843',
  primaryDeep: '#831843',
  accent: '#db2777', // rose franc — boutons d'action
  accentPressed: '#be185d',
  background: '#fdf2f8', // rose très pâle, visible au travers des surfaces
  surface: 'rgba(255, 255, 255, 0.62)', // verre : cartes secondaires et inputs
  card: 'rgba(255, 255, 255, 0.85)', // verre plus dense : cartes principales
  // Surface OPAQUE : barres système (onglets, headers natifs) où un verre
  // translucide laisserait passer le blanc du fond par défaut.
  cardSolid: '#ffffff',
  // Dégradé « voile rose » des cartes mises en avant (solde, incognito,
  // récompenses). Décliné par thème : un rose pâle codé en dur rendait ces
  // cartes illisibles en sombre.
  washFrom: '#fbcfe8',
  washTo: '#fdeef6',
  text: '#27141c',
  textMuted: '#6d5560',
  textOnPrimary: '#ffffff',
  textOnAccent: '#ffffff',
  danger: '#dc2626',
  success: '#16a34a',
  border: 'rgba(219, 39, 119, 0.16)',
  inputBg: 'rgba(255, 255, 255, 0.72)',
};

const dark: typeof light = {
  primary: '#ec4899', // rose vif — reste l'identité, lisible sur fond sombre
  primaryDark: '#f9a8d4',
  primaryDeep: '#f9a8d4', // titres : rose clair sur fond prune noir
  accent: '#ec4899',
  accentPressed: '#f472b6',
  background: '#1c0b13', // prune presque noire
  surface: 'rgba(255, 255, 255, 0.07)',
  card: 'rgba(255, 255, 255, 0.10)',
  cardSolid: '#2b1420', // prune élevée, opaque
  washFrom: '#45182c',
  washTo: '#2a1120',
  text: '#f7ebf1',
  textMuted: '#b79aa8',
  textOnPrimary: '#ffffff',
  textOnAccent: '#ffffff',
  danger: '#f87171',
  success: '#4ade80',
  border: 'rgba(249, 168, 212, 0.16)',
  inputBg: 'rgba(255, 255, 255, 0.08)',
};

export const isDark = Appearance.getColorScheme() === 'dark';
export const colors = isDark ? dark : light;

// Encres pour les surfaces qui restent CLAIRES quel que soit le thème : le
// bouton blanc des écrans de connexion (posé sur une vidéo sombre), les
// pastilles rondes posées sur les photos, les tampons du deck, la pastille de
// verdict du scan. Leur contenu ne doit surtout pas suivre le thème : `text`
// vaut presque blanc en mode sombre, ce qui donnait du blanc sur blanc.
export const onLight = {
  ink: '#27141c',
  danger: '#dc2626',
  success: '#16a34a',
};

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

// Rôles de couleur Material 3, dérivés de la palette rose. Utilisés uniquement
// par la branche Android des composants ; iOS reste sur les translucides.
const m3Light = {
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#fdf0f6',
  surfaceContainer: '#f9e4ee',
  surfaceContainerHigh: '#f4d9e6',
  primaryContainer: '#fbcfe8',
  onPrimaryContainer: '#831843',
  secondaryContainer: '#fce7f3',
  onSecondaryContainer: '#831843',
  outline: 'rgba(131, 24, 67, 0.42)',
  outlineVariant: 'rgba(131, 24, 67, 0.16)',
  ripple: 'rgba(157, 23, 77, 0.12)',
  rippleOnPrimary: 'rgba(255, 255, 255, 0.22)',
};

const m3Dark: typeof m3Light = {
  surfaceContainerLowest: '#170910',
  surfaceContainerLow: '#221019',
  surfaceContainer: '#2b1420',
  surfaceContainerHigh: '#372030',
  primaryContainer: '#5b1c3a',
  onPrimaryContainer: '#fbcfe8',
  secondaryContainer: '#45182c',
  onSecondaryContainer: '#f9a8d4',
  outline: 'rgba(249, 168, 212, 0.45)',
  outlineVariant: 'rgba(249, 168, 212, 0.18)',
  ripple: 'rgba(244, 114, 182, 0.16)',
  rippleOnPrimary: 'rgba(255, 255, 255, 0.24)',
};

export const m3 = isDark ? m3Dark : m3Light;

// Tokens du verre iOS : teinte posée sur le flou, et reflet spéculaire (bord
// haut plus clair) qui donne l'épaisseur du verre.
export const glass = isDark
  ? {
      tint: 'rgba(28, 11, 19, 0.52)',
      tintStrong: 'rgba(28, 11, 19, 0.72)',
      highlight: 'rgba(249, 168, 212, 0.28)',
      border: 'rgba(249, 168, 212, 0.16)',
    }
  : {
      tint: 'rgba(255, 255, 255, 0.5)',
      tintStrong: 'rgba(255, 255, 255, 0.72)',
      highlight: 'rgba(255, 255, 255, 0.95)',
      border: 'rgba(255, 255, 255, 0.55)',
    };

// Échelle d'élévation unique pour toute l'app : même lumière partout, teintée
// prune pour rester dans la palette. `card` pour les surfaces posées (cartes,
// listes), `floating` pour ce qui flotte (barres fixes, boutons, modales).
export const shadows = {
  card: {
    shadowColor: isDark ? '#000000' : '#831843',
    shadowOpacity: isDark ? 0.35 : 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  floating: {
    shadowColor: isDark ? '#000000' : '#831843',
    shadowOpacity: isDark ? 0.5 : 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;
