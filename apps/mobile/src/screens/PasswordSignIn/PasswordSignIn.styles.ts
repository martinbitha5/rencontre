import { StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  backBtn: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, alignSelf: 'flex-start' },
  container: { flex: 1 },
  form: { gap: spacing.sm, padding: spacing.md, marginTop: spacing.md },
  label: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.xs },
  eyeBtn: {
    position: 'absolute',
    right: spacing.md,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
});
