import { StyleSheet } from 'react-native';
import { colors, isDark, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  introContent: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },

  hero: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.sm },
  heroBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: colors.primaryDeep, textAlign: 'center' },
  heroText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: spacing.sm,
  },

  // Encart de refus : rouge très pâle en clair, voile rouge sombre en sombre.
  rejected: {
    backgroundColor: isDark ? 'rgba(240, 128, 120, 0.16)' : '#FBEAE8',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rejectedTitle: { fontSize: 15, fontWeight: '800', color: colors.danger },
  rejectedText: { fontSize: 14, color: colors.text, lineHeight: 19 },

  steps: { gap: spacing.md, marginTop: spacing.xs },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  stepTexts: { flex: 1 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  stepText: { fontSize: 14, color: colors.textMuted, lineHeight: 19 },

  gestureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  gestureIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gestureTexts: { flex: 1 },
  gestureLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDeep,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  gestureValue: { fontSize: 17, fontWeight: '800', color: colors.primaryDeep, lineHeight: 22 },

  privacy: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  warning: { fontSize: 14, color: colors.danger, lineHeight: 19, fontWeight: '600' },

  gestureStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  gestureStripText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },

  cameraArea: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.md },
  cameraBox: {
    width: '100%',
    maxWidth: 340,
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  camera: { flex: 1 },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  permissionText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },

  shutterRow: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.lg },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 3,
    borderColor: colors.primaryDeep,
  },
  shutterHint: { fontSize: 13, color: colors.textMuted },

  previewContent: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  preview: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  checklist: { gap: spacing.sm },
  checkRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  checkText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 19 },

  statusWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  statusIcon: {
    width: 108,
    height: 108,
    borderRadius: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontSize: 24, fontWeight: '800', color: colors.primaryDeep },
  statusText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },
});
