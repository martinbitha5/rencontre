import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrcFlag, OperatorLogo, type OperatorBrandId } from '@/components/brand';
import { Button, ErrorText, ScreenHeader } from '@/components/ui';
import { MOBILE_MONEY_OPERATORS } from '@/config/economy';
import { colors } from '@/theme';
import { styles } from './MobileMoney.styles';

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
    // Bord bas inclus : le bouton Continuer ne doit pas vivre sous la barre
    // de gestes.
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
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
