import { haptic } from '@/utils/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useAppLock } from '@/providers/applock';
import { useAuth } from '@/providers/auth';
import { FingerprintDraw } from '@/components/ZolaLogo';
import { flame } from '@/theme';

// Intro de démarrage, dans le prolongement EXACT de l'écran de démarrage
// natif (app.json : logo empreinte blanc, 76 pt, centré, sur #fd267a).
//
// Avant, l'écran natif montrait le logo, puis l'intro repartait d'un fond plus
// sombre avec un logo vide redessiné trait par trait : à l'ouverture, le logo
// disparaissait puis réapparaissait. Maintenant :
//   1. l'écran natif reste affiché tant que l'intro n'a pas peint sa première
//      image (RootLayout bloque la disparition automatique) ;
//   2. l'intro démarre sur le même rose plein, le logo déjà formé, à la même
//      taille et au même endroit ;
//   3. le fond glisse vers le dégradé flamme du site (rose vers orange), le
//      logo grandit, l'éclat de reconnaissance passe, le wordmark apparaît,
//      puis fondu vers l'app.
// Rien ne disparaît pour revenir ensuite.

const SPLASH_BG = '#fd267a'; // app.json > expo-splash-screen > backgroundColor
const LOGO_SIZE = 150;
// Le glyphe occupe ~75 % de l'image de l'écran natif (76 pt) : ~57 pt.
// FingerprintDraw le dessine sur ~85 % de sa taille : 0,45 recolle les deux.
const START_SCALE = 0.45;

// Intro courte : environ une seconde de l'écran natif à l'app (contre 1,6 s
// avant). Elle se prolonge seulement si l'app derrière n'est pas encore
// prête, jamais pour le plaisir de l'animation.
const GROW_MS = 480;
const WORD_AT = 200;
const DONE_AT = 720; // logo formé, wordmark posé, courte tenue
const EXIT_MS = 280;

export function IntroSplash({ onFinish }: { onFinish: () => void }) {
  // Sortie conditionnée à deux choses : l'animation est arrivée au bout de sa
  // tenue, ET l'app derrière est prête (session chargée, verrou évalué). La
  // navigation de Gate s'est faite pendant l'intro : le fondu débouche
  // directement sur le bon écran.
  const { loading, syncing } = useAuth();
  const { ready: lockReady } = useAppLock();
  const appReady = lockReady && !loading && !syncing;

  const reduceMotion = useReducedMotion();
  const [animDone, setAnimDone] = useState(false);
  const [exiting, setExiting] = useState(false);
  const exitStarted = useRef(false);

  const solid = useSharedValue(1); // rose plein de l'écran natif
  const logoScale = useSharedValue(reduceMotion ? 1 : START_SCALE);
  const wordOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const wordShift = useSharedValue(reduceMotion ? 0 : 10);
  const overlayOpacity = useSharedValue(1);
  const overlayScale = useSharedValue(1);

  // L'écran natif ne s'efface qu'une fois la première image de l'intro
  // posée : jamais d'image vide entre les deux.
  const onFirstLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      solid.set(withTiming(0, { duration: 300 }));
      const t = setTimeout(() => setAnimDone(true), 500);
      return () => clearTimeout(t);
    }
    solid.set(withTiming(0, { duration: 400, easing: Easing.inOut(Easing.quad) }));
    logoScale.set(withTiming(1, { duration: GROW_MS, easing: Easing.out(Easing.cubic) }));
    wordOpacity.set(withDelay(WORD_AT, withTiming(1, { duration: 300 })));
    wordShift.set(withDelay(
      WORD_AT,
      withTiming(0, { duration: 300, easing: Easing.out(Easing.cubic) }),
    ));

    // Retour haptique de l'éclat : passe par utils/haptics, désactivé pour
    // l'instant.
    const tick = setTimeout(() => haptic.tap(), 300);
    const done = setTimeout(() => setAnimDone(true), DONE_AT);
    return () => {
      clearTimeout(tick);
      clearTimeout(done);
    };
  }, [reduceMotion, solid, logoScale, wordOpacity, wordShift]);

  useEffect(() => {
    if (!animDone || !appReady || exitStarted.current) return;
    exitStarted.current = true;
    setExiting(true);
    overlayScale.set(withTiming(1.05, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) }));
    overlayOpacity.set(withTiming(
      0,
      { duration: EXIT_MS, easing: Easing.inOut(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(onFinish)();
      },
    ));
  }, [animDone, appReady, overlayOpacity, overlayScale, onFinish]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
    transform: [{ scale: overlayScale.value }],
  }));
  const solidStyle = useAnimatedStyle(() => ({ opacity: solid.value }));
  const logoStyle = useAnimatedStyle(() => ({ transform: [{ scale: logoScale.value }] }));
  const wordStyle = useAnimatedStyle(() => ({
    opacity: wordOpacity.value,
    transform: [{ translateY: wordShift.value }],
  }));

  return (
    <Animated.View
      style={[styles.overlay, overlayStyle]}
      pointerEvents={exiting ? 'none' : 'auto'}
      onLayout={onFirstLayout}
    >
      {/* Dégradé flamme du site (--flame, 45 degrés). */}
      <LinearGradient
        colors={flame}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_BG }, solidStyle]} />

      {/* Le logo reste au centre exact de l'écran, comme sur l'écran natif.
          Le wordmark se pose dessous sans le déplacer. */}
      <View style={styles.center} pointerEvents="none">
        <Animated.View style={logoStyle}>
          <FingerprintDraw drawn size={LOGO_SIZE} color="#ffffff" glowColor="#ffffff" strokeWidth={2} />
        </Animated.View>
        <Animated.View style={[styles.words, wordStyle]}>
          <Text style={styles.wordmark}>ZOLA</Text>
          <Text style={styles.tagline}>Des rencontres qui comptent</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
  },
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  words: {
    position: 'absolute',
    top: '50%',
    marginTop: LOGO_SIZE / 2 + 18,
    left: 0,
    right: 0,
    alignItems: 'center',
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
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: 6,
    textAlign: 'center',
  },
});
