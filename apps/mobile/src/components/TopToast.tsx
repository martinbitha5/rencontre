import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '@/utils/haptics';
import { colors, isDark, shadows } from '@/theme';

// Bandeau de notification en haut de l'écran : il descend, reste quelques
// secondes, puis remonte tout seul. Un appui ou un glissement vers le haut le
// ferme tout de suite. Une seule notification à la fois : la suivante
// remplace la précédente.
//
// Appelable de partout, y compris hors d'un composant : showToast({ ... }).

export type ToastTone = 'info' | 'success' | 'pending' | 'error' | 'offline' | 'unstable';

export interface ToastOptions {
  text: string;
  tone?: ToastTone;
  // Durée d'affichage en millisecondes, 4 s par défaut. 0 : le bandeau reste
  // jusqu'à ce qu'on le ferme ou qu'un autre le remplace (perte de réseau).
  duration?: number;
  // Identifie un bandeau pour pouvoir le retirer sans toucher aux autres
  // (hideToast('network') ne ferme que le bandeau réseau).
  key?: string;
}

type Listener = (t: ToastOptions & { id: number }) => void;
let listener: Listener | null = null;
let hideListener: ((key?: string) => void) | null = null;
let seq = 0;
// Minuterie de disparition : une seule notification à la fois, donc une
// seule minuterie, gardée au niveau du module.
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(options: ToastOptions) {
  seq += 1;
  listener?.({ ...options, id: seq });
}

// Ferme le bandeau affiché. Avec une clé, seulement s'il porte cette clé.
export function hideToast(key?: string) {
  hideListener?.(key);
}

// Pastille colorée à gauche : la couleur dit la nature du message d'un coup
// d'oeil, l'icône le confirme.
const TONES: Record<ToastTone, { bg: string; icon: keyof typeof Ionicons.glyphMap; ink: string }> = {
  info: { bg: '#ffe1ea', icon: 'notifications', ink: '#e6175f' },
  pending: { bg: '#ffe1ea', icon: 'time-outline', ink: '#e6175f' },
  success: { bg: '#16a34a', icon: 'checkmark', ink: '#ffffff' },
  error: { bg: '#dc2626', icon: 'alert', ink: '#ffffff' },
  offline: { bg: '#24262a', icon: 'cloud-offline-outline', ink: '#ffffff' },
  unstable: { bg: '#f59e0b', icon: 'cellular-outline', ink: '#ffffff' },
};

const HIDDEN = -160;

export function TopToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const y = useSharedValue(HIDDEN);

  const clear = () => setToast(null);

  const hide = () => {
    if (hideTimer) clearTimeout(hideTimer);
    y.set(
      withTiming(HIDDEN, { duration: 260, easing: Easing.in(Easing.cubic) }, (done) => {
        if (done) runOnJS(clear)();
      }),
    );
  };

  // Clé du bandeau affiché, lue par hideToast sans attendre un rendu.
  const shownKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    listener = (t) => {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
      shownKey.current = t.key;
      setToast(t);
      y.set(HIDDEN);
      y.set(withSpring(0, { damping: 18, stiffness: 220, mass: 0.8 }));
      if (t.tone === 'success') haptic.success();
      else if (t.tone === 'error') haptic.impact();
      else haptic.tap();
      const duration = t.duration ?? 4000;
      if (duration > 0) hideTimer = setTimeout(hide, duration);
    };
    hideListener = (key) => {
      if (key !== undefined && shownKey.current !== key) return;
      shownKey.current = undefined;
      hide();
    };
    return () => {
      listener = null;
      hideListener = null;
      if (hideTimer) clearTimeout(hideTimer);
    };
    // hide ne dépend que de valeurs stables (y et la minuterie du module).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [y]);

  // Glisser vers le haut ferme, vers le bas résiste.
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      y.set(e.translationY < 0 ? e.translationY : e.translationY * 0.15);
    })
    .onEnd((e) => {
      if (e.translationY < -24 || e.velocityY < -400) runOnJS(hide)();
      else y.set(withSpring(0, { damping: 18, stiffness: 220 }));
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
    opacity: y.value <= HIDDEN + 10 ? 0 : 1,
  }));

  if (!toast) return null;
  const tone = TONES[toast.tone ?? 'info'];

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.wrap, { top: insets.top + 6 }, style]}>
        <Pressable style={styles.card} onPress={hide} accessibilityRole="alert">
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Ionicons name={tone.icon} size={24} color={tone.ink} />
          </View>
          <Text style={styles.text} numberOfLines={3}>
            {toast.text}
          </Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // L'ombre vit sur le conteneur : sur la carte, le découpage des coins
  // arrondis la ferait disparaître sur iOS.
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 200,
    borderRadius: 14,
    // Carte du thème : claire en mode clair, prune élevé en mode sombre, avec
    // un liseré pour la détacher du fond quand l'ombre ne se voit plus.
    backgroundColor: colors.cardSolid,
    ...(isDark ? { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border } : null),
    ...shadows.floating,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    borderRadius: 14,
    overflow: 'hidden',
  },
  badge: { alignSelf: 'stretch', width: 64, alignItems: 'center', justifyContent: 'center' },
  text: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.text,
  },
});
