import { StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  emptyWrap: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.washFrom,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 15, color: colors.textMuted },
  // Rangée de transaction : pastille, libellé, montant. Les séparateurs
  // hairline remplacent les cartes individuelles.
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.washFrom,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 40 + spacing.md,
  },
  txBody: { flex: 1, gap: 1 },
  txLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  txDetail: { fontSize: 13, color: colors.textMuted },
  txDate: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  txAmountWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  txAmount: { fontSize: 17, fontWeight: '800', color: colors.success },
  txAmountNeg: { color: colors.danger },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: spacing.md,
  },
  secureText: { fontSize: 12, color: colors.textMuted },
});
