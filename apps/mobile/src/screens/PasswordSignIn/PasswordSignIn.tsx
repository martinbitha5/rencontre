import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ErrorText, Input, StepIntro } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { colors } from '@/theme';
import { styles } from './PasswordSignIn.styles';

// Connexion de secours par mot de passe, pour qui n'a pas accès à ses e-mails
// (les comptes historiques créés avec un mot de passe fonctionnent aussi).
export default function PasswordSignIn() {
  const router = useRouter();
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Renseigne ton e-mail et ton mot de passe.');
      return;
    }
    setLoading(true);
    setError(null);
    const err = await signInWithEmail(email.trim(), password);
    if (err) setError('E-mail ou mot de passe incorrect.');
    setLoading(false);
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
          icon="lock-closed-outline"
          title="Connexion"
          subtitle="Entre ton e-mail et ton mot de passe."
        />
        <View style={styles.form}>
          <Text style={styles.label}>E-mail</Text>
          <Input
            placeholder="E-mail"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <Text style={styles.label}>Mot de passe</Text>
          <View>
            <Input
              placeholder="Mot de passe"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={8}
            >
              <Ionicons
                name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
          <ErrorText>{error}</ErrorText>
          <Button title="Continuer" onPress={submit} loading={loading} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
