import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoinIcon } from '../../../components/coins';
import { CountUp, PressableScale, Reveal } from '../../../components/motion';
import { MenuRow, ScreenHeader } from '../../../components/ui';
import { COIN_NAME_PLURAL, formatCoins } from '../../../config/economy';
import { useWallet } from '../../../lib/wallet';
import { colors, radius, spacing } from '../../../theme';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Mon portefeuille : une carte de solde, puis deux entrées. L'historique vit
// sur son propre écran — cette page doit répondre à « combien il me reste »
// en un coup d'œil, sans faire défiler.
export default function WalletScreen() {
  const router = useRouter();
  const { wallet, refresh } = useWallet();
  // Rejoue le comptage du solde à chaque ouverture de l'écran : remonter le
  // CountUp (via key) relance l'animation 0 -> solde, sinon elle ne se voyait
  // qu'au tout premier chargement, souvent masquée par la transition.
  const [replay, setReplay] = useState(0);

  useFocusEffect(
    useCallback(() => {
      refresh();
      setReplay((r) => r + 1);
    }, [refresh]),
  );

  const freeLeft = wallet ? Math.max(wallet.free_dm_quota - wallet.free_dms_used, 0) : null;
  // Part périssable du solde : annoncée clairement plutôt que de laisser le
  // solde fondre sans explication le jour de l'échéance.
  const expiring =
    wallet && wallet.expiring_balance > 0 && wallet.expiring_at ? wallet : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Mon portefeuille" />
      <ScrollView contentContainerStyle={styles.content}>
        <Reveal>
          <LinearGradient
            colors={[colors.washTo, colors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.balanceCard}
          >
            <Text style={styles.balanceCaption}>Solde</Text>
            <View style={styles.balanceRow}>
              {/* Le solde se compose sous les yeux : 0 puis rattrapage. La
                  courbe est très sortante, donc l'essentiel du chemin est fait
                  en un tiers du temps et le chiffre se pose. */}
              {wallet ? (
                <CountUp
                  key={replay}
                  value={wallet.balance}
                  duration={1100}
                  format={formatCoins}
                  style={styles.balanceValue}
                />
              ) : (
                <Text style={styles.balanceValue}>–</Text>
              )}
              <CoinIcon size={28} />
            </View>
            {expiring && (
              <Text style={styles.expiring}>
                Dont {formatCoins(expiring.expiring_balance)} {COIN_NAME_PLURAL} valables
                jusqu'au {formatDate(expiring.expiring_at!)}
              </Text>
            )}
            {freeLeft !== null && (
              <Text style={styles.freeDms}>Messages directs gratuits restants : {freeLeft}</Text>
            )}
            <PressableScale
              style={styles.refreshBtn}
              onPress={refresh}
              accessibilityRole="button"
              accessibilityLabel="Actualiser le solde"
            >
              <View style={styles.refreshInner}>
                <Ionicons name="refresh" size={15} color={colors.textOnPrimary} />
                <Text style={styles.refreshText}>Actualiser</Text>
              </View>
            </PressableScale>
          </LinearGradient>
        </Reveal>

        <Reveal index={1} style={styles.menu}>
          <MenuRow
            icon="wallet-outline"
            label="Obtenir plus de pièces"
            onPress={() => router.push('/rewards')}
          />
        </Reveal>

        <Reveal index={2} style={styles.menu}>
          <MenuRow
            icon="list-outline"
            label="Voir toutes les transactions"
            onPress={() => router.push('/(tabs)/profile/transactions')}
          />
        </Reveal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: 0, gap: spacing.md },
  balanceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: 'center',
    gap: 4,
  },
  balanceCaption: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: 2,
  },
  balanceValue: { fontSize: 44, fontWeight: '800', color: colors.text },
  expiring: { fontSize: 13, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  freeDms: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  refreshBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  refreshInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 26,
    // 44 de haut : cible tactile au standard iOS.
    minHeight: 44,
  },
  refreshText: { fontSize: 15, fontWeight: '700', color: colors.textOnPrimary },
  menu: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
});
