import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { DoweMark } from '@/components/DoweLogo';
import { brandRamp } from '@/theme';

// Écran de chargement du démarrage : dégradé cacao vers terracotta, logo empreinte
// qui respire, wordmark DOWE. Il couvre l'attente de la session, du verrou et
// l'éventuel rechargement de thème, pour que l'app n'ouvre jamais sur un
// spinner nu. (L'intro animée du démarrage à froid vit dans IntroSplash ;
// cet écran est le fond d'attente qu'elle recouvre.)
export function AppLoading() {
  const breathe = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Respiration lente du logo : une présence calme, pas un spinner.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1.06, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [breathe]);

  return (
    <LinearGradient
      colors={brandRamp}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.fill}
    >
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
