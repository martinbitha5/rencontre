// Listes d'options des champs de profil détaillés + libellés d'affichage.

export interface Option {
  value: string;
  label: string;
}

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

export function labelFor(options: Option[], value: string | null | undefined): string | null {
  if (!value) return null;
  return options.find((o) => o.value === value)?.label ?? value;
}
