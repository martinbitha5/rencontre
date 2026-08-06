import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppLock } from '../lib/applock';
import { colors, radius, spacing } from '../theme';

export const CODE_LENGTH = 4;

// Pavé numérique réutilisé par l'écran de verrouillage et par la définition du
// code dans les paramètres.
export function CodePad({
  title,
  subtitle,
  error,
  onComplete,
}: {
  title: string;
  subtitle?: string;
  error?: string | null;
  onComplete: (code: string) => void;
}) {
  const [code, setCode] = useState('');

  const push = (digit: string) => {
    if (code.length >= CODE_LENGTH) return;
    const next = code + digit;
    setCode(next);
    if (next.length === CODE_LENGTH) {
      // Laisse le dernier point s'afficher avant de rendre la main.
      setTimeout(() => {
        onComplete(next);
        setCode('');
      }, 120);
    }
  };

  return (
    <View style={styles.pad}>
      <View style={styles.lockIcon}>
        <Ionicons name="lock-closed" size={30} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      <View style={styles.dots}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < code.length && styles.dotFilled]} />
        ))}
      </View>

      <Text style={styles.error}>{error ?? ' '}</Text>

      <View style={styles.keys}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Pressable
            key={d}
            onPress={() => push(d)}
            style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
          >
            <Text style={styles.keyText}>{d}</Text>
          </Pressable>
        ))}
        <View style={styles.key} />
        <Pressable
          onPress={() => push('0')}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
        >
          <Text style={styles.keyText}>0</Text>
        </Pressable>
        <Pressable
          onPress={() => setCode((c) => c.slice(0, -1))}
          style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
        >
          <Ionicons name="backspace-outline" size={24} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

// Écran plein affiché par-dessus l'app tant que le code n'est pas saisi.
export function LockScreen() {
  const { unlock } = useAppLock();
  const [error, setError] = useState<string | null>(null);

  const submit = async (code: string) => {
    const ok = await unlock(code);
    setError(ok ? null : 'Code incorrect. Réessaie.');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <CodePad
        title="Dowe est verrouillé"
        subtitle="Entre ton code secret pour continuer."
        error={error}
        onComplete={submit}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  pad: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  lockIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },
  dots: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dotFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  error: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginTop: spacing.sm,
    minHeight: 18,
  },
  keys: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: 264,
    marginTop: spacing.sm,
  },
  key: {
    width: 78,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    margin: 3,
  },
  keyPressed: { backgroundColor: colors.surface },
  keyText: { fontSize: 26, fontWeight: '700', color: colors.text },
});
