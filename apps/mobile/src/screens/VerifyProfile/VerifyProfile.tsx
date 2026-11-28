import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Ellipse, Mask, Rect } from 'react-native-svg';
import {
  getMyPhotos,
  getMyVerification,
  getVerificationChallenge,
  photoUrl,
  submitVerification,
} from '@/services/api';
import { GlassSurface, Reveal } from '@/components/motion';
import {
  Button,
  Centered,
  HeaderBackButton,
  ScreenHeader,
  VerifiedBadge,
} from '@/components/ui';
import { ZolaMark } from '@/components/ZolaLogo';
import { showToast } from '@/components/TopToast';
import { SITE } from '@/config/support';
import { PoseCard } from './PoseCard';
import { GestureImage } from '@/components/GestureArt';
import { useAuth } from '@/providers/auth';
import { countryName, useMyCountry } from '@/utils/countries';
import { cacheGet, cacheSet } from '@/utils/cache';
import { haptic } from '@/utils/haptics';
import { colors, isDark, photoScrim, spacing } from '@/theme';
import { ageFromBirthDate, type MyPhoto, type VerificationState } from '@/types';
import { styles } from './VerifyProfile.styles';
import { safeBack } from '@/utils/safeBack';

// Le geste est tiré au sort PAR LE SERVEUR et assigné au compte : deux
// personnes n'ont pas le même, et relancer l'application ne le change pas.
// C'est tout l'intérêt du procédé, une photo récupérée ailleurs ne peut pas
// répondre à une consigne qu'on ne pouvait pas connaître à l'avance.
// Les codes viennent de draw_gesture() (migration 031) ; cette table ne sert
// qu'à les afficher.
const GESTURES: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  main_ouverte: { label: 'Main ouverte à côté du visage', icon: 'hand-left-outline' },
  pouce_leve: { label: 'Pouce levé près de la joue', icon: 'thumbs-up-outline' },
  signe_v: { label: 'Deux doigts levés, le signe V', icon: 'hand-right-outline' },
  main_joue: { label: 'Main posée sur la joue', icon: 'happy-outline' },
  main_sur_tete: { label: 'Main posée sur le haut de la tête', icon: 'accessibility-outline' },
  trois_doigts: { label: 'Trois doigts levés', icon: 'hand-right-outline' },
  index_leve: { label: 'Index levé vers le plafond', icon: 'arrow-up-circle-outline' },
  paume_face: { label: 'Paume tournée vers la caméra', icon: 'stop-outline' },
};

const UNKNOWN_GESTURE = { label: 'le geste demandé', icon: 'help-circle-outline' as const };

const gestureFor = (code: string | null | undefined) =>
  (code && GESTURES[code]) || UNKNOWN_GESTURE;

type Step = 'intro' | 'pose' | 'camera' | 'preview' | 'sent';

// Date d'envoi d'une demande, en français court : « 14 sept., 17:36 ».
function formatSentAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString(
    'fr-FR',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

export default function VerifyProfile() {
  const router = useRouter();
  const { profile } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<VerificationState | null>(null);
  const [step, setStep] = useState<Step>('intro');
  const [shot, setShot] = useState<{ uri: string; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const camera = useRef<CameraView>(null);
  // Ma première photo : le héros montre MA carte, badge compris, telle que
  // les autres la verront. Lue d'abord dans le cache, corrigée par le réseau.
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  // Le geste vient du serveur, jamais d'un tirage local.
  const [gestureCode, setGestureCode] = useState<string | null>(null);
  const gesture = gestureFor(gestureCode);

  const load = useCallback(async () => {
    try {
      const [verification, challenge] = await Promise.all([
        getMyVerification(),
        getVerificationChallenge().catch(() => null),
      ]);
      setState(verification);
      if (challenge) setGestureCode(challenge.gesture);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    load();
    cacheGet<MyPhoto[]>('my-photos').then((cached) => {
      if (cached?.[0]) setPhotoPath((prev) => prev ?? cached[0].storage_path);
    });
    getMyPhotos()
      .then((fresh) => {
        setPhotoPath(fresh[0]?.storage_path ?? null);
        cacheSet('my-photos', fresh);
      })
      .catch(() => {});
  }, [load]);

  const takeShot = async () => {
    if (!camera.current || !ready || busy) return;
    setBusy(true);
    haptic.impact();
    try {
      const photo = await camera.current.takePictureAsync({ base64: true, quality: 0.5 });
      if (!photo?.base64) throw new Error('no_image');
      setShot({ uri: photo.uri, base64: photo.base64 });
      setStep('preview');
    } catch {
      Alert.alert('Photo impossible', 'Réessaie dans un instant.');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!shot || busy) return;
    setBusy(true);
    try {
      await submitVerification(shot.base64);
      setShot(null);
      setStep('sent');
      showToast({
        tone: 'pending',
        text: 'On a bien reçu ta photo. On te prévient très vite !',
      });
      safeBack(router);
      load();
    } catch (e) {
      const raw = String((e as { message?: string })?.message ?? '');
      const message = raw.includes('no_profile_photo')
        ? 'Ajoute d’abord au moins une photo à ton profil : sans elle, il n’y a rien à comparer.'
        : raw.includes('already_pending')
          ? 'Une demande est déjà en cours d’examen.'
          : raw.includes('already_verified')
            ? 'Ton profil est déjà vérifié.'
            : 'Envoi impossible. Vérifie ta connexion et réessaie.';
      Alert.alert('Vérification', message);
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert(
          'Caméra refusée',
          'La vérification a besoin de la caméra. Tu peux l’autoriser dans les réglages du téléphone.',
        );
        return;
      }
    }
    setStep('camera');
  };

  const name = profile?.display_name ?? '';
  const age = profile?.birth_date ? ageFromBirthDate(profile.birth_date) : null;

  if (!state) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Vérification" left={<HeaderBackButton />} />
        <Centered>
          <ActivityIndicator size="large" color={colors.primary} />
        </Centered>
      </SafeAreaView>
    );
  }

  // ---------- Déjà vérifié ----------
  if (state.is_verified) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <HeaderWash />
        <ScreenHeader title="Vérification" left={<HeaderBackButton />} />
        <ScrollView contentContainerStyle={styles.statusContent} showsVerticalScrollIndicator={false}>
          <Reveal index={0}>
            <MiniCard photoPath={photoPath} name={name} age={age} verified tag="Vérifié" />
          </Reveal>
          <Reveal index={1}>
            <Text style={styles.statusTitle}>Profil vérifié</Text>
          </Reveal>
          <Reveal index={2}>
            <Text style={styles.statusText}>
              Le badge bleu est sur ta fiche, partout où ton nom apparaît. Il dit aux autres que
              la personne sur les photos est bien toi, et tu reçois nettement plus de réponses.
            </Text>
          </Reveal>
        </ScrollView>
        <Footer>
          <Button title="Revenir au profil" variant="secondary" onPress={() => safeBack(router)} />
        </Footer>
      </SafeAreaView>
    );
  }

  // ---------- Demande en cours ----------
  if (state.status === 'pending' || step === 'sent') {
    const sentAt = formatSentAt(state.created_at);
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <HeaderWash />
        <ScreenHeader title="Vérification" left={<HeaderBackButton />} />
        <ScrollView contentContainerStyle={styles.statusContent} showsVerticalScrollIndicator={false}>
          <Reveal index={0} style={[styles.statusIcon, { backgroundColor: colors.washFrom }]}>
            <Ionicons name="hourglass-outline" size={46} color={colors.selectedInk} />
          </Reveal>
          <Reveal index={1}>
            <Text style={styles.statusTitle}>Selfie bien reçu</Text>
          </Reveal>
          <Reveal index={2}>
            <Text style={styles.statusText}>
              Notre équipe le compare à tes photos de profil. On te prévient dès que c’est fait,
              en général sous 24 heures.
            </Text>
          </Reveal>
          <Reveal index={3} style={[styles.progress, styles.column]}>
            <ProgressRow
              state="done"
              title="Selfie envoyé"
              detail={sentAt ? `Le ${sentAt}` : 'À l’instant'}
            />
            <ProgressRow
              state="current"
              title="Examen par l’équipe"
              detail="Comparaison avec tes photos de profil et le geste demandé."
            />
            <ProgressRow
              state="todo"
              title="Badge bleu sur ta fiche"
              detail="Dès validation, sans rien faire de plus. Le selfie est ensuite supprimé."
              last
            />
          </Reveal>
        </ScrollView>
        <Footer>
          <Button title="Revenir au profil" variant="secondary" onPress={() => safeBack(router)} />
        </Footer>
      </SafeAreaView>
    );
  }

  // ---------- Caméra ----------
  if (step === 'camera') {
    return (
      <CameraStep
        granted={!!permission?.granted}
        requestPermission={requestPermission}
        cameraRef={camera}
        ready={ready}
        busy={busy}
        onReady={() => setReady(true)}
        onShoot={takeShot}
        onBack={() => setStep('intro')}
        gestureCode={gestureCode}
        gestureLabel={gesture.label}
      />
    );
  }

  // ---------- Vérifie et valide : le modèle et le selfie côte à côte ----------
  if (step === 'preview' && shot) {
    const retake = () => {
      haptic.tap();
      setShot(null);
      setStep('camera');
    };
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.flowTop}>
          <Pressable onPress={retake} hitSlop={12} accessibilityLabel="Retour">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}>
          <Reveal index={0} style={styles.pair}>
            <PoseCard gesture={gestureCode} width={128} badge={false} />
            <Image source={{ uri: shot.uri }} style={styles.pairShot} contentFit="cover" />
          </Reveal>
          <Reveal index={1}>
            <Text style={styles.flowTitle}>Vérifie et valide ta photo</Text>
          </Reveal>
          <Reveal index={2} style={styles.bullets}>
            <Bullet text="Ton visage est net et on voit bien le geste, comme sur le modèle." />
            <Bullet text="Notre équipe compare ce selfie avec les photos de ton profil." />
            <Bullet text="Il n'est jamais montré aux autres et il est supprimé après l'examen." />
          </Reveal>
          <Reveal index={3} style={styles.flowActions}>
            <PrimaryButton title="Accepter et envoyer" onPress={send} loading={busy} />
            <Pressable onPress={retake} disabled={busy} style={styles.flowSecondary} hitSlop={8}>
              <Text style={styles.flowSecondaryText}>Recommencer</Text>
            </Pressable>
          </Reveal>
          <HelpLinks />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- Prends cette pose ----------
  if (step === 'pose') {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.flowTop}>
          <Pressable
            onPress={() => setStep('intro')}
            hitSlop={12}
            accessibilityLabel="Fermer"
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.flowContent} showsVerticalScrollIndicator={false}>
          <Reveal index={0} style={styles.poseHero}>
            <PoseCard gesture={gestureCode} width={170} />
            <View style={styles.poseLabel}>
              <GestureImage code={gestureCode} size={26} />
              <Text style={styles.poseLabelText}>{gesture.label}</Text>
            </View>
          </Reveal>
          <Reveal index={1}>
            <Text style={[styles.flowTitle, styles.center]}>Prends cette pose et fais un selfie</Text>
          </Reveal>
          <Reveal index={2}>
            <Text style={styles.flowText}>
              On vérifie que ce selfie correspond bien aux photos de ton profil. Il ne sera visible
              par aucun autre membre.
            </Text>
          </Reveal>
          <Reveal index={3} style={styles.tips}>
            <Text style={styles.tipsTitle}>Pour que ta vérification réussisse</Text>
            <Bullet text="Ton visage doit être bien visible, sans lunettes de soleil." />
            <Bullet text={`Fais exactement le même geste : ${gesture.label.toLowerCase()}.`} />
            <Bullet text="Mets-toi dans un endroit bien éclairé." />
          </Reveal>
          <Reveal index={4} style={styles.flowActions}>
            <PrimaryButton title="Prendre la photo" icon="camera" onPress={start} />
          </Reveal>
          <HelpLinks />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- Introduction ----------
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.flowTop}>
        <HeaderBackButton />
      </View>
      <ScrollView contentContainerStyle={styles.introFlow} showsVerticalScrollIndicator={false}>
        <Reveal index={0} style={styles.introHero}>
          <MiniCard photoPath={photoPath} name={name} age={age} verified tag="Vérifié" tilt />
        </Reveal>
        <Reveal index={1}>
          <Text style={styles.flowTitle}>Confirme ton profil avec une photo vérifiée</Text>
        </Reveal>
        <Reveal index={2}>
          <Text style={styles.flowText}>
            Le badge bleu montre aux autres membres que ton profil est authentique. Ça prend une
            minute.
          </Text>
        </Reveal>

        {state.status === 'rejected' && (
          <Reveal index={3} style={styles.rejected}>
            <Ionicons name="alert-circle" size={22} color={colors.danger} />
            <View style={styles.rejectedBody}>
              <Text style={styles.rejectedTitle}>Dernière tentative refusée</Text>
              <Text style={styles.rejectedText}>
                {state.reject_reason || 'Le selfie ne permettait pas de te reconnaître.'} Tu peux
                recommencer dès maintenant.
              </Text>
            </View>
          </Reveal>
        )}

        {!state.has_photo && (
          <Reveal index={3} style={styles.warningCard}>
            <Ionicons name="image-outline" size={22} color={colors.accent} />
            <Text style={styles.warningText}>
              Ajoute d’abord une photo à ton profil, sinon il n’y a rien à comparer.
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/profile/edit')} hitSlop={8}>
              <Text style={styles.warningLink}>Ajouter</Text>
            </Pressable>
          </Reveal>
        )}
      </ScrollView>

      <View style={styles.introFooter}>
        <Pressable onPress={() => safeBack(router)} hitSlop={10} style={styles.flowSecondary}>
          <Text style={styles.flowSecondaryText}>Ignorer</Text>
        </Pressable>
        <PrimaryButton
          title="Vérification photo"
          icon="checkmark-circle"
          disabled={!state.has_photo}
          onPress={() => {
            haptic.tap();
            setStep('pose');
          }}
        />
      </View>
    </SafeAreaView>
  );
}

// Bouton plein de la marque, en pilule.
function PrimaryButton({
  title,
  onPress,
  loading,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primary,
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole="button"
    >
      {loading ? (
        <ActivityIndicator color={colors.textOnPrimary} />
      ) : (
        <>
          {!!icon && <Ionicons name={icon} size={20} color={colors.textOnPrimary} />}
          <Text style={styles.primaryText}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <View style={styles.bulletDot} />
      <Text style={styles.bulletText}>{text}</Text>
    </View>
  );
}

// Les trois liens d'aide du bas : confidentialité, raison d'être, contact.
function HelpLinks() {
  const open = (page: string) => WebBrowser.openBrowserAsync(`${SITE}/${page}`).catch(() => {});
  const rows: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }[] = [
    {
      label: 'Consulter la politique de confidentialité',
      icon: 'chevron-forward',
      onPress: () => open('confidentialite.html'),
    },
    {
      label: 'Pourquoi est-ce nécessaire ?',
      icon: 'chevron-forward',
      onPress: () =>
        Alert.alert(
          'Pourquoi vérifier ?',
          'La vérification prouve que la personne sur les photos est bien toi. Elle protège tout le monde contre les faux profils, et les profils vérifiés reçoivent plus de réponses.',
        ),
    },
    { label: 'Obtenir de l’aide', icon: 'information-circle', onPress: () => open('contact.html') },
  ];
  return (
    <View style={styles.links}>
      {rows.map((r, i) => (
        <Pressable
          key={r.label}
          onPress={r.onPress}
          style={({ pressed }) => [styles.linkRow, i < rows.length - 1 && styles.linkBorder, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.linkText}>{r.label}</Text>
          <Ionicons name={r.icon} size={18} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Voile rose derrière l'en-tête et filigrane d'empreinte : la signature des
// écrans d'accueil du profil, reprise ici.
// ---------------------------------------------------------------------------
function HeaderWash() {
  return (
    <>
      <LinearGradient
        colors={[colors.washFrom, colors.background]}
        style={[styles.headerGrad, { height: 320 }]}
        pointerEvents="none"
      />
      <View style={styles.watermark} pointerEvents="none">
        <ZolaMark
          size={260}
          color={isDark ? 'rgba(255, 225, 234,0.06)' : 'rgba(16, 17, 19,0.06)'}
          strokeWidth={1.6}
        />
      </View>
    </>
  );
}

// Pied fixe en verre, comme l'écran Incognito : le bouton reste sous le pouce
// quelle que soit la longueur de la page.
function Footer({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <GlassSurface intensity={60} style={styles.footer}>
      <View style={[styles.footerInner, { paddingBottom: spacing.md + insets.bottom }]}>
        {children}
      </View>
    </GlassSurface>
  );
}

// Ma carte Rencontres en miniature, avec le badge bleu : ce que les autres
// verront une fois la vérification faite. Même grammaire que la vraie carte
// (cadre crème, coin signature, voile, nom centré).
function MiniCard({
  photoPath,
  name,
  age,
  verified,
  tag,
  tilt,
}: {
  photoPath: string | null;
  name: string;
  age: number | null;
  verified: boolean;
  tag: string;
  tilt?: boolean;
}) {
  // Le pays de ma ville, sous mon prénom : RDC ou Congo-Brazzaville.
  const country = useMyCountry();
  return (
    <View style={[styles.miniCardWrap, tilt && styles.miniCardTilt]}>
      <View style={styles.miniPhotoFrame}>
        {photoPath ? (
          <Image
            source={{ uri: photoUrl(photoPath) }}
            style={styles.miniPhoto}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={styles.miniNoPhoto}>
            <Text style={styles.miniInitial}>{name?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        )}
        <LinearGradient colors={photoScrim} style={styles.miniInfo}>
          <View style={styles.miniNameRow}>
            <Text style={styles.miniName} numberOfLines={1}>
              {name || 'Toi'}
              {age ? `, ${age}` : ''}
            </Text>
            {verified && <VerifiedBadge size={18} />}
          </View>
          <Text style={styles.miniPlace} numberOfLines={1}>
            {countryName(country)}
          </Text>
        </LinearGradient>
      </View>
      <View style={styles.miniTag}>
        <Ionicons name="checkmark-circle" size={12} color="#ffffff" />
        <Text style={styles.miniTagText}>{tag}</Text>
      </View>
    </View>
  );
}

// Ligne de la timeline d'attente : faite, en cours (point qui respire), à
// venir.
function ProgressRow({
  state,
  title,
  detail,
  last,
}: {
  state: 'done' | 'current' | 'todo';
  title: string;
  detail: string;
  last?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (state !== 'current' || reduceMotion) return;
    pulse.set(withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 0 }),
      ),
      -1,
    ));
  }, [state, reduceMotion, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.1 }],
  }));

  return (
    <View style={styles.progressRow}>
      <View style={styles.progressRail}>
        {state === 'current' && <Animated.View style={[styles.progressPulse, pulseStyle]} />}
        <View
          style={[
            styles.progressDot,
            state === 'done' && styles.progressDotDone,
            state === 'current' && styles.progressDotCurrent,
          ]}
        >
          {state === 'done' && <Ionicons name="checkmark" size={16} color="#ffffff" />}
          {state === 'current' && <Ionicons name="time" size={15} color="#ffffff" />}
        </View>
        {!last && (
          <View style={[styles.progressLine, state === 'done' && styles.progressLineDone]} />
        )}
      </View>
      <View style={[styles.progressTexts, last && styles.progressTextsLast]}>
        <Text style={[styles.progressTitle, state === 'todo' && styles.progressTitleMuted]}>
          {title}
        </Text>
        <Text style={styles.progressDetail}>{detail}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Prise de vue : plein écran sombre, caméra frontale dans un cadre à coin
// signature, guide ovale pour le visage, consigne du geste posée sur l'image,
// déclencheur blanc. Le bouton de sortie est en haut à gauche, toujours sous
// l'encoche.
// ---------------------------------------------------------------------------
function CameraStep({
  granted,
  requestPermission,
  cameraRef,
  ready,
  busy,
  onReady,
  onShoot,
  onBack,
  gestureCode,
  gestureLabel,
}: {
  granted: boolean;
  requestPermission: () => Promise<{ granted: boolean }>;
  cameraRef: React.RefObject<CameraView | null>;
  ready: boolean;
  busy: boolean;
  onReady: () => void;
  onShoot: () => void;
  onBack: () => void;
  gestureCode: string | null;
  gestureLabel: string;
}) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ w: Math.round(width), h: Math.round(height) });
  };
  // Ovale du visage : centré, un peu au-dessus du milieu pour laisser la
  // place à la main qui fait le geste en dessous ou à côté.
  const cx = box.w / 2;
  const cy = box.h * 0.42;
  const rx = Math.min(box.w * 0.34, 150);
  const ry = rx * 1.3;

  return (
    <SafeAreaView style={styles.cameraScreen} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.cameraTop}>
        <Pressable
          onPress={() => {
            haptic.tap();
            onBack();
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={({ pressed }) => [styles.darkPill, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={20} color="#ffffff" />
          <Text style={styles.darkPillText}>Retour</Text>
        </Pressable>
      </View>

      <View style={styles.cameraArea}>
        <View style={styles.cameraBox} onLayout={onLayout}>
          {granted ? (
            <>
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="front"
                onCameraReady={onReady}
              />
              {box.w > 0 && (
                <Svg
                  width={box.w}
                  height={box.h}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                >
                  <Defs>
                    <Mask id="faceHole">
                      <Rect x={0} y={0} width={box.w} height={box.h} fill="#ffffff" />
                      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#000000" />
                    </Mask>
                  </Defs>
                  <Rect
                    x={0}
                    y={0}
                    width={box.w}
                    height={box.h}
                    fill="rgba(16, 17, 19,0.55)"
                    mask="url(#faceHole)"
                  />
                  <Ellipse
                    cx={cx}
                    cy={cy}
                    rx={rx}
                    ry={ry}
                    stroke="rgba(255,255,255,0.9)"
                    strokeWidth={2}
                    strokeDasharray="10 8"
                    fill="none"
                  />
                </Svg>
              )}
              <View style={styles.gestureFloating}>
                <GestureImage code={gestureCode} size={34} />
                <Text style={styles.gestureFloatingText} numberOfLines={2}>
                  {gestureLabel}
                </Text>
              </View>
              <Text style={styles.faceHint}>Place ton visage dans l’ovale</Text>
            </>
          ) : (
            <View style={styles.permissionBox}>
              <Ionicons name="camera-outline" size={40} color="#ffffff" />
              <Text style={styles.permissionText}>
                Autorise la caméra pour prendre ton selfie de vérification.
              </Text>
              <Button title="Autoriser la caméra" onPress={() => void requestPermission()} />
            </View>
          )}
        </View>
      </View>

      {granted && (
        <View style={styles.shutterRow}>
          <Pressable
            style={({ pressed }) => [styles.shutter, pressed && { opacity: 0.85 }]}
            onPress={onShoot}
            disabled={busy || !ready}
            accessibilityRole="button"
            accessibilityLabel="Prendre la photo"
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={[styles.shutterInner, !ready && { opacity: 0.4 }]} />
            )}
          </Pressable>
          <Text style={styles.shutterHint}>
            {ready ? 'Visage net, geste bien visible, puis déclenche.' : 'Caméra en préparation…'}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}
