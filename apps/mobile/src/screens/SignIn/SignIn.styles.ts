import { StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  backBtn: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, alignSelf: 'flex-start' },
  container: { flex: 1 },
  form: { gap: spacing.sm, padding: spacing.md, marginTop: spacing.md },
  altLink: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textDecorationLine: 'underline',
    marginTop: spacing.xs,
  },
  footer: { padding: spacing.md, marginTop: 'auto' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(23,18,23,.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.cardSolid,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalIcon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryDeep,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: spacing.sm,
  },
});
