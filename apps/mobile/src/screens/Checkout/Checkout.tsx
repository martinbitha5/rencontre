import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { OperatorLogo, PackIcon, type OperatorBrandId } from '@/components/brand';
import { GlassSurface, Reveal } from '@/components/motion';
import { PaymentResultToast, type PaymentToast } from '@/components/PaymentResultToast';
import { Button, ErrorText, ScreenHeader } from '@/components/ui';
import { findPurchase, MOBILE_MONEY_OPERATORS, type MobileMoneyOperator } from '@/config/economy';
import * as WebBrowser from 'expo-web-browser';
import { SUPPORT_IS_WHATSAPP, supportUrl } from '@/config/support';
import { initiateMobileMoneyPayment, waitForPaymentSettlement } from '@/services/payments';
import { useWallet } from '@/providers/wallet';
import { colors, spacing } from '@/theme';
import { styles } from './Checkout.styles';

// Résumé de l'achat : dernier écran avant le débit. Il récapitule ce qui est
// acheté, ce que ça coûte, par quel opérateur et sur quel numéro — c'est le
// seul endroit où l'utilisateur peut encore tout relire avant de payer.
// Le montant affiché reste indicatif : celui qui fait foi est calculé par la
// fonction Edge, jamais envoyé par le client.
export default function Checkout() {
  const router = useRouter();
  // La barre de paiement en verre file jusqu'au bord bas de l'écran ; le
  // bouton, lui, remonte au-dessus de la barre de gestes.
  const insets = useSafeAreaInsets();
  const { refresh } = useWallet();
  const params = useLocalSearchParams<{
    kind?: string;
    id?: string;
    operator?: string;
    phone?: string;
  }>();

  const purchase = findPurchase(params.kind, params.id);
  const operator =
    MOBILE_MONEY_OPERATORS.find((o) => o.id === params.operator) ?? MOBILE_MONEY_OPERATORS[0];
  const digits = (params.phone ?? '').replace(/\D/g, '').slice(-9);

  const [busy, setBusy] = useState(false);
  // On attend le verdict du serveur sur la transaction.
  const [waiting, setWaiting] = useState(false);
  // La demande de paiement est partie directement sur le téléphone (poussée
  // wallet) : c'est à l'utilisateur d'agir, le texte d'attente doit le dire.
  const [pushed, setPushed] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Alerte de résultat (succès ou échec) avec jauge qui se vide de 100 % à 0 :
  // quand elle atteint zéro, la bannière se ferme, et un paiement réussi
  // ramène automatiquement au portefeuille.
  const [toast, setToast] = useState<PaymentToast | null>(null);

  const onToastDone = () => {
    const wasSuccess = toast?.variant === 'success';
    setToast(null);
    if (wasSuccess) router.dismissAll();
  };

  const askHelp = () => {
    Alert.alert(
      "Besoin d'aide ?",
      "As-tu besoin d'aide pour ce paiement ? Nous te redirigerons vers notre équipe de support pour t'aider au plus vite.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Oui, aide-moi', onPress: confirmOpenSupport },
      ],
    );
  };

  const confirmOpenSupport = () => {
    if (!SUPPORT_IS_WHATSAPP) {
      Linking.openURL(supportUrl()).catch(() => {});
      return;
    }
    Alert.alert(
      'Ouvrir WhatsApp ?',
      "Tu vas quitter l'application pour écrire à notre équipe sur WhatsApp.",
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Ouvrir WhatsApp',
          onPress: () => {
            const message =
              `Bonjour, j'ai besoin d'aide pour un paiement : ` +
              `${purchase.title} (${purchase.priceCdfLabel}) via ${operator.name}.`;
            Linking.openURL(supportUrl(message)).catch(() => {
              Alert.alert('Erreur', "Impossible d'ouvrir WhatsApp sur cet appareil.");
            });
          },
        },
      ],
    );
  };

  const pay = async () => {
    setBusy(true);
    setError(null);
    setPushed(false);
    const result = await initiateMobileMoneyPayment({
      kind: purchase.kind,
      itemId: purchase.id,
      operator: operator.id as MobileMoneyOperator,
      phone: `+243${digits}`,
    });
    if (result.status === 'unavailable') {
      setBusy(false);
      setError(
        "Le paiement Mobile Money sera activé très bientôt (connexion MultiPay en cours). Réessaie d'ici peu.",
      );
      return;
    }
    if (result.status === 'error') {
      setBusy(false);
      setError(result.message);
      return;
    }

    setBusy(false);

    // Navigateur refermé sans repasser par l'URL de retour. Ça ressemble à un
    // abandon, mais ça n'en est pas la preuve : en production, le retour vers
    // dowe://checkout-return ne se fait pas toujours, même après un paiement
    // mené à son terme.
    let dismissed = false;

    if (result.checkoutUrl) {
      // Rail navigateur : paiement sur la page sécurisée Interswitch, dans un
      // navigateur intégré. Elle se referme d'elle-même au retour vers
      // dowe://checkout-return.
      const browser = await WebBrowser.openAuthSessionAsync(
        result.checkoutUrl,
        'dowe://checkout-return',
      );
      dismissed = browser.type !== 'success';
    } else {
      // Poussée directe : la demande de confirmation est déjà sur le
      // téléphone, rien à ouvrir.
      setPushed(true);
    }

    // ON NE FERME JAMAIS LA COMMANDE D'ICI. L'app a longtemps appelé
    // cancelPayment() dès que le navigateur se refermait sans retour, et une
    // commande close ne peut plus être créditée : on détruisait donc des
    // paiements que MultiPay annonçait par webhook comme
    // TRANSACTION.COMPLETED. Le client, lui, avait bien payé.
    //
    // Fermer la commande n'a jamais protégé de rien : le crédit exige déjà que
    // multipay-return revérifie la transaction chez Interswitch et retrouve
    // une approbation au bon montant. Un paiement réellement abandonné n'est
    // donc pas créditable, qu'on le ferme ou non. Le laisser en attente ne
    // coûte qu'une ligne pending de plus ; le fermer coûte un paiement.

    // Navigateur refermé sans finir : la réponse est IMMÉDIATE. L'alerte
    // d'annulation part tout de suite (pas d'écran d'attente), et une
    // vérification silencieuse tourne derrière : si le paiement était en fait
    // allé au bout (le retour vers l'app ne se fait pas toujours), l'alerte
    // bascule en succès et l'achat s'active.
    if (dismissed) {
      const message =
        "Tu es revenu dans l'app sans terminer le paiement. " +
        "Aucun montant n'a été débité de ton compte.";
      setError(message);
      setToast({ variant: 'failure', title: 'Paiement annulé', message });
      const late = await waitForPaymentSettlement(result.reference, 5);
      if (late === 'success') {
        setError(null);
        setDone(true);
        refresh();
        setToast({
          variant: 'success',
          title: 'Paiement confirmé',
          message: `${purchase.title} est maintenant actif sur ton compte.`,
        });
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
      setDone(true);
      refresh();
      setToast({
        variant: 'success',
        title: 'Paiement confirmé',
        message: `${purchase.title} est maintenant actif sur ton compte.`,
      });
      return;
    }
    if (settlement === 'cancelled') {
      const message = "Paiement annulé. Aucun montant n'a été débité de ton compte.";
      setError(message);
      setToast({ variant: 'failure', title: 'Paiement annulé', message });
      return;
    }
    if (settlement === 'failed') {
      const message = 'Le paiement a été refusé. Aucun montant ne sera débité.';
      setError(message);
      setToast({ variant: 'failure', title: 'Paiement refusé', message });
      return;
    }
    setError(
      "Le paiement n'est pas encore confirmé. Dès sa validation par l'opérateur, ton achat sera activé automatiquement.",
    );
  };

  if (waiting) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.doneWrap}>
          <OperatorLogo id={operator.id as OperatorBrandId} size={64} />
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.md }} />
          <Text style={styles.doneTitle}>
            {pushed ? 'Confirme sur ton téléphone' : 'Vérification du paiement'}
          </Text>
          <Text style={styles.doneText}>
            {pushed
              ? `Une demande de paiement de ${purchase.priceCdfLabel} vient d'arriver sur le ` +
                `numéro 0${digits}. Valide-la avec ton code ${operator.name} : ton achat ` +
                `sera activé automatiquement.`
              : `On confirme ton paiement de ${purchase.priceCdfLabel} auprès du service de ` +
                `paiement. Ton achat sera activé automatiquement dès la validation.`}
          </Text>
          {/* Cet écran ne doit jamais être une impasse : la confirmation peut
              prendre plus de temps que le sondage, et le webhook créditera de
              toute façon. On le dit, et on laisse partir. */}
          <View style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>
            <Button
              title="Revenir plus tard"
              variant="secondary"
              onPress={() => router.back()}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.doneWrap}>
          <View style={styles.doneIcon}>
            <Ionicons name="checkmark" size={40} color={colors.textOnAccent} />
          </View>
          <Text style={styles.doneTitle}>Paiement confirmé</Text>
          <Text style={styles.doneText}>
            Ton paiement de {purchase.priceCdfLabel} a été validé. {purchase.title} est
            maintenant actif sur ton compte.
          </Text>
          <Button title="Revenir au portefeuille" onPress={() => router.dismissAll()} />
        </View>
        <PaymentResultToast toast={toast} onDone={onToastDone} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader
        title="Résumé de l'achat"
        right={
          <Pressable
            onPress={askHelp}
            hitSlop={12}
            style={styles.helpBtn}
            accessibilityRole="button"
            accessibilityLabel="Besoin d'aide pour ce paiement"
          >
            <Ionicons name="help" size={17} color={colors.textOnPrimary} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Vérifie les informations ci-dessous pour terminer le paiement.
        </Text>

        <Reveal style={styles.line}>
          <View style={styles.lineIcon}>
            <PackIcon id={purchase.icon} size={22} />
          </View>
          <View style={styles.lineBody}>
            <Text style={styles.lineTitle}>{purchase.title}</Text>
            <Text style={styles.lineText}>{purchase.detail}</Text>
            {!!purchase.validityDays && (
              <Text style={styles.lineText}>Valables {purchase.validityDays} jours</Text>
            )}
          </View>
          <Text style={styles.lineAmount}>{purchase.priceCdfLabel}</Text>
        </Reveal>

        <Reveal index={1} style={styles.line}>
          <View style={styles.lineIcon}>
            <Ionicons name="receipt-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.lineBody}>
            <Text style={styles.lineTitle}>Frais de service</Text>
            <Text style={styles.lineText}>Fournisseur de services de paiement</Text>
          </View>
          <Text style={styles.lineFree}>Gratuit</Text>
        </Reveal>

        <Reveal index={2} style={styles.line}>
          <View style={styles.lineIcon}>
            <OperatorLogo id={operator.id as OperatorBrandId} size={40} />
          </View>
          <View style={styles.lineBody}>
            <Text style={styles.lineTitle}>{operator.name}</Text>
            <Text style={styles.lineText}>+243 {digits}</Text>
            <Text style={styles.lineText}>
              Tu finalises sur la page sécurisée du service de paiement : Mobile Money
              (code PIN) ou carte bancaire, au choix.
            </Text>
          </View>
        </Reveal>

        <View style={styles.separator} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total :</Text>
          <Text style={styles.totalValue}>{purchase.priceCdfLabel}</Text>
        </View>

        <ErrorText>{error}</ErrorText>
      </ScrollView>

      {/* Barre de paiement posée sur le contenu : le flou signale qu'elle
          flotte au-dessus plutôt que de clore la page. */}
      <GlassSurface intensity={60} style={styles.footer}>
        <View style={[styles.footerInner, { paddingBottom: spacing.md + insets.bottom }]}>
          <Button
            title={`Payer ${purchase.priceCdfLabel}`}
            variant="secondary"
            onPress={pay}
            loading={busy}
          />
        </View>
      </GlassSurface>
      <PaymentResultToast toast={toast} onDone={onToastDone} />
    </SafeAreaView>
  );
}
