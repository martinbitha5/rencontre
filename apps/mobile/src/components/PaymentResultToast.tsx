import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { colors, radius, sigCorner, spacing } from '@/theme';

// Alerte de résultat de paiement, posée en haut de l'écran : icône, titre,
// message, et une jauge qui se vide de 100 % à 0 en DURATION_MS. Quand la
// jauge atteint zéro, onDone est appelé (fermeture, et navigation éventuelle
// décidée par l'écran).
//
// La jauge est une INFORMATION (le temps qu'il reste avant la fermeture), pas
// une décoration : elle s'anime donc même quand « Réduire les animations »
// est actif (ReduceMotion.Never) — sans elle, la bannière semblerait figée
// six secondes puis disparaîtrait sans prévenir.

export type PaymentToast = {
  variant: 'success' | 'failure';
  title: string;
  message: string;
};

const DURATION_MS = 6000;

export function PaymentResultToast({
  toast,
  onDone,
}: {
  toast: PaymentToast | null;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const gauge = useSharedValue(1);

  useEffect(() => {
    if (!toast) return;
    gauge.value = 1;
    gauge.value = withTiming(0, {
      duration: DURATION_MS,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    });
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(
        toast.variant === 'success'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      ).catch(() => {});
    }
    const timer = setTimeout(onDone, DURATION_MS);
    return () => clearTimeout(timer);
    // gauge est stable (shared value) ; relancer uniquement sur nouveau toast.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  const fill = useAnimatedStyle(() => ({ width: `${gauge.value * 100}%` }));

  if (!toast) return null;
  const tint = toast.variant === 'success' ? colors.success : colors.danger;

  return (
    <Animated.View
      entering={FadeInDown.duration(260).reduceMotion(ReduceMotion.System)}
      exiting={FadeOutUp.duration(200).reduceMotion(ReduceMotion.System)}
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
      pointerEvents="none"
    >
      <View style={styles.card}>
        <View style={[styles.icon, { backgroundColor: tint }]}>
          <Ionicons
            name={toast.variant === 'success' ? 'checkmark' : 'close'}
            size={22}
            color="#ffffff"
          />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{toast.title}</Text>
          <Text style={styles.message}>{toast.message}</Text>
          <View style={styles.track}>
            <Animated.View style={[styles.fillBar, { backgroundColor: tint }, fill]} />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    zIndex: 50,
    elevation: 50,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.cardSolid,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderBottomRightRadius: sigCorner,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  message: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginTop: spacing.xs,
  },
  fillBar: { height: '100%', borderRadius: 3 },
});
