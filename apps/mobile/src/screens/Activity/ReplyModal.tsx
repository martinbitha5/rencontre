import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { sendMessage } from '@/services/api';
import { Button } from '@/components/ui';
import { colors, radius, sigCorner, spacing } from '@/theme';
import type { MatchSummary } from '@/types';

// Répondre à une invitation DM reçue.
//
// C'est la RÉPONSE qui crée le match : côté serveur, le premier message posté
// par le destinataire d'une invitation fait passer le match de 'pending' à
// 'active' (trigger messages_activate_pending). Tant que ce message n'est pas
// parti, il n'y a pas de conversation à ouvrir — seulement une invitation à
// lire. D'où ce composeur, et non un raccourci vers l'écran de chat : la
// conversation s'ouvre APRÈS la réponse, jamais avant.
//
// Répondre ne coûte rien : c'est l'expéditeur qui a payé son message initial.
export function ReplyModal({
  target,
  onClose,
  onSent,
}: {
  target: MatchSummary | null;
  onClose: () => void;
  onSent: (match: MatchSummary) => void;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Chaque ouverture repart d'un champ vide : le brouillon d'une invitation
  // ne doit pas se retrouver dans la suivante.
  useEffect(() => {
    if (target) {
      setDraft('');
      setError(null);
    }
  }, [target]);

  const submit = async () => {
    const content = draft.trim();
    if (!target || !content || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendMessage(target.match_id, content);
      onSent(target);
    } catch {
      setError("Ta réponse n'est pas partie. Vérifie ta connexion et réessaie.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      visible={target !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={1}>
              Répondre à {target?.display_name ?? ''}
            </Text>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Le message reçu, rappelé au-dessus du champ : on répond à quelque
              chose, pas dans le vide. */}
          <View style={styles.quote}>
            <Text style={styles.quoteText}>
              {target?.last_message ?? 'Nouveau message'}
            </Text>
          </View>

          <TextInput
            style={styles.input}
            placeholder="Ta réponse"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={2000}
            autoFocus
          />

          <Text style={styles.hint}>
            Ta réponse ouvre la conversation entre vous. Elle ne te coûte rien.
          </Text>

          {!!error && <Text style={styles.error}>{error}</Text>}

          {sending ? (
            <View style={styles.sendingRow}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <Button title="Envoyer ma réponse" onPress={submit} disabled={!draft.trim()} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(23,18,23,.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.cardSolid,
    borderRadius: radius.lg,
    borderBottomRightRadius: sigCorner,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: colors.primaryDeep,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Voile rose : le message reçu est une surface secondaire, pas une action.
  quote: {
    backgroundColor: colors.selected,
    borderRadius: radius.md,
    borderBottomRightRadius: sigCorner,
    padding: spacing.md,
  },
  quoteText: { fontSize: 15, lineHeight: 21, color: colors.selectedInk },
  input: {
    minHeight: 88,
    maxHeight: 160,
    borderRadius: radius.md,
    backgroundColor: colors.inputBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  error: { fontSize: 13, color: colors.danger },
  sendingRow: { height: 52, alignItems: 'center', justifyContent: 'center' },
});
