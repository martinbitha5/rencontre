import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scanEvent } from '../api';
import { OperatorLogo, PackIcon, type OperatorBrandId } from '../components/brand';
import { Button, ErrorText, ScreenHeader, SectionLabel } from '../components/ui';
import { formatCdf, MOBILE_MONEY_OPERATORS, type MobileMoneyOperator } from '../config/economy';
import { cancelPayment, initiateMobileMoneyPayment, waitForPaymentSettlement } from '../lib/payments';
import { notifyPartyAccessChanged } from '../lib/partySignal';
import { colors, onLight, radius, spacing } from '../theme';

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

    const browser = await WebBrowser.openAuthSessionAsync(
      result.checkoutUrl,
      'dowe://checkout-return',
    );
    setPaying(false);

    // Navigateur refermé sans passer par l'URL de retour : la commande est
    // close côté serveur, elle ne pourra plus être réglée.
    if (browser.type !== 'success') {
      await cancelPayment(result.reference);
      setPayError("Paiement annulé. Aucun montant n'a été débité, tu peux réessayer.");
      return;
    }

    setWaiting(true);
    const settlement = await waitForPaymentSettlement(result.reference);
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
      <ScreenHeader title="Scanner" />
      <Text style={styles.subtitle}>
        Vise le code QR affiché à l'entrée. L'accès se paie une seule fois : ensuite tu peux
        sortir et revenir librement.
      </Text>

      <View style={styles.cameraArea}>
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
              <Ionicons name="camera-outline" size={36} color={colors.primary} />
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
      </View>

      {/* Résultat plein écran : vert = entrée validée, rouge = refusée, et
          entre les deux l'écran de paiement de l'entrée. */}
      <Modal visible={outcome !== null} animationType="fade" transparent={false}>
        {waiting ? (
          <View style={[styles.result, styles.resultPayment]}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.resultTitle}>Vérification du paiement</Text>
            <Text style={styles.resultText}>
              On confirme ton paiement auprès du service de paiement. Ton entrée sera validée
              dès l'accord.
            </Text>
          </View>
        ) : outcome?.kind === 'granted' ? (
          <View style={[styles.result, styles.resultGranted]}>
            <View style={styles.resultIcon}>
              <Ionicons name="checkmark" size={72} color="#1d7a2c" />
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
              L'onglet Rencontres affiche maintenant les personnes présentes à la soirée.
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
                    L'entrée se paie une seule fois : ensuite tu peux sortir et revenir
                    librement.
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
                  Le numéro du compte {operator.name} qui règle l'entrée. Tu termines dans la
                  fenêtre sécurisée du service de paiement, où la carte bancaire reste
                  possible.
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    lineHeight: 18,
  },
  // La zone caméra prend tout l'espace restant et centre le carré de scan.
  cameraArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  cameraBox: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  camera: { flex: 1 },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  permissionText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  frame: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    right: '18%',
    bottom: '18%',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: colors.accent,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 10 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 10 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 10 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 10 },
  result: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  resultGranted: { backgroundColor: colors.accent },
  onAccent: { color: colors.textOnAccent },
  resultDenied: { backgroundColor: colors.danger },
  // L'écran de paiement reste neutre : ni vert ni rouge, rien n'est tranché.
  resultPayment: { backgroundColor: colors.background },
  resultIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  resultTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.primaryDeep,
    textAlign: 'center',
  },
  resultName: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.primaryDeep,
    textAlign: 'center',
  },
  resultText: {
    fontSize: 15,
    color: colors.primaryDeep,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 300,
  },
  // Écran de paiement de l'entrée : mise en page de formulaire, pas de verdict.
  paymentSafe: { flex: 1, backgroundColor: colors.background },
  paymentContent: { padding: spacing.md, paddingBottom: spacing.lg },
  paymentHead: { alignItems: 'center', gap: 4, marginBottom: spacing.md },
  paymentIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  paymentTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  paymentName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  paymentPrice: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'center',
    marginVertical: spacing.xs,
  },
  paymentText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
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
  rowActive: { backgroundColor: colors.surface },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
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
    marginTop: spacing.md,
  },
  phoneRowError: { borderColor: colors.danger },
  prefix: { fontSize: 16, fontWeight: '700', color: colors.text },
  phoneInput: { flex: 1, fontSize: 16, color: colors.text },
  paymentHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  paymentFooter: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  resultActions: {
    alignSelf: 'stretch',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
