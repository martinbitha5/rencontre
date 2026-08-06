import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  FadeInUp,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { haptic } from '../lib/haptics';
import { FingerprintDraw, LOGO_FORMED_MS } from './DoweLogo';

// Page de bienvenue : la célébration de fin d'inscription. L'empreinte se
// dessine (la même signature que l'intro de l'app), le prénom apparaît, trois
// confirmations tombent en cascade, puis le bouton « Découvrir » invite à
// entrer. Des particules dérivent en arrière-plan : l'écran respire.
//
// La navigation vers l'app ne part QUE du bouton : c'est `onEnter` (le
// rafraîchissement du profil) qui fait basculer la garde de navigation vers
// les onglets. Rien ici ne connaît les routes.

const CHECKS = [
  { icon: 'checkmark-circle', text: 'Profil complété' },
  { icon: 'images', text: 'Photos en ligne' },
  { icon: 'heart', text: 'Prêt pour les rencontres' },
] as const;

// Particules : positions et cadences figées (pas d'aléatoire au rendu, le
// rythme doit être le même à chaque montage — c'est une chorégraphie).
const PARTICLES = [
  { left: '12%', top: '18%', size: 5, delay: 0, duration: 3600 },
  { left: '82%', top: '14%', size: 4, delay: 600, duration: 4200 },
  { left: '70%', top: '30%', size: 6, delay: 1200, duration: 3800 },
  { left: '20%', top: '38%', size: 4, delay: 300, duration: 4600 },
  { left: '88%', top: '52%', size: 5, delay: 900, duration: 4000 },
  { left: '8%', top: '62%', size: 6, delay: 1500, duration: 4400 },
  { left: '78%', top: '74%', size: 4, delay: 200, duration: 3600 },
  { left: '28%', top: '80%', size: 5, delay: 1100, duration: 4200 },
] as const;

function Particle({
  left,
  top,
  size,
  delay,
  duration,
}: (typeof PARTICLES)[number]) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(
        withTiming(1, {
          duration,
          easing: Easing.inOut(Easing.quad),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      ),
    );
  }, [t, delay, duration]);

  const st = useAnimatedStyle(() => ({
    opacity: 0.15 + t.value * 0.55,
    transform: [{ translateY: -t.value * 16 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        pc.dot,
        { left, top, width: size, height: size, borderRadius: size / 2 },
        st,
      ]}
    />
  );
}

export function OnboardingWelcome({
  name,
  onEnter,
}: {
  name: string;
  onEnter: () => Promise<void> | void;
}) {
  const [entering, setEntering] = useState(false);
  const btnScale = useSharedValue(1);
  const haloOpacity = useSharedValue(0);

  useEffect(() => {
    haptic.success();
    haloOpacity.value = withDelay(
      400,
      withSequence(
        withTiming(0.3, { duration: 700, easing: Easing.out(Easing.quad) }),
        withRepeat(
          withSequence(
            withTiming(0.16, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
            withTiming(0.3, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
        ),
      ),
    );
  }, [haloOpacity]);

  const haloStyle = useAnimatedStyle(() => ({ opacity: haloOpacity.value }));
  const btnStyle = useAnimatedStyle(() => ({ transform: [{ scale: btnScale.value }] }));

  const enter = async () => {
    if (entering) return;
    setEntering(true);
    haptic.impact();
    try {
      await onEnter();
    } finally {
      // Si le réseau a empêché la bascule, le bouton redevient utilisable ;
      // sinon la garde de navigation a déjà changé d'écran.
      setEntering(false);
    }
  };

  return (
    <LinearGradient
      colors={['#1c0b13', '#4a1030', '#9d174d']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={pc.fill}
    >
      {PARTICLES.map((p) => (
        <Particle key={`${p.left}-${p.top}`} {...p} />
      ))}
      <Animated.View style={[pc.halo, haloStyle]} />

      <SafeAreaView style={pc.safe} edges={['top', 'bottom']}>
        <View style={pc.center}>
          <FingerprintDraw size={130} color="#ffffff" glowColor="#f472b6" strokeWidth={2} pulse />

          <Animated.Text
            entering={FadeInDown.duration(420)
              .delay(LOGO_FORMED_MS - 200)
              .reduceMotion(ReduceMotion.System)}
            style={pc.title}
          >
            Bienvenue, {name}
          </Animated.Text>
          <Animated.Text
            entering={FadeInDown.duration(420)
              .delay(LOGO_FORMED_MS)
              .reduceMotion(ReduceMotion.System)}
            style={pc.subtitle}
          >
            Ton profil est prêt. De belles rencontres t'attendent.
          </Animated.Text>

          <View style={pc.checks}>
            {CHECKS.map((c, i) => (
              <Animated.View
                key={c.text}
                entering={FadeInDown.duration(360)
                  .delay(LOGO_FORMED_MS + 250 + i * 140)
                  .reduceMotion(ReduceMotion.System)}
                style={pc.checkRow}
              >
                <Ionicons name={c.icon} size={17} color="#f472b6" />
                <Text style={pc.checkText}>{c.text}</Text>
              </Animated.View>
            ))}
          </View>
        </View>

        <Animated.View
          entering={FadeInUp.duration(420)
            .delay(LOGO_FORMED_MS + 750)
            .reduceMotion(ReduceMotion.System)}
          style={btnStyle}
        >
          <Pressable
            disabled={entering}
            onPressIn={() => {
              btnScale.value = withSpring(0.97, { damping: 16, stiffness: 280 });
            }}
            onPressOut={() => {
              btnScale.value = withSpring(1, { damping: 16, stiffness: 280 });
            }}
            onPress={enter}
            style={[pc.btn, entering && { opacity: 0.7 }]}
          >
            <Text style={pc.btnText}>{entering ? 'Un instant…' : 'Découvrir'}</Text>
            {!entering && <Ionicons name="arrow-forward" size={18} color="#27141c" />}
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const pc = StyleSheet.create({
  fill: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: 24, paddingBottom: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  halo: {
    position: 'absolute',
    alignSelf: 'center',
    top: '22%',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#ec4899',
    shadowColor: '#ec4899',
    shadowOpacity: 1,
    shadowRadius: 60,
  },
  dot: { position: 'absolute', backgroundColor: '#f9a8d4' },
  title: {
    marginTop: 26,
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 300,
    marginTop: 4,
  },
  checks: { marginTop: 28, gap: 12, alignSelf: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkText: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '600' },
  btn: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  btnText: { fontSize: 16, fontWeight: '800', color: '#27141c' },
});
