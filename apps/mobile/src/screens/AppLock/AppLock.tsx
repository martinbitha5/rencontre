import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CodePad } from '@/components/LockScreen';
import { PAYMENTS_ENABLED } from '@/config/features';
import { Button, ScreenHeader } from '@/components/ui';
import { useAppLock } from '@/providers/applock';
import { useWallet } from '@/providers/wallet';
import { styles } from './AppLock.styles';

type Step = 'idle' | 'choose' | 'confirm' | 'remove';

// Définition et retrait du code secret. Réservé aux abonnés Incognito : c'est
// l'un des avantages vendus avec l'abonnement.
export default function AppLock() {
  const router = useRouter();
  const { wallet } = useWallet();
  const { hasCode, setCode, removeCode } = useAppLock();
  const [step, setStep] = useState<Step>('idle');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Le code secret est l'un des avantages vendus avec l'abonnement Incognito.
  // Tant que l'app est gratuite, il est ouvert à tout le monde : le mur
  // d'abonnement n'aurait plus de porte de sortie.
  const subscribed =
    !PAYMENTS_ENABLED ||
    (!!wallet?.incognito_until && new Date(wallet.incognito_until) > new Date());

  const onChoose = (code: string) => {
    setFirst(code);
    setError(null);
    setStep('confirm');
  };

  const onConfirm = async (code: string) => {
    if (code !== first) {
      setError('Les deux codes ne correspondent pas. Recommence.');
      setStep('choose');
      return;
    }
    await setCode(code);
    setStep('idle');
    Alert.alert('Code enregistré', "Dowe demandera ce code à l'ouverture.");
  };

  const onRemove = async (code: string) => {
    const ok = await removeCode(code);
    if (!ok) {
      setError('Code incorrect.');
      return;
    }
    setStep('idle');
    Alert.alert('Code supprimé', "L'application ne demandera plus de code.");
  };

  if (step === 'choose') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Code secret" />
        <CodePad
          title="Choisis ton code"
          subtitle="Quatre chiffres, à retenir : il n'y a pas de récupération."
          error={error}
          onComplete={onChoose}
        />
      </SafeAreaView>
    );
  }

  if (step === 'confirm') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Code secret" />
        <CodePad title="Confirme ton code" error={error} onComplete={onConfirm} />
      </SafeAreaView>
    );
  }

  if (step === 'remove') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScreenHeader title="Code secret" />
        <CodePad
          title="Entre ton code actuel"
          subtitle="Pour confirmer sa suppression."
          error={error}
          onComplete={onRemove}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Code secret" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Un code à quatre chiffres demandé à l'ouverture de Dowe et après une absence
          prolongée.
        </Text>

        {/* Dire ce que la fonctionnalité protège, et surtout ce qu'elle ne
            protège pas : la vendre comme un chiffrement serait faux. */}
        <View style={styles.note}>
          <Text style={styles.noteTitle}>Ce que ça protège</Text>
          <Text style={styles.noteText}>
            Quelqu'un qui prend ton téléphone déverrouillé en main ne peut pas ouvrir Dowe. Le
            code reste dans le coffre-fort du système, il ne quitte jamais l'appareil et n'est
            pas envoyé à nos serveurs.
          </Text>
          <Text style={styles.noteTitle}>Ce que ça ne protège pas</Text>
          <Text style={styles.noteText}>
            Tes messages ne sont pas chiffrés par ce code. Quelqu'un qui sait extraire les
            données d'un téléphone y accédera quand même. C'est une porte devant l'écran, pas un
            coffre.
          </Text>
          <Text style={styles.noteText}>
            Il n'existe aucune récupération : un code oublié se règle en désinstallant puis
            réinstallant l'application.
          </Text>
        </View>

        {!subscribed && !hasCode ? (
          <View style={styles.locked}>
            <Text style={styles.lockedText}>
              Le code secret fait partie de l'abonnement Incognito.
            </Text>
            <Button title="Voir l'offre Incognito" onPress={() => router.push('/incognito')} />
          </View>
        ) : hasCode ? (
          <Button
            title="Supprimer le code"
            variant="danger"
            onPress={() => {
              setError(null);
              setStep('remove');
            }}
          />
        ) : (
          <Button
            title="Définir un code"
            onPress={() => {
              setError(null);
              setStep('choose');
            }}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
