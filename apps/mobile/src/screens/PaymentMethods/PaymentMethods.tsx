import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrcFlag, OperatorLogo, PackIcon, type OperatorBrandId } from '@/components/brand';
import { ScreenHeader, SectionLabel } from '@/components/ui';
import { findPurchase, MOBILE_MONEY_OPERATORS } from '@/config/economy';
import { useAuth } from '@/providers/auth';
import { useWallet } from '@/providers/wallet';
import { getStoreOffer, purchaseStoreProduct, restoreStorePurchases } from '@/services/revenuecat';
import { colors } from '@/theme';
import { styles } from './PaymentMethods.styles';

// Choix du moyen de paiement : récap de l'achat (pack de pièces ou abonnement
// Incognito, l'écran ne fait pas la différence), puis « Paiements locaux »
// (Mobile Money via MultiPay) et « Paiements internationaux » (stores).
export default function PaymentMethods() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const purchase = findPurchase(params.kind, params.id);
  const { session } = useAuth();
  const { refresh } = useWallet();
  const [storePrice, setStorePrice] = useState<string | null>(null);
  const [loadedProductId, setLoadedProductId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isMobileStore = Platform.OS === 'ios' || Platform.OS === 'android';
  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

  useEffect(() => {
    let active = true;
    if (!isMobileStore || !session?.user.id) return;

    getStoreOffer(purchase.id, session.user.id).then((offer) => {
      if (!active) return;
      setStorePrice(offer?.price ?? null);
      setLoadedProductId(purchase.id);
    });

    return () => {
      active = false;
    };
  }, [isMobileStore, purchase.id, session?.user.id]);

  const payWithStore = async () => {
    if (!session?.user.id) {
      Alert.alert('Connexion requise', 'Reconnecte-toi puis réessaie cet achat.');
      return;
    }

    setBusy(true);
    const status = await purchaseStoreProduct(purchase.id, session.user.id);
    setBusy(false);

    if (status === 'cancelled') return;
    if (status === 'unavailable') {
      Alert.alert('Offre indisponible', `Le produit n’est pas encore proposé par ${storeName}.`);
      return;
    }
    if (status === 'error') {
      Alert.alert('Achat non abouti', 'Le store n’a pas pu terminer cet achat. Réessaie.');
      return;
    }

    await refresh();
    Alert.alert(
      'Achat confirmé',
      'Le store a confirmé ton achat. Le solde peut prendre quelques secondes à se mettre à jour.',
    );
  };

  const restorePurchases = async () => {
    if (!session?.user.id) return;
    setBusy(true);
    const restored = await restoreStorePurchases(session.user.id);
    await refresh();
    setBusy(false);
    Alert.alert(
      restored ? 'Achats synchronisés' : 'Restauration indisponible',
      restored
        ? 'Tes achats ont été synchronisés avec ce compte.'
        : 'La restauration n’a pas abouti. Vérifie ta connexion et réessaie.',
    );
  };

  const storeLoading = isMobileStore && !!session?.user.id && loadedProductId !== purchase.id;
  const displayedStorePrice = storeLoading
    ? 'Chargement…'
    : loadedProductId === purchase.id
      ? storePrice ?? 'Indisponible'
      : 'Indisponible';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title={isMobileStore ? `Paiement ${storeName}` : 'Paiement local'}
        right={Platform.OS === 'web' ? <DrcFlag width={28} /> : null}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.recap}>
          <PackIcon id={purchase.icon} size={28} />
          <Text style={styles.recapPack}>{purchase.title}</Text>
          <Text style={styles.recapCoins}>{purchase.detail}</Text>
          <Text style={styles.recapPrice}>
            {isMobileStore ? displayedStorePrice : purchase.priceCdfLabel}
          </Text>
          {!!purchase.validityDays && !isMobileStore && (
            <Text style={styles.recapValidity}>Valables {purchase.validityDays} jours</Text>
          )}
          <Text style={styles.recapHint}>
            {isMobileStore
              ? `Le paiement sera traité par ${storeName}.`
              : 'Sélectionne ton opérateur Mobile Money.'}
          </Text>
        </View>

        {Platform.OS === 'web' && (
          <View style={styles.group}>
            {MOBILE_MONEY_OPERATORS.map((op) => (
              <Pressable
                key={op.id}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
                onPress={() =>
                  router.push({
                    pathname: '/mobile-money',
                    params: { kind: purchase.kind, id: purchase.id, operator: op.id },
                  })
                }
              >
                <OperatorLogo id={op.id as OperatorBrandId} size={38} />
                <Text style={styles.rowLabel}>{op.name}</Text>
                <Text style={styles.rowDetail}>{purchase.priceCdfLabel}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        )}

        {isMobileStore && (
          <>
            <SectionLabel>{Platform.OS === 'ios' ? 'Achat intégré' : 'Achat Google Play'}</SectionLabel>
            <View style={styles.group}>
              <Pressable
                disabled={busy || !storePrice}
                style={({ pressed }) => [styles.row, pressed && !busy && { opacity: 0.7 }]}
                onPress={payWithStore}
              >
                <View style={styles.rowIcon}>
                  <Ionicons
                    name={Platform.OS === 'ios' ? 'logo-apple' : 'logo-google-playstore'}
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <Text style={styles.rowLabel}>{storeName}</Text>
                {busy || storeLoading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.rowDetail}>{displayedStorePrice}</Text>
                )}
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
          </>
        )}

        {Platform.OS === 'ios' && (
          <Pressable
            disabled={busy}
            onPress={restorePurchases}
            style={({ pressed }) => [styles.row, pressed && !busy && { opacity: 0.7 }]}
          >
            <Text style={styles.rowLabel}>Restaurer mes achats</Text>
            <Ionicons name="refresh" size={18} color={colors.primary} />
          </Pressable>
        )}

        <Text style={styles.secure}>Tous les paiements sont sécurisés et cryptés.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
