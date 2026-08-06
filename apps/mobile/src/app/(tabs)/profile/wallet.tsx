import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoinIcon } from '../../../components/coins';
import { CountUp, PressableScale, Reveal } from '../../../components/motion';
import { COIN_NAME_PLURAL, formatCoins } from '../../../config/economy';
import { useWallet } from '../../../lib/wallet';
import { colors, radius, shadows, spacing } from '../../../theme';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Mon portefeuille : le solde trône sur le dégradé d'en-tête, la feuille
// claire en dessous porte les deux entrées. L'historique vit sur son propre
// écran — cette page doit répondre à « combien il me reste » en un coup
// d'œil, sans faire défiler.
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
    <View style={styles.screen}>
      {/* En-tête plein-bleed : le dégradé magenta passe derrière la barre de
          statut, la SafeArea vit à l'intérieur. */}
      <LinearGradient
        colors={[colors.headerGradFrom, colors.headerGradTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.headerGrad}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Ionicons name="chevron-back" size={26} color="#ffffff" />
            </Pressable>
            <Text style={styles.headerTitle}>Mon portefeuille</Text>
          </View>

          {/* Le solde, mis en avant sur le dégradé. */}
          <View style={styles.balanceBlock}>
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
              <CoinIcon size={26} />
            </View>
            {expiring && (
              <Text style={styles.balanceSub}>
                Dont {formatCoins(expiring.expiring_balance)} {COIN_NAME_PLURAL}
                {" valables jusqu'au "}
                {formatDate(expiring.expiring_at!)}
              </Text>
            )}
            {freeLeft !== null && (
              <Text style={styles.balanceSub}>
                Messages directs gratuits restants : {freeLeft}
              </Text>
            )}
            <PressableScale
              style={styles.refreshBtn}
              onPress={refresh}
              accessibilityRole="button"
              accessibilityLabel="Actualiser le solde"
            >
              <View style={styles.refreshInner}>
                <Ionicons name="refresh" size={14} color="#ffffff" />
                <Text style={styles.refreshText}>Actualiser</Text>
              </View>
            </PressableScale>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Feuille claire aux coins très arrondis, posée sur le bas du dégradé. */}
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={styles.content}>
          <Reveal>
            <Pressable
              style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.9 }]}
              onPress={() => router.push('/rewards')}
              accessibilityRole="button"
            >
              <View style={styles.actionIcon}>
                <Ionicons name="wallet-outline" size={20} color={colors.accent} />
              </View>
              <Text style={styles.actionLabel}>Obtenir plus de pièces</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </Reveal>

          <Reveal index={1}>
            <Pressable
              style={({ pressed }) => [styles.actionCard, pressed && { opacity: 0.9 }]}
              onPress={() => router.push('/(tabs)/profile/transactions')}
              accessibilityRole="button"
            >
              <View style={styles.actionIcon}>
                <Ionicons name="list-outline" size={20} color={colors.accent} />
              </View>
              <Text style={styles.actionLabel}>Voir toutes les transactions</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </Reveal>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.headerGradFrom },
  // Le dégradé descend sous la feuille : ses derniers points sont recouverts
  // par les coins arrondis.
  headerGrad: { paddingBottom: spacing.lg + 28 },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.sm,
    bottom: 0,
    justifyContent: 'center',
  },
  balanceBlock: {
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  balanceCaption: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: 2,
  },
  balanceValue: { fontSize: 34, fontWeight: '800', color: '#ffffff' },
  balanceSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },
  refreshBtn: {
    marginTop: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: radius.full,
  },
  refreshInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 22,
    // 40 de haut : cible tactile confortable sans alourdir l'en-tête.
    minHeight: 40,
  },
  refreshText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  // Feuille de contenu : coins hauts très arrondis, elle recouvre le dégradé.
  sheet: {
    flex: 1,
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm + 2,
  },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  // Carte-rangée d'action : pastille d'icône, libellé, chevron.
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    padding: spacing.md,
    marginBottom: 12,
    ...shadows.card,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.washFrom,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
});
