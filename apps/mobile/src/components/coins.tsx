import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COIN_COLOR, COIN_NAME_PLURAL, formatCoins } from '../config/economy';
import { useWallet } from '../lib/wallet';
import { colors, radius, spacing } from '../theme';
import { Button } from './ui';

// Icône de la monnaie interne : des pièces en or.
export function CoinIcon({ size = 16, color = COIN_COLOR }: { size?: number; color?: string }) {
  return <FontAwesome5 name="coins" size={size} color={color} />;
}

// Pastille de solde : affichée dans les en-têtes, ouvre la recharge par défaut.
export function CoinPill({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const { wallet } = useWallet();
  return (
    <Pressable
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.8 }]}
      onPress={onPress ?? (() => router.push('/recharge'))}
      hitSlop={8}
    >
      <CoinIcon size={14} />
      <Text style={styles.pillText}>{wallet ? formatCoins(wallet.balance) : '–'}</Text>
    </Pressable>
  );
}

// Modale "solde insuffisant" : propose la recharge.
export function InsufficientCoinsModal({
  cost,
  onClose,
}: {
  cost: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { wallet } = useWallet();
  return (
    <Modal visible={cost !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <CoinIcon size={28} />
          </View>
          <Text style={styles.title}>Solde insuffisant</Text>
          <Text style={styles.text}>
            Il te faut {cost === null ? '' : formatCoins(cost)} {COIN_NAME_PLURAL} pour cette
            action{wallet ? ` et il t'en reste ${formatCoins(wallet.balance)}` : ''}. Recharge
            ton compte pour continuer.
          </Text>
          <Button
            title="Recharger"
            onPress={() => {
              onClose();
              router.push('/recharge');
            }}
          />
          <Button title="Plus tard" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: { fontSize: 14, fontWeight: '800', color: colors.textOnAccent },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(14,15,12,.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  icon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primaryDeep,
    textAlign: 'center',
  },
  text: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
    lineHeight: 21,
  },
});
