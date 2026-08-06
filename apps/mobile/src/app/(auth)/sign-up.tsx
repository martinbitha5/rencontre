import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, Input, StepIntro } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { colors, spacing } from '../../theme';

// Création de compte par e-mail : un seul champ. Un code de vérification est
// envoyé, sa validation crée le compte (et connecte les comptes existants).
export default function SignUp() {
  const router = useRouter();
  const { sendEmailCode } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    const res = await sendEmailCode(email.trim(), true);
    setLoading(false);
    if (res === 'sent') {
      router.push({
        pathname: '/(auth)/verify',
        params: { email: email.trim(), create: '1' },
      });
      return;
    }
    setError(res === 'not_found' ? "Impossible d'envoyer le code. Réessaie." : res);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <StepIntro
          icon="mail-outline"
          title="Entre ton e-mail"
          subtitle="Tu recevras un e-mail avec un code pour vérification. Si tu ne le vois pas, vérifie tes spams."
        />
        <View style={styles.form}>
          <Input
            placeholder="E-mail"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(null);
            }}
            autoFocus
          />
          <ErrorText>{error}</ErrorText>
        </View>
        <View style={styles.footer}>
          <Button title="Continuer" onPress={submit} loading={loading} disabled={!valid} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  backBtn: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, alignSelf: 'flex-start' },
  container: { flex: 1 },
  form: { gap: spacing.sm, padding: spacing.md, marginTop: spacing.md },
  footer: { padding: spacing.md, marginTop: 'auto' },
});
