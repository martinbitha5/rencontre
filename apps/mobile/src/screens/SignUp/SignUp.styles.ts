import { StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  backBtn: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, alignSelf: 'flex-start' },
  container: { flex: 1 },
  form: { gap: spacing.sm, padding: spacing.md, marginTop: spacing.md },
  footer: { padding: spacing.md, marginTop: 'auto' },
});
