import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { sendDirectMessage } from '../api';
import { COIN_NAME_PLURAL, formatCoins } from '../config/economy';
import { CoinIcon } from './coins';
import { useWallet } from '../lib/wallet';
import { colors, radius, shadows, spacing } from '../theme';
import type { DirectMessageResult } from '../types';
import { Button } from './ui';

interface Target {
  user_id: string;
  display_name: string;
}

const DM_MAX = 150;

// Un premier DM ne doit pas permettre de partager des coordonnées : pas de
// chiffres (numéros de téléphone), pas de caractères spéciaux (@, handles,
// liens) et pas de noms de réseaux sociaux ou de messageries.
const FORBIDDEN_SPECIALS = /[@#$%^&*()_+=<>[\]{}/\\|~:;"`€£§°]/;
const FORBIDDEN_KEYWORDS =
  /\b(whatsapp|instagram|insta|facebook|telegram|snapchat|tiktok|gmail|e?-?mail|num[ée]ro|t[ée]l[ée]phone)\b/i;

function dmContentError(text: string): string | null {
  if (!text) return null;
  if (/[0-9]/.test(text)) {
    return 'Les chiffres ne sont pas autorisés : ne partage pas de numéro ou d\'informations personnelles. Ajuste ton message.';
  }
  if (FORBIDDEN_SPECIALS.test(text)) {
    return 'Les caractères spéciaux ne sont pas autorisés. Utilise seulement des lettres et une ponctuation simple. Ajuste ton message.';
  }
  if (FORBIDDEN_KEYWORDS.test(text)) {
    return 'Ton message ne doit pas contenir d\'informations personnelles ni de réseaux sociaux. Ajuste ton message.';
  }
  return null;
}

// Composer le premier message vers un profil sans match.
// La tarification est décidée côté serveur ; ici on ne fait qu'afficher
// le quota gratuit restant ou le coût.
export function DirectMessageModal({
  target,
  onClose,
  onResult,
}: {
  target: Target | null;
  onClose: () => void;
  onResult: (result: DirectMessageResult, target: Target) => void;
}) {
  const { wallet, costs } = useWallet();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentError = dmContentError(draft.trim());

  useEffect(() => {
    setDraft('');
    setError(null);
    setSending(false);
  }, [target?.user_id]);

  const freeLeft = wallet
    ? Math.max(wallet.free_dm_quota - wallet.free_dms_used, 0)
    : null;

  const send = async () => {
    const content = draft.trim();
    if (!content || !target || sending || dmContentError(content)) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendDirectMessage(target.user_id, content);
      onResult(result, target);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(
        msg.includes('dm_filtre')
          ? "Ce profil n'accepte que les DM des personnes qui correspondent à ses critères."
          : msg.includes('message_contenu_interdit')
            ? 'Ton message contient des chiffres, caractères spéciaux ou informations personnelles. Ajuste ton message.'
            : "Le message n'a pas pu être envoyé. Réessaie.",
      );
      setSending(false);
    }
  };

  return (
    <Modal visible={target !== null} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <View style={styles.card}>
          <Text style={styles.title}>Envoyer un DM</Text>
          <Text style={styles.hint}>
            Écris un message direct à {target?.display_name}. Parle avec ton cœur et, surtout,
            sois poli(e). Si {target?.display_name} répond, le match se crée automatiquement et
            répondre ne lui coûte rien. Maximum {DM_MAX} caractères, sans chiffres, caractères
            spéciaux ni informations personnelles.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Écris quelque chose de sympa…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={DM_MAX}
            autoFocus
          />
          <Text style={styles.counter}>Caractères restants : {DM_MAX - draft.length}</Text>
          {!!contentError && <Text style={styles.error}>{contentError}</Text>}
          <View style={styles.costRow}>
            <CoinIcon size={14} />
            <Text style={styles.costText}>
              {freeLeft === null
                ? `Ce DM te coûtera ${formatCoins(costs.dm_cost)} ${COIN_NAME_PLURAL}.`
                : freeLeft > 0
                  ? `Gratuit — il te reste ${freeLeft} DM offert${freeLeft > 1 ? 's' : ''}.`
                  : `Ce DM te coûtera ${formatCoins(costs.dm_cost)} ${COIN_NAME_PLURAL} (solde : ${formatCoins(wallet?.balance ?? 0)}).`}
            </Text>
          </View>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Button
            title="Envoyer"
            onPress={send}
            loading={sending}
            disabled={!draft.trim() || contentError !== null}
          />
          <Button title="Annuler" variant="ghost" onPress={onClose} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(14,15,12,.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.floating,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryDeep,
  },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  costText: { fontSize: 14, fontWeight: '600', color: colors.primary, flexShrink: 1 },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  input: {
    minHeight: 160,
    maxHeight: 240,
    borderRadius: radius.sm,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  counter: { fontSize: 12, color: colors.textMuted, textAlign: 'right' },
});
