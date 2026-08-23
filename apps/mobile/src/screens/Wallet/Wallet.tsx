import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CoinIcon } from '@/components/coins';
import { CountUp, PressableScale, Reveal } from '@/components/motion';
import { HeaderBackButton, ScreenHeader } from '@/components/ui';
import { COIN_NAME_PLURAL, formatCoins } from '@/config/economy';
import { useWallet } from '@/providers/wallet';
import { colors } from '@/theme';
import { styles } from './Wallet.styles';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// Mon portefeuille : le solde trône dans une grande carte signature au voile
// sable, les deux entrées vivent en cartes-rangées crème dessous. Cette page
// doit répondre à « combien il me reste » en un coup d'œil, sans faire
// défiler.
export default function Wallet() {
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
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Même en-tête que partout ailleurs : titre centré, pastille de retour
          à gauche. */}
      <ScreenHeader title="Mon portefeuille" left={<HeaderBackButton />} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* La grande carte du solde : voile sable, coin signature. */}
        <Reveal>
          <LinearGradient
            colors={[colors.washFrom, colors.washTo]}
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
              <CoinIcon size={22} color={colors.gold} />
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
                <Ionicons name="refresh" size={14} color={colors.accent} />
                <Text style={styles.refreshText}>Actualiser</Text>
              </View>
            </PressableScale>
          </LinearGradient>
        </Reveal>

        <Reveal index={1}>
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

        <Reveal index={2}>
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
    </SafeAreaView>
  );
}
