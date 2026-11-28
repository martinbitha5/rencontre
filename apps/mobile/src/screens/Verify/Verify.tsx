import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from '@/components/keyboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, StepIntro } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors, keyboardAppearance } from '@/theme';
import { styles } from './Verify.styles';
import { safeBack } from '@/utils/safeBack';
import { type InputHandle, useFocusWhenShown } from '@/utils/useFocusWhenShown';

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
  const inputRef = useRef<InputHandle>(null);
  useFocusWhenShown(inputRef, !!email);

  // Sans e-mail, cet écran ne peut rien vérifier (ouverture directe, état
  // restauré) : retour à l'accueil plutôt qu'une demande de code sans issue.
  useEffect(() => {
    if (!email) router.replace('/(auth)/welcome');
  }, [email, router]);

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

  if (!email) return <SafeAreaView style={styles.safe} />;

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={() => safeBack(router, '/(auth)/welcome')} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
      >
        <StepIntro
          icon="keypad-outline"
          title={`Entre le code à ${CODE_LENGTH} chiffres`}
          subtitle={`Insère le code reçu par e-mail à ${email ?? ''}. Si tu ne le vois pas, vérifie tes spams.`}
        />

        {/* Le vrai champ est posé sur les cases, invisible mais à taille
            réelle : un champ de 1 px perdait le focus sur Android (clavier
            qui sort puis se referme). Toucher une case touche le champ. */}
        <View style={styles.boxes}>
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
          <TextInput
            keyboardAppearance={keyboardAppearance}
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            caretHidden
            contextMenuHidden
            style={styles.hiddenInput}
          />
        </View>

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
