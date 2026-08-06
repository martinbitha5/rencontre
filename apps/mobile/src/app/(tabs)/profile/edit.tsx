import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  deletePhoto,
  getMyPhotos,
  photoUrl,
  updateMyProfile,
  uploadPhoto,
} from '../../../api';
import { Button, Centered, Chip, Input, ScreenHeader, SectionCard } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { pickPhotoMessage, pickProfilePhoto } from '../../../lib/photoPicker';
import {
  EDUCATION_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_OPTIONS,
  HAS_CHILDREN_OPTIONS,
  INTEREST_OPTIONS,
  LANGUAGE_OPTIONS,
  RELIGION_OPTIONS,
  WANTS_CHILDREN_OPTIONS,
  type Option,
} from '../../../profileOptions';
import { colors, radius, spacing } from '../../../theme';
import type { MyPhoto } from '../../../types';

// Rangée de chips à choix unique (re-cliquer désélectionne).
function ChoiceRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            active={value === o.value}
            onPress={() => onChange(value === o.value ? null : o.value)}
          />
        ))}
      </View>
    </View>
  );
}

// Rangée de chips multi-sélection avec maximum.
function MultiRow({
  label,
  options,
  values,
  onChange,
  max,
}: {
  label: string;
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
}) {
  const toggle = (item: string) => {
    if (values.includes(item)) onChange(values.filter((v) => v !== item));
    else if (values.length < max) onChange([...values, item]);
  };
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label} ({values.length}/{max})
      </Text>
      <View style={styles.chipRow}>
        {options.map((o) => (
          <Chip key={o} label={o} active={values.includes(o)} onPress={() => toggle(o)} />
        ))}
      </View>
    </View>
  );
}

export default function EditProfile() {
  const { profile, refreshProfile } = useAuth();
  const [photos, setPhotos] = useState<MyPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  const [bio, setBio] = useState(profile?.bio ?? '');
  const [height, setHeight] = useState(profile?.height_cm ? String(profile.height_cm) : '');
  const [job, setJob] = useState(profile?.job_title ?? '');
  const [education, setEducation] = useState<string | null>(profile?.education ?? null);
  const [goal, setGoal] = useState<string | null>(profile?.relationship_goal ?? null);
  const [hasChildren, setHasChildren] = useState<string | null>(profile?.has_children ?? null);
  const [wantsChildren, setWantsChildren] = useState<string | null>(
    profile?.wants_children ?? null,
  );
  const [smoking, setSmoking] = useState<string | null>(profile?.smoking ?? null);
  const [drinking, setDrinking] = useState<string | null>(profile?.drinking ?? null);
  const [religion, setReligion] = useState<string | null>(profile?.religion ?? null);
  const [languages, setLanguages] = useState<string[]>(profile?.languages ?? []);
  const [interests, setInterests] = useState<string[]>(profile?.interests ?? []);

  useFocusEffect(
    useCallback(() => {
      getMyPhotos().then(setPhotos).catch(() => {});
    }, []),
  );

  if (!profile) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Centered>
    );
  }

  const completionFields = [
    photos.length > 0,
    bio.trim().length > 0,
    height !== '',
    job.trim() !== '',
    education !== null,
    goal !== null,
    hasChildren !== null,
    wantsChildren !== null,
    smoking !== null,
    drinking !== null,
    religion !== null,
    languages.length > 0,
    interests.length > 0,
  ];
  const completion = Math.round(
    (completionFields.filter(Boolean).length / completionFields.length) * 100,
  );

  const addPhoto = async () => {
    if (photos.length >= 6) return Alert.alert('Maximum 6 photos');
    // Même chemin que l'onboarding : permission demandée, photo préparée
    // (proportions d'origine conservées, JPEG borné), erreurs annoncées.
    const picked = await pickProfilePhoto();
    if (picked.status !== 'ok') {
      const message = pickPhotoMessage(picked);
      if (message) Alert.alert('Photo', message);
      return;
    }
    try {
      const uploaded = await uploadPhoto(picked.base64, photos.length);
      setPhotos((p) => [...p, uploaded]);
    } catch (e) {
      const detail = (e as { message?: string })?.message ?? '';
      Alert.alert(
        'Erreur',
        /size|large|exceed/i.test(detail)
          ? 'Cette photo est trop lourde. Choisis-en une autre.'
          : `Envoi impossible${detail ? ` : ${detail}` : '. Réessaie.'}`,
      );
    }
  };

  const removePhoto = (photo: MyPhoto) => {
    if (photos.length <= 1) {
      return Alert.alert('Impossible', 'Garde au moins une photo sur ton profil.');
    }
    Alert.alert('Retirer cette photo ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          await deletePhoto(photo).catch(() => {});
          setPhotos((p) => p.filter((x) => x.id !== photo.id));
        },
      },
    ]);
  };

  const save = async () => {
    const h = height === '' ? null : Number(height);
    if (h !== null && (Number.isNaN(h) || h < 100 || h > 250)) {
      return Alert.alert('Taille invalide', 'Indique ta taille en centimètres (100 à 250).');
    }
    setSaving(true);
    try {
      await updateMyProfile({
        bio: bio.trim(),
        height_cm: h,
        job_title: job.trim() || null,
        education,
        relationship_goal: goal,
        has_children: hasChildren,
        wants_children: wantsChildren,
        smoking,
        drinking,
        religion,
        languages,
        interests,
      });
      await refreshProfile();
      Alert.alert('Profil enregistré');
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Modifier le profil" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.completionCard}>
          <View style={styles.completionHeader}>
            <Text style={styles.completionLabel}>Profil complété</Text>
            <Text style={styles.completionPct}>{completion} %</Text>
          </View>
          <View style={styles.completionTrack}>
            <View style={[styles.completionFill, { width: `${completion}%` }]} />
          </View>
          {completion < 100 && (
            <Text style={styles.completionHint}>
              Un profil complet reçoit beaucoup plus de likes.
            </Text>
          )}
        </View>

        <SectionCard title="Mes photos" style={styles.section}>
          <View style={styles.photoGrid}>
            {photos.map((p) => (
              <Pressable key={p.id} style={styles.photoCell} onLongPress={() => removePhoto(p)}>
                <Image
                  source={{ uri: photoUrl(p.storage_path) }}
                  style={{ flex: 1 }}
                  contentFit="cover"
                />
              </Pressable>
            ))}
            {photos.length < 6 && (
              <Pressable style={[styles.photoCell, styles.photoAdd]} onPress={addPhoto}>
                <Ionicons name="add" size={34} color={colors.primary} />
              </Pressable>
            )}
          </View>
          <Text style={styles.hint}>Appui long sur une photo pour la retirer.</Text>
        </SectionCard>

        <SectionCard title="À propos de moi" style={styles.section}>
          <Input
            value={bio}
            onChangeText={setBio}
            placeholder="Quelques mots sur toi…"
            multiline
            maxLength={500}
            style={styles.bioInput}
          />

          {/* La commune a été retirée du produit : la ville, vérifiée par la
              localisation à l'onboarding, suffit. */}
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Taille (cm)</Text>
            <Input
              value={height}
              onChangeText={setHeight}
              keyboardType="number-pad"
              maxLength={3}
              placeholder="175"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Profession</Text>
            <Input
              value={job}
              onChangeText={setJob}
              placeholder="Ton métier ou ton activité"
              maxLength={80}
            />
          </View>

          <ChoiceRow
            label="Niveau d'études"
            options={EDUCATION_OPTIONS}
            value={education}
            onChange={setEducation}
          />
          <ChoiceRow
            label="Religion"
            options={RELIGION_OPTIONS.map((r) => ({ value: r, label: r }))}
            value={religion}
            onChange={setReligion}
          />
          <MultiRow
            label="Langues parlées"
            options={LANGUAGE_OPTIONS}
            values={languages}
            onChange={setLanguages}
            max={6}
          />
        </SectionCard>

        <SectionCard title="Mon mode de vie" style={styles.section}>
          <ChoiceRow
            label="J'ai des enfants"
            options={HAS_CHILDREN_OPTIONS}
            value={hasChildren}
            onChange={setHasChildren}
          />
          <ChoiceRow
            label="Je veux des enfants"
            options={WANTS_CHILDREN_OPTIONS}
            value={wantsChildren}
            onChange={setWantsChildren}
          />
          <ChoiceRow
            label="Tabac"
            options={FREQUENCY_OPTIONS}
            value={smoking}
            onChange={setSmoking}
          />
          <ChoiceRow
            label="Alcool"
            options={FREQUENCY_OPTIONS}
            value={drinking}
            onChange={setDrinking}
          />
        </SectionCard>

        <SectionCard title="Mes centres d'intérêt" style={styles.section}>
          <MultiRow
            label="Choisis ce qui te ressemble"
            options={INTEREST_OPTIONS}
            values={interests}
            onChange={setInterests}
            max={10}
          />
        </SectionCard>

        <SectionCard title="Je recherche" style={styles.section}>
          <ChoiceRow
            label="Type de relation"
            options={GOAL_OPTIONS}
            value={goal}
            onChange={setGoal}
          />
          <Text style={styles.hint}>
            La tranche d'âge et le genre recherchés se règlent dans Paramètres, Préférences de
            recherche.
          </Text>
        </SectionCard>

        <View style={{ height: spacing.md }} />
        <Button title="Enregistrer mon profil" onPress={save} loading={saving} />
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: 0 },
  section: { marginTop: spacing.md },
  completionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  completionHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  completionLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  completionPct: { fontSize: 14, fontWeight: '800', color: colors.primary },
  completionTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  completionFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  completionHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCell: {
    width: '31%',
    aspectRatio: 3 / 4,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.inputBg,
  },
  photoAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  bioInput: { height: 110, paddingTop: spacing.md, textAlignVertical: 'top' },
  field: { marginTop: spacing.md },
  fieldPair: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 6,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
