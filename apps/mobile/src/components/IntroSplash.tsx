import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useAppLock } from '../lib/applock';
import { useAuth } from '../lib/auth';
import { FingerprintDraw, LOGO_FORMED_MS } from './DoweLogo';

// Intro de démarrage : les lignes de l'empreinte (le logo Dowe) se dessinent
// une à une, un éclat de lumière signe la reconnaissance, le wordmark
// apparaît, l'écran tient un court instant puis s'efface en fondu avec un
// léger zoom sur l'app. Rapide (~2 s) : c'est une signature, pas un film.
//
// Tout est piloté par Reanimated sur le thread UI (60 fps), le dessin des
// lignes vit dans FingerprintDraw (composant partagé du logo).

// Chronologie (ms depuis le montage). Le dessin lui-même suit la chronologie
// exportée par DoweLogo (formé + éclat retombé à LOGO_FORMED_MS).
const WORD_AT = 850; // apparition du wordmark, chevauche la fin du dessin
const DONE_AT = LOGO_FORMED_MS + 550; // logo formé puis tenue d'environ 0,5 s
const EXIT_MS = 420;

export function IntroSplash({ onFinish }: { onFinish: () => void }) {
  // Sortie conditionnée à deux choses : l'animation est arrivée au bout de sa
  // tenue, ET l'app derrière est prête (session chargée, verrou évalué). La
  // navigation de Gate s'est faite pendant l'intro : le fondu débouche
  // directement sur le bon écran, profils compris.
  const { loading, syncing } = useAuth();
  const { ready: lockReady } = useAppLock();
  const appReady = lockReady && !loading && !syncing;

  const reduceMotion = useReducedMotion();
  const [animDone, setAnimDone] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitStarted = useRef(false);

  const haloOpacity = useSharedValue(reduceMotion ? 0.16 : 0);
  const wordOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const wordShift = useSharedValue(reduceMotion ? 0 : 10);
  const overlayOpacity = useSharedValue(1);
  const overlayScale = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      // Accessibilité : pas de chorégraphie, le logo formé s'affiche
      // brièvement puis s'efface en fondu simple.
      const t = setTimeout(() => setAnimDone(true), 800);
      return () => clearTimeout(t);
    }
    haloOpacity.value = withDelay(
      500,
      withTiming(0.16, { duration: 600, easing: Easing.inOut(Easing.quad) }),
    );
    wordOpacity.value = withDelay(WORD_AT, withTiming(1, { duration: 380 }));
    wordShift.value = withDelay(
      WORD_AT,
      withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );

    // Micro retour haptique au moment de l'éclat : discret, façon capteur
    // d'empreinte qui reconnaît. Sans objet sur le web.
    const haptic = setTimeout(() => {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }
    }, 800);
    const done = setTimeout(() => setAnimDone(true), DONE_AT);
    return () => {
      clearTimeout(haptic);
      clearTimeout(done);
    };
  }, [reduceMotion, haloOpacity, wordOpacity, wordShift]);

  useEffect(() => {
    if (!animDone || !appReady || exitStarted.current) return;
    exitStarted.current = true;
    setExiting(true);
    overlayScale.value = withTiming(1.06, {
      duration: EXIT_MS,
      easing: Easing.in(Easing.cubic),
    });
    overlayOpacity.value = withTiming(
      0,
      { duration: EXIT_MS, easing: Easing.inOut(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(onFinish)();
      },
    );
  }, [animDone, appReady, overlayOpacity, overlayScale, onFinish]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    transform: [{ scale: overlayScale.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({ opacity: haloOpacity.value }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ translateY: wordShift.value }],
  }));

  return (
    <Animated.View
      style={[styles.overlay, overlayStyle]}
      pointerEvents={exiting ? 'none' : 'auto'}
    >
      <LinearGradient
        colors={['#1c0b13', '#4a1030', '#9d174d']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.fill}
      >
        <Animated.View style={[styles.halo, haloStyle]} />
        <FingerprintDraw size={150} color="#ffffff" glowColor="#f472b6" strokeWidth={2} />
        <Animated.View style={wordStyle}>
          <Text style={styles.wordmark}>DOWE</Text>
          <Text style={styles.tagline}>Des rencontres qui comptent</Text>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  halo: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#ec4899',
    // Adouci par une ombre portée de sa propre couleur : sans elle, le disque
    // aurait un bord net et ferait pastille au lieu de lueur.
    shadowColor: '#ec4899',
    shadowOpacity: 1,
    shadowRadius: 60,
  },
  wordmark: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 10,
    // Compense l'espacement de la dernière lettre pour un centrage optique.
    marginRight: -10,
    textAlign: 'center',
  },
  tagline: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
});
