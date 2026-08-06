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
import { Button, ErrorText, StepTitle, WizardHeader } from '../components/ui';
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
import { colors, radius, spacing } from '../theme';
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
// nécessaires au fonctionnement de l'app.
const OPTIONAL_STEPS: Step[] = [
  'about',
  'lifestyle',
  'children',
  'background',
  'interests',
  'bio',
];

const STEP_META: Record<Step, { title: string; subtitle: string }> = {
  name: {
    title: "Comment tu t'appelles ?",
    subtitle: "C'est le prénom que les autres verront.",
  },
  birthdate: {
    title: 'Ta date de naissance',
    subtitle: 'Seul ton âge sera affiché sur ton profil.',
  },
  gender: {
    title: 'Toi, et qui tu cherches',
    subtitle: 'Ces réponses déterminent les profils qui te seront proposés.',
  },
  goal: {
    title: 'Ce que tu recherches',
    subtitle: 'Affiché sur ton profil, pour croiser des personnes du même avis.',
  },
  city: {
    title: 'Où vis-tu ?',
    subtitle: 'Ta ville est vérifiée avec ta position.',
  },
  photos: {
    title: 'Tes photos',
    subtitle: "Au moins une, jusqu'à six. La première est ta photo principale.",
  },
  about: {
    title: 'Ton profil',
    subtitle: 'Ces informations apparaissent sur ta fiche, sous tes photos.',
  },
  lifestyle: {
    title: 'Ton mode de vie',
    subtitle: 'Tabac et alcool : deux réponses qui évitent bien des malentendus.',
  },
  children: {
    title: 'Les enfants',
    subtitle: 'Un sujet qui compte pour beaucoup de monde, autant être clair.',
  },
  background: {
    title: 'Religion et langues',
    subtitle: 'Ce qui aide à se comprendre dès le premier message.',
  },
  interests: {
    title: "Tes centres d'intérêt",
    subtitle: 'Choisis ce qui te ressemble : ce sont souvent eux qui lancent la conversation.',
  },
  bio: {
    title: 'Quelques mots sur toi',
    subtitle: 'La touche personnelle qui donne envie de répondre.',
  },
};

const BIO_MAX = 500;
const MAX_PHOTOS = 6;
const MIN_AGE = 18;
const MAX_AGE = 100;

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

// Groupe de pastilles à choix multiple (langues, centres d'intérêt).
function ChipGroup({
  options,
  values,
  onToggle,
}: {
  options: string[];
  values: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <View style={styles.chipWrap}>
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <Pressable
            key={o}
            onPress={() => {
              haptic.select();
              onToggle(o);
            }}
            style={({ pressed }) => [
              styles.chip,
              on && styles.chipOn,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Rangée de liste iOS : libellé à gauche, coche à droite quand sélectionnée.
// Les rangées vivent dans un groupe arrondi, séparées par un filet.
function SelectRow({
  label,
  hint,
  selected,
  first,
  onPress,
}: {
  label: string;
  hint?: string;
  selected?: boolean;
  first?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        !first && styles.rowDivider,
        pressed && { backgroundColor: colors.surface },
      ]}
    >
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, selected && styles.rowLabelOn]}>{label}</Text>
        {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
      </View>
      {selected && <Ionicons name="checkmark" size={21} color={colors.accent} />}
    </Pressable>
  );
}

export default function Onboarding() {
  const { refreshProfile } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
        return Number.isFinite(h) && h >= 100 && h <= 250
          ? null
          : 'Indique ta taille en centimètres (100 à 250).';
      }
      default:
        // Étapes de complétion : rien n'est exigé.
        return null;
    }
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
              setStepIndex(stepIndex + 1);
            },
          },
          {
            text: `Garder ${chosenCity?.name ?? 'mon choix'}`,
            onPress: () => {
              cityConfirmed.current = true;
              setStepIndex(stepIndex + 1);
            },
          },
        ],
      );
      return;
    }

    if (stepIndex < STEPS.length - 1) {
      haptic.tap();
      setStepIndex(stepIndex + 1);
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
      haptic.success();
      await refreshProfile();
    } catch (e) {
      setError(profileSaveError(e));
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (stepIndex > 0) {
      setError(null);
      setStepIndex(stepIndex - 1);
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <WizardHeader step={stepIndex + 1} total={STEPS.length} onBack={back} />

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <StepTitle title={meta.title} subtitle={meta.subtitle} />

          <View style={styles.body}>
            {step === 'name' && (
              <View style={styles.group}>
                <TextInput
                  style={styles.field}
                  placeholder="Prénom"
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  maxLength={50}
                  autoFocus
                  autoCapitalize="words"
                  autoCorrect={false}
                />
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
                      style={styles.group}
                      onPress={() => {
                        haptic.tap();
                        setPickerOpen(true);
                      }}
                    >
                      <View style={styles.rowSingle}>
                        <Text style={birthDate ? styles.rowValue : styles.rowPlaceholder}>
                          {birthDate ? DATE_FMT.format(birthDate) : 'Choisir ma date'}
                        </Text>
                        <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
                      </View>
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
                  <Text style={styles.centerNote}>
                    {DATE_FMT.format(birthDate)} · <Text style={styles.bold}>{age} ans</Text>
                  </Text>
                )}
              </>
            )}

            {step === 'gender' && (
              <>
                <Text style={styles.groupLabel}>Je suis</Text>
                <View style={styles.group}>
                  <SelectRow
                    first
                    label="Un homme"
                    selected={gender === 'homme'}
                    onPress={() => setGender('homme')}
                  />
                  <SelectRow
                    label="Une femme"
                    selected={gender === 'femme'}
                    onPress={() => setGender('femme')}
                  />
                </View>

                <Text style={styles.groupLabel}>Je recherche</Text>
                <View style={styles.group}>
                  <SelectRow
                    first
                    label="Un homme"
                    selected={lookingFor === 'homme'}
                    onPress={() => setLookingFor('homme')}
                  />
                  <SelectRow
                    label="Une femme"
                    selected={lookingFor === 'femme'}
                    onPress={() => setLookingFor('femme')}
                  />
                </View>
              </>
            )}

            {step === 'goal' && (
              <View style={styles.group}>
                {GOAL_OPTIONS.map((o, i) => (
                  <SelectRow
                    key={o.value}
                    first={i === 0}
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
                  <Ionicons name="search" size={18} color={colors.textMuted} />
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
                  <View style={styles.group}>
                    {citySuggestions.map((c, i) => (
                      <Pressable
                        key={c.id}
                        style={({ pressed }) => [
                          styles.row,
                          i > 0 && styles.rowDivider,
                          pressed && { backgroundColor: colors.surface },
                        ]}
                        onPress={() => {
                          haptic.select();
                          setCityId(c.id);
                          setCityQuery(c.name);
                          Keyboard.dismiss();
                        }}
                      >
                        <Text style={styles.rowBody} numberOfLines={1}>
                          <Text style={styles.rowLabel}>{c.name}</Text>
                          <Text style={styles.rowHint}>, République démocratique du Congo</Text>
                        </Text>
                        {detectedCity?.id === c.id && (
                          <Ionicons name="navigate" size={16} color={colors.primary} />
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
                      color={detectedCity?.id === chosenCity.id ? colors.success : colors.textMuted}
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
                      <Pressable
                        key={`empty-${i}`}
                        style={[styles.photoCell, styles.photoEmpty, isNext && styles.photoNext]}
                        onPress={addPhoto}
                        disabled={!isNext || uploading}
                      >
                        <Ionicons
                          name="add"
                          size={26}
                          color={isNext ? colors.accent : colors.border}
                        />
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.note}>
                  {uploading
                    ? 'Envoi en cours…'
                    : `${photos.length} photo${photos.length > 1 ? 's' : ''} sur ${MAX_PHOTOS}`}
                </Text>
              </>
            )}

            {step === 'about' && (
              <>
                <View style={styles.group}>
                  <View style={styles.rowSingle}>
                    <Text style={styles.rowLabel}>Taille</Text>
                    <View style={styles.inlineField}>
                      <TextInput
                        style={styles.inlineInput}
                        placeholder="175"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        maxLength={3}
                        value={height}
                        onChangeText={setHeight}
                      />
                      <Text style={styles.unit}>cm</Text>
                    </View>
                  </View>
                  <View style={[styles.rowSingle, styles.rowDivider]}>
                    <Text style={styles.rowLabel}>Profession</Text>
                    <TextInput
                      style={styles.inlineInputWide}
                      placeholder="Ton métier"
                      placeholderTextColor={colors.textMuted}
                      value={job}
                      onChangeText={setJob}
                      maxLength={80}
                    />
                  </View>
                </View>

                <Text style={styles.groupLabel}>Études</Text>
                <View style={styles.group}>
                  {EDUCATION_OPTIONS.map((o, i) => (
                    <SelectRow
                      key={o.value}
                      first={i === 0}
                      label={o.label}
                      selected={education === o.value}
                      onPress={() => setEducation(education === o.value ? null : o.value)}
                    />
                  ))}
                </View>
              </>
            )}

            {step === 'lifestyle' && (
              <>
                <Text style={styles.groupLabel}>Tabac</Text>
                <View style={styles.group}>
                  {FREQUENCY_OPTIONS.map((o, i) => (
                    <SelectRow
                      key={o.value}
                      first={i === 0}
                      label={o.label}
                      selected={smoking === o.value}
                      onPress={() => setSmoking(smoking === o.value ? null : o.value)}
                    />
                  ))}
                </View>

                <Text style={styles.groupLabel}>Alcool</Text>
                <View style={styles.group}>
                  {FREQUENCY_OPTIONS.map((o, i) => (
                    <SelectRow
                      key={o.value}
                      first={i === 0}
                      label={o.label}
                      selected={drinking === o.value}
                      onPress={() => setDrinking(drinking === o.value ? null : o.value)}
                    />
                  ))}
                </View>
              </>
            )}

            {step === 'children' && (
              <>
                <Text style={styles.groupLabel}>J'ai des enfants</Text>
                <View style={styles.group}>
                  {HAS_CHILDREN_OPTIONS.map((o, i) => (
                    <SelectRow
                      key={o.value}
                      first={i === 0}
                      label={o.label}
                      selected={hasChildren === o.value}
                      onPress={() => setHasChildren(hasChildren === o.value ? null : o.value)}
                    />
                  ))}
                </View>

                <Text style={styles.groupLabel}>Je veux des enfants</Text>
                <View style={styles.group}>
                  {WANTS_CHILDREN_OPTIONS.map((o, i) => (
                    <SelectRow
                      key={o.value}
                      first={i === 0}
                      label={o.label}
                      selected={wantsChildren === o.value}
                      onPress={() =>
                        setWantsChildren(wantsChildren === o.value ? null : o.value)
                      }
                    />
                  ))}
                </View>
              </>
            )}

            {step === 'background' && (
              <>
                <Text style={styles.groupLabel}>Religion</Text>
                <View style={styles.group}>
                  {RELIGION_OPTIONS.map((r, i) => (
                    <SelectRow
                      key={r}
                      first={i === 0}
                      label={r}
                      selected={religion === r}
                      onPress={() => setReligion(religion === r ? null : r)}
                    />
                  ))}
                </View>

                <Text style={styles.groupLabel}>Langues parlées</Text>
                <ChipGroup
                  options={LANGUAGE_OPTIONS}
                  values={languages}
                  onToggle={(v) =>
                    setLanguages((prev) =>
                      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                    )
                  }
                />
              </>
            )}

            {step === 'interests' && (
              <>
                <ChipGroup
                  options={INTEREST_OPTIONS}
                  values={interests}
                  onToggle={(v) =>
                    setInterests((prev) =>
                      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v],
                    )
                  }
                />
                <Text style={styles.note}>
                  {interests.length === 0
                    ? 'Aucun choisi pour le moment.'
                    : `${interests.length} sélectionné${interests.length > 1 ? 's' : ''}.`}
                </Text>
              </>
            )}

            {step === 'bio' && (
              <>
                <View style={styles.group}>
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
                </View>
                <Text style={[styles.note, styles.noteRight]}>
                  {bio.length}/{BIO_MAX}
                </Text>
              </>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <ErrorText>{error}</ErrorText>
          <Button
            title={isLast ? 'Terminer' : 'Continuer'}
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
                setStepIndex(stepIndex + 1);
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
  body: { paddingHorizontal: spacing.md, marginTop: spacing.lg, gap: spacing.sm },

  // Groupe de liste à la iOS : carte blanche arrondie, rangées séparées par
  // un filet, rien d'autre. C'est la sobriété qui fait le sérieux.
  group: {
    backgroundColor: colors.cardSolid,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: spacing.md,
    marginLeft: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  rowSingle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    minHeight: 54,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: 17, color: colors.text },
  rowLabelOn: { fontWeight: '600', color: colors.accent },
  rowHint: { fontSize: 15, color: colors.textMuted },
  rowValue: { fontSize: 17, color: colors.text },
  rowPlaceholder: { fontSize: 17, color: colors.textMuted },

  field: {
    paddingHorizontal: spacing.md,
    minHeight: 54,
    fontSize: 17,
    color: colors.text,
  },

  // La roue occupe une carte à elle seule, sans bord ni ombre : le mouvement
  // suffit à la désigner.
  wheelCard: {
    backgroundColor: colors.cardSolid,
    borderRadius: radius.md,
    overflow: 'hidden',
    paddingVertical: spacing.xs,
  },
  wheel: { alignSelf: 'stretch' },
  centerNote: {
    textAlign: 'center',
    fontSize: 15,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  bold: { fontWeight: '700', color: colors.text },

  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 54,
    backgroundColor: colors.cardSolid,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 17, color: colors.text },

  note: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  noteRight: { textAlign: 'right' },

  // Champ posé à droite d'une rangée de liste (taille, profession).
  inlineField: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineInput: {
    minWidth: 56,
    fontSize: 17,
    color: colors.text,
    textAlign: 'right',
    paddingVertical: 8,
  },
  inlineInputWide: {
    flex: 1,
    fontSize: 17,
    color: colors.text,
    textAlign: 'right',
    paddingVertical: 8,
    marginLeft: spacing.md,
  },
  unit: { fontSize: 17, color: colors.textMuted },

  // Pastilles à choix multiple : langues, centres d'intérêt.
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardSolid,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surface },
  chipText: { fontSize: 15, color: colors.text },
  chipTextOn: { color: colors.accent, fontWeight: '600' },

  skipBtn: { alignSelf: 'center', paddingVertical: 6 },
  skipText: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCell: {
    width: '31.5%',
    aspectRatio: 3 / 4,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.cardSolid,
  },
  photoImg: { width: '100%', height: '100%' },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },
  photoNext: { borderWidth: 1.5, borderColor: colors.accent },
  mainTag: {
    position: 'absolute',
    left: 6,
    bottom: 6,
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

  bioField: {
    minHeight: 140,
    padding: spacing.md,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
  },

  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
});
