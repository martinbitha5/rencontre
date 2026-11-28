import { Ionicons } from '@expo/vector-icons';

import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from '@/components/keyboard';
import Animated, { Easing, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  deletePhoto,
  getCities,
  getMyPhotos,
  updateMyProfile,
  uploadPhoto,
} from '@/services/api';
import {
  BounceChip,
  ChoiceTile,
  FocusLine,
  GradientButton,
  HeightSlider,
  OnboardingHeader,
  OptionCard,
  SkipLink,
  StepBadge,
} from './OnboardingKit';
import { OnboardingWelcome } from './OnboardingWelcome';
import { useAuth } from '@/providers/auth';
import { detectCity, type DetectedPlace } from '@/utils/cityGeo';
import { COUNTRIES, COUNTRY_CODES, countryName } from '@/utils/countries';
import { haptic } from '@/utils/haptics';
import { pickPhotoMessage, pickProfilePhoto, type PhotoSource } from '@/services/photoPicker';
import { PhotoSourceSheet } from '@/components/PhotoSourceSheet';
import {
  AGE_MAX,
  AGE_MIN,
  EDUCATION_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_OPTIONS,
  goalHint,
  goalIcon,
  HAS_CHILDREN_OPTIONS,
  INTEREST_OPTIONS,
  interestIcon,
  LANGUAGE_OPTIONS,
  RELIGION_OPTIONS,
  WANTS_CHILDREN_OPTIONS,
} from '@/profileOptions';
import { colors, keyboardAppearance, onLight } from '@/theme';
import type { City, CountryCode, Gender, MyPhoto } from '@/types';
import { styles } from './Onboarding.styles';
import { onIntroDone } from '@/utils/introState';
import type { InputHandle } from '@/utils/useFocusWhenShown';
import { Photo } from '@/components/Photo';

// Ce qu'on dit quand la position ne permet pas (encore) de choisir sa ville.
function placeMessage(place: DetectedPlace, chosen: CountryCode | null): string | null {
  switch (place.status) {
    case 'ok':
      return null;
    case 'denied':
      return 'Zola a besoin de ta position pour confirmer ta ville. Sans elle, on ne peut pas continuer.';
    case 'blocked':
      return 'La position est désactivée pour Zola. Autorise-la dans les réglages du téléphone pour confirmer ta ville.';
    case 'unavailable':
      return 'On n’arrive pas à lire ta position. Vérifie que la localisation du téléphone est activée, idéalement près d’une fenêtre, puis réessaie.';
    case 'wrong_country':
      return `Ta position indique que tu es en ${
        place.country ? COUNTRIES[place.country].short : 'un autre pays'
      }, pas en ${chosen ? COUNTRIES[chosen].short : 'ce pays'}. Choisis le pays où tu vis.`;
    case 'outside':
      return 'Zola est ouvert en RDC et au Congo-Brazzaville. Ta position est en dehors de ces deux pays.';
  }
}

// Une question par écran. D'abord ce qui est indispensable pour exister dans
// le deck (jusqu'aux photos), ensuite ce qui remplit la fiche « Plus d'infos ».
// Les étapes de la seconde moitié se passent d'un geste (« Ignorer ») :
// personne ne doit être bloqué, mais un profil vide n'intéresse personne.
const STEPS = [
  'name',
  'birthdate',
  'gender',
  'lookingFor',
  'goal',
  'country',
  'city',
  'photos',
  'height',
  'job',
  'education',
  'smoking',
  'drinking',
  'wantsChildren',
  'hasChildren',
  'religion',
  'languages',
  'interests',
  'bio',
] as const;
type Step = (typeof STEPS)[number];

// Étapes que l'on peut sauter. Les centres d'intérêt n'en font PAS partie :
// ce sont eux qui lancent les conversations.
const OPTIONAL_STEPS: Step[] = [
  'height',
  'job',
  'education',
  'smoking',
  'drinking',
  'wantsChildren',
  'hasChildren',
  'religion',
  'languages',
  'bio',
];

// Nombre minimum de centres d'intérêt à choisir pour continuer.
const MIN_INTERESTS = 5;

// Chaque étape a son icône, son titre et sa ligne d'explication.
const STEP_META: Record<
  Step,
  { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }
> = {
  name: {
    icon: 'person',
    title: "Comment tu t'appelles ?",
    subtitle: "C'est le prénom que les autres verront sur ton profil.",
  },
  birthdate: {
    icon: 'calendar',
    title: 'Quelle est ta date de naissance ?',
    subtitle: 'On affiche seulement ton âge, jamais la date.',
  },
  gender: {
    icon: 'male-female',
    title: 'Quel genre te correspond le mieux ?',
    subtitle: 'Tu pourras le modifier plus tard dans ton profil.',
  },
  lookingFor: {
    icon: 'eye',
    title: 'Quels profils veux-tu voir ?',
    subtitle: 'On te montre les bonnes personnes. Tu pourras changer ta réponse plus tard.',
  },
  goal: {
    icon: 'heart',
    title: 'Que recherches-tu ?',
    subtitle: 'Sois honnête, ça aide à croiser des personnes du même avis. Tu pourras changer à tout moment.',
  },
  country: {
    icon: 'flag',
    title: 'Dans quel pays vis-tu ?',
    subtitle: 'Zola est ouvert en RDC et au Congo-Brazzaville. Tu rencontres les personnes de ton pays.',
  },
  city: {
    icon: 'location',
    title: 'Où vis-tu ?',
    subtitle: 'On te montre les personnes près de chez toi. Ta position exacte reste privée.',
  },
  photos: {
    icon: 'camera',
    title: 'Choisis tes photos',
    subtitle: "Ajoute au moins une photo pour commencer, jusqu'à six.",
  },
  height: {
    icon: 'resize',
    title: 'Combien mesures-tu ?',
    subtitle: 'Affiché sur ta fiche, sous tes photos.',
  },
  job: {
    icon: 'briefcase',
    title: 'Que fais-tu dans la vie ?',
    subtitle: 'Ton métier, ou ce qui occupe tes journées.',
  },
  education: {
    icon: 'school',
    title: "Quel est ton niveau d'études ?",
    subtitle: 'Une info de plus pour faire connaissance.',
  },
  smoking: {
    icon: 'leaf',
    title: 'Est-ce que tu fumes ?',
    subtitle: 'Une réponse claire évite bien des malentendus.',
  },
  drinking: {
    icon: 'wine',
    title: 'Est-ce que tu bois ?',
    subtitle: 'Une réponse claire évite bien des malentendus.',
  },
  wantsChildren: {
    icon: 'happy',
    title: 'Veux-tu des enfants ?',
    subtitle: 'Un sujet qui compte pour beaucoup de monde.',
  },
  hasChildren: {
    icon: 'people',
    title: 'As-tu déjà des enfants ?',
    subtitle: 'Affiché sur ta fiche, si tu le souhaites.',
  },
  religion: {
    icon: 'book',
    title: 'As-tu une religion ?',
    subtitle: 'Pour croiser des personnes qui partagent tes valeurs.',
  },
  languages: {
    icon: 'chatbubbles',
    title: 'Quelles langues parles-tu ?',
    subtitle: 'Choisis-en autant que tu veux.',
  },
  interests: {
    icon: 'color-palette',
    title: "Quels sont tes centres d'intérêt ?",
    subtitle: `Choisis-en au moins ${MIN_INTERESTS}. Ce sont souvent eux qui lancent la conversation.`,
  },
  bio: {
    icon: 'create',
    title: 'Ce qui te rend unique',
    subtitle: 'Quelques mots sur toi, qui donnent envie de répondre.',
  },
};


// Libellés des réponses fermées, à la première personne comme sur la fiche.
const SMOKING_LABELS: Record<string, string> = {
  jamais: 'Non, jamais',
  parfois: "À l'occasion",
  souvent: 'Oui, souvent',
};
const DRINKING_LABELS: Record<string, string> = {
  jamais: 'Jamais',
  parfois: "À l'occasion",
  souvent: 'Souvent',
};
const WANTS_CHILDREN_LABELS: Record<string, string> = {
  oui: "J'aimerais en avoir un jour",
  non: "Je ne veux pas d'enfants",
  peut_etre: 'Je ne sais pas encore',
};
const HAS_CHILDREN_LABELS: Record<string, string> = {
  oui: "Oui, j'ai des enfants",
  non: "Non, je n'en ai pas",
};

const BIO_MAX = 500;
const MAX_PHOTOS = 6;
const MIN_AGE = AGE_MIN;
const MAX_AGE = AGE_MAX;
const HEIGHT_MIN = 100;
const HEIGHT_MAX = 250;

// Les trois cases de la date de naissance.
const DATE_FIELDS = [
  { key: 'day', label: 'Jour', placeholder: 'JJ', max: 2 },
  { key: 'month', label: 'Mois', placeholder: 'MM', max: 2 },
  { key: 'year', label: 'Année', placeholder: 'AAAA', max: 4 },
] as const;

function profileSaveError(e: unknown): string {
  const err = e as { message?: string } | null;
  const msg = err?.message ?? '';
  if (/relationship_goal/.test(msg)) {
    return "Cette intention n'est pas acceptée par le serveur. Choisis-en une autre.";
  }
  if (/birth_date/.test(msg)) return 'Zola est réservé aux 18 ans et plus.';
  if (/display_name/.test(msg)) return 'Ce prénom ne convient pas (1 à 50 caractères).';
  if (/city_id|cities/.test(msg)) return 'Cette ville est introuvable. Choisis-la dans la liste.';
  if (/bio/.test(msg)) return 'Ta bio dépasse 500 caractères.';
  if (/network|fetch|timeout/i.test(msg)) {
    return 'Connexion perdue. Vérifie ton réseau et réessaie.';
  }
  return msg ? `Enregistrement refusé : ${msg}` : "Impossible d'enregistrer le profil. Réessaie.";
}

export default function Onboarding() {
  const { refreshProfile } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  // Prénom : le clavier s'ouvre une fois l'écran posé et l'intro terminée,
  // pas au montage (sur Android, il sortait puis se refermait).
  const nameRef = useRef<InputHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 'form' : le parcours. 'done' : profil enregistré, place à la célébration.
  // La bascule vers l'app ne part que du bouton « Découvrir » de la page de
  // bienvenue : c'est refreshProfile qui fait naviguer la garde de _layout.
  const [phase, setPhase] = useState<'form' | 'done'>('form');

  const [name, setName] = useState('');
  // Date de naissance saisie en trois cases (jour, mois, année), au clavier
  // numérique. Le passage d'une case à la suivante est automatique.
  const [bDay, setBDay] = useState('');
  const [bMonth, setBMonth] = useState('');
  const [bYear, setBYear] = useState('');
  const monthRef = useRef<ComponentRef<typeof TextInput>>(null);
  const yearRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [gender, setGender] = useState<Gender | null>(null);
  const [lookingFor, setLookingFor] = useState<Gender | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  // Le pays d'abord : il décide des seules villes chargées et proposées.
  const [country, setCountry] = useState<CountryCode | null>(null);
  // Liste déroulante des pays, ouverte ou fermée.
  const [countryOpen, setCountryOpen] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [cityId, setCityId] = useState<number | null>(null);
  // Vérification de position, obligatoire pour passer l'étape de la ville.
  // null tant qu'elle n'a pas répondu.
  const [place, setPlace] = useState<DetectedPlace | null>(null);
  const [locating, setLocating] = useState(false);
  // Ce que la personne tape pour chercher sa ville.
  const [cityQuery, setCityQuery] = useState('');
  const [photos, setPhotos] = useState<MyPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [bio, setBio] = useState('');
  // Champs de la fiche détaillée : ils remplissent la section « Plus d'infos »
  // que voyaient vide les nouveaux inscrits.
  const [height, setHeight] = useState('');
  const [job, setJob] = useState('');
  const [education, setEducation] = useState<string | null>(null);
  const [smoking, setSmoking] = useState<string | null>(null);
  const [drinking, setDrinking] = useState<string | null>(null);
  const [hasChildren, setHasChildren] = useState<string | null>(null);
  const [wantsChildren, setWantsChildren] = useState<string | null>(null);
  const [religion, setReligion] = useState<string | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const detectionStarted = useRef(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const step: Step = STEPS[stepIndex];

  useEffect(() => {
    if (step !== 'name') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = onIntroDone(() => {
      timer = setTimeout(() => nameRef.current?.focus(), 450);
    });
    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, [step]);
  const meta = STEP_META[step];

  useEffect(() => {
    getMyPhotos().then(setPhotos).catch(() => {});
  }, []);

  // Changer de pays repart de zéro côté ville : nouvelle liste, nouvelle
  // vérification par la position. Les villes de l'autre pays ne sont jamais
  // chargées.
  const chooseCountry = (code: CountryCode) => {
    if (code === country) return;
    setCities([]);
    setCityId(null);
    setCityQuery('');
    setPlace(null);
    detectionStarted.current = false;
    setCountry(code);
  };

  useEffect(() => {
    if (!country) return;
    let alive = true;
    getCities(country)
      .then((c) => alive && setCities(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [country]);

  // Vérifie la position. La ville la plus proche est retenue d'office ; la
  // personne ne peut choisir que parmi les villes proches de là où elle est.
  const locate = async () => {
    if (!cities.length || locating) return;
    setLocating(true);
    try {
      // La ville n'est pas cochée d'office : la personne la cherche et la
      // choisit, la position sert à vérifier son choix.
      setPlace(await detectCity(cities));
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    if (step !== 'city' || !cities.length || detectionStarted.current) return;
    detectionStarted.current = true;
    void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, cities]);

  // Permission refusée pour de bon : seuls les réglages du téléphone peuvent
  // la rendre. Au retour dans l'app, on revérifie de soi-même.
  useEffect(() => {
    if (step !== 'city' || place?.status !== 'blocked') return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void locate();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, place?.status]);

  // Date valide seulement si les trois cases forment un vrai jour du
  // calendrier (le 31 février est refusé).
  const birthDate = useMemo(() => {
    if (bYear.length !== 4 || !bDay || !bMonth) return null;
    const d = Number(bDay);
    const m = Number(bMonth);
    const y = Number(bYear);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
  }, [bDay, bMonth, bYear]);


  // La ville où se trouve vraiment le téléphone : la plus proche de la
  // position, dans le pays choisi. Seule celle-là est acceptée.
  const positionCity = place?.status === 'ok' ? place.allowed[0] : null;
  const chosenCity = cities.find((c) => c.id === cityId) ?? null;
  // En développement (simulateur, émulateur, téléphone de test hors des deux
  // Congo), toute ville du pays passe pour pouvoir tester l'inscription ;
  // jamais dans l'app publiée.
  const devBypass = __DEV__ && !!place && place.status !== 'ok';
  const cityAllowed = !!chosenCity && (devBypass || chosenCity.id === positionCity?.id);

  // Suggestions sous le champ : rien tant qu'on n'a pas tapé, puis les villes
  // du pays dont le nom commence ou contient ce qui est tapé, accents ignorés.
  const citySuggestions = useMemo(() => {
    if (chosenCity) return [];
    const flat = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
    const q = flat(cityQuery.trim());
    if (!q) return [];
    return cities
      .filter((c) => flat(c.name).includes(q))
      .sort((a, b) => Number(!flat(a.name).startsWith(q)) - Number(!flat(b.name).startsWith(q)))
      .slice(0, 6);
  }, [cityQuery, cities, chosenCity]);

  const age = useMemo(() => {
    if (!birthDate) return null;
    const now = new Date();
    let a = now.getFullYear() - birthDate.getFullYear();
    const mm = now.getMonth() - birthDate.getMonth();
    if (mm < 0 || (mm === 0 && now.getDate() < birthDate.getDate())) a--;
    return a;
  }, [birthDate]);

  const validateStep = (): string | null => {
    switch (step) {
      case 'name':
        return name.trim().length >= 2 ? null : 'Entre ton prénom (2 caractères minimum).';
      case 'birthdate':
        if (!birthDate) return 'Entre une date de naissance valide.';
        if (age !== null && age < MIN_AGE) return 'Zola est réservé aux 18 ans et plus.';
        if (age !== null && age > MAX_AGE) return `Zola est ouvert de ${MIN_AGE} à ${MAX_AGE} ans.`;
        return null;
      case 'gender':
        return gender ? null : 'Choisis ton genre.';
      case 'lookingFor':
        return lookingFor ? null : 'Choisis les profils que tu veux voir.';
      case 'goal':
        return goal ? null : 'Choisis ce que tu recherches.';
      case 'country':
        return country ? null : 'Choisis ton pays.';
      case 'city':
        // Sans position vérifiée, pas de ville : on ne passe pas l'étape. Et
        // seule la ville où l'on se trouve vraiment est acceptée.
        if (locating || !place) return 'On vérifie ta position, un instant.';
        if (!chosenCity) return 'Cherche ta ville et choisis-la dans la liste.';
        if (cityAllowed) return null;
        if (positionCity) {
          return `Ta position indique que tu es à ${positionCity.name}, pas à ${chosenCity.name}. Choisis la ville où tu te trouves.`;
        }
        return placeMessage(place, country) ?? 'Choisis ta ville dans la liste.';
      case 'photos':
        return photos.length >= 1 ? null : 'Ajoute au moins une photo.';
      case 'height': {
        if (height === '') return null;
        const h = Number(height);
        return Number.isFinite(h) && h >= HEIGHT_MIN && h <= HEIGHT_MAX
          ? null
          : 'Indique ta taille en centimètres (100 à 250).';
      }
      case 'interests': {
        const left = MIN_INTERESTS - interests.length;
        return left <= 0
          ? null
          : `Choisis encore ${left} centre${left > 1 ? 's' : ''} d'intérêt.`;
      }
      default:
        // Étapes de complétion : rien n'est exigé.
        return null;
    }
  };

  const goTo = (index: number) => {
    // Le sens du glissement suit le sens de la marche : on avance, la
    // question suivante arrive de la droite ; on revient, de la gauche.
    setDirection(index >= stepIndex ? 1 : -1);
    setStepIndex(index);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const next = async () => {
    const err = validateStep();
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    Keyboard.dismiss();

    if (stepIndex < STEPS.length - 1) {
      haptic.tap();
      goTo(stepIndex + 1);
      return;
    }

    setSaving(true);
    try {
      await updateMyProfile({
        display_name: name.trim(),
        birth_date: `${birthDate!.getFullYear()}-${String(birthDate!.getMonth() + 1).padStart(2, '0')}-${String(birthDate!.getDate()).padStart(2, '0')}`,
        gender,
        looking_for: lookingFor,
        relationship_goal: goal,
        city_id: cityId,
        bio: bio.trim(),
        // Champs de la fiche détaillée : ce qui est resté vide part en null,
        // la fiche masque d'elle-même les lignes sans valeur.
        height_cm: height === '' ? null : Number(height),
        job_title: job.trim() || null,
        education,
        smoking,
        drinking,
        has_children: hasChildren,
        wants_children: wantsChildren,
        religion,
        languages,
        interests,
        is_onboarded: true,
      });
      // Le profil est enregistré : place à la célébration. refreshProfile ne
      // part qu'au « Découvrir » de la page de bienvenue, sinon la garde de
      // navigation nous arracherait l'écran des mains.
      setPhase('done');
    } catch (e) {
      setError(profileSaveError(e));
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (stepIndex > 0) {
      setError(null);
      goTo(stepIndex - 1);
    }
  };

  // Ajout d'une photo : chaque issue a désormais son message, plus aucune
  // sortie muette.
  // Toucher une case vide ouvre d'abord le choix : galerie ou appareil photo.
  const [sourceOpen, setSourceOpen] = useState(false);
  const openPhotoSource = () => {
    if (photos.length >= MAX_PHOTOS || uploading) return;
    setSourceOpen(true);
  };

  const addPhoto = async (source: PhotoSource) => {
    if (photos.length >= MAX_PHOTOS || uploading) return;
    setError(null);
    const picked = await pickProfilePhoto(source);
    if (picked.status !== 'ok') {
      const message = pickPhotoMessage(picked);
      if (message) setError(message);
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadPhoto(picked.base64, photos.length, picked.thumbBase64);
      setPhotos((p) => [...p, uploaded]);
      haptic.tap();
    } catch (e) {
      const detail = (e as { message?: string })?.message ?? '';
      setError(
        /size|large|exceed/i.test(detail)
          ? 'Cette photo est trop lourde. Choisis-en une autre.'
          : `Envoi impossible${detail ? ` : ${detail}` : '. Réessaie.'}`,
      );
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = (photo: MyPhoto) => {
    Alert.alert('Retirer cette photo ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          setPhotos((p) => p.filter((x) => x.id !== photo.id));
          await deletePhoto(photo).catch(() => {});
        },
      },
    ]);
  };

  const isLast = stepIndex === STEPS.length - 1;

  // ------------------------------------------------------------------
  // Profil enregistré : la page de bienvenue prend tout l'écran.
  // ------------------------------------------------------------------
  if (phase === 'done') {
    return <OnboardingWelcome name={name.trim()} onEnter={refreshProfile} />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.container}
      >
        <OnboardingHeader step={stepIndex + 1} total={STEPS.length} onBack={back} />

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            key={step}
            entering={(direction === 1 ? FadeInRight : FadeInLeft).duration(260).easing(Easing.out(Easing.cubic))}
          >
            <View style={styles.titleBlock}>
              <StepBadge icon={meta.icon} />
              <Text style={styles.title}>{meta.title}</Text>
              <Text style={styles.subtitle}>{meta.subtitle}</Text>
            </View>

            <View style={styles.body}>
              {step === 'name' && (
                <View style={styles.nameBlock}>
                  <TextInput
                    keyboardAppearance={keyboardAppearance}
                    style={styles.nameField}
                    placeholder="Ton prénom"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                    maxLength={50}
                    ref={nameRef}
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={next}
                  />
                  <FocusLine active={name.trim().length >= 2} />
                </View>
              )}

              {step === 'birthdate' && (
                <>
                  <View style={styles.dateRow}>
                    {DATE_FIELDS.map((f) => {
                      const value = f.key === 'day' ? bDay : f.key === 'month' ? bMonth : bYear;
                      const set = f.key === 'day' ? setBDay : f.key === 'month' ? setBMonth : setBYear;
                      const ref = f.key === 'month' ? monthRef : f.key === 'year' ? yearRef : undefined;
                      const nextRef = f.key === 'day' ? monthRef : f.key === 'month' ? yearRef : undefined;
                      return (
                        <View key={f.key} style={[styles.dateCol, f.max === 4 && styles.dateColWide]}>
                          <Text style={styles.dateLabel}>{f.label}</Text>
                          <TextInput
                            ref={ref}
                            keyboardAppearance={keyboardAppearance}
                            style={[styles.dateBox, value.length > 0 && styles.dateBoxOn]}
                            value={value}
                            placeholder={f.placeholder}
                            placeholderTextColor={colors.textMuted}
                            keyboardType="number-pad"
                            maxLength={f.max}
                            autoFocus={f.key === 'day'}
                            onChangeText={(t) => {
                              const digits = t.replace(/[^0-9]/g, '');
                              set(digits);
                              if (digits.length === f.max) nextRef?.current?.focus();
                            }}
                          />
                        </View>
                      );
                    })}
                  </View>
                  {birthDate && age !== null && age >= MIN_AGE && age <= MAX_AGE && (
                    <Text style={styles.ageHint}>Tu as {age} ans. On affichera seulement ton âge.</Text>
                  )}
                  <View style={styles.privacyRow}>
                    <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                    <Text style={styles.privacyText}>On ne se sert de cette info pour rien d&apos;autre.</Text>
                  </View>
                </>
              )}

              {step === 'gender' && (
                <View style={styles.pillStack}>
                  <ChoiceTile
                    label="Je suis un homme"
                    selected={gender === 'homme'}
                    onPress={() => setGender('homme')}
                  />
                  <ChoiceTile
                    label="Je suis une femme"
                    selected={gender === 'femme'}
                    onPress={() => setGender('femme')}
                  />
                </View>
              )}

              {step === 'lookingFor' && (
                <View style={styles.cardStack}>
                  <OptionCard
                    label="Je veux voir des profils d'hommes"
                    selected={lookingFor === 'homme'}
                    onPress={() => setLookingFor('homme')}
                  />
                  <OptionCard
                    label="Je veux voir des profils de femmes"
                    selected={lookingFor === 'femme'}
                    onPress={() => setLookingFor('femme')}
                  />
                </View>
              )}

              {step === 'goal' && (
                <View style={styles.cardStack}>
                  {GOAL_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      icon={goalIcon(o.value)}
                      label={o.label}
                      hint={goalHint(o.value)}
                      selected={goal === o.value}
                      onPress={() => setGoal(o.value)}
                    />
                  ))}
                </View>
              )}

              {step === 'country' && (
                <>
                  {/* Sélecteur : fermé, il montre le pays choisi ; ouvert, la
                      liste des pays servis apparaît juste dessous. */}
                  <Pressable
                    style={({ pressed }) => [styles.searchField, pressed && { opacity: 0.8 }]}
                    onPress={() => setCountryOpen((o) => !o)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: countryOpen }}
                    accessibilityLabel={
                      country ? `Pays, ${COUNTRIES[country].name}. Changer` : 'Choisir ton pays'
                    }
                  >
                    {country ? (
                      <Text style={styles.countryFlag}>{COUNTRIES[country].flag}</Text>
                    ) : (
                      <Ionicons name="earth" size={18} color={colors.textMuted} />
                    )}
                    <Text
                      style={[styles.countryValue, !country && { color: colors.textMuted, fontWeight: '400' }]}
                      numberOfLines={1}
                    >
                      {country ? COUNTRIES[country].name : 'Choisis ton pays'}
                    </Text>
                    <Ionicons
                      name={countryOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>

                  {countryOpen && (
                    <View style={styles.cardStack}>
                      {COUNTRY_CODES.map((code) => (
                        <OptionCard
                          key={code}
                          emoji={COUNTRIES[code].flag}
                          label={COUNTRIES[code].name}
                          selected={country === code}
                          onPress={() => {
                            chooseCountry(code);
                            setCountryOpen(false);
                          }}
                        />
                      ))}
                    </View>
                  )}
                </>
              )}

              {step === 'city' && (
                <>
                  {/* On tape sa ville, les suggestions s'affichent dessous, on
                      touche la bonne. La position vérifie le choix : seule la
                      ville où l'on se trouve vraiment est acceptée. */}
                  {chosenCity ? (
                    <OptionCard
                      icon={cityAllowed ? 'checkmark-circle' : 'alert-circle'}
                      label={`${chosenCity.name}, ${countryName(chosenCity.country)}`}
                      hint={
                        cityAllowed
                          ? place?.status === 'ok'
                            ? 'Confirmée par ta position'
                            : chosenCity.province
                          : positionCity
                            ? `Ta position indique ${positionCity.name}`
                            : chosenCity.province
                      }
                      selected={cityAllowed}
                      onPress={() => {
                        setCityId(null);
                        setCityQuery('');
                      }}
                    />
                  ) : (
                    <View style={styles.searchField}>
                      <Ionicons name="search" size={18} color={colors.textMuted} />
                      <TextInput
                        keyboardAppearance={keyboardAppearance}
                        style={styles.searchInput}
                        placeholder="Ta ville"
                        placeholderTextColor={colors.textMuted}
                        value={cityQuery}
                        onChangeText={setCityQuery}
                        autoCorrect={false}
                        autoCapitalize="words"
                        returnKeyType="search"
                      />
                      {cityQuery.length > 0 && (
                        <Pressable
                          hitSlop={10}
                          onPress={() => setCityQuery('')}
                          accessibilityLabel="Effacer"
                        >
                          <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                        </Pressable>
                      )}
                    </View>
                  )}

                  {citySuggestions.length > 0 && (
                    <View style={styles.cardStack}>
                      {citySuggestions.map((c) => (
                        <OptionCard
                          key={c.id}
                          icon="location-outline"
                          label={c.name}
                          hint={`${c.province}, ${countryName(c.country)}`}
                          onPress={() => {
                            setCityId(c.id);
                            setCityQuery(c.name);
                            Keyboard.dismiss();
                          }}
                        />
                      ))}
                    </View>
                  )}

                  {!chosenCity && cityQuery.trim().length >= 2 && citySuggestions.length === 0 && (
                    <Text style={styles.note}>
                      Aucune ville trouvée en {country ? COUNTRIES[country].short : 'ce pays'}.
                    </Text>
                  )}

                  {!!chosenCity && (
                    <Pressable
                      onPress={() => {
                        setCityId(null);
                        setCityQuery('');
                      }}
                      hitSlop={8}
                      style={styles.changeCity}
                    >
                      <Text style={styles.changeCityText}>Changer de ville</Text>
                    </Pressable>
                  )}

                  {/* État de la vérification de position. */}
                  {(locating || !place) && (
                    <View style={styles.privacyRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.privacyText}>On vérifie ta position…</Text>
                    </View>
                  )}

                  {!locating && !!place && place.status !== 'ok' && (
                    <>
                      <Text style={styles.note}>{placeMessage(place, country)}</Text>
                      {place.status === 'wrong_country' && place.country ? (
                        <OptionCard
                          emoji={COUNTRIES[place.country].flag}
                          label={`Passer en ${COUNTRIES[place.country].short}`}
                          hint="Tes villes seront celles de ce pays."
                          onPress={() => place.country && chooseCountry(place.country)}
                        />
                      ) : place.status === 'blocked' ? (
                        <OptionCard
                          icon="settings"
                          label="Ouvrir les réglages"
                          hint="Autorise la position pour Zola, puis reviens ici."
                          onPress={() => Linking.openSettings().catch(() => {})}
                        />
                      ) : place.status !== 'outside' ? (
                        <OptionCard
                          icon="navigate"
                          label={place.status === 'denied' ? 'Autoriser la position' : 'Réessayer'}
                          onPress={() => void locate()}
                        />
                      ) : null}
                      {devBypass && (
                        <Text style={styles.note}>
                          Mode développement, toutes les villes du pays sont acceptées pour tester.
                        </Text>
                      )}
                    </>
                  )}

                  {!locating && place?.status === 'ok' && (
                    <View style={styles.privacyRow}>
                      <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
                      <Text style={styles.privacyText}>
                        Ta ville est vérifiée par ta position et ne pourra plus changer. Ta position
                        exacte n’est jamais enregistrée.
                      </Text>
                    </View>
                  )}
                </>
              )}

              {step === 'photos' && (
                <>
                  <View style={styles.photoGrid}>
                    {Array.from({ length: Math.max(2, Math.min(MAX_PHOTOS, photos.length + 1)) }).map(
                      (_, i) => {
                        const photo = photos[i];
                        if (photo) {
                          return (
                            <View key={photo.id} style={styles.photoCell}>
                              <Photo
                                path={photo.storage_path}
                                style={styles.photoImg}
                                contentFit="cover"
                              />
                              {i === 0 && (
                                <View style={styles.mainTag}>
                                  <Ionicons name="star" size={11} color="#ffffff" />
                                  <Text style={styles.mainTagText}>Principale</Text>
                                </View>
                              )}
                              <Pressable
                                style={styles.photoRemove}
                                onPress={() => removePhoto(photo)}
                                hitSlop={12}
                                accessibilityLabel="Retirer cette photo"
                              >
                                <Ionicons name="close" size={16} color={onLight.ink} />
                              </Pressable>
                            </View>
                          );
                        }
                        const isNext = i === photos.length;
                        return (
                          <Pressable
                            key={`empty-${i}`}
                            style={({ pressed }) => [
                              styles.photoCell,
                              styles.photoEmpty,
                              !isNext && styles.photoEmptyIdle,
                              pressed && { transform: [{ scale: 0.98 }] },
                            ]}
                            onPress={openPhotoSource}
                            disabled={!isNext || uploading}
                            accessibilityLabel="Ajouter une photo"
                          >
                            {isNext && uploading ? (
                              <ActivityIndicator color={colors.primary} />
                            ) : (
                              <>
                                <Ionicons name="camera" size={30} color={colors.textMuted} />
                                <View style={[styles.photoPlus, isNext && styles.photoPlusNext]}>
                                  <Ionicons
                                    name="add"
                                    size={20}
                                    color={isNext ? '#ffffff' : onLight.ink}
                                  />
                                </View>
                              </>
                            )}
                          </Pressable>
                        );
                      },
                    )}
                  </View>
                  <Text style={styles.note}>
                    {uploading
                      ? 'Envoi en cours…'
                      : `${photos.length} photo${photos.length > 1 ? 's' : ''} sur ${MAX_PHOTOS}. La première est ta photo principale.`}
                  </Text>
                </>
              )}

              {step === 'height' && (
                <View style={styles.heightBlock}>
                  <View style={styles.heightReadout}>
                    <Text style={styles.heightValue}>{height === '' ? '-' : `${height} cm`}</Text>
                    {height !== '' && (
                      <Pressable hitSlop={10} onPress={() => setHeight('')}>
                        <Text style={styles.heightClearText}>Effacer</Text>
                      </Pressable>
                    )}
                  </View>
                  <HeightSlider
                    min={HEIGHT_MIN}
                    max={HEIGHT_MAX}
                    value={height === '' ? null : Number(height)}
                    onChange={(v) => setHeight(String(v))}
                  />
                </View>
              )}

              {step === 'job' && (
                <View style={styles.nameBlock}>
                  <TextInput
                    keyboardAppearance={keyboardAppearance}
                    style={styles.lineField}
                    placeholder="Ton métier"
                    placeholderTextColor={colors.textMuted}
                    value={job}
                    onChangeText={setJob}
                    maxLength={80}
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={next}
                  />
                  <FocusLine active={job.trim().length > 0} />
                </View>
              )}

              {step === 'education' && (
                <View style={styles.cardStack}>
                  {EDUCATION_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={o.label}
                      selected={education === o.value}
                      onPress={() => setEducation(education === o.value ? null : o.value)}
                    />
                  ))}
                </View>
              )}

              {step === 'smoking' && (
                <View style={styles.cardStack}>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={SMOKING_LABELS[o.value] ?? o.label}
                      selected={smoking === o.value}
                      onPress={() => setSmoking(smoking === o.value ? null : o.value)}
                    />
                  ))}
                </View>
              )}

              {step === 'drinking' && (
                <View style={styles.cardStack}>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={DRINKING_LABELS[o.value] ?? o.label}
                      selected={drinking === o.value}
                      onPress={() => setDrinking(drinking === o.value ? null : o.value)}
                    />
                  ))}
                </View>
              )}

              {step === 'wantsChildren' && (
                <View style={styles.cardStack}>
                  {WANTS_CHILDREN_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={WANTS_CHILDREN_LABELS[o.value] ?? o.label}
                      selected={wantsChildren === o.value}
                      onPress={() => setWantsChildren(wantsChildren === o.value ? null : o.value)}
                    />
                  ))}
                </View>
              )}

              {step === 'hasChildren' && (
                <View style={styles.cardStack}>
                  {HAS_CHILDREN_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      label={HAS_CHILDREN_LABELS[o.value] ?? o.label}
                      selected={hasChildren === o.value}
                      onPress={() => setHasChildren(hasChildren === o.value ? null : o.value)}
                    />
                  ))}
                </View>
              )}

              {step === 'religion' && (
                <View style={styles.cardStack}>
                  {RELIGION_OPTIONS.map((r) => (
                    <OptionCard
                      key={r}
                      label={r}
                      selected={religion === r}
                      onPress={() => setReligion(religion === r ? null : r)}
                    />
                  ))}
                </View>
              )}

              {step === 'languages' && (
                <View style={styles.cardStack}>
                  {LANGUAGE_OPTIONS.map((l) => (
                    <OptionCard
                      key={l}
                      multi
                      label={l}
                      selected={languages.includes(l)}
                      onPress={() =>
                        setLanguages((prev) =>
                          prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
                        )
                      }
                    />
                  ))}
                </View>
              )}

              {step === 'interests' && (
                <>
                  <Text style={styles.interestCount}>
                    {interests.length >= MIN_INTERESTS
                      ? `${interests.length} choisis, c'est parfait.`
                      : `${interests.length} sur ${MIN_INTERESTS} minimum`}
                  </Text>
                  <View style={styles.chipWrap}>
                    {INTEREST_OPTIONS.map((o) => (
                      <BounceChip
                        key={o}
                        label={o}
                        icon={interestIcon(o)}
                        active={interests.includes(o)}
                        onPress={() =>
                          setInterests((prev) =>
                            prev.includes(o) ? prev.filter((x) => x !== o) : [...prev, o],
                          )
                        }
                      />
                    ))}
                  </View>
                </>
              )}

              {step === 'bio' && (
                <View style={styles.nameBlock}>
                  <TextInput
                    keyboardAppearance={keyboardAppearance}
                    style={styles.bioField}
                    placeholder="Dis-le avec tes propres mots…"
                    placeholderTextColor={colors.textMuted}
                    value={bio}
                    onChangeText={setBio}
                    maxLength={BIO_MAX}
                    multiline
                    textAlignVertical="top"
                  />
                  <FocusLine active={bio.trim().length > 0} />
                  <Text style={styles.bioCount}>{BIO_MAX - bio.length} caractères</Text>
                </View>
              )}
            </View>
          </Animated.View>
        </ScrollView>

        <View style={styles.footer}>
          {/* Le message d'une étape incomplète s'efface de lui-même dès que
              l'étape est remplie ; une erreur d'enregistrement (dernière
              étape) reste affichée. */}
          {!!error && (isLast || validateStep() !== null) && (
            <Text style={styles.error}>{error}</Text>
          )}
          {OPTIONAL_STEPS.includes(step) && !isLast && (
            <SkipLink
              onPress={() => {
                setError(null);
                goTo(stepIndex + 1);
              }}
            />
          )}
          {step === 'photos' && photos.length === 0 ? (
            <GradientButton
              title="Ajouter des photos"
              icon="images"
              onPress={openPhotoSource}
              loading={uploading}
            />
          ) : (
            <GradientButton
              title={isLast ? 'Terminer' : 'Continuer'}
              onPress={next}
              loading={saving}
              // Grisé tant que l'étape est incomplète, mais jamais bloqué :
              // le premier appui passe toujours, et s'il manque quelque
              // chose, next() l'affiche au-dessus du bouton.
              dimmed={validateStep() !== null}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      <PhotoSourceSheet
        visible={sourceOpen}
        onClose={() => setSourceOpen(false)}
        onPick={(source) => void addPhoto(source)}
      />
    </SafeAreaView>
  );
}
