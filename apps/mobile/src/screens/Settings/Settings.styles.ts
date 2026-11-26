import { StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: spacing.xl },
  // Ligne pleine largeur sur fond clair, séparée de la suivante par un filet.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surface },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.text },
  rowHint: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rowDetail: { fontSize: 14, color: colors.textMuted },
  rowDanger: { color: colors.danger, fontWeight: '600' },
  // Bande grise entre deux groupes de réglages.
  gap: { height: 14, backgroundColor: colors.surface },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    marginBottom: spacing.sm,
  },
  themeOptionActive: { borderColor: colors.primary },
  themeOptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOptionLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  themeOptionDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  themeHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  footer: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
