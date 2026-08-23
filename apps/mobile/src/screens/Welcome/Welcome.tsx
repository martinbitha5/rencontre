import { useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import React from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DoweMark } from '@/components/DoweLogo';
import { colors } from '@/theme';
import { styles } from './Welcome.styles';

const SITE = 'https://dowe-eight.vercel.app';
const heroVideo = require('../../../assets/IMG_1770.mp4');

// Accueil non connecté : deux entrées (Connexion / Créer un compte) qui
// mènent chacune au choix des trois méthodes, plus les liens légaux.
export default function Welcome() {
  const router = useRouter();

  const player = useVideoPlayer(heroVideo, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

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

  const openPage = (path: string) => {
    WebBrowser.openBrowserAsync(`${SITE}/${path}`).catch(() => {});
  };

  return (
    <View style={styles.screen}>
      <VideoView
        player={player}
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        contentFit="cover"
        nativeControls={false}
        pointerEvents="none"
      />
      <View style={styles.overlay} pointerEvents="none" />
      <SafeAreaView style={styles.safe}>
        <View style={styles.hero}>
          {/* Marque posée directement sur la vidéo, sans pastille : la vidéo
              reste visible à travers les interstices de l'empreinte. */}
          <View style={styles.logo}>
            <DoweMark size={72} color={colors.textOnAccent} strokeWidth={2} />
          </View>
          <Text style={styles.title}>DOWE</Text>
          <Text style={styles.tagline}>
            Rencontre des Congolais qui cherchent la même chose que toi.
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.btn, styles.btnLime, pressed && { opacity: 0.85 }]}
            onPress={() => router.push({ pathname: '/(auth)/methods', params: { mode: 'signin' } })}
          >
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
