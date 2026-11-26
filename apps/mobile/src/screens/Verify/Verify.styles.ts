import { StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  backBtn: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, alignSelf: 'flex-start' },
  boxes: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  // flex + maxWidth : six cases de 48 débordaient d'un écran de 320 dp ; les
  // cases se resserrent d'elles-mêmes sur les petits écrans.
  box: {
    flex: 1,
    maxWidth: 48,
    height: 56,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.primary, backgroundColor: colors.card },
  boxFilled: { borderColor: colors.primary },
  boxText: { fontSize: 24, fontWeight: '800', color: colors.text },
  hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent' },
  resend: {
    textAlign: 'center',
    marginTop: spacing.lg,
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  footer: { padding: spacing.md, gap: spacing.sm, marginTop: 'auto' },
});
