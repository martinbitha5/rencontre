import { Ionicons } from '@expo/vector-icons';

import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  deletePhoto,
  getMyPhotos,
  reorderPhotos,
  replacePhoto,
  updateMyProfile,
  uploadPhoto,
} from '@/services/api';
import { ProfileDetailModal } from '@/components/ProfileDetailModal';
import { Centered, HeaderBackButton } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { pickPhotoMessage, pickProfilePhoto, type PhotoSource } from '@/services/photoPicker';
import { PhotoSourceSheet } from '@/components/PhotoSourceSheet';
import { cacheSet } from '@/utils/cache';
import { haptic } from '@/utils/haptics';
import {
  EDUCATION_OPTIONS,
  FREQUENCY_OPTIONS,
  GOAL_OPTIONS,
  goalIcon,
  HAS_CHILDREN_OPTIONS,
  INTEREST_OPTIONS,
  LANGUAGE_OPTIONS,
  RELIGION_OPTIONS,
  WANTS_CHILDREN_OPTIONS,
  interestIcon,
  labelFor,
  type Option,
} from '@/profileOptions';
import { BounceChip, GradientButton, HeightSlider, OptionCard } from '@/screens/Onboarding/OnboardingKit';
import { BottomSheet } from '@/screens/Settings/BottomSheet';
import { InterestLabel } from '@/components/InterestIcon';
import { colors, keyboardAppearance } from '@/theme';
import { ageFromBirthDate, type MyPhoto, type Profile, type ViewableProfile } from '@/types';
import { useMyCities } from '@/utils/countries';
import { styles } from './EditProfile.styles';
import { Photo } from '@/components/Photo';

// Modifier le profil : la barre « Rempli à X % » en haut, la grille de
// photos, puis une ligne par information. Toucher une ligne ouvre une feuille
// qui enregistre dès qu'on choisit : plus de gros bouton « Enregistrer » à
// chercher en bas de page.

const MAX_PHOTOS = 6;
const MAX_INTERESTS = 10;
const BIO_MAX = 500;

const NAME_MAX = 50;
const SUPPORT_EMAIL = 'support@zola-rdc.com';

type Field =
  | 'name'
  | 'bio'
  | 'job'
  | 'education'
  | 'goal'
  | 'height'
  | 'wantsChildren'
  | 'hasChildren'
  | 'drinking'
  | 'smoking'
  | 'religion'
  | 'languages'
  | 'interests';

const SHEET_TITLES: Record<Field, string> = {
  name: 'Ton prénom',
  bio: 'Description',
  job: 'Ton métier',
  education: "Niveau d'études",
  goal: 'Ce que je cherche',
  height: 'Taille',
  wantsChildren: 'Enfants',
  hasChildren: 'Déjà des enfants',
  drinking: 'Alcool',
  smoking: 'Tabac',
  religion: 'Religion',
  languages: 'Langues',
  interests: "Centres d'intérêt",
};

const RELIGION_CHOICES: Option[] = RELIGION_OPTIONS.map((r) => ({ value: r, label: r }));

export default function EditProfile() {
  const { profile, session, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  // Ouvert depuis le push « photo retirée » (send-push, migration 063).
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const photoNotice = focus === 'photos' && !noticeDismissed;
  // Seules les villes de mon pays : on ne passe pas d'un pays à l'autre ici.
  const { cities } = useMyCities();
  const [photos, setPhotos] = useState<MyPhoto[]>([]);
  // Photo en cours d'envoi ou de remplacement : sa cellule montre un voile et
  // un indicateur, la grille reste manipulable pour le reste.
  const [busyPhoto, setBusyPhoto] = useState<string | null>(null);
  // Choix galerie ou appareil photo : la feuille s'ouvre, et la cible (nouvelle
  // photo ou photo à remplacer) attend ici que la source soit choisie.
  const [sourceOpen, setSourceOpen] = useState(false);
  const sourceTarget = useRef<'new' | MyPhoto>('new');
  const [editing, setEditing] = useState<Field | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  // Brouillons des champs saisis à la main ou à choix multiples.
  const [draftText, setDraftText] = useState('');
  const [draftHeight, setDraftHeight] = useState<number | null>(null);
  const [draftList, setDraftList] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      getMyPhotos().then(setPhotos).catch(() => {});
    }, []),
  );

  // Toute modification de la grille est répercutée dans le cache local : le
  // profil et la vérification lisent `my-photos` avant le réseau.
  const commitPhotos = (next: MyPhoto[]) => {
    setPhotos(next);
    cacheSet('my-photos', next);
  };

  if (!profile) {
    return (
      <Centered>
        <ActivityIndicator size="large" color={colors.primary} />
      </Centered>
    );
  }

  const completionFields = [
    photos.length >= 2,
    !!profile.bio?.trim(),
    !!profile.height_cm,
    !!profile.job_title,
    !!profile.education,
    !!profile.relationship_goal,
    !!profile.has_children,
    !!profile.wants_children,
    !!profile.smoking,
    !!profile.drinking,
    !!profile.religion,
    (profile.languages?.length ?? 0) > 0,
    (profile.interests?.length ?? 0) >= 5,
  ];
  const completion = Math.round(
    (completionFields.filter(Boolean).length / completionFields.length) * 100,
  );

  // ------------------------------------------------------------------
  // Enregistrement d'un champ : envoi, relecture du profil, feuille fermée.
  // ------------------------------------------------------------------
  const saveFields = async (patch: Partial<Profile>) => {
    setSaving(true);
    try {
      await updateMyProfile(patch);
      await refreshProfile();
      haptic.success();
      setEditing(null);
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer pour l'instant. Réessaie.");
    } finally {
      setSaving(false);
    }
  };

  const open = (field: Field) => {
    haptic.tap();
    if (field === 'name') setDraftText(profile.display_name ?? '');
    if (field === 'bio') setDraftText(profile.bio ?? '');
    if (field === 'job') setDraftText(profile.job_title ?? '');
    if (field === 'height') setDraftHeight(profile.height_cm ?? null);
    if (field === 'languages') setDraftList(profile.languages ?? []);
    if (field === 'interests') setDraftList(profile.interests ?? []);
    setEditing(field);
  };

  const lockedInfo = () => {
    haptic.tap();
    Alert.alert(
      'Information protégée',
      `Ta date de naissance et ton genre ne se modifient pas depuis l’app. En cas d’erreur, écris-nous à ${SUPPORT_EMAIL}.`,
    );
  };

  // La ville est choisie à l'inscription et vérifiée par la position : elle
  // ne change plus ensuite. Les filtres permettent de voir tout son pays.
  const lockedCityInfo = () => {
    haptic.tap();
    Alert.alert(
      'Ville vérifiée',
      `Ta ville a été choisie à l’inscription et confirmée par ta position, elle ne se modifie pas. Pour voir les profils de tout ton pays, active-le dans les filtres. Tu as déménagé ? Écris-nous à ${SUPPORT_EMAIL}.`,
    );
  };

  const accountInfo = () => {
    haptic.tap();
    Alert.alert(
      'Identifiant de connexion',
      'C’est l’adresse ou le numéro avec lequel tu te connectes. Il reste privé.',
    );
  };

  const saveName = () => {
    const name = draftText.trim().replace(/\s+/g, ' ');
    if (!name) return Alert.alert('Prénom', 'Indique ton prénom.');
    void saveFields({ display_name: name });
  };

  // Choix unique : un nouvel appui sur la réponse déjà choisie l'efface.
  const pick = (key: keyof Profile, current: string | null, value: string) =>
    saveFields({ [key]: current === value ? null : value } as Partial<Profile>);

  const toggleDraft = (item: string, max: number) =>
    setDraftList((prev) =>
      prev.includes(item)
        ? prev.filter((x) => x !== item)
        : prev.length < max
          ? [...prev, item]
          : prev,
    );

  // ------------------------------------------------------------------
  // Photos.
  // ------------------------------------------------------------------
  const uploadErrorMessage = (e: unknown) => {
    const detail = (e as { message?: string })?.message ?? '';
    return /size|large|exceed/i.test(detail)
      ? 'Cette photo est trop lourde. Choisis-en une autre.'
      : `Envoi impossible${detail ? ` : ${detail}` : '. Réessaie.'}`;
  };

  const requestAdd = () => {
    if (photos.length >= MAX_PHOTOS) return Alert.alert(`Maximum ${MAX_PHOTOS} photos`);
    sourceTarget.current = 'new';
    setSourceOpen(true);
  };

  const requestSwap = (photo: MyPhoto) => {
    sourceTarget.current = photo;
    setSourceOpen(true);
  };

  const onSourcePicked = (source: PhotoSource) => {
    const target = sourceTarget.current;
    if (target === 'new') void addPhoto(source);
    else void swapPhoto(target, source);
  };

  const addPhoto = async (source: PhotoSource) => {
    if (photos.length >= MAX_PHOTOS) return Alert.alert(`Maximum ${MAX_PHOTOS} photos`);
    const picked = await pickProfilePhoto(source);
    if (picked.status !== 'ok') {
      const message = pickPhotoMessage(picked);
      if (message) Alert.alert('Photo', message);
      return;
    }
    setBusyPhoto('new');
    try {
      const uploaded = await uploadPhoto(picked.base64, photos.length, picked.thumbBase64);
      commitPhotos([...photos, uploaded]);
      setNoticeDismissed(true);
    } catch (e) {
      Alert.alert('Erreur', uploadErrorMessage(e));
    } finally {
      setBusyPhoto(null);
    }
  };

  const swapPhoto = async (photo: MyPhoto, source: PhotoSource) => {
    const picked = await pickProfilePhoto(source);
    if (picked.status !== 'ok') {
      const message = pickPhotoMessage(picked);
      if (message) Alert.alert('Photo', message);
      return;
    }
    setBusyPhoto(photo.id);
    try {
      const replaced = await replacePhoto(photo, picked.base64, picked.thumbBase64);
      commitPhotos(photos.map((p) => (p.id === photo.id ? replaced : p)));
    } catch (e) {
      Alert.alert('Erreur', uploadErrorMessage(e));
    } finally {
      setBusyPhoto(null);
    }
  };

  const makeMain = async (photo: MyPhoto) => {
    const next = [photo, ...photos.filter((p) => p.id !== photo.id)];
    const previous = photos;
    commitPhotos(next.map((p, i) => ({ ...p, position: i })));
    try {
      commitPhotos(await reorderPhotos(next));
    } catch {
      commitPhotos(previous);
      Alert.alert('Erreur', "Impossible de changer l'ordre pour l'instant.");
    }
  };

  const removePhoto = (photo: MyPhoto) => {
    if (photos.length <= 1) {
      return Alert.alert('Impossible', 'Garde au moins une photo sur ton profil.');
    }
    Alert.alert('Retirer cette photo ?', 'Elle disparaît de ton profil immédiatement.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Retirer',
        style: 'destructive',
        onPress: async () => {
          setBusyPhoto(photo.id);
          try {
            await deletePhoto(photo);
            const rest = photos.filter((x) => x.id !== photo.id);
            commitPhotos(await reorderPhotos(rest).catch(() => rest));
          } catch {
            Alert.alert('Erreur', 'Impossible de retirer cette photo pour l’instant.');
          } finally {
            setBusyPhoto(null);
          }
        },
      },
    ]);
  };

  const photoMenu = (photo: MyPhoto, index: number) => {
    haptic.tap();
    Alert.alert(
      index === 0 ? 'Photo principale' : `Photo ${index + 1}`,
      index === 0 ? 'C’est celle que les autres voient en premier.' : undefined,
      [
        ...(index > 0
          ? [{ text: 'Mettre en photo principale', onPress: () => void makeMain(photo) }]
          : []),
        { text: 'Remplacer', onPress: () => requestSwap(photo) },
        { text: 'Retirer', style: 'destructive' as const, onPress: () => removePhoto(photo) },
        { text: 'Annuler', style: 'cancel' as const },
      ],
    );
  };

  // Une case de la grille : photo existante, case d'ajout, ou case vide.
  const renderSlot = (i: number, big?: boolean) => {
    const p = photos[i];
    const cellStyle = [styles.slot, big && styles.slotBig];
    if (p) {
      const busy = busyPhoto === p.id;
      return (
        <Pressable
          key={p.id}
          style={cellStyle}
          onPress={() => !busy && photoMenu(p, i)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={i === 0 ? 'Photo principale, options' : `Photo ${i + 1}, options`}
        >
          <Photo
            path={p.storage_path}
            style={styles.slotImg}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={120}
          />
          {busy && (
            <View style={styles.slotBusy}>
              <ActivityIndicator color="#ffffff" />
            </View>
          )}
        </Pressable>
      );
    }
    const isNext = i === photos.length;
    return (
      <Pressable
        key={`empty-${i}`}
        style={[cellStyle, styles.slotEmpty]}
        onPress={requestAdd}
        disabled={!isNext || busyPhoto === 'new'}
        accessibilityRole="button"
        accessibilityLabel="Ajouter une photo"
      >
        {isNext && busyPhoto === 'new' ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Ionicons name="add" size={26} color={isNext ? colors.text : colors.textMuted} />
        )}
      </Pressable>
    );
  };

  const publicPreview: ViewableProfile = {
    ...profile,
    display_name: profile.display_name ?? '',
    birth_date: profile.birth_date ?? '',
    gender: profile.gender ?? 'homme',
    bio: profile.bio ?? '',
    city_name: null,
    photos: photos.map((p) => ({ id: p.id, path: p.storage_path })),
  };

  const workLine = [profile.job_title, labelFor(EDUCATION_OPTIONS, profile.education)]
    .filter(Boolean)
    .join(', ');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* En-tête : retour, barre de remplissage, aperçu. */}
      <View style={styles.header}>
        <HeaderBackButton />
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Rempli à {completion} %</Text>
          <View style={styles.headerTrack}>
            <View style={[styles.headerFill, { width: `${completion}%` }]} />
          </View>
        </View>
        <Pressable onPress={() => setPreviewing(true)} hitSlop={10}>
          <Text style={styles.headerAction}>Aperçu</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {photoNotice && (
          <View style={styles.notice} accessibilityRole="alert">
            <Ionicons name="image" size={22} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.noticeTitle}>Une de tes photos a été retirée</Text>
              <Text style={styles.noticeText}>
                Elle ne respectait pas nos règles. Ajoute une photo récente où l’on voit bien ton
                visage, sans personne d’autre.
              </Text>
            </View>
            <Pressable
              onPress={() => setNoticeDismissed(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Grille : une grande photo à gauche, deux petites à droite, puis
            une rangée de trois. */}
        <View style={styles.grid}>
          <View style={styles.gridTop}>
            {renderSlot(0, true)}
            <View style={styles.gridSide}>
              {renderSlot(1)}
              {renderSlot(2)}
            </View>
          </View>
          <View style={styles.gridRow}>
            {renderSlot(3)}
            {renderSlot(4)}
            {renderSlot(5)}
          </View>
        </View>
        <Text style={styles.gridHint}>
          Touche une photo pour la remplacer, la retirer ou la mettre en premier.
        </Text>
        {photos.length < MAX_PHOTOS && (
          <View style={styles.block}>
            <GradientButton
              title="Ajouter des photos"
              icon="images"
              onPress={requestAdd}
              loading={busyPhoto === 'new'}
            />
          </View>
        )}

        {/* Données personnelles. Prénom et ville se modifient ici. La date de
            naissance et le genre restent fixes : les changer permettrait de
            contourner la limite des 18 ans et fausserait la vérification. */}
        <Text style={styles.sectionTitle}>Données personnelles</Text>
        <View style={styles.list}>
          <DetailRow
            icon="person"
            label="Prénom"
            value={profile.display_name}
            onPress={() => open('name')}
          />
          <DetailRow
            icon="location"
            label="Ville"
            value={cities.find((c) => c.id === profile.city_id)?.name ?? null}
            onPress={lockedCityInfo}
            locked
          />
          <DetailRow
            icon="calendar"
            label="Date de naissance"
            value={birthLabel(profile.birth_date)}
            onPress={lockedInfo}
            locked
          />
          <DetailRow
            icon="male-female"
            label="Genre"
            value={profile.gender ? (profile.gender === 'femme' ? 'Femme' : 'Homme') : null}
            onPress={lockedInfo}
            locked
          />
          {session?.user.email ? (
            <DetailRow
              icon="mail"
              label="E-mail"
              value={session.user.email}
              onPress={accountInfo}
              locked
              last={!session.user.phone}
            />
          ) : null}
          {session?.user.phone ? (
            <DetailRow
              icon="call"
              label="Téléphone"
              value={`+${session.user.phone.replace(/^\+/, '')}`}
              onPress={accountInfo}
              locked
              last
            />
          ) : null}
        </View>
        <Text style={styles.sectionNote}>
          Ton e-mail et ton numéro restent privés, personne d’autre ne les voit.
        </Text>

        <SectionRow
          title="Emploi et études"
          value={workLine || 'Ajoute ton métier et tes études'}
          empty={!workLine}
          onPress={() => open('job')}
        />
        <SectionRow
          title="Ce que je cherche"
          value={labelFor(GOAL_OPTIONS, profile.relationship_goal) ?? 'Choisis ton intention'}
          empty={!profile.relationship_goal}
          onPress={() => open('goal')}
        />
        <SectionRow
          title="Description"
          value={profile.bio?.trim() || 'Quelques mots sur toi'}
          empty={!profile.bio?.trim()}
          onPress={() => open('bio')}
        />

        <Text style={styles.sectionTitle}>Dis-nous en plus sur toi</Text>
        <View style={styles.list}>
          <DetailRow
            icon="resize"
            label="Taille"
            value={profile.height_cm ? `${profile.height_cm} cm` : null}
            onPress={() => open('height')}
          />
          <DetailRow
            icon="school"
            label="Études"
            value={labelFor(EDUCATION_OPTIONS, profile.education)}
            onPress={() => open('education')}
          />
          <DetailRow
            icon="happy"
            label="Enfants"
            value={labelFor(WANTS_CHILDREN_OPTIONS, profile.wants_children)}
            onPress={() => open('wantsChildren')}
          />
          <DetailRow
            icon="people"
            label="Déjà des enfants"
            value={labelFor(HAS_CHILDREN_OPTIONS, profile.has_children)}
            onPress={() => open('hasChildren')}
          />
          <DetailRow
            icon="wine"
            label="Alcool"
            value={labelFor(FREQUENCY_OPTIONS, profile.drinking)}
            onPress={() => open('drinking')}
          />
          <DetailRow
            icon="leaf"
            label="Tabac"
            value={labelFor(FREQUENCY_OPTIONS, profile.smoking)}
            onPress={() => open('smoking')}
          />
          <DetailRow
            icon="book"
            label="Religion"
            value={profile.religion}
            onPress={() => open('religion')}
          />
          <DetailRow
            icon="chatbubbles"
            label="Langues"
            value={(profile.languages ?? []).join(', ') || null}
            onPress={() => open('languages')}
            last
          />
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Centres d&apos;intérêt</Text>
          <Pressable onPress={() => open('interests')} hitSlop={10}>
            <Text style={styles.sectionAction}>Modifier</Text>
          </Pressable>
        </View>
        <View style={styles.chips}>
          {(profile.interests ?? []).length === 0 ? (
            <Text style={styles.emptyText}>Aucun pour l&apos;instant.</Text>
          ) : (
            (profile.interests ?? []).map((it) => (
              <View key={it} style={styles.chip}>
                <InterestLabel interest={it} color={colors.text} textStyle={styles.chipText} />
              </View>
            ))
          )}
        </View>

        <View style={styles.verify}>
          <View style={styles.verifyHead}>
            <Text style={styles.sectionTitleFlat}>Vérification</Text>
            <Ionicons name="checkmark-circle" size={20} color="#1D9BF0" />
          </View>
          <Text style={styles.emptyText}>
            {profile.is_verified
              ? 'Ton profil est vérifié. Le badge bleu montre aux autres que tu es bien toi.'
              : 'Le badge bleu montre que la personne a prouvé son identité. Fais vérifier ton profil depuis l’onglet Profil.'}
          </Text>
        </View>
      </ScrollView>

      {/* Feuille d'édition, une par information. */}
      <BottomSheet
        visible={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing ? SHEET_TITLES[editing] : undefined}
      >
        {/* Le clavier est géré par la feuille elle-même (elle remonte). */}
        <View>
          <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <View style={styles.sheetBody}>
              {editing === 'name' && (
                <>
                  <TextInput
                    keyboardAppearance={keyboardAppearance}
                    style={styles.sheetInput}
                    value={draftText}
                    onChangeText={setDraftText}
                    placeholder="Ton prénom"
                    placeholderTextColor={colors.textMuted}
                    maxLength={NAME_MAX}
                    autoCapitalize="words"
                    autoComplete="given-name"
                    returnKeyType="done"
                    onSubmitEditing={saveName}
                    autoFocus
                  />
                  <Text style={styles.emptyText}>
                    C’est le nom que les autres voient sur ton profil.
                  </Text>
                  <GradientButton title="Enregistrer" loading={saving} onPress={saveName} />
                </>
              )}


              {(editing === 'bio' || editing === 'job') && (
                <>
                  <TextInput
                    keyboardAppearance={keyboardAppearance}
                    style={editing === 'bio' ? styles.sheetBio : styles.sheetInput}
                    value={draftText}
                    onChangeText={setDraftText}
                    placeholder={editing === 'bio' ? 'Dis-le avec tes propres mots…' : 'Ton métier'}
                    placeholderTextColor={colors.textMuted}
                    maxLength={editing === 'bio' ? BIO_MAX : 80}
                    multiline={editing === 'bio'}
                    textAlignVertical="top"
                    autoFocus
                  />
                  {editing === 'bio' && (
                    <Text style={styles.sheetCount}>{BIO_MAX - draftText.length} caractères</Text>
                  )}
                  {editing === 'job' && (
                    <Pressable onPress={() => setEditing('education')} style={styles.sheetLink}>
                      <Text style={styles.sectionAction}>Modifier aussi mes études</Text>
                    </Pressable>
                  )}
                  <GradientButton
                    title="Enregistrer"
                    loading={saving}
                    onPress={() =>
                      saveFields(
                        editing === 'bio'
                          ? { bio: draftText.trim() }
                          : { job_title: draftText.trim() || null },
                      )
                    }
                  />
                </>
              )}

              {editing === 'height' && (
                <>
                  <Text style={styles.sheetValue}>
                    {draftHeight === null ? 'Pas indiquée' : `${draftHeight} cm`}
                  </Text>
                  <HeightSlider min={100} max={250} value={draftHeight} onChange={setDraftHeight} />
                  <GradientButton
                    title="Enregistrer"
                    loading={saving}
                    onPress={() => saveFields({ height_cm: draftHeight })}
                  />
                  {draftHeight !== null && (
                    <Pressable
                      onPress={() => saveFields({ height_cm: null })}
                      style={styles.sheetLink}
                    >
                      <Text style={styles.sectionAction}>Ne pas indiquer ma taille</Text>
                    </Pressable>
                  )}
                </>
              )}

              {editing === 'education' &&
                EDUCATION_OPTIONS.map((o) => (
                  <OptionCard
                    key={o.value}
                    label={o.label}
                    selected={profile.education === o.value}
                    onPress={() => pick('education', profile.education, o.value)}
                  />
                ))}
              {editing === 'goal' &&
                GOAL_OPTIONS.map((o) => (
                  <OptionCard
                    key={o.value}
                    icon={goalIcon(o.value)}
                    label={o.label}
                    selected={profile.relationship_goal === o.value}
                    onPress={() => saveFields({ relationship_goal: o.value })}
                  />
                ))}
              {editing === 'wantsChildren' &&
                WANTS_CHILDREN_OPTIONS.map((o) => (
                  <OptionCard
                    key={o.value}
                    label={o.label}
                    selected={profile.wants_children === o.value}
                    onPress={() => pick('wants_children', profile.wants_children, o.value)}
                  />
                ))}
              {editing === 'hasChildren' &&
                HAS_CHILDREN_OPTIONS.map((o) => (
                  <OptionCard
                    key={o.value}
                    label={o.label}
                    selected={profile.has_children === o.value}
                    onPress={() => pick('has_children', profile.has_children, o.value)}
                  />
                ))}
              {editing === 'drinking' &&
                FREQUENCY_OPTIONS.map((o) => (
                  <OptionCard
                    key={o.value}
                    label={o.label}
                    selected={profile.drinking === o.value}
                    onPress={() => pick('drinking', profile.drinking, o.value)}
                  />
                ))}
              {editing === 'smoking' &&
                FREQUENCY_OPTIONS.map((o) => (
                  <OptionCard
                    key={o.value}
                    label={o.label}
                    selected={profile.smoking === o.value}
                    onPress={() => pick('smoking', profile.smoking, o.value)}
                  />
                ))}
              {editing === 'religion' &&
                RELIGION_CHOICES.map((o) => (
                  <OptionCard
                    key={o.value}
                    label={o.label}
                    selected={profile.religion === o.value}
                    onPress={() => pick('religion', profile.religion, o.value)}
                  />
                ))}

              {editing === 'languages' && (
                <>
                  {LANGUAGE_OPTIONS.map((l) => (
                    <OptionCard
                      key={l}
                      multi
                      label={l}
                      selected={draftList.includes(l)}
                      onPress={() => toggleDraft(l, LANGUAGE_OPTIONS.length)}
                    />
                  ))}
                  <GradientButton
                    title="Enregistrer"
                    loading={saving}
                    onPress={() => saveFields({ languages: draftList })}
                  />
                </>
              )}

              {editing === 'interests' && (
                <>
                  <Text style={styles.emptyText}>
                    {draftList.length} sur {MAX_INTERESTS} au maximum
                  </Text>
                  <View style={styles.chipsSheet}>
                    {INTEREST_OPTIONS.map((o) => (
                      <BounceChip
                        key={o}
                        label={o}
                        icon={interestIcon(o)}
                        active={draftList.includes(o)}
                        onPress={() => toggleDraft(o, MAX_INTERESTS)}
                      />
                    ))}
                  </View>
                  <GradientButton
                    title="Enregistrer"
                    loading={saving}
                    onPress={() => saveFields({ interests: draftList })}
                  />
                </>
              )}
            </View>
          </ScrollView>
        </View>
      </BottomSheet>

      <PhotoSourceSheet
        visible={sourceOpen}
        onClose={() => setSourceOpen(false)}
        onPick={onSourcePicked}
      />

      <ProfileDetailModal
        profile={previewing ? publicPreview : null}
        onClose={() => setPreviewing(false)}
        isSelf
      />
    </SafeAreaView>
  );
}

// Carte de section : titre gras, valeur grise, chevron.
function SectionRow({
  title,
  value,
  empty,
  onPress,
}: {
  title: string;
  value: string;
  empty?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed]} onPress={onPress}>
      <View style={styles.cardRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={[styles.cardValue, empty && styles.cardEmpty]} numberOfLines={2}>
            {value}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.text} />
      </View>
    </Pressable>
  );
}

// Ligne de détail : icône, libellé, valeur à droite, chevron.
function DetailRow({
  icon,
  label,
  value,
  onPress,
  last,
  locked,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null;
  onPress: () => void;
  last?: boolean;
  // Information affichée mais non modifiable : cadenas au lieu du chevron.
  locked?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.detail, !last && styles.detailBorder, pressed && styles.pressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}${locked ? ', non modifiable' : ''}`}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, !value && styles.cardEmpty]} numberOfLines={1}>
        {value ?? (locked ? 'Non renseigné' : 'Ajouter')}
      </Text>
      <Ionicons
        name={locked ? 'lock-closed' : 'chevron-forward'}
        size={locked ? 14 : 16}
        color={locked ? colors.textMuted : colors.text}
      />
    </Pressable>
  );
}

// « 12 mars 1998 (27 ans) ».
function birthLabel(birthDate: string | null | undefined): string | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${date} (${ageFromBirthDate(birthDate)} ans)`;
}
