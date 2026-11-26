import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppLockProvider, useAppLock } from '@/providers/applock';
import { AuthProvider, useAuth } from '@/providers/auth';
import { wireNotificationNavigation } from '@/services/notifications';
import { restAudioSession } from '@/utils/audioSession';
import { bootThemePreference, watchSystemTheme } from '@/utils/themePreference';
import { WalletProvider } from '@/providers/wallet';
import { AppLoading } from '@/components/AppLoading';
import { IntroSplash } from '@/components/IntroSplash';
import { LockScreen } from '@/components/LockScreen';
import { showToast, TopToastHost } from '@/components/TopToast';
import { cacheGet, cacheSet } from '@/utils/cache';
import { colors, isDark, isIOS } from '@/theme';
import { IS_EXPO_GO } from '@/utils/expoGo';
import { markIntroDone } from '@/utils/introState';
import { preloadWelcomeVideo } from '@/utils/welcomeVideo';

// L'écran de démarrage natif (logo sur fond prune) reste affiché jusqu'à ce que
// l'intro ait peint sa première image : c'est IntroSplash qui le retire, pour
// un enchaînement sans image vide. Fondu court côté natif.
SplashScreen.preventAutoHideAsync().catch(() => {});
// Le fondu natif n'existe que dans les vraies builds ; Expo Go l'ignore et
// prévient dans les journaux, on ne l'y demande donc pas.
if (!IS_EXPO_GO) {
  SplashScreen.setOptions({ duration: 220, fade: true });
}

// Verrou par code secret : posé par-dessus tout le reste, y compris la
// navigation. Rien de l'app n'est atteignable tant que le code n'est pas saisi.
// Le code protège un compte : sans personne connecté, il n'y a rien à
// protéger et l'app s'ouvre normalement sur l'accueil. À la déconnexion, le
// code est oublié, pour que le compte suivant ne tombe pas sur le code d'un
// autre.
function LockGate({ children }: { children: React.ReactNode }) {
  const { locked, ready, forgetCode } = useAppLock();
  const { session } = useAuth();
  const hadSession = useRef(false);

  useEffect(() => {
    if (session) hadSession.current = true;
    else if (hadSession.current) {
      hadSession.current = false;
      forgetCode();
    }
  }, [session, forgetCode]);

  if (!ready) {
    return <AppLoading />;
  }
  return locked && session ? <LockScreen /> : <>{children}</>;
}

function Gate({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, syncing } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const firstRoute = useRef(true);

  useEffect(() => {
    // `syncing` : session connue mais profil pas encore chargé. Naviguer ici
    // ferait passer un compte déjà onboardé par l'écran d'onboarding.
    if (loading || syncing) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';
    const isFirst = firstRoute.current;
    firstRoute.current = false;

    // Démarrage à froid sans compte : toujours l'accueil. Sinon l'app pouvait
    // rouvrir sur une étape du parcours de connexion restée en mémoire (le
    // code reçu par e-mail, par exemple) chez quelqu'un qui n'a rien demandé.
    if (!session && isFirst && !(inAuthGroup && segments[1] === 'welcome')) {
      router.replace('/(auth)/welcome');
    } else if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (session && !profile?.is_onboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (session && profile?.is_onboarded && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [session, profile, loading, syncing, segments, router]);

  // Personne de connecté : l'écran d'accueil et sa vidéo arrivent. On copie
  // la vidéo dans le cache tout de suite, pendant l'intro animée, pour
  // qu'elle soit prête à l'affichage (voir utils/welcomeVideo).
  useEffect(() => {
    if (!loading && !session) preloadWelcomeVideo();
  }, [loading, session]);

  // Toucher une notification ouvre l'écran visé (data.url posée par la edge
  // function send-push) — y compris quand l'app était complètement fermée :
  // la navigation n'est branchée qu'une fois la session prête et l'onboarding
  // terminé, pour que Gate ne la redirige pas aussitôt ailleurs.
  const onboarded = !!profile?.is_onboarded;
  useEffect(() => {
    if (loading || syncing || !session || !onboarded) return;
    return wireNotificationNavigation((url) => router.push(url as Href));
  }, [loading, syncing, session, onboarded, router]);

  if (loading) {
    return <AppLoading />;
  }
  return <>{children}</>;
}

// Annonce du badge bleu : quand l'équipe valide la vérification, le profil
// relu passe à is_verified. On ne l'annonce que si ce téléphone a d'abord vu
// le compte NON vérifié : un compte vérifié depuis longtemps, qui se
// reconnecte, ne reçoit pas une fausse bonne nouvelle.
function VerifiedAnnouncer() {
  const { profile } = useAuth();
  const userId = profile?.user_id;
  const verified = !!profile?.is_verified;
  useEffect(() => {
    if (!userId) return;
    const key = `verify-watch:${userId}`;
    if (!verified) {
      cacheSet(key, 'waiting');
      return;
    }
    cacheGet<string>(key).then((state) => {
      if (state !== 'waiting') return;
      cacheSet(key, 'announced');
      showToast({ tone: 'success', text: 'Ton profil a bien été vérifié !' });
    });
  }, [userId, verified]);
  return null;
}

// Thème de navigation construit sur la palette Zola. Sans lui, React
// Navigation applique son thème clair par défaut à toutes les navigations
// imbriquées (connexion, profil...) : fond blanc pendant les transitions et
// en-têtes blancs en mode sombre.
const navBase = isDark ? DarkTheme : DefaultTheme;
const navTheme = {
  ...navBase,
  colors: {
    ...navBase.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.cardSolid,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

export default function RootLayout() {
  // Intro de marque au démarrage à froid : l'empreinte qui devient le logo
  // (voir IntroSplash). Elle recouvre tout, y compris l'écran de chargement
  // et la navigation de Gate ; quand elle s'efface, l'app est déjà sur le
  // bon écran. Une fois retirée, elle ne revient pas de la session.
  const [introDone, setIntroDone] = useState(false);

  // Un thème forcé (clair ou sombre) se réapplique au démarrage à froid,
  // derrière l'écran de chargement. Sans préférence, rien ne se passe.
  // Ensuite, en mode « système », l'app suit le téléphone s'il change de
  // thème en cours de route.
  useEffect(() => {
    bootThemePreference();
    return watchSystemTheme();
  }, []);

  // Fond de la fenêtre native accordé au thème. Sans lui, il reste blanc et
  // perce en mode sombre (ouverture du clavier, transitions, retour arrière
  // au geste).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, []);

  // Session audio au repos dès le démarrage : la musique de la personne
  // continue quand elle ouvre l'app (voir utils/audioSession).
  useEffect(() => {
    restAudioSession();
  }, []);

  // Filet de sécurité : si l'intro n'a pas pu retirer l'écran natif (erreur
  // de rendu, intro déjà passée), on le retire quand même.
  useEffect(() => {
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <ThemeProvider value={navTheme}>
      <AppLockProvider>
        <AuthProvider>
          <WalletProvider>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <LockGate>
              <Gate>
                {/* contentStyle : sans lui, le conteneur natif des écrans reste
                    blanc (thème clair par défaut de la navigation) et perce en
                    mode sombre pendant les transitions. Même raison pour le
                    fond du header de la conversation. */}
                <Stack
                  screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                    // Chaque plateforme garde sa grammaire de transition :
                    // glissement latéral natif avec retour au geste sur iOS,
                    // fondu montant Material sur Android.
                    animation: isIOS ? 'default' : 'fade_from_bottom',
                  }}
                >
                  <Stack.Screen name="(auth)" />
                  <Stack.Screen name="onboarding" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen
                    name="chat/[matchId]"
                    options={{
                      headerShown: true,
                      headerTintColor: colors.primaryDeep,
                      headerTitle: '',
                      headerStyle: { backgroundColor: colors.cardSolid },
                    }}
                  />
                  <Stack.Screen name="history" />
                  <Stack.Screen name="archives" />
                  <Stack.Screen name="rewards" />
                  <Stack.Screen name="referral" />
                  <Stack.Screen name="recharge" />
                  <Stack.Screen name="incognito" />
                  <Stack.Screen name="privacy" />
                  <Stack.Screen name="payment" />
                  <Stack.Screen name="mobile-money" />
                  <Stack.Screen name="checkout" />
                  <Stack.Screen name="checkout-return" />
                  <Stack.Screen name="scan" />
                  <Stack.Screen name="verify-profile" />
                  <Stack.Screen name="preferences" />
                  <Stack.Screen name="app-lock" />
                  <Stack.Screen name="auth-callback" />
                </Stack>
              </Gate>
            </LockGate>
            <VerifiedAnnouncer />
            <TopToastHost />
            {!introDone && (
              <IntroSplash
                onFinish={() => {
                  markIntroDone();
                  setIntroDone(true);
                }}
              />
            )}
          </WalletProvider>
        </AuthProvider>
      </AppLockProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
