import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, Input, StepIntro } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors } from '@/theme';
import { styles } from './SignIn.styles';

// Connexion par e-mail : un seul champ. L'app envoie un code de vérification ;
// si aucun compte n'existe avec cet e-mail, on propose d'en créer un.
export default function SignIn() {
  const router = useRouter();
  const { sendEmailCode } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [proposeSignup, setProposeSignup] = useState(false);

  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  const goVerify = (create: boolean) =>
    router.push({
      pathname: '/(auth)/verify',
      params: { email: email.trim(), create: create ? '1' : '0' },
    });

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true);
    setError(null);
    const res = await sendEmailCode(email.trim(), false);
    setLoading(false);
    if (res === 'sent') {
      goVerify(false);
      return;
    }
    if (res === 'not_found') {
      setProposeSignup(true);
      return;
    }
    setError(res);
  };

  const createInstead = async () => {
    setProposeSignup(false);
    setLoading(true);
    const res = await sendEmailCode(email.trim(), true);
    setLoading(false);
    if (res === 'sent') {
      goVerify(true);
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
          <Pressable onPress={() => router.push('/(auth)/password')} hitSlop={6}>
            <Text style={styles.altLink}>
              Tu n'as pas accès à tes e-mails ? Connexion avec mot de passe
            </Text>
          </Pressable>
          <ErrorText>{error}</ErrorText>
        </View>
        <View style={styles.footer}>
          <Button title="Continuer" onPress={submit} loading={loading} disabled={!valid} />
        </View>
      </KeyboardAvoidingView>

      {/* L'e-mail n'existe pas : proposer la création de compte */}
      <Modal visible={proposeSignup} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIcon}>
              <Ionicons name="person-add-outline" size={28} color={colors.textOnAccent} />
            </View>
            <Text style={styles.modalTitle}>Aucun compte trouvé</Text>
            <Text style={styles.modalText}>
              Aucun compte n'existe avec {email.trim()}. Veux-tu plutôt créer un compte avec cet
              e-mail ?
            </Text>
            <Button title="Oui, créer un compte" onPress={createInstead} />
            <Button title="Non" variant="ghost" onPress={() => setProposeSignup(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
