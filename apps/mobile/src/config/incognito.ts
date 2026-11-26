import type { Ionicons } from '@expo/vector-icons';

// Ce que le mode Incognito fait RÉELLEMENT aujourd'hui, une seule liste pour
// toute l'app : la feuille d'introduction (avant l'activation, depuis le
// profil) et l'écran d'abonnement (rail payant) lisent la même source. Toute
// ligne ajoutée ici est une promesse faite à quelqu'un qui active le mode, et
// demain à quelqu'un qui le paie : ne rien lister qui ne soit pas déjà
// implémenté et vérifiable côté serveur (migrations 029, 030).
export interface IncognitoPerk {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
}

export const INCOGNITO_PERKS: IncognitoPerk[] = [
  {
    icon: 'eye-off-outline',
    title: 'Deviens invisible',
    text: 'Ton profil sort du fil Rencontres. Personne ne tombe dessus par hasard.',
  },
  {
    icon: 'globe-outline',
    title: 'Cache ton statut en ligne',
    text: "Ta dernière activité n'est plus affichée aux profils qui te découvrent.",
  },
  {
    icon: 'lock-closed-outline',
    title: "Sécurise l'application",
    text: 'Verrouille Zola avec un code secret à l’ouverture.',
  },
  {
    icon: 'compass-outline',
    title: 'Continue à explorer',
    text: 'Tu vois tout le monde et tu écris en premier, sans laisser de trace dans leurs vues.',
  },
];

// Ce que l'incognito NE change PAS : dit noir sur blanc dans la feuille
// d'introduction, pour qu'une personne n'active pas le mode en croyant couper
// ses conversations, ou qu'elle ne s'étonne pas d'être encore vue de ceux à
// qui elle écrit.
export const INCOGNITO_KEEPS: string[] = [
  'Tes matchs et tes conversations continuent normalement.',
  'Les profils que tu likes ou à qui tu écris voient toujours ta fiche.',
  'Tu peux redevenir visible à tout moment depuis ton profil.',
];
