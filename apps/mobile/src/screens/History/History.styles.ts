import { StyleSheet } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  cell: {
    flex: 1,
    maxWidth: '48.5%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photo: { aspectRatio: 3 / 4 },
  noPhoto: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPhotoText: { fontSize: 38, color: 'rgba(255,255,255,.6)', fontWeight: '700' },
  cellOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(23,18,23,.55)',
  },
  cellName: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  cellTime: { fontSize: 11, color: 'rgba(255,255,255,.75)', marginTop: 1 },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  endText: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: spacing.lg,
  },
});
