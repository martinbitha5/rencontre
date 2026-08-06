import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
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
import { colors, radius, spacing } from '../theme';
import { Button } from './ui';

// Doit correspondre à la contrainte check de la table reports.
const REPORT_REASONS: { key: string; label: string; hint: string }[] = [
  { key: 'faux_profil', label: 'Faux profil', hint: 'Photos volées, identité inventée' },
  { key: 'harcelement', label: 'Harcèlement', hint: 'Insultes, menaces, insistance après un refus' },
  { key: 'contenu_inapproprie', label: 'Contenu inapproprié', hint: 'Photos ou messages déplacés' },
  { key: 'arnaque', label: 'Arnaque', hint: 'Demande d’argent, lien douteux' },
  { key: 'mineur', label: 'Semble mineur', hint: 'Traité en priorité par notre équipe' },
  { key: 'autre', label: 'Autre', hint: 'Explique-nous en quelques mots' },
];

export function ReportModal({
  visible,
  name,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  name: string | null;
  onSubmit: (reason: string, details: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (!visible) {
      setReason(null);
      setDetails('');
    }
  }, [visible]);

  const chosen = REPORT_REASONS.find((r) => r.key === reason);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <View style={styles.card}>
          <View style={styles.handle} />
          <Text style={styles.title}>Signaler {name ?? 'ce profil'}</Text>
          <Text style={styles.text}>
            Notre équipe examine chaque signalement. Le profil sera aussi bloqué : vous ne
            vous verrez plus.
          </Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {REPORT_REASONS.map((r) => {
              const active = reason === r.key;
              return (
                <Pressable
                  key={r.key}
                  style={[styles.reasonRow, active && styles.reasonRowActive]}
                  onPress={() => setReason(r.key)}
                >
                  <View style={styles.reasonTexts}>
                    <Text style={[styles.reasonText, active && styles.reasonTextActive]}>
                      {r.label}
                    </Text>
                    <Text style={styles.reasonHint}>{r.hint}</Text>
                  </View>
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={active ? colors.primary : colors.border}
                  />
                </Pressable>
              );
            })}

            {chosen && (
              <View style={styles.detailsBlock}>
                <Text style={styles.detailsLabel}>
                  Ce qui s’est passé {chosen.key === 'autre' ? '' : '(facultatif)'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={details}
                  onChangeText={setDetails}
                  multiline
                  maxLength={1000}
                  placeholder="Donne un détail utile : ce qui a été dit, quand, sur quelle photo."
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.counter}>{details.length}/1000</Text>
              </View>
            )}
          </ScrollView>

          <Button
            title="Envoyer le signalement"
            disabled={!reason}
            onPress={() => reason && onSubmit(reason, details)}
          />
          <Button title="Annuler" variant="ghost" onPress={onCancel} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(14,15,12,.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    maxHeight: '88%',
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.primaryDeep,
    textAlign: 'center',
  },
  text: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.xs,
  },
  list: { flexGrow: 0 },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  reasonRowActive: { backgroundColor: colors.surface, borderBottomColor: 'transparent' },
  reasonTexts: { flex: 1 },
  reasonText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  reasonTextActive: { color: colors.primary },
  reasonHint: { fontSize: 12.5, color: colors.textMuted, marginTop: 1 },
  detailsBlock: { marginTop: spacing.md },
  detailsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  counter: { fontSize: 11.5, color: colors.textMuted, textAlign: 'right', marginTop: 2 },
});
