import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  deletePhoto,
  getCities,
  getMyPhotos,
  photoUrl,
  updateMyProfile,
  uploadPhoto,
} from '../api';
import {
  BounceChip,
  ChoiceTile,
  FocusLine,
  GradientButton,
  HeightSlider,
  OnboardingHeader,
  OptionCard,
  SegmentPills,
  StepBadge,
} from '../components/onboarding-kit';
import { OnboardingWelcome } from '../components/OnboardingWelcome';
import { useAuth } from '../lib/auth';
import { detectCity } from '../lib/cityGeo';
import { haptic } from '../lib/haptics';
import { pickPhotoMessage, pickProfilePhoto } from '../lib/photoPicker';
import {
  EDUCATION_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_OPTIONS,
  HAS_CHILDREN_OPTIONS,
  INTEREST_OPTIONS,
  LANGUAGE_OPTIONS,
  RELIGION_OPTIONS,
  WANTS_CHILDREN_OPTIONS,
} from '../profileOptions';
import { colors, radius, shadows, spacing } from '../theme';
import type { City, Gender, MyPhoto } from '../types';

// L'inscription se fait en deux temps : d'abord ce qui est indispensable
// pour exister dans le deck, ensuite ce qui remplit la fiche « Plus d'infos ».
// Les étapes de la seconde moitié se passent d'un geste : personne ne doit
// être bloqué, mais un profil vide n'intéresse personne non plus.
const STEPS = [
  'name',
  'birthdate',
  'gender',
  'goal',
  'city',
  'photos',
  'about',
  'lifestyle',
  'children',
  'background',
  'interests',
  'bio',
] as const;
type Step = (typeof STEPS)[number];

// Étapes que l'on peut sauter : elles enrichissent le profil sans être
// nécessaires au fonctionnement de l'app. Les centres d'intérêt n'en font
// PAS partie : ce sont eux qui lancent les conversations, un profil sans
// aucun centre d'intérêt n'accroche personne.
const OPTIONAL_STEPS: Step[] = ['about', 'lifestyle', 'children', 'background', 'bio'];

// Nombre minimum de centres d'intérêt à choisir pour continuer.
const MIN_INTERESTS = 5;

// Chaque étape a sa personnalité : une icône, un titre, un sous-titre. C'est
// la pastille d'icône qui change d'une question à l'autre et donne le rythme.
const STEP_META: Record<
  Step,
  { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string }
> = {
  name: {
    icon: 'person',
    title: "Comment tu t'appelles ?",
    subtitle: "C'est le prénom que les autres verront.",
  },
  birthdate: {
    icon: 'calendar',
    title: 'Ta date de naissance',
    subtitle: 'Seul ton âge sera affiché sur ton profil.',
  },
  gender: {
    icon: 'male-female',
    title: 'Toi, et qui tu cherches',
    subtitle: 'Ces réponses déterminent les profils qui te seront proposés.',
  },
  goal: {
    icon: 'heart',
    title: 'Ce que tu recherches',
    subtitle: 'Affiché sur ton profil, pour croiser des personnes du même avis.',
  },
  city: {
    icon: 'location',
    title: 'Où vis-tu ?',
    subtitle: 'Ta ville est vérifiée avec ta position.',
  },
  photos: {
    icon: 'camera',
    title: 'Tes photos',
    subtitle: "Au moins une, jusqu'à six. La première est ta photo principale.",
  },
  about: {
    icon: 'briefcase',
    title: 'Ton profil',
    subtitle: 'Ces informations apparaissent sur ta fiche, sous tes photos.',
  },
  lifestyle: {
    icon: 'wine',
    title: 'Ton mode de vie',
    subtitle: 'Tabac et alcool : deux réponses qui évitent bien des malentendus.',
  },
  children: {
    icon: 'people',
    title: 'Les enfants',
    subtitle: 'Un sujet qui compte pour beaucoup de monde, autant être clair.',
  },
  background: {
    icon: 'earth',
    title: 'Religion et langues',
    subtitle: 'Ce qui aide à se comprendre dès le premier message.',
  },
  interests: {
    icon: 'color-palette',
    title: "Tes centres d'intérêt",
    subtitle: 'Choisis ce qui te ressemble : ce sont souvent eux qui lancent la conversation.',
  },
  bio: {
    icon: 'create',
    title: 'Quelques mots sur toi',
    subtitle: 'La touche personnelle qui donne envie de répondre.',
  },
};

// Icône de chaque intention : la carte porte son caractère.
const GOAL_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  relation_serieuse: 'heart',
  mariage: 'diamond',
  amitie: 'people',
  rien_de_serieux: 'happy',
  je_me_laisse_surprendre: 'sparkles',
};

const BIO_MAX = 500;
const MAX_PHOTOS = 6;
const MIN_AGE = 18;
const MAX_AGE = 100;
const HEIGHT_MIN = 100;
const HEIGHT_MAX = 250;

// Bornes de la roue de date : on ne peut pas choisir une date qui donnerait
// moins de 18 ans, la règle est portée par le sélecteur lui-même.
const today = new Date();
const MAX_DATE = new Date(
  today.getFullYear() - MIN_AGE,
  today.getMonth(),
  today.getDate(),
);
const MIN_DATE = new Date(
  today.getFullYear() - MAX_AGE,
  today.getMonth(),
  today.getDate(),
);
// Date d'ouverture de la roue : 25 ans, l'âge médian de l'app.
const DEFAULT_DATE = new Date(today.getFullYear() - 25, today.getMonth(), today.getDate());

const DATE_FMT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function profileSaveError(e: unknown): string {
  const err = e as { message?: string } | null;
  const msg = err?.message ?? '';
  if (/relationship_goal/.test(msg)) {
    return "Cette intention n'est pas acceptée par le serveur. Choisis-en une autre.";
  }
  if (/birth_date/.test(msg)) return 'Dowe est réservé aux 18 ans et plus.';
  if (/display_name/.test(msg)) return 'Ce prénom ne convient pas (1 à 50 caractères).';
  if (/city_id|cities/.test(msg)) return 'Cette ville est introuvable. Choisis-la dans la liste.';
  if (/bio/.test(msg)) return 'Ta bio dépasse 500 caractères.';
  if (/network|fetch|timeout/i.test(msg)) {
    return 'Connexion perdue. Vérifie ton réseau et réessaie.';
  }
  return msg ? `Enregistrement refusé : ${msg}` : "Impossible d'enregistrer le profil. Réessaie.";
}

// Libellé de section à l'intérieur d'une étape (Je suis / Tabac / Religion...).
function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export default function Onboarding() {
  const { refreshProfile } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 'form' : le parcours. 'done' : profil enregistré, place à la célébration.
  // La bascule vers l'app ne part que du bouton « Découvrir » de la page de
  // bienvenue : c'est refreshProfile qui fait naviguer la garde de _layout.
  const [phase, setPhase] = useState<'form' | 'done'>('form');

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
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
  const cityConfirmed = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  const step: Step = STEPS[stepIndex];
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
      setCityId((current) => current ?? det.id);
    });
  }, [step, cities]);

  // Sur iOS la roue est posée dans la page ; sur Android le sélecteur est une
  // boîte de dialogue système qui s'ouvre à la demande.
  useEffect(() => {
    if (step === 'birthdate' && Platform.OS === 'ios') setPickerOpen(true);
  }, [step]);

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');

  const citySuggestions = useMemo(() => {
    if (cityId) return [];
    const q = normalize(cityQuery.trim());
    if (q.length < 2) return [];
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
  }, [cityQuery, cityId, cities]);

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
        if (!birthDate) return 'Choisis ta date de naissance.';
        if (age !== null && age < MIN_AGE) return 'Dowe est réservé aux 18 ans et plus.';
        return null;
      case 'gender':
        return gender && lookingFor ? null : 'Complète les deux réponses.';
      case 'goal':
        return goal ? null : 'Choisis ce que tu recherches.';
      case 'city':
        return cityId ? null : 'Choisis ta ville dans la liste.';
      case 'photos':
        return photos.length >= 1 ? null : 'Ajoute au moins une photo.';
      case 'about': {
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
  const addPhoto = async () => {
    if (photos.length >= MAX_PHOTOS || uploading) return;
    setError(null);
    const picked = await pickProfilePhoto();
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
          <View key={step}>
            <View style={styles.titleBlock}>
              <StepBadge icon={meta.icon} />
              <Text style={styles.title}>{meta.title}</Text>
              <Text style={styles.subtitle}>{meta.subtitle}</Text>
            </View>

            <View style={styles.body}>
              {step === 'name' && (
                <View style={styles.nameBlock}>
                  <TextInput
                    style={styles.nameField}
                    placeholder="Ton prénom"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={setName}
                    maxLength={50}
                    autoFocus
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  <FocusLine active={name.trim().length >= 2} />
                  <Text style={styles.nameHint}>
                    {name.trim().length >= 2
                      ? 'Parfait, ça sonne bien.'
                      : 'Au moins 2 caractères.'}
                  </Text>
                </View>
              )}

              {step === 'birthdate' && (
                <>
                  {/* Roue de date native : on fait défiler jour, mois et année,
                      et la borne des 18 ans est portée par le sélecteur. */}
                  {Platform.OS === 'ios' ? (
                    <View style={styles.wheelCard}>
                      <DateTimePicker
                        value={birthDate ?? DEFAULT_DATE}
                        mode="date"
                        display="spinner"
                        locale="fr-FR"
                        maximumDate={MAX_DATE}
                        minimumDate={MIN_DATE}
                        textColor={colors.text}
                        onChange={(_, d) => d && setBirthDate(d)}
                        style={styles.wheel}
                      />
                    </View>
                  ) : (
                    <>
                      <Pressable
                        style={({ pressed }) => [styles.dateField, pressed && { opacity: 0.85 }]}
                        onPress={() => {
                          haptic.tap();
                          setPickerOpen(true);
                        }}
                      >
                        <Ionicons name="calendar-outline" size={20} color={colors.accent} />
                        <Text style={birthDate ? styles.dateValue : styles.datePlaceholder}>
                          {birthDate ? DATE_FMT.format(birthDate) : 'Choisir ma date'}
                        </Text>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </Pressable>
                      {pickerOpen && (
                        <DateTimePicker
                          value={birthDate ?? DEFAULT_DATE}
                          mode="date"
                          display="spinner"
                          maximumDate={MAX_DATE}
                          minimumDate={MIN_DATE}
                          onChange={(event, d) => {
                            setPickerOpen(false);
                            if (event.type === 'set' && d) setBirthDate(d);
                          }}
                        />
                      )}
                    </>
                  )}

                  {birthDate && age !== null && (
                    <View style={styles.ageRow}>
                      <View style={styles.agePill}>
                        <Text style={styles.agePillText}>{age} ans</Text>
                      </View>
                      <Text style={styles.ageDate}>{DATE_FMT.format(birthDate)}</Text>
                    </View>
                  )}
                </>
              )}

              {step === 'gender' && (
                <>
                  <SectionLabel>Je suis</SectionLabel>
                  <View style={styles.tileRow}>
                    <ChoiceTile
                      icon="male"
                      label="Un homme"
                      selected={gender === 'homme'}
                      onPress={() => setGender('homme')}
                    />
                    <ChoiceTile
                      icon="female"
                      label="Une femme"
                      selected={gender === 'femme'}
                      onPress={() => setGender('femme')}
                    />
                  </View>

                  <SectionLabel>Je recherche</SectionLabel>
                  <View style={styles.tileRow}>
                    <ChoiceTile
                      icon="male"
                      label="Un homme"
                      selected={lookingFor === 'homme'}
                      onPress={() => setLookingFor('homme')}
                    />
                    <ChoiceTile
                      icon="female"
                      label="Une femme"
                      selected={lookingFor === 'femme'}
                      onPress={() => setLookingFor('femme')}
                    />
                  </View>
                </>
              )}

              {step === 'goal' && (
                <View style={styles.cardStack}>
                  {GOAL_OPTIONS.map((o) => (
                    <OptionCard
                      key={o.value}
                      icon={GOAL_ICONS[o.value] ?? 'heart'}
                      label={o.label}
                      selected={goal === o.value}
                      onPress={() => setGoal(o.value)}
                    />
                  ))}
                </View>
              )}

              {step === 'city' && (
                <>
                  <View style={styles.searchField}>
                    <Ionicons name="search" size={18} color={colors.accent} />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Ta ville"
                      placeholderTextColor={colors.textMuted}
                      value={
                        chosenCity
                          ? `${chosenCity.name}, République démocratique du Congo`
                          : cityQuery
                      }
                      onChangeText={(t) => {
                        setCityId(null);
                        setCityQuery(t);
                      }}
                      autoCorrect={false}
                      autoCapitalize="words"
                    />
                    {(!!chosenCity || cityQuery.length > 0) && (
                      <Pressable
                        hitSlop={10}
                        onPress={() => {
                          setCityId(null);
                          setCityQuery('');
                        }}
                      >
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>

                  {citySuggestions.length > 0 && (
                    <View style={styles.cardStack}>
                      {citySuggestions.map((c) => (
                        <Pressable
                          key={c.id}
                          style={({ pressed }) => [
                            styles.cityCard,
                            pressed && { opacity: 0.85 },
                          ]}
                          onPress={() => {
                            haptic.select();
                            setCityId(c.id);
                            setCityQuery(c.name);
                            Keyboard.dismiss();
                          }}
                        >
                          <View style={styles.cityIcon}>
                            <Ionicons
                              name={detectedCity?.id === c.id ? 'navigate' : 'location-outline'}
                              size={16}
                              color={colors.accent}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cityName}>{c.name}</Text>
                            <Text style={styles.cityHint}>
                              {c.province} · République démocratique du Congo
                            </Text>
                          </View>
                          {detectedCity?.id === c.id && (
                            <Text style={styles.cityDetected}>Position</Text>
                          )}
                        </Pressable>
                      ))}
                    </View>
                  )}

                  {!chosenCity && cityQuery.trim().length >= 2 && citySuggestions.length === 0 && (
                    <Text style={styles.note}>
                      Aucune ville trouvée. Dowe couvre les grandes villes de la RDC.
                    </Text>
                  )}

                  {!!chosenCity && (
                    <View style={styles.noteRow}>
                      <Ionicons
                        name={
                          detectedCity?.id === chosenCity.id
                            ? 'shield-checkmark'
                            : 'information-circle-outline'
                        }
                        size={17}
                        color={
                          detectedCity?.id === chosenCity.id ? colors.success : colors.textMuted
                        }
                      />
                      <Text style={styles.note}>
                        {detectedCity?.id === chosenCity.id
                          ? 'Ville confirmée par ta position.'
                          : `${chosenCity.name} · ${chosenCity.province}`}
                      </Text>
                    </View>
                  )}
                </>
              )}

              {step === 'photos' && (
                <>
                  <View style={styles.photoGrid}>
                    {Array.from({ length: MAX_PHOTOS }).map((_, i) => {
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
                                <Ionicons name="star" size={9} color="#ffffff" />
                                <Text style={styles.mainTagText}>Principale</Text>
                              </View>
                            )}
                            <Pressable
                              style={styles.photoRemove}
                              onPress={() => removePhoto(photo)}
                              hitSlop={8}
                            >
                              <Ionicons name="close" size={14} color="#ffffff" />
                            </Pressable>
                          </View>
                        );
                      }
                      const isNext = i === photos.length;
                      return (
                        <View
                          key={`empty-${i}`}
                          style={[styles.photoCell, styles.photoEmpty, isNext && styles.photoNext]}
                        >
                          <Pressable
                            style={styles.photoEmptyPress}
                            onPress={addPhoto}
                            disabled={!isNext || uploading}
                          >
                            {isNext && uploading ? (
                              <Text style={styles.photoUploading}>…</Text>
                            ) : (
                              <Ionicons
                                name="add"
                                size={26}
                                color={isNext ? colors.accent : colors.border}
                              />
                            )}
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                  <View style={styles.photoDots}>
                    {Array.from({ length: MAX_PHOTOS }).map((_, i) => (
                      <View
                        key={i}
                        style={[styles.photoDot, i < photos.length && styles.photoDotOn]}
                      />
                    ))}
                    <Text style={styles.note}>
                      {uploading
                        ? '  Envoi en cours…'
                        : `  ${photos.length} photo${photos.length > 1 ? 's' : ''} sur ${MAX_PHOTOS}`}
                    </Text>
                  </View>
                </>
              )}

              {step === 'about' && (
                <>
                  <SectionLabel>Taille</SectionLabel>
                  <View style={styles.heightCard}>
                    <View style={styles.heightReadout}>
                      <Text style={styles.heightValue}>{height === '' ? '—' : height}</Text>
                      <Text style={styles.heightUnit}> cm</Text>
                      {height !== '' && (
                        <Pressable
                          hitSlop={10}
                          onPress={() => {
                            haptic.tap();
                            setHeight('');
                          }}
                          style={styles.heightClear}
                        >
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
                    <View style={styles.heightBounds}>
                      <Text style={styles.heightBound}>{HEIGHT_MIN} cm</Text>
                      <Text style={styles.heightBound}>{HEIGHT_MAX} cm</Text>
                    </View>
                  </View>

                  <SectionLabel>Profession</SectionLabel>
                  <View style={styles.inputCard}>
                    <Ionicons name="briefcase-outline" size={18} color={colors.accent} />
                    <TextInput
                      style={styles.inputCardField}
                      placeholder="Ton métier"
                      placeholderTextColor={colors.textMuted}
                      value={job}
                      onChangeText={setJob}
                      maxLength={80}
                    />
                  </View>

                  <SectionLabel>Études</SectionLabel>
                  <View style={styles.chipWrap}>
                    {EDUCATION_OPTIONS.map((o) => (
                      <BounceChip
                        key={o.value}
                        label={o.label}
                        active={education === o.value}
                        onPress={() => setEducation(education === o.value ? null : o.value)}
                      />
                    ))}
                  </View>
                </>
              )}

              {step === 'lifestyle' && (
                <>
                  <SectionLabel>Tabac</SectionLabel>
                  <SegmentPills
                    options={FREQUENCY_OPTIONS}
                    value={smoking}
                    onChange={(v) => setSmoking(smoking === v ? null : v)}
                  />

                  <SectionLabel>Alcool</SectionLabel>
                  <SegmentPills
                    options={FREQUENCY_OPTIONS}
                    value={drinking}
                    onChange={(v) => setDrinking(drinking === v ? null : v)}
                  />
                </>
              )}

              {step === 'children' && (
                <>
                  <SectionLabel>{"J'ai des enfants"}</SectionLabel>
                  <View style={styles.tileRow}>
                    {HAS_CHILDREN_OPTIONS.map((o) => (
                      <ChoiceTile
                        key={o.value}
                        icon={o.value === 'oui' ? 'people' : 'person'}
                        label={o.label}
                        selected={hasChildren === o.value}
                        onPress={() => setHasChildren(hasChildren === o.value ? null : o.value)}
                      />
                    ))}
                  </View>

                  <SectionLabel>Je veux des enfants</SectionLabel>
                  <SegmentPills
                    options={WANTS_CHILDREN_OPTIONS}
                    value={wantsChildren}
                    onChange={(v) => setWantsChildren(wantsChildren === v ? null : v)}
                  />
                </>
              )}

              {step === 'background' && (
                <>
                  <SectionLabel>Religion</SectionLabel>
                  <View style={styles.chipWrap}>
                    {RELIGION_OPTIONS.map((r) => (
                      <BounceChip
                        key={r}
                        label={r}
                        active={religion === r}
                        onPress={() => setReligion(religion === r ? null : r)}
                      />
                    ))}
                  </View>

                  <SectionLabel>Langues parlées</SectionLabel>
                  <View style={styles.chipWrap}>
                    {LANGUAGE_OPTIONS.map((l) => (
                      <BounceChip
                        key={l}
                        label={l}
                        active={languages.includes(l)}
                        onPress={() =>
                          setLanguages((prev) =>
                            prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
                          )
                        }
                      />
                    ))}
                  </View>
                </>
              )}

              {step === 'interests' && (
                <>
                  {/* Compteur : il passe au vert quand le minimum est atteint. */}
                  <View style={styles.interestHead}>
                    {interests.length >= MIN_INTERESTS ? (
                      <View style={[styles.countPill, styles.countPillDone]}>
                        <Ionicons name="checkmark" size={14} color="#ffffff" />
                        <Text style={styles.countPillDoneText}>
                          {interests.length} {"choisis, c'est parfait"}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.countPill}>
                        <Text style={styles.countPillText}>
                          {interests.length}/{MIN_INTERESTS} minimum
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.chipWrap}>
                    {INTEREST_OPTIONS.map((o) => (
                      <BounceChip
                        key={o}
                        label={o}
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
                <View style={styles.bioCard}>
                  <TextInput
                    style={styles.bioField}
                    placeholder="Ce qui te fait vibrer, ce que tu cherches…"
                    placeholderTextColor={colors.textMuted}
                    value={bio}
                    onChangeText={setBio}
                    maxLength={BIO_MAX}
                    multiline
                    textAlignVertical="top"
                  />
                  <View style={styles.bioFoot}>
                    <View style={styles.bioTrack}>
                      <View
                        style={[styles.bioFill, { width: `${(bio.length / BIO_MAX) * 100}%` }]}
                      />
                    </View>
                    <Text style={styles.bioCount}>
                      {bio.length}/{BIO_MAX}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <GradientButton
            title={isLast ? 'Terminer' : 'Continuer'}
            icon={isLast ? 'checkmark' : 'arrow-forward'}
            onPress={next}
            loading={saving}
            disabled={validateStep() !== null}
          />
          {/* Les étapes de complétion se passent d'un geste, sauf la dernière
              qui porte le bouton d'enregistrement. */}
          {OPTIONAL_STEPS.includes(step) && !isLast && (
            <Pressable
              onPress={() => {
                setError(null);
                goTo(stepIndex + 1);
              }}
              hitSlop={8}
              style={styles.skipBtn}
            >
              <Text style={styles.skipText}>Passer cette étape</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { paddingBottom: spacing.xl },

  titleBlock: { paddingHorizontal: spacing.md, marginTop: spacing.md, gap: spacing.sm },
  title: {
    fontSize: 31,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 38,
    letterSpacing: -0.5,
    marginTop: spacing.xs,
  },
  subtitle: { fontSize: 15, color: colors.textMuted, lineHeight: 22 },

  body: { paddingHorizontal: spacing.md, marginTop: spacing.lg, gap: spacing.sm },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing.md,
    marginLeft: 4,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardStack: { gap: spacing.sm },
  tileRow: { flexDirection: 'row', gap: spacing.sm },

  // Prénom : un grand champ nu, le trait dit la validité.
  nameBlock: { marginTop: spacing.md, gap: spacing.sm },
  nameField: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: spacing.sm,
    letterSpacing: -0.4,
  },
  nameHint: { fontSize: 13, color: colors.textMuted },

  // La roue occupe une carte blanche à elle seule.
  wheelCard: {
    backgroundColor: colors.cardSolid,
    borderRadius: 24,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
    ...shadows.card,
  },
  wheel: { alignSelf: 'stretch' },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.card,
  },
  dateValue: { flex: 1, fontSize: 17, color: colors.text, fontWeight: '600' },
  datePlaceholder: { flex: 1, fontSize: 17, color: colors.textMuted },
  ageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  agePill: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  agePillText: { fontSize: 15, fontWeight: '800', color: colors.textOnAccent },
  ageDate: { fontSize: 15, color: colors.textMuted },

  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.card,
  },
  searchInput: { flex: 1, fontSize: 17, color: colors.text },
  cityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    ...shadows.card,
  },
  cityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cityName: { fontSize: 16, fontWeight: '600', color: colors.text },
  cityHint: { fontSize: 13, color: colors.textMuted },
  cityDetected: { fontSize: 12, fontWeight: '700', color: colors.accent },

  note: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCell: {
    width: '31.5%',
    aspectRatio: 3 / 4,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.cardSolid,
  },
  photoImg: { width: '100%', height: '100%' },
  photoEmpty: { borderWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  photoNext: { borderColor: colors.accent },
  photoEmptyPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  photoUploading: { fontSize: 22, fontWeight: '800', color: colors.accent },
  mainTag: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,.6)',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mainTagText: { fontSize: 10.5, fontWeight: '700', color: '#ffffff' },
  photoRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.xs,
    paddingHorizontal: 2,
  },
  photoDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  photoDotOn: { backgroundColor: colors.accent },

  heightCard: {
    backgroundColor: colors.cardSolid,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
    ...shadows.card,
  },
  heightReadout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  heightValue: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  heightUnit: { fontSize: 18, fontWeight: '600', color: colors.textMuted },
  heightClear: { marginLeft: spacing.md },
  heightClearText: { fontSize: 13, fontWeight: '700', color: colors.accent },
  heightBounds: { flexDirection: 'row', justifyContent: 'space-between' },
  heightBound: { fontSize: 12, color: colors.textMuted },

  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 56,
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.card,
  },
  inputCardField: { flex: 1, fontSize: 16, color: colors.text },

  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  interestHead: { flexDirection: 'row', marginBottom: spacing.xs },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cardSolid,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  countPillDone: { backgroundColor: colors.success, borderColor: 'transparent' },
  countPillText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  countPillDoneText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },

  bioCard: {
    backgroundColor: colors.cardSolid,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  bioField: {
    minHeight: 150,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
  },
  bioFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bioTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  bioFill: { height: '100%', borderRadius: 2, backgroundColor: colors.accent },
  bioCount: {
    fontSize: 12,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },

  error: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  skipBtn: { alignSelf: 'center', paddingVertical: 6 },
  skipText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
});
