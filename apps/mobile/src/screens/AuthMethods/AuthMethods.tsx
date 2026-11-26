import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZolaMark } from '@/components/ZolaLogo';
import { ErrorText } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors, flame, onLight, photoScrim } from '@/theme';
import { styles } from './AuthMethods.styles';
import { safeBack } from '@/utils/safeBack';

// Un couple enlacé qui rit (photo Unsplash libre de droit, voir
// assets/images/CREDITS.txt), 1170 x 1755. Le haut de la photo est un fond
// uni où se posent le logo et le titre, les visages tombent dans la bande
// libre du milieu, et les boutons sur le bas, sous le voile.
const heroPhoto = require('../../../assets/images/auth-couple.jpg');

// Voile du haut : le titre blanc reste lisible quelle que soit la photo.
const topScrim = ['rgba(16, 17, 19, 0.55)', 'rgba(16, 17, 19, 0)'] as const;

// Choix de la méthode d'authentification, atteint depuis l'accueil par
// « Connexion » ou « Créer un compte ». Les trois options sont les mêmes
// (OAuth ne distingue pas les deux), seul l'e-mail route différemment.
export default function AuthMethods() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isSignup = mode === 'signup';
  const { signInWithOAuth } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const oauth = async (provider: 'google' | 'apple') => {
    setBusy(provider);
    setError(null);
    const err = await signInWithOAuth(provider);
    if (err) setError(err);
    setBusy(null);
  };

  const verb = isSignup ? 'Créer' : 'Continuer';

  return (
    <View style={styles.screen}>
      {/* Photo en plein écran, recadrée sur les côtés : les visages restent
          au centre quel que soit le format du téléphone. */}
      <Image
        source={heroPhoto}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
        transition={250}
        pointerEvents="none"
        accessible={false}
      />
      <LinearGradient
        colors={topScrim}
        locations={[0, 0.38]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Voile sombre sur le bas : les boutons s'y posent et doivent rester
          lisibles. */}
      <LinearGradient
        colors={photoScrim}
        locations={[0.4, 0.72, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <SafeAreaView style={styles.safe}>
        <Pressable onPress={() => safeBack(router, '/(auth)/welcome')} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.textOnPrimary} />
        </Pressable>

        <View style={styles.hero}>
          {/* Marque posée directement sur le fond prune, sans pastille : seule
              l'empreinte se dessine, le fond reste visible entre ses lignes.
              Le bloc tient dans le tiers haut, au-dessus de la tête du
              portrait ; le centre de l'écran est laissé au visage. */}
          <View style={styles.logo}>
            <ZolaMark size={64} color={colors.textOnAccent} strokeWidth={2} />
          </View>
          <Text style={styles.title}>{isSignup ? 'Créer un compte' : 'Connexion'}</Text>
          <Text style={styles.tagline}>
            {isSignup
              ? 'Choisis comment créer ton compte Zola.'
              : 'Content de te revoir. Choisis comment te connecter.'}
          </Text>
        </View>

        <View style={styles.actions}>
          <ErrorText>{error}</ErrorText>
          <Pressable
            style={[styles.btn, styles.btnWhite]}
            onPress={() => oauth('google')}
            disabled={busy !== null}
          >
            <Ionicons name="logo-google" size={20} color={onLight.ink} style={styles.btnIcon} />
            <Text style={styles.btnWhiteText}>
              {busy === 'google' ? 'Connexion…' : `${verb} avec Google`}
            </Text>
          </Pressable>
          {Platform.OS === 'ios' && (
            <Pressable
              style={[styles.btn, styles.btnBlack]}
              onPress={() => oauth('apple')}
              disabled={busy !== null}
            >
              <Ionicons name="logo-apple" size={20} color="#fff" style={styles.btnIcon} />
              <Text style={styles.btnBlackText}>
                {busy === 'apple' ? 'Connexion…' : `${verb} avec Apple`}
              </Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.btn, styles.btnLime]}
            onPress={() =>
              router.push(isSignup ? '/(auth)/sign-up' : '/(auth)/sign-in')
            }
          >
            {/* Dégradé flamme des boutons du site. */}
            <LinearGradient
              pointerEvents="none"
              colors={flame}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, styles.btnFill]}
            />
            <Ionicons
              name="mail-outline"
              size={20}
              color={colors.textOnAccent}
              style={styles.btnIcon}
            />
            <Text style={styles.btnLimeText}>{`${verb} avec un e-mail`}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
