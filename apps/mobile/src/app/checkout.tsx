import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { OperatorLogo, PackIcon, type OperatorBrandId } from '../components/brand';
import { GlassSurface, Reveal } from '../components/motion';
import { Button, ErrorText, ScreenHeader } from '../components/ui';
import { findPurchase, MOBILE_MONEY_OPERATORS, type MobileMoneyOperator } from '../config/economy';
import * as WebBrowser from 'expo-web-browser';
import { SUPPORT_IS_WHATSAPP, supportUrl } from '../config/support';
import { cancelPayment, initiateMobileMoneyPayment, waitForPaymentSettlement } from '../lib/payments';
import { useWallet } from '../lib/wallet';
import { colors, radius, spacing } from '../theme';

// Résumé de l'achat : dernier écran avant le débit. Il récapitule ce qui est
// acheté, ce que ça coûte, par quel opérateur et sur quel numéro — c'est le
// seul endroit où l'utilisateur peut encore tout relire avant de payer.
// Le montant affiché reste indicatif : celui qui fait foi est calculé par la
// fonction Edge, jamais envoyé par le client.
export default function Checkout() {
  const router = useRouter();
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
  // Navigateur refermé : on attend le verdict du serveur sur la transaction.
  const [waiting, setWaiting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    // Paiement sur la page sécurisée Interswitch (carte ou Mobile Money),
    // dans un navigateur intégré. Elle se referme d'elle-même au retour
    // vers dowe://checkout-return.
    setBusy(false);
    const browser = await WebBrowser.openAuthSessionAsync(
      result.checkoutUrl,
      'dowe://checkout-return',
    );

    // Navigateur refermé sans être passé par l'URL de retour : l'utilisateur
    // a quitté ou annulé. On ferme la commande côté serveur AVANT tout
    // sondage — une commande annulée ne peut plus être créditée.
    if (browser.type !== 'success') {
      await cancelPayment(result.reference);
      const message = 'Paiement annulé. Aucun montant n\'a été débité de ton compte.';
      setError(message);
      Alert.alert('Paiement annulé', message);
      return;
    }

    // Le statut ne vient jamais du navigateur : on sonde le serveur, qui
    // revérifie la transaction chez Interswitch avant de créditer.
    setWaiting(true);
    const settlement = await waitForPaymentSettlement(result.reference);
    setWaiting(false);
    if (settlement === 'success') {
      setDone(true);
      refresh();
      return;
    }
    if (settlement === 'cancelled') {
      const message = 'Paiement annulé. Aucun montant n\'a été débité de ton compte.';
      setError(message);
      Alert.alert('Paiement annulé', message);
      return;
    }
    if (settlement === 'failed') {
      setError('Le paiement a été refusé. Aucun montant ne sera débité.');
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
          <Text style={styles.doneTitle}>Vérification du paiement</Text>
          <Text style={styles.doneText}>
            On confirme ton paiement de {purchase.priceCdfLabel} auprès du service de
            paiement. Ton achat sera activé automatiquement dès la validation.
          </Text>
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
        <View style={styles.footerInner}>
          <Button
            title={`Payer ${purchase.priceCdfLabel}`}
            variant="secondary"
            onPress={pay}
            loading={busy}
          />
        </View>
      </GlassSurface>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: 0 },
  helpBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  lineIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  lineBody: { flex: 1, gap: 2 },
  lineTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  lineText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  lineAmount: { fontSize: 15, fontWeight: '700', color: colors.text },
  lineFree: { fontSize: 15, fontWeight: '700', color: colors.success },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  totalLabel: { fontSize: 18, fontWeight: '700', color: colors.text },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.text },
  footer: { borderRadius: 0 },
  footerInner: { padding: spacing.md },
  doneWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  doneIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  doneTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  doneText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.md,
  },
});
