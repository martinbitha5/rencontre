import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { Easing, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  deletePhoto,
  getCities,
  getMyPhotos,
  photoUrl,
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
import { detectCity } from '@/utils/cityGeo';
import { haptic } from '@/utils/haptics';
import { pickPhotoMessage, pickProfilePhoto, type PhotoSource } from '@/services/photoPicker';
import { PhotoSourceSheet } from '@/components/PhotoSourceSheet';
import {
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
import type { City, Gender, MyPhoto } from '@/types';
import { styles } from './Onboarding.styles';
import { onIntroDone } from '@/utils/introState';
import type { InputHandle } from '@/utils/useFocusWhenShown';

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
const MIN_AGE = 18;
const MAX_AGE = 100;
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
  const [cities, setCities] = useState<City[]>([]);
  const [cityId, setCityId] = useState<number | null>(null);
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
  const [detectedCity, setDetectedCity] = useState<City | null>(null);
  const detectionStarted = useRef(false);
  // La personne a touché à la ville : la détection de position, si elle
  // répond en retard, ne doit plus écraser son choix.
  const cityTouched = useRef(false);
  const cityConfirmed = useRef(false);
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
    getCities().then(setCities).catch(() => {});
    getMyPhotos().then(setPhotos).catch(() => {});
  }, []);

  useEffect(() => {
    if (step !== 'city' || !cities.length || detectionStarted.current) return;
    detectionStarted.current = true;
    detectCity(cities).then((det) => {
      if (!det) return;
      setDetectedCity(det);
      if (!cityTouched.current) setCityId((current) => current ?? det.id);
    });
  }, [step, cities]);

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

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');

  const citySuggestions = useMemo(() => {
    if (cityId) return [];
    const q = normalize(cityQuery.trim());
    // Rien de tapé : toutes les villes, celle de la position en tête. On
    // choisit d'un toucher, sans avoir à deviner l'orthographe.
    if (q.length < 2) {
      return [...cities].sort((a, b) =>
        a.id === detectedCity?.id ? -1 : b.id === detectedCity?.id ? 1 : 0,
      );
    }
    const isSubsequence = (needle: string, hay: string) => {
      let i = 0;
      for (const ch of hay) if (ch === needle[i]) i++;
      return i === needle.length;
    };
    return cities
      .filter((c) => {
        const n = normalize(c.name);
        return n.includes(q) || (q.length >= 3 && isSubsequence(q, n));
      })
      .slice(0, 6);
  }, [cityQuery, cityId, cities, detectedCity]);

  // Changer de ville : on repart d'un champ vide, la liste complète revient.
  const changeCity = () => {
    cityTouched.current = true;
    setCityId(null);
    setCityQuery('');
  };

  const chosenCity = cities.find((c) => c.id === cityId) ?? null;

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
        if (age !== null && age > MAX_AGE) return 'Vérifie ton année de naissance.';
        return null;
      case 'gender':
        return gender ? null : 'Choisis ton genre.';
      case 'lookingFor':
        return lookingFor ? null : 'Choisis les profils que tu veux voir.';
      case 'goal':
        return goal ? null : 'Choisis ce que tu recherches.';
      case 'city':
        return cityId ? null : 'Choisis ta ville dans la liste.';
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

    if (step === 'city' && detectedCity && cityId !== detectedCity.id && !cityConfirmed.current) {
      Alert.alert(
        'Vérifions ta ville',
        `Ta position indique ${detectedCity.name}, mais tu as choisi ${chosenCity?.name ?? 'une autre ville'}. Laquelle garder ?`,
        [
          {
            text: `Utiliser ${detectedCity.name}`,
            onPress: () => {
              setCityId(detectedCity.id);
              goTo(stepIndex + 1);
            },
          },
          {
            text: `Garder ${chosenCity?.name ?? 'mon choix'}`,
            onPress: () => {
              cityConfirmed.current = true;
              goTo(stepIndex + 1);
            },
          },
        ],
      );
      return;
    }

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
      const uploaded = await uploadPhoto(picked.base64, photos.length);
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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

              {step === 'city' && (
                <>
                  <View style={styles.searchField}>
                    <Ionicons name="search" size={18} color={colors.textMuted} />
                    <TextInput
                      keyboardAppearance={keyboardAppearance}
                      style={styles.searchInput}
                      placeholder="Ta ville"
                      placeholderTextColor={colors.textMuted}
                      value={chosenCity ? chosenCity.name : cityQuery}
                      // Toucher le champ quand une ville est déjà choisie le
                      // vide : on tape directement la nouvelle ville, au lieu
                      // d'ajouter des lettres au bout de l'ancienne.
                      onFocus={() => {
                        if (chosenCity) changeCity();
                      }}
                      onChangeText={(t) => {
                        cityTouched.current = true;
                        setCityId(null);
                        setCityQuery(t);
                      }}
                      autoCorrect={false}
                      autoCapitalize="words"
                    />
                    {(!!chosenCity || cityQuery.length > 0) && (
                      <Pressable
                        hitSlop={10}
                        onPress={changeCity}
                        accessibilityLabel="Effacer la ville"
                      >
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>

                  {citySuggestions.length > 0 && (
                    <View style={styles.cardStack}>
                      {citySuggestions.map((c) => (
                        <OptionCard
                          key={c.id}
                          icon={detectedCity?.id === c.id ? 'navigate' : 'location-outline'}
                          label={c.name}
                          hint={`${c.province}${detectedCity?.id === c.id ? ' · ta position' : ''}`}
                          onPress={() => {
                            cityTouched.current = true;
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
                      Aucune ville trouvée. Zola couvre les grandes villes de la RDC.
                    </Text>
                  )}

                  {!!chosenCity && (
                    <OptionCard
                      icon={detectedCity?.id === chosenCity.id ? 'navigate' : 'location'}
                      label={chosenCity.name}
                      hint={
                        detectedCity?.id === chosenCity.id
                          ? 'Ville confirmée par ta position.'
                          : `${chosenCity.province} · République démocratique du Congo`
                      }
                      selected
                      onPress={changeCity}
                    />
                  )}
                  {!!chosenCity && (
                    <Pressable onPress={changeCity} hitSlop={8} style={styles.changeCity}>
                      <Text style={styles.changeCityText}>Changer de ville</Text>
                    </Pressable>
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
                              <Image
                                source={{ uri: photoUrl(photo.storage_path) }}
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
          {!!error && <Text style={styles.error}>{error}</Text>}
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
              disabled={validateStep() !== null}
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
