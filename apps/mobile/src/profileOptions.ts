import type { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
// Listes d'options des champs de profil détaillés + libellés d'affichage.

export interface Option {
  value: string;
  label: string;
}

// Tranche d'âge de Zola : de 18 à 60 ans, pour s'inscrire comme pour filtrer.
// La base applique la même règle (migration 074).
export const AGE_MIN = 18;
export const AGE_MAX = 60;

export const EDUCATION_OPTIONS: Option[] = [
  { value: 'secondaire', label: 'Secondaire' },
  { value: 'universitaire', label: 'Universitaire' },
  { value: 'licence', label: 'Licence' },
  { value: 'master', label: 'Master' },
  { value: 'doctorat', label: 'Doctorat' },
  { value: 'autre', label: 'Autre' },
];

export const GOAL_OPTIONS: Option[] = [
  { value: 'relation_serieuse', label: 'Relation sérieuse' },
  { value: 'mariage', label: 'Mariage' },
  { value: 'amitie', label: 'Amitié' },
  { value: 'rien_de_serieux', label: 'Rien de sérieux' },
  { value: 'je_me_laisse_surprendre', label: 'Je me laisse surprendre' },
];

// Une icône par intention, la même partout (carte du deck, fiche, profil,
// onboarding, filtres) : on reconnaît une intention avant de lire son nom.
const GOAL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  relation_serieuse: 'heart',
  mariage: 'diamond',
  amitie: 'people',
  rien_de_serieux: 'cafe',
  je_me_laisse_surprendre: 'sparkles',
};

// Une phrase par intention, à la première personne : ce qu'elle veut dire.
const GOAL_HINTS: Record<string, string> = {
  relation_serieuse: "J'ai envie d'une histoire qui dure.",
  mariage: 'Je cherche la personne avec qui construire un foyer.',
  amitie: 'Je veux faire de nouvelles connaissances, on verra bien.',
  rien_de_serieux: "J'ai envie de sortir et de passer de bons moments.",
  je_me_laisse_surprendre: 'Pas de plan précis, je laisse venir.',
};

export function goalHint(value: string): string | undefined {
  return GOAL_HINTS[value];
}

export function goalIcon(value: string | null | undefined): keyof typeof Ionicons.glyphMap {
  return (value && GOAL_ICONS[value]) || 'heart';
}

export const HAS_CHILDREN_OPTIONS: Option[] = [
  { value: 'non', label: 'Non' },
  { value: 'oui', label: 'Oui' },
];

export const WANTS_CHILDREN_OPTIONS: Option[] = [
  { value: 'oui', label: 'Oui' },
  { value: 'non', label: 'Non' },
  { value: 'peut_etre', label: 'Peut-être' },
];

export const FREQUENCY_OPTIONS: Option[] = [
  { value: 'jamais', label: 'Jamais' },
  { value: 'parfois', label: 'Parfois' },
  { value: 'souvent', label: 'Souvent' },
];

export const RELIGION_OPTIONS: string[] = [
  'Chrétien(ne)',
  'Catholique',
  'Protestant(e)',
  'Kimbanguiste',
  'Musulman(e)',
  'Autre',
];

export const LANGUAGE_OPTIONS: string[] = [
  'Français',
  'Lingala',
  'Swahili',
  'Tshiluba',
  'Kikongo',
  'Anglais',
];

export const INTEREST_OPTIONS: string[] = [
  'Musique',
  'Gospel',
  'Rumba',
  'Danse',
  'Cuisine',
  'Voyage',
  'Lecture',
  'Cinéma',
  'Séries',
  'Fitness',
  'Football',
  'Basket',
  'Mode',
  'Beauté',
  'Photographie',
  'Art',
  'Tech',
  'Jeux vidéo',
  'Entrepreneuriat',
  'Église',
  'Famille',
  'Brunch',
  'Karaoké',
  'Nature',
];

// Pictogramme de chaque centre d'intérêt (jeu MaterialCommunityIcons) : les
// puces du deck, de la fiche et de l'édition en portent tous un.
type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export const INTEREST_ICON: Record<string, IconName> = {
  Musique: 'music-note',
  Gospel: 'hands-pray',
  Rumba: 'trumpet',
  Danse: 'human-female-dance',
  Cuisine: 'pot-steam-outline',
  Voyage: 'airplane',
  Lecture: 'book-open-variant',
  Cinéma: 'movie-open-outline',
  Séries: 'television-classic',
  Fitness: 'dumbbell',
  Football: 'soccer',
  Basket: 'basketball',
  Mode: 'hanger',
  Beauté: 'lipstick',
  Photographie: 'camera-outline',
  Art: 'palette-outline',
  Tech: 'laptop',
  'Jeux vidéo': 'gamepad-variant-outline',
  Entrepreneuriat: 'briefcase-outline',
  Église: 'church',
  Famille: 'account-group-outline',
  Brunch: 'coffee-outline',
  Karaoké: 'microphone-variant',
  Nature: 'leaf',
};

export function interestIcon(interest: string): IconName {
  return INTEREST_ICON[interest] ?? 'star-four-points-outline';
}

export function labelFor(options: Option[], value: string | null | undefined): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}
