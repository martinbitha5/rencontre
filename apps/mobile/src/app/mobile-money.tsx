import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrcFlag, OperatorLogo, type OperatorBrandId } from '../components/brand';
import { Button, ErrorText, ScreenHeader } from '../components/ui';
import { MOBILE_MONEY_OPERATORS } from '../config/economy';
import { colors, radius, spacing } from '../theme';

// Paiement Mobile Money (RDC), étape 1 : saisie du numéro. Le débit lui-même
// est déclenché depuis le résumé de l'achat (/checkout), qui récapitule tout
// une dernière fois avant de contacter MultiPay.
export default function MobileMoney() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; id?: string; operator?: string }>();
  const operator =
    MOBILE_MONEY_OPERATORS.find((o) => o.id === params.operator) ?? MOBILE_MONEY_OPERATORS[0];

  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Numéro congolais : 9 chiffres après +243, commençant par 8 ou 9.
  const digits = phone.replace(/\D/g, '');
  const valid = /^[89]\d{8}$/.test(digits);

  const next = () => {
    setError(null);
    router.push({
      pathname: '/checkout',
      params: { kind: params.kind, id: params.id, operator: operator.id, phone: digits },
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Mobile Money" right={<DrcFlag width={28} />} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={styles.intro}>
          <OperatorLogo id={operator.id as OperatorBrandId} size={64} />
          <Text style={styles.introTitle}>{operator.name}</Text>
          <Text style={styles.introText}>
            Entre le numéro de téléphone pour le paiement par {operator.name}.
          </Text>
        </View>

        <View style={styles.form}>
          <View style={[styles.phoneRow, !valid && digits.length === 9 && styles.phoneRowError]}>
            <Text style={styles.prefix}>+243</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder="Numéro de téléphone"
              placeholderTextColor={colors.textMuted}
              keyboardType="phone-pad"
              maxLength={11}
              value={phone}
              onChangeText={(v) => {
                setPhone(v);
                setError(null);
              }}
              autoFocus
            />
            {valid && <Ionicons name="checkmark-circle" size={22} color={colors.success} />}
          </View>
          <ErrorText>{error}</ErrorText>
        </View>

        <View style={styles.footer}>
          <Button title="Continuer" onPress={next} disabled={!valid} />
          <Text style={styles.secure}>Tous les paiements sont sécurisés et cryptés.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  intro: { alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 6 },
  introTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 4 },
  introText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  form: { padding: spacing.md, gap: spacing.sm, marginTop: spacing.md },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 54,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
  },
  phoneRowError: { borderColor: colors.danger },
  prefix: { fontSize: 16, fontWeight: '700', color: colors.text },
  phoneInput: { flex: 1, fontSize: 16, color: colors.text },
  footer: { padding: spacing.md, marginTop: 'auto', gap: spacing.sm },
  secure: { textAlign: 'center', fontSize: 12, color: colors.textMuted },
  doneWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  doneTitle: { fontSize: 24, fontWeight: '800', color: colors.primaryDeep },
  doneText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14,15,12,.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryDeep,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
});
