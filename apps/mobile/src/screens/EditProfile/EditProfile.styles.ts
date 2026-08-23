import { StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: 0 },
  section: { marginTop: spacing.md },
  completionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  completionHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  completionLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  completionPct: { fontSize: 14, fontWeight: '800', color: colors.primary },
  completionTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  completionFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  completionHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoCell: {
    width: '31%',
    aspectRatio: 3 / 4,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.inputBg,
  },
  photoAdd: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  bioInput: { height: 110, paddingTop: spacing.md, textAlignVertical: 'top' },
  field: { marginTop: spacing.md },
  fieldPair: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 6,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
