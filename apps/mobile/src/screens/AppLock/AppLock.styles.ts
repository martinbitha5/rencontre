import { StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: 0, gap: spacing.md },
  intro: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  note: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  noteTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 4 },
  noteText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  locked: { gap: spacing.sm },
  lockedText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
});
