import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, StepIntro } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors } from '@/theme';
import { styles } from './Verify.styles';

const CODE_LENGTH = 6;
const RESEND_DELAY = 60;

// Saisie du code reçu par e-mail. La vérification crée la session ;
// le Gate du layout racine route ensuite vers l'onboarding ou les onglets.
export default function Verify() {
  const router = useRouter();
  const { email, create } = useLocalSearchParams<{ email?: string; create?: string }>();
  const { sendEmailCode, verifyEmailCode } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_DELAY);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const submit = async (value: string) => {
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    const err = await verifyEmailCode(email, value);
    if (err) {
      setError(err);
      setCode('');
      setBusy(false);
      return;
    }
    // Session créée : le Gate redirige tout seul, rien d'autre à faire.
  };

  const onChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    setError(null);
    if (digits.length === CODE_LENGTH) submit(digits);
  };

  const resend = async () => {
    if (!email || countdown > 0) return;
    setError(null);
    const res = await sendEmailCode(email, create === '1');
    if (res !== 'sent' && res !== 'not_found') setError(res);
    setCountdown(RESEND_DELAY);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <StepIntro
          icon="keypad-outline"
          title={`Entre le code à ${CODE_LENGTH} chiffres`}
          subtitle={`Insère le code reçu par e-mail à ${email ?? ''}. Si tu ne le vois pas, vérifie tes spams.`}
        />

        <Pressable style={styles.boxes} onPress={() => inputRef.current?.focus()}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.box,
                i === code.length && styles.boxActive,
                !!code[i] && styles.boxFilled,
              ]}
            >
              <Text style={styles.boxText}>{code[i] ?? ''}</Text>
            </View>
          ))}
        </Pressable>
        <TextInput
          ref={inputRef}
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          autoFocus
          style={styles.hiddenInput}
        />

        <Pressable onPress={resend} disabled={countdown > 0} hitSlop={8}>
          <Text style={[styles.resend, countdown > 0 && { color: colors.textMuted }]}>
            {countdown > 0 ? `Renvoyer le code dans ${countdown}s` : 'Renvoyer le code'}
          </Text>
        </Pressable>

        <View style={styles.footer}>
          <ErrorText>{error}</ErrorText>
          <Button
            title="Continuer"
            onPress={() => submit(code)}
            loading={busy}
            disabled={code.length !== CODE_LENGTH}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
