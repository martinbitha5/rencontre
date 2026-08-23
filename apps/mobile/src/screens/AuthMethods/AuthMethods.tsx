import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DoweMark } from '@/components/DoweLogo';
import { ErrorText } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors, onLight } from '@/theme';
import { styles } from './AuthMethods.styles';

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
      <SafeAreaView style={styles.safe}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.textOnPrimary} />
        </Pressable>

        <View style={styles.hero}>
          {/* Marque posée directement sur le fond prune, sans pastille : seule
              l'empreinte se dessine, le fond reste visible entre ses lignes. */}
          <View style={styles.logo}>
            <DoweMark size={64} color={colors.textOnAccent} strokeWidth={2} />
          </View>
          <Text style={styles.title}>{isSignup ? 'Créer un compte' : 'Connexion'}</Text>
          <Text style={styles.tagline}>
            {isSignup
              ? 'Choisis comment créer ton compte Dowe.'
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
