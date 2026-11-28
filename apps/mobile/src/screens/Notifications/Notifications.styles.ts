import { StyleSheet } from 'react-native';
import { colors, isDark, spacing } from '@/theme';

// Même langage que l'onglet Profil et Confidentialité : fond gris clair,
// cartes blanches arrondies, ronds teintés pour les icônes.
const PANEL_BG = isDark ? '#16171a' : '#f4f4f6';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PANEL_BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: spacing.sm, paddingBottom: spacing.xl * 2, gap: 10 },
  emptyWrap: { flexGrow: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    backgroundColor: colors.cardSolid,
  },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  tone_rose: { backgroundColor: colors.selected },
  tone_green: { backgroundColor: isDark ? 'rgba(22,163,74,0.18)' : '#dcfce7' },
  tone_orange: { backgroundColor: isDark ? 'rgba(245,158,11,0.18)' : '#fef3c7' },
  tone_grey: { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#ececf0' },
  ink_rose: { color: colors.primary },
  ink_green: { color: '#16a34a' },
  ink_orange: { color: '#d97706' },
  ink_grey: { color: colors.textMuted },
  body: { flex: 1, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  text: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  time: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  emptyText: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
});
