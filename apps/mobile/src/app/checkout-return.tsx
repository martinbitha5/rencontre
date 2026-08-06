import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { waitForPaymentSettlement, type PaymentStatus } from '../lib/payments';
import { useWallet } from '../lib/wallet';
import { colors, spacing } from '../theme';

// Atterrissage du deep link dowe://checkout-return?ref=...&status=... posé par
// la page de résultat MultiPay. Sur iOS le navigateur intégré intercepte la
// redirection et /checkout gère la suite ; sur Android le lien peut être routé
// directement ici. Dans les deux cas le statut est REDEMANDÉ au serveur, qui
// seul décide (et crédite) : le paramètre status de l'URL n'est qu'indicatif.
export default function CheckoutReturn() {
  const router = useRouter();
  const { refresh } = useWallet();
  const params = useLocalSearchParams<{ ref?: string; status?: string }>();
  const [settlement, setSettlement] = useState<PaymentStatus | 'checking'>('checking');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ref = typeof params.ref === 'string' ? params.ref : '';
      if (!ref) {
        if (!cancelled) setSettlement('unknown');
        return;
      }
      const result = await waitForPaymentSettlement(ref);
      if (cancelled) return;
      setSettlement(result);
      if (result === 'success') refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.ref]);

  if (settlement === 'checking') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.wrap}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.text}>Vérification du paiement…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const success = settlement === 'success';
  const cancelled = settlement === 'cancelled';
  const failed = settlement === 'failed';
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.wrap}>
        <View style={[styles.icon, (failed || cancelled) && styles.iconFailed]}>
          <Ionicons
            name={success ? 'checkmark' : failed || cancelled ? 'close' : 'time-outline'}
            size={40}
            color={colors.textOnAccent}
          />
        </View>
        <Text style={styles.title}>
          {success
            ? 'Paiement confirmé'
            : cancelled
              ? 'Paiement annulé'
              : failed
                ? 'Paiement non abouti'
                : 'Paiement en attente'}
        </Text>
        <Text style={styles.text}>
          {success
            ? 'Ton achat a été validé et activé sur ton compte.'
            : cancelled
              ? "Tu as quitté le paiement avant la fin. Aucun montant n'a été débité de ton compte."
              : failed
                ? 'Le paiement a été refusé. Aucun montant ne sera débité.'
                : "Le paiement est en cours de confirmation. Ton achat sera activé automatiquement dès sa validation."}
        </Text>
        <Button title="Revenir au portefeuille" onPress={() => router.dismissAll()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  wrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconFailed: { backgroundColor: colors.danger },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  text: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.md,
  },
});
