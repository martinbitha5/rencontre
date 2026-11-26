import { StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },

  // En-tête : retour, « Rempli à X % » avec sa barre, « Aperçu ».
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  headerCenter: { flex: 1, alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  headerTrack: {
    width: 120,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  headerFill: { height: '100%', backgroundColor: colors.text, borderRadius: 2 },
  headerAction: { fontSize: 15, fontWeight: '600', color: colors.text, paddingRight: spacing.sm },

  content: { paddingHorizontal: spacing.md, gap: spacing.sm },

  // Bandeau ouvert par le push « photo retirée ».
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  noticeTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  noticeText: { fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 18 },

  // Grille de photos.
  grid: { gap: spacing.sm },
  gridTop: { flexDirection: 'row', gap: spacing.sm, aspectRatio: 3 / 2 },
  gridSide: { flex: 1, gap: spacing.sm },
  gridRow: { flexDirection: 'row', gap: spacing.sm, aspectRatio: 3 / 1 },
  slot: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  slotBig: { flex: 2 },
  slotImg: { width: '100%', height: '100%' },
  slotEmpty: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  slotBusy: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16, 17, 19,.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  block: { marginTop: spacing.xs, marginBottom: spacing.sm },

  // Cartes de section.
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  cardValue: { fontSize: 14, color: colors.textMuted, marginTop: 4, lineHeight: 19 },
  cardEmpty: { color: colors.textMuted, fontStyle: 'italic' },
  pressed: { opacity: 0.75 },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  sectionTitleFlat: { fontSize: 20, fontWeight: '800', color: colors.text },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionAction: { fontSize: 15, fontWeight: '700', color: colors.text },

  // Liste « Dis-nous en plus sur toi ».
  list: { backgroundColor: colors.surface, borderRadius: 14, overflow: 'hidden' },
  detail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  detailBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  detailValue: { fontSize: 13, color: colors.textMuted, maxWidth: '45%' },
  sectionNote: { fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: 4 },

  // Centres d'intérêt.
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: 14, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },

  verify: { marginTop: spacing.lg, gap: 6 },
  verifyHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Feuille d'édition.
  sheetScroll: { maxHeight: 520 },
  sheetBody: { gap: spacing.sm, paddingBottom: spacing.md },
  sheetInput: {
    fontSize: 17,
    color: colors.text,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.text,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetBio: {
    fontSize: 16,
    color: colors.text,
    minHeight: 120,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.md,
    lineHeight: 22,
  },
  sheetCount: { fontSize: 12, color: colors.textMuted, textAlign: 'right' },
  sheetValue: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  sheetLink: { alignSelf: 'center', paddingVertical: spacing.sm },
  chipsSheet: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
});
