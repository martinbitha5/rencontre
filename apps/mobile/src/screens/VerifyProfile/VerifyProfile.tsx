import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMyVerification, getVerificationChallenge, submitVerification } from '@/services/api';
import { Button, Centered, ScreenHeader } from '@/components/ui';
import { colors } from '@/theme';
import type { VerificationState } from '@/types';
import { styles } from './VerifyProfile.styles';

// Le geste est tiré au sort PAR LE SERVEUR et assigné au compte : deux
// personnes n'ont pas le même, et relancer l'application ne le change pas.
// C'est tout l'intérêt du procédé — une photo récupérée ailleurs ne peut pas
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

const gestureLabel = (code: string | null) => gestureFor(code).label;

type Step = 'intro' | 'camera' | 'preview' | 'sent';

export default function VerifyProfile() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<VerificationState | null>(null);
  const [step, setStep] = useState<Step>('intro');
  const [shot, setShot] = useState<{ uri: string; base64: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const camera = useRef<CameraView>(null);

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
  }, [load]);

  const takeShot = async () => {
    if (!camera.current || !ready || busy) return;
    setBusy(true);
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
      await load();
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

  if (!state) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Vérifier mon profil" />
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
        <ScreenHeader title="Vérifier mon profil" />
        <View style={styles.statusWrap}>
          <View style={[styles.statusIcon, { backgroundColor: colors.accent }]}>
            <Ionicons name="checkmark" size={54} color={colors.primaryDeep} />
          </View>
          <Text style={styles.statusTitle}>Profil vérifié</Text>
          <Text style={styles.statusText}>
            Le badge apparaît sur ton profil. Il montre aux autres que la personne sur les
            photos est bien toi, et tu reçois nettement plus de réponses.
          </Text>
          <Button title="Revenir au profil" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  // ---------- Demande en cours ----------
  if (state.status === 'pending' || step === 'sent') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Vérifier mon profil" />
        <View style={styles.statusWrap}>
          <View style={[styles.statusIcon, { backgroundColor: colors.surface }]}>
            <Ionicons name="hourglass-outline" size={48} color={colors.primary} />
          </View>
          <Text style={styles.statusTitle}>Demande envoyée</Text>
          <Text style={styles.statusText}>
            Notre équipe compare ton selfie à tes photos de profil. La réponse arrive
            généralement en moins de 24 heures. Ton selfie est supprimé dès que la
            vérification est faite.
          </Text>
          <Button title="Revenir au profil" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  // ---------- Caméra ----------
  if (step === 'camera') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Selfie de vérification" />
        <View style={styles.gestureStrip}>
          <Ionicons name={gesture.icon} size={20} color={colors.primary} />
          <Text style={styles.gestureStripText}>{gesture.label}</Text>
        </View>

        <View style={styles.cameraArea}>
          <View style={styles.cameraBox}>
            {permission?.granted ? (
              <CameraView
                ref={camera}
                style={styles.camera}
                facing="front"
                onCameraReady={() => setReady(true)}
              />
            ) : (
              <View style={styles.permissionBox}>
                <Ionicons name="camera-outline" size={36} color={colors.primary} />
                <Text style={styles.permissionText}>
                  Autorise la caméra pour prendre ton selfie de vérification.
                </Text>
                <Button title="Autoriser la caméra" onPress={requestPermission} />
              </View>
            )}
          </View>
        </View>

        {permission?.granted && (
          <View style={styles.shutterRow}>
            <Pressable
              style={({ pressed }) => [styles.shutter, pressed && { opacity: 0.85 }]}
              onPress={takeShot}
              disabled={busy || !ready}
            >
              {busy ? (
                <ActivityIndicator color={colors.primaryDeep} />
              ) : (
                <View style={styles.shutterInner} />
              )}
            </Pressable>
            <Text style={styles.shutterHint}>
              {ready ? 'Cadre bien ton visage, puis prends la photo.' : 'Caméra en préparation…'}
            </Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ---------- Aperçu avant envoi ----------
  if (step === 'preview' && shot) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Vérifie ta photo" />
        <ScrollView contentContainerStyle={styles.previewContent}>
          <Image source={{ uri: shot.uri }} style={styles.preview} contentFit="cover" />
          <View style={styles.checklist}>
            <Check text="Ton visage est net et entièrement visible" />
            <Check text={`On voit clairement : ${gesture.label.toLowerCase()}`} />
            <Check text="Pas de lunettes de soleil, pas de casquette baissée" />
          </View>
          <Button title={busy ? 'Envoi…' : 'Envoyer pour vérification'} onPress={send} loading={busy} />
          <Button
            title="Reprendre la photo"
            variant="ghost"
            onPress={() => {
              setShot(null);
              setStep('camera');
            }}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---------- Introduction ----------
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Vérifier mon profil" />
      <ScrollView contentContainerStyle={styles.introContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroBadge}>
            <Ionicons name="shield-checkmark" size={30} color={colors.primaryDeep} />
          </View>
          <Text style={styles.heroTitle}>Montre que c’est bien toi</Text>
          <Text style={styles.heroText}>
            Un badge vérifié sur ton profil, et les autres savent qu’ils parlent à une vraie
            personne. Les profils vérifiés reçoivent beaucoup plus de réponses.
          </Text>
        </View>

        {state.status === 'rejected' && (
          <View style={styles.rejected}>
            <Text style={styles.rejectedTitle}>Demande refusée</Text>
            <Text style={styles.rejectedText}>
              {state.reject_reason || 'Le selfie ne permettait pas de te reconnaître.'}
            </Text>
            <Text style={styles.rejectedText}>Tu peux recommencer dès maintenant.</Text>
          </View>
        )}

        <View style={styles.steps}>
          <Step n="1" title="Prends un selfie" text="Face à la caméra, dans un endroit éclairé." />
          <Step
            n="2"
            title="Reproduis le geste"
            text={`Celui tiré au sort pour toi : ${gesture.label.toLowerCase()}.`}
          />
          <Step
            n="3"
            title="On compare, on valide"
            text="Notre équipe compare avec tes photos de profil, sous 24 heures."
          />
        </View>

        <View style={styles.gestureCard}>
          <View style={styles.gestureIcon}>
            <Ionicons name={gesture.icon} size={34} color={colors.primaryDeep} />
          </View>
          <View style={styles.gestureTexts}>
            <Text style={styles.gestureLabel}>Ton geste</Text>
            <Text style={styles.gestureValue}>{gesture.label}</Text>
          </View>
        </View>

        <Text style={styles.privacy}>
          Ce selfie ne sera jamais publié ni montré aux autres abonnés. Seule notre équipe le
          voit, et il est supprimé dès que la vérification est faite.
        </Text>

        {!state.has_photo && (
          <Text style={styles.warning}>
            Ajoute d’abord au moins une photo à ton profil : sans elle, il n’y a rien à
            comparer.
          </Text>
        )}

        <Button
          title="Commencer"
          disabled={!state.has_photo}
          onPress={async () => {
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
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={styles.stepTexts}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepText}>{text}</Text>
      </View>
    </View>
  );
}

function Check({ text }: { text: string }) {
  return (
    <View style={styles.checkRow}>
      <Ionicons name="checkmark-circle" size={18} color={colors.success} />
      <Text style={styles.checkText}>{text}</Text>
    </View>
  );
}
