import { FontAwesome5 } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COIN_COLOR, COIN_NAME_PLURAL, formatCoins } from '@/config/economy';
import { PAYMENTS_ENABLED } from '@/config/features';
import { useWallet } from '@/providers/wallet';
import { colors, radius, spacing } from '@/theme';
import { Button } from '@/components/ui';

// Icône de la monnaie interne : des pièces en or.
export function CoinIcon({ size = 16, color = COIN_COLOR }: { size?: number; color?: string }) {
  return <FontAwesome5 name="coins" size={size} color={color} />;
}

// Pastille de solde : affichée dans les en-têtes, ouvre la recharge par défaut.
// En mode gratuit elle ne s'affiche pas : il n'y a plus de solde à montrer ni
// de recharge où aller.
export function CoinPill({ onPress }: { onPress?: () => void }) {
  const router = useRouter();
  const { wallet } = useWallet();
  if (!PAYMENTS_ENABLED) return null;
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
//
// En mode gratuit elle ne devrait jamais s'ouvrir — le serveur ne facture plus
// rien (economy_config.free_mode). Elle reste néanmoins branchée en filet :
// si le client tourne en gratuit alors que la base facture encore, mieux vaut
// un message honnête qu'un renvoi vers une boutique fermée.
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
          <Text style={styles.title}>
            {PAYMENTS_ENABLED ? 'Solde insuffisant' : 'Action indisponible'}
          </Text>
          <Text style={styles.text}>
            {PAYMENTS_ENABLED ? (
              <>
                Il te faut {cost === null ? '' : formatCoins(cost)} {COIN_NAME_PLURAL} pour cette
                action{wallet ? ` et il t'en reste ${formatCoins(wallet.balance)}` : ''}. Recharge
                ton compte pour continuer.
              </>
            ) : (
              "Cette action n'a pas pu aboutir pour l'instant. Réessaie dans un moment."
            )}
          </Text>
          {PAYMENTS_ENABLED && (
            <Button
              title="Recharger"
              onPress={() => {
                onClose();
                router.push('/recharge');
              }}
            />
          )}
          <Button
            title={PAYMENTS_ENABLED ? 'Plus tard' : "J'ai compris"}
            variant="ghost"
            onPress={onClose}
          />
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
    backgroundColor: 'rgba(23,18,23,.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.cardSolid,
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
