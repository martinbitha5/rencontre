import { StyleSheet } from 'react-native';
import { colors, isDark, spacing } from '@/theme';

// Même langage que l'onglet Profil : fond gris clair, cartes blanches
// arrondies, ronds rose pâle.
const PANEL_BG = isDark ? '#16171a' : '#f4f4f6';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PANEL_BG },
  content: { paddingHorizontal: 20, paddingTop: spacing.sm, paddingBottom: spacing.xl * 2 },
  intro: { fontSize: 15, lineHeight: 22, color: colors.textMuted, marginBottom: spacing.sm },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.cardSolid,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 60 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDark: { backgroundColor: '#101113' },
  rowIconDanger: { backgroundColor: isDark ? 'rgba(248, 113, 113, 0.14)' : '#fef2f2' },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowText: { fontSize: 13.5, lineHeight: 19, color: colors.textMuted },

  loader: { paddingVertical: spacing.lg },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.textMuted },

  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 },
  blockAvatar: { width: 44, height: 44, borderRadius: 22 },
  blockAvatarEmpty: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  blockBody: { flex: 1, minWidth: 0, gap: 2 },
  blockName: { fontSize: 16, fontWeight: '700', color: colors.text },
  blockDate: { fontSize: 13, color: colors.textMuted },
  unblockBtn: {
    minWidth: 96,
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unblockText: { fontSize: 14, fontWeight: '700', color: colors.text },
});
