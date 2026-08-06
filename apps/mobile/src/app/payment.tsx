import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrcFlag, OperatorLogo, PackIcon, type OperatorBrandId } from '../components/brand';
import { ScreenHeader, SectionLabel } from '../components/ui';
import { findPurchase, MOBILE_MONEY_OPERATORS } from '../config/economy';
import { colors, radius, spacing } from '../theme';

// Choix du moyen de paiement : récap de l'achat (pack de pièces ou abonnement
// Incognito, l'écran ne fait pas la différence), puis « Paiements locaux »
// (Mobile Money via MultiPay) et « Paiements internationaux » (stores).
export default function PaymentMethods() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; id?: string }>();
  const purchase = findPurchase(params.kind, params.id);

  const storeName = Platform.OS === 'android' ? 'Google Play' : 'App Store';

  const payWithStore = () => {
    Alert.alert(
      'Bientôt disponible',
      `Le paiement via ${storeName} arrive très vite. En attendant, utilise le Mobile Money.`,
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Moyens de paiement" right={<DrcFlag width={28} />} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.recap}>
          <PackIcon id={purchase.icon} size={28} />
          <Text style={styles.recapPack}>{purchase.title}</Text>
          <Text style={styles.recapCoins}>{purchase.detail}</Text>
          <Text style={styles.recapPrice}>{purchase.priceCdfLabel}</Text>
          {!!purchase.validityDays && (
            <Text style={styles.recapValidity}>Valables {purchase.validityDays} jours</Text>
          )}
          <Text style={styles.recapHint}>
            Sélectionne le moyen de paiement qui te convient le mieux.
          </Text>
        </View>

        <SectionLabel>Paiements locaux</SectionLabel>
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

        <SectionLabel>Paiements internationaux</SectionLabel>
        <View style={styles.group}>
          <Pressable
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            onPress={payWithStore}
          >
            <View style={styles.rowIcon}>
              <Ionicons
                name={Platform.OS === 'android' ? 'logo-google-playstore' : 'logo-apple'}
                size={20}
                color={colors.primary}
              />
            </View>
            <Text style={styles.rowLabel}>{storeName}</Text>
            <Text style={styles.rowDetail}>{purchase.price}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <Text style={styles.secure}>Tous les paiements sont sécurisés et cryptés.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: 0 },
  recap: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 4,
  },
  recapPack: { fontSize: 19, fontWeight: '800', color: colors.text, marginTop: 6 },
  recapCoins: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  recapPrice: { fontSize: 20, fontWeight: '800', color: colors.primary },
  recapValidity: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  recapHint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  group: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  rowDetail: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  secure: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});
