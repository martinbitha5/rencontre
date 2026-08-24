import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scanEvent } from '@/services/api';
import { OperatorLogo, PackIcon, type OperatorBrandId } from '@/components/brand';
import { Button, ErrorText, HeaderBackButton, ScreenHeader, SectionLabel } from '@/components/ui';
import { formatCdf, MOBILE_MONEY_OPERATORS, type MobileMoneyOperator } from '@/config/economy';
import { PAYMENTS_ENABLED } from '@/config/features';
import { initiateMobileMoneyPayment, waitForPaymentSettlement } from '@/services/payments';
import { notifyPartyAccessChanged } from '@/utils/partySignal';
import { colors, onLight } from '@/theme';
import { styles } from './Scan.styles';

// Le QR contient dowe://event/{token} ; on tolère aussi le token brut.
function extractToken(data: string): string {
  const cleaned = data.trim();
  const parts = cleaned.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? cleaned;
}

// Ce que l'écran montre après un scan.
// - granted : le vert, l'accès est acquis
// - payment : le QR est bon, il reste à payer l'entrée sur le portail web
// - denied  : le rouge, avec la raison
type ScanOutcome =
  | { kind: 'granted'; name: string; already: boolean; paid: boolean }
  | { kind: 'payment'; eventId: string; name: string; priceCdf: number }
  | { kind: 'denied'; message: string };

const INVALID_MESSAGE =
  "Ce code ne correspond à aucune soirée en cours. Vérifie auprès de l'organisateur.";

export default function Scan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [processing, setProcessing] = useState(false);
  // Paiement en cours : commande créée, navigateur ouvert, ou serveur sondé.
  const [paying, setPaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  // Demande de paiement poussée directement sur le téléphone : l'attente
  // n'est pas la même chose qu'une vérification, c'est au client d'agir.
  const [pushed, setPushed] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const lastScan = useRef(0);

  // Opérateur et numéro : Interswitch attend un numéro de client, et un champ
  // vide lui fait refuser la transaction (« Incorrect Transaction »). On les
  // demande donc ici, comme dans la boutique. Ils sont conservés entre deux
  // tentatives : après un paiement raté, on ne retape pas son numéro.
  const [operatorId, setOperatorId] = useState<MobileMoneyOperator>(
    MOBILE_MONEY_OPERATORS[0].id,
  );
  const [phone, setPhone] = useState('');
  // Numéro congolais : 9 chiffres après +243, commençant par 8 ou 9.
  const digits = phone.replace(/\D/g, '');
  const phoneValid = /^[89]\d{8}$/.test(digits);
  const operator =
    MOBILE_MONEY_OPERATORS.find((o) => o.id === operatorId) ?? MOBILE_MONEY_OPERATORS[0];

  // Accès accordé (entrée libre, déjà sur la liste, ou paiement validé) :
  // prévenir Rencontres, qui bascule aussitôt sur les personnes présentes.
  const granted = outcome?.kind === 'granted';
  useEffect(() => {
    if (granted) notifyPartyAccessChanged();
  }, [granted]);

  const onScanned = async (data: string) => {
    // anti-rafale : la caméra émet le même code plusieurs fois par seconde
    const now = Date.now();
    if (processing || outcome || now - lastScan.current < 2500) return;
    lastScan.current = now;
    setProcessing(true);
    try {
      const result = await scanEvent(extractToken(data));
      if (result.status === 'invalid') {
        setOutcome({ kind: 'denied', message: INVALID_MESSAGE });
        return;
      }
      if (result.status === 'payment_required') {
        setPayError(null);
        // Aucun tunnel de paiement n'est présenté tant que l'app est
        // gratuite : une soirée encore tarifée au backoffice se règle alors
        // auprès de l'organisateur, sur place. Mettre son prix à 0 rend
        // l'entrée immédiate.
        if (!PAYMENTS_ENABLED) {
          setOutcome({
            kind: 'denied',
            message: `L'entrée de « ${result.name} » se règle directement auprès de l'organisateur. Re-scanne le code une fois sur la liste.`,
          });
          return;
        }
        setOutcome({
          kind: 'payment',
          eventId: result.event_id,
          name: result.name,
          priceCdf: result.price_cdf,
        });
        return;
      }
      // Déjà sur la liste, ou entrée libre : rien à payer.
      setOutcome({ kind: 'granted', name: result.name, already: result.already, paid: false });
    } catch {
      setOutcome({ kind: 'denied', message: INVALID_MESSAGE });
    } finally {
      setProcessing(false);
    }
  };

  // Portail de paiement : commande créée côté serveur (qui relit le prix dans
  // la base), paiement sur la page sécurisée Interswitch (carte ou Mobile
  // Money), puis verdict redemandé au serveur. L'accès n'est jamais accordé
  // ici : c'est multipay-return qui l'inscrit, après vérification.
  const payEntry = async () => {
    if (outcome?.kind !== 'payment' || !phoneValid) return;
    const { eventId, name } = outcome;
    setPayError(null);
    setPaying(true);
    setPushed(false);

    const result = await initiateMobileMoneyPayment({
      kind: 'event',
      itemId: eventId,
      operator: operatorId,
      phone: `+243${digits}`,
    });
    if (result.status === 'unavailable') {
      setPaying(false);
      setPayError(
        "Le paiement en ligne sera activé très bientôt. Adresse-toi à l'organisateur pour entrer.",
      );
      return;
    }
    if (result.status === 'error') {
      setPaying(false);
      setPayError(result.message);
      return;
    }

    // Navigateur refermé sans repasser par l'URL de retour : ça ressemble à un
    // abandon sans en être la preuve.
    let dismissed = false;

    if (result.checkoutUrl) {
      // Rail navigateur (mode TEST, ou repli si la poussée a échoué).
      const browser = await WebBrowser.openAuthSessionAsync(
        result.checkoutUrl,
        'dowe://checkout-return',
      );
      setPaying(false);
      dismissed = browser.type !== 'success';
    } else {
      // Poussée wallet : la demande de confirmation est déjà sur le téléphone
      // du client, debout devant la porte. Il compose peut-être son code en ce
      // moment même.
      setPaying(false);
      setPushed(true);
    }

    // ON NE FERME JAMAIS LA COMMANDE D'ICI : voir le commentaire détaillé dans
    // Checkout.tsx. Annuler sur simple fermeture du navigateur détruisait des
    // paiements réellement encaissés. Ici l'enjeu est encore plus concret :
    // quelqu'un debout devant une porte, qui a payé son entrée.

    // Navigateur refermé sans finir : réponse IMMÉDIATE (pas d'attente), et
    // vérification silencieuse derrière — si le paiement était en fait allé
    // au bout, l'entrée s'ouvre quand même.
    if (dismissed) {
      setPayError(
        "Tu es revenu sans terminer le paiement. Aucun montant n'a été débité, tu peux réessayer.",
      );
      const late = await waitForPaymentSettlement(result.reference, 5);
      if (late === 'success') {
        setPayError(null);
        setOutcome({ kind: 'granted', name, already: false, paid: true });
      }
      return;
    }

    setWaiting(true);
    const settlement = await waitForPaymentSettlement(
      result.reference,
      result.checkoutUrl ? 30 : 45,
    );
    setWaiting(false);

    if (settlement === 'success') {
      setOutcome({ kind: 'granted', name, already: false, paid: true });
      return;
    }
    if (settlement === 'cancelled') {
      setPayError("Paiement annulé. Aucun montant n'a été débité, tu peux réessayer.");
      return;
    }
    if (settlement === 'failed') {
      setPayError('Le paiement a été refusé. Aucun montant ne sera débité.');
      return;
    }
    setPayError(
      "Le paiement n'est pas encore confirmé. Dès sa validation, re-scanne le code : ton entrée sera reconnue.",
    );
  };

  const closeOutcome = () => {
    setOutcome(null);
    setPayError(null);
  };

  const goToParty = () => {
    closeOutcome();
    // Rencontres passe automatiquement en mode soirée
    router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Scanner" left={<HeaderBackButton />} />

      {/* La zone de scan monte directement sous le titre : c'est l'action de
          l'écran, elle ne se cherche pas. Les explications viennent après,
          en taille lisible. */}
      <View style={styles.body}>
        <View style={styles.cameraBox}>
          {!permission ? null : permission.granted ? (
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => onScanned(data)}
            />
          ) : (
            <View style={styles.permissionBox}>
              <Ionicons name="camera-outline" size={40} color={colors.accent} />
              <Text style={styles.permissionText}>
                Autorise la caméra pour scanner le code QR de la soirée.
              </Text>
              <Button title="Autoriser la caméra" onPress={requestPermission} />
            </View>
          )}
          {permission?.granted && (
            <View style={styles.frame} pointerEvents="none">
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
          )}
        </View>

        <Text style={styles.lead}>{"Vise le code QR affiché à l'entrée"}</Text>

        <View style={styles.hintCard}>
          <View style={styles.hintIcon}>
            <Ionicons name="ticket-outline" size={22} color={colors.accent} />
          </View>
          <Text style={styles.hintText}>
            {PAYMENTS_ENABLED
              ? "L'accès se paie une seule fois : ensuite tu peux sortir et revenir librement."
              : "L'accès se valide une seule fois : ensuite tu peux sortir et revenir librement."}
          </Text>
        </View>
      </View>

      {/* Résultat plein écran : vert = entrée validée, rouge = refusée, et
          entre les deux l'écran de paiement de l'entrée. */}
      <Modal visible={outcome !== null} animationType="fade" transparent={false}>
        {waiting ? (
          <View style={[styles.result, styles.resultPayment]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.resultTitle}>
              {pushed ? 'Confirme sur ton téléphone' : 'Vérification du paiement'}
            </Text>
            <Text style={styles.resultText}>
              {pushed
                ? "Une demande de paiement vient d'arriver sur ton téléphone. Valide-la avec ton code : ton entrée sera validée aussitôt."
                : "On confirme ton paiement auprès du service de paiement. Ton entrée sera validée dès l'accord."}
            </Text>
            {/* Jamais d'impasse : si la confirmation tarde, re-scanner le QR
                après coup retrouvera l'entrée déjà payée. */}
            <View style={styles.resultActions}>
              <Button title="Revenir au scanner" variant="secondary" onPress={closeOutcome} />
            </View>
          </View>
        ) : outcome?.kind === 'granted' ? (
          <View style={[styles.result, styles.resultGranted]}>
            <View style={styles.resultIcon}>
              <Ionicons name="checkmark" size={72} color="#2C8A57" />
            </View>
            {/* Fond accent : encre blanche, comme l'écran de refus. Les styles
                partagés visent le fond neutre de l'écran de paiement, où le
                prune est le bon choix. */}
            <Text style={[styles.resultTitle, styles.onAccent]}>Entrée validée</Text>
            <Text style={[styles.resultName, styles.onAccent]}>{outcome.name}</Text>
            <Text style={[styles.resultText, styles.onAccent]}>
              {outcome.already
                ? 'Tu étais déjà sur la liste : re-bienvenue, rien à payer.'
                : outcome.paid
                  ? 'Ton entrée est payée. Tu peux sortir et revenir librement.'
                  : 'Entrée offerte. Bonne soirée !'}
            </Text>
            <Text style={[styles.resultText, styles.onAccent]}>
              {"L'onglet Rencontres affiche maintenant les personnes présentes à la soirée."}
            </Text>
            <View style={styles.resultActions}>
              <Button title="Découvrir qui est là" onPress={goToParty} />
            </View>
          </View>
        ) : outcome?.kind === 'payment' ? (
          <SafeAreaView style={styles.paymentSafe} edges={['top', 'bottom']}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={{ flex: 1 }}
            >
              <ScrollView
                contentContainerStyle={styles.paymentContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={styles.paymentHead}>
                  <View style={styles.paymentIcon}>
                    <PackIcon id="event" size={40} />
                  </View>
                  <Text style={styles.paymentTitle}>Entrée de la soirée</Text>
                  <Text style={styles.paymentName}>{outcome.name}</Text>
                  <Text style={styles.paymentPrice}>{formatCdf(outcome.priceCdf)}</Text>
                  <Text style={styles.paymentText}>
                    {"L'entrée se paie une seule fois : ensuite tu peux sortir et revenir librement."}
                  </Text>
                </View>

                <SectionLabel>Moyen de paiement</SectionLabel>
                <View style={styles.group}>
                  {MOBILE_MONEY_OPERATORS.map((op) => {
                    const active = op.id === operatorId;
                    return (
                      <Pressable
                        key={op.id}
                        style={({ pressed }) => [
                          styles.row,
                          active && styles.rowActive,
                          pressed && { opacity: 0.7 },
                        ]}
                        onPress={() => setOperatorId(op.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                      >
                        <OperatorLogo id={op.id as OperatorBrandId} size={38} />
                        <Text style={styles.rowLabel}>{op.name}</Text>
                        <Ionicons
                          name={active ? 'radio-button-on' : 'radio-button-off'}
                          size={20}
                          color={active ? colors.primary : colors.textMuted}
                        />
                      </Pressable>
                    );
                  })}
                </View>

                <View
                  style={[
                    styles.phoneRow,
                    !phoneValid && digits.length === 9 && styles.phoneRowError,
                  ]}
                >
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
                      setPayError(null);
                    }}
                    accessibilityLabel={`Numéro ${operator.name}`}
                  />
                  {phoneValid && (
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                  )}
                </View>
                <Text style={styles.paymentHint}>
                  {`Le numéro du compte ${operator.name} qui règle l'entrée. Tu termines dans la fenêtre sécurisée du service de paiement, où la carte bancaire reste possible.`}
                </Text>

                <ErrorText>{payError}</ErrorText>
              </ScrollView>

              <View style={styles.paymentFooter}>
                <Button
                  title={`Payer ${formatCdf(outcome.priceCdf)}`}
                  onPress={payEntry}
                  loading={paying}
                  disabled={!phoneValid}
                />
                <Button title="Annuler" variant="ghost" onPress={closeOutcome} />
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        ) : outcome ? (
          <View style={[styles.result, styles.resultDenied]}>
            <View style={styles.resultIcon}>
              {/* Pastille blanche : rouge fixe, la variante claire du thème
                  sombre s'y délavait. */}
              <Ionicons name="close" size={72} color={onLight.danger} />
            </View>
            <Text style={[styles.resultTitle, { color: '#fff' }]}>Entrée refusée</Text>
            <Text style={[styles.resultText, { color: 'rgba(255,255,255,.9)' }]}>
              {outcome.message}
            </Text>
            <View style={styles.resultActions}>
              <Button title="Réessayer" onPress={closeOutcome} />
            </View>
          </View>
        ) : null}
      </Modal>
    </SafeAreaView>
  );
}
