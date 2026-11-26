import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ZolaMark } from '@/components/ZolaLogo';
import { brandRamp, colors, flame } from '@/theme';
import { preloadWelcomeVideo, WELCOME_VIDEO } from '@/utils/welcomeVideo';
import { styles } from './Welcome.styles';

const SITE = 'https://zola-rdc.com';

// Accueil non connecté : deux entrées (Connexion / Créer un compte) qui
// mènent chacune au choix des trois méthodes, plus les liens légaux.
export default function Welcome() {
  const router = useRouter();

  // Lecteur créé vide, puis rempli avec la copie locale de la vidéo (voir
  // utils/welcomeVideo) : plus de lecture en flux depuis le serveur de dev.
  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  React.useEffect(() => {
    let alive = true;
    preloadWelcomeVideo().then(async (localUri) => {
      if (!alive) return;
      try {
        await player.replaceAsync(localUri ? { uri: localUri } : WELCOME_VIDEO);
      } catch {
        return;
      }
      if (alive) player.play();
    });
    return () => {
      alive = false;
    };
  }, [player]);

  // Sur web, le play() du setup part avant que la source soit prête : on
  // relance la lecture dès que le lecteur passe à l'état readyToPlay.
  React.useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && !player.playing) player.play();
    });
    return () => sub.remove();
  }, [player]);

  // Le système met la vidéo en pause quand l'app passe en arrière-plan :
  // on relance la lecture dès que l'app redevient active.
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !player.playing) player.play();
    });
    return () => sub.remove();
  }, [player]);

  // Le logo, le texte et les boutons sont là tout de suite sur le dégradé de
  // marque ; la vidéo, lue en local, arrive en fondu court dès sa première
  // image (jamais d'image vide ou de saut brutal).
  const videoOpacity = useSharedValue(0);
  const videoStyle = useAnimatedStyle(() => ({ opacity: videoOpacity.value }));
  const revealVideo = React.useCallback(() => {
    videoOpacity.set(withTiming(1, { duration: 350 }));
  }, [videoOpacity]);

  const openPage = (path: string) => {
    WebBrowser.openBrowserAsync(`${SITE}/${path}`).catch(() => {});
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={brandRamp}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, videoStyle]} pointerEvents="none">
        <VideoView
          player={player}
          style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
          contentFit="cover"
          nativeControls={false}
          onFirstFrameRender={revealVideo}
        />
      </Animated.View>
      <View style={styles.overlay} pointerEvents="none" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          {/* Marque posée directement sur la vidéo, sans pastille : la vidéo
              reste visible à travers les interstices de l'empreinte. */}
          <View style={styles.logo}>
            <ZolaMark size={72} color={colors.textOnAccent} strokeWidth={2} />
          </View>
          <Text style={styles.title}>ZOLA</Text>
          <Text style={styles.tagline}>
            Rencontre des Congolais qui cherchent la même chose que toi.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnLime, pressed && { opacity: 0.85 }]}
            onPress={() => router.push({ pathname: '/(auth)/methods', params: { mode: 'signin' } })}
          >
            {/* Dégradé flamme des boutons du site. */}
            <LinearGradient
              pointerEvents="none"
              colors={flame}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, styles.btnFill]}
            />
            <Text style={styles.btnLimeText}>Connexion</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnWhite, pressed && { opacity: 0.85 }]}
            onPress={() => router.push({ pathname: '/(auth)/methods', params: { mode: 'signup' } })}
          >
            <Text style={styles.btnWhiteText}>Créer un compte</Text>
          </Pressable>

          <Text style={styles.legal}>
            En continuant, tu confirmes avoir 18 ans ou plus et tu acceptes nos{' '}
            <Text style={styles.legalLink} onPress={() => openPage('conditions.html')}>
              conditions générales
            </Text>{' '}
            et notre{' '}
            <Text style={styles.legalLink} onPress={() => openPage('confidentialite.html')}>
              politique de confidentialité
            </Text>
            .
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
