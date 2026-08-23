import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PaymentResultToast, type PaymentToast } from '@/components/PaymentResultToast';
import { Button } from '@/components/ui';
import { waitForPaymentSettlement, type PaymentStatus } from '@/services/payments';
import { useWallet } from '@/providers/wallet';
import { colors } from '@/theme';
import { styles } from './CheckoutReturn.styles';

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
  // Alerte de résultat avec jauge 100 % -> 0 : à zéro elle se ferme, et un
  // paiement réussi ramène automatiquement au portefeuille.
  const [toast, setToast] = useState<PaymentToast | null>(null);

  const onToastDone = () => {
    const wasSuccess = toast?.variant === 'success';
    setToast(null);
    if (wasSuccess) router.dismissAll();
  };

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
      if (result === 'success') {
        refresh();
        setToast({
          variant: 'success',
          title: 'Paiement confirmé',
          message: 'Ton achat a été validé et activé sur ton compte.',
        });
      } else if (result === 'cancelled') {
        setToast({
          variant: 'failure',
          title: 'Paiement annulé',
          message: "Aucun montant n'a été débité de ton compte.",
        });
      } else if (result === 'failed') {
        setToast({
          variant: 'failure',
          title: 'Paiement refusé',
          message: 'Le paiement a été refusé. Aucun montant ne sera débité.',
        });
      }
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
      <PaymentResultToast toast={toast} onDone={onToastDone} />
    </SafeAreaView>
  );
}
