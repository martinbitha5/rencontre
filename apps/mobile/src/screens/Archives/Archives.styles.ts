import { StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    maxWidth: 300,
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.md,
  },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 22, fontWeight: '700' },
  rowBody: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowPreview: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  rowTime: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  restoreBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  restoreBtnText: { fontSize: 13, fontWeight: '800', color: colors.primary },
});
