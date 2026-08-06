import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { DoweMark } from './DoweLogo';

// Écran de chargement du démarrage : dégradé prune vers rose, logo empreinte
// qui respire, wordmark DOWE. Il couvre l'attente de la session, du verrou et
// l'éventuel rechargement de thème, pour que l'app n'ouvre jamais sur un
// spinner nu. (L'intro animée du démarrage à froid vit dans IntroSplash ;
// cet écran est le fond d'attente qu'elle recouvre.)
export function AppLoading() {
  const breathe = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Respiration lente du logo, accompagnée du halo : une présence calme,
    // pas un spinner.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.06, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    glowLoop.start();
    return () => {
      loop.stop();
      glowLoop.stop();
    };
  }, [breathe, glow]);

  return (
    <LinearGradient
      colors={['#1c0b13', '#4a1030', '#9d174d']}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.fill}
    >
      {/* Halo doux derrière le logo */}
      <Animated.View
        style={[
          styles.halo,
          { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] }) },
        ]}
      />
      <Animated.View style={{ transform: [{ scale: breathe }] }}>
        <DoweMark size={92} color="#ffffff" strokeWidth={2} />
      </Animated.View>
      <Text style={styles.wordmark}>DOWE</Text>
      <Text style={styles.tagline}>Des rencontres qui comptent</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  halo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: '#ec4899',
  },
  wordmark: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 10,
    // Compense l'espacement de la dernière lettre pour un centrage optique.
    marginRight: -10,
  },
  tagline: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 14,
    fontWeight: '500',
    marginTop: -6,
  },
});
