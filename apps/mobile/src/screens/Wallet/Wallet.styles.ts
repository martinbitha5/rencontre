import { StyleSheet } from 'react-native';
import { colors, shadows, sigCorner, spacing } from '@/theme';

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  // La carte du solde : voile sable, radius 24 et coin signature, le solde en
  // très grand encre.
  balanceCard: {
    borderRadius: 24,
    borderBottomRightRadius: sigCorner,
    padding: 20,
    gap: 4,
    marginBottom: spacing.md,
    ...shadows.card,
  },
  balanceCaption: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: 2,
  },
  balanceValue: { fontSize: 40, fontWeight: '800', color: colors.primaryDeep },
  balanceSub: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  refreshBtn: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  refreshInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    // 40 de haut : cible tactile confortable sans alourdir la carte.
    minHeight: 40,
  },
  refreshText: { fontSize: 14, fontWeight: '700', color: colors.accent },
  // Carte-rangée d'action : pastille d'icône, libellé, chevron.
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    borderBottomRightRadius: 8,
    padding: spacing.md,
    marginBottom: 12,
    ...shadows.card,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.washFrom,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
});
