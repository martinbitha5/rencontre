import { Stack, useRouter, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppLockProvider, useAppLock } from '@/providers/applock';
import { AuthProvider, useAuth } from '@/providers/auth';
import { wireNotificationNavigation } from '@/services/notifications';
import { bootThemePreference, watchSystemTheme } from '@/utils/themePreference';
import { WalletProvider } from '@/providers/wallet';
import { AppLoading } from '@/components/AppLoading';
import { IntroSplash } from '@/components/IntroSplash';
import { LockScreen } from '@/components/LockScreen';
import { colors, isDark, isIOS } from '@/theme';

// Verrou par code secret : posé par-dessus tout le reste, y compris la
// navigation. Rien de l'app n'est atteignable tant que le code n'est pas saisi.
function LockGate({ children }: { children: React.ReactNode }) {
  const { locked, ready } = useAppLock();
  if (!ready) {
    return <AppLoading />;
  }
  return locked ? <LockScreen /> : <>{children}</>;
}

function Gate({ children }: { children: React.ReactNode }) {
  const { session, profile, loading, syncing } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // `syncing` : session connue mais profil pas encore chargé. Naviguer ici
    // ferait passer un compte déjà onboardé par l'écran d'onboarding.
    if (loading || syncing) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (session && !profile?.is_onboarded && !inOnboarding) {
      router.replace('/onboarding');
    } else if (session && profile?.is_onboarded && (inAuthGroup || inOnboarding)) {
      router.replace('/(tabs)');
    }
  }, [session, profile, loading, syncing, segments, router]);

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

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
                  <Stack.Screen name="payment" />
                  <Stack.Screen name="mobile-money" />
                  <Stack.Screen name="checkout" />
                  <Stack.Screen name="checkout-return" />
                  <Stack.Screen name="scan" />
                  <Stack.Screen name="verify-profile" />
                  <Stack.Screen name="app-lock" />
                </Stack>
              </Gate>
            </LockGate>
            {!introDone && <IntroSplash onFinish={() => setIntroDone(true)} />}
          </WalletProvider>
        </AuthProvider>
      </AppLockProvider>
    </GestureHandlerRootView>
  );
}
