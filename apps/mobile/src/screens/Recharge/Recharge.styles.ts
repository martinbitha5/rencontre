import { StyleSheet } from 'react-native';
import { COIN_ON_GOLD } from '@/config/economy';
import { colors, shadows, spacing } from '@/theme';

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  // Sous-titre posé sous la barre de titre, aux mêmes marges que le contenu.
  headerSub: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pack: { width: '48%', flexGrow: 1 },
  packCard: {
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    borderBottomRightRadius: 8,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.md,
  },
  packCardSelected: {
    borderColor: colors.accent,
    ...shadows.card,
  },
  packBody: { alignItems: 'center', gap: 3, paddingVertical: spacing.xs },
  packName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
  },
  // Hauteur fixe : la pilule apparaît sans décaler les prix des autres cartes.
  packTagSlot: { height: 20, justifyContent: 'center' },
  packTagPill: {
    backgroundColor: colors.gold,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  // Encre sombre sur l'aplat or : du blanc sur de l'or ne se lit pas.
  packTagText: { fontSize: 11, fontWeight: '800', color: COIN_ON_GOLD },
  packCoins: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  packPrice: { fontSize: 15, fontWeight: '800', color: colors.primaryDeep },
  packPriceUsd: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  footnote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  explain: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginVertical: spacing.sm,
  },
  buyBtn: {
    height: 54,
    borderRadius: 18,
    borderBottomRightRadius: 8,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  buyText: { fontSize: 16, fontWeight: '700', color: colors.textOnAccent },
  soon: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
