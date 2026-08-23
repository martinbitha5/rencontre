import { StyleSheet } from 'react-native';
import { brandSurface, colors, onLight, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandSurface },
  safe: { flex: 1, justifyContent: 'space-between', padding: spacing.lg },
  backBtn: { alignSelf: 'flex-start', padding: 2 },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { marginBottom: spacing.lg },
  title: { color: colors.textOnPrimary, fontSize: 30, fontWeight: '800' },
  tagline: {
    color: 'rgba(255,255,255,.92)',
    fontSize: 15,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 22,
    maxWidth: 300,
  },
  actions: { gap: spacing.sm + 4 },
  btn: {
    height: 54,
    borderRadius: radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnIcon: { marginRight: spacing.sm },
  // Bouton Google : blanc imposé par la charte du fournisseur. Encre fixe,
  // sinon le libellé passait en blanc sur blanc en thème sombre.
  btnWhite: { backgroundColor: '#fff' },
  btnWhiteText: { fontSize: 16, fontWeight: '700', color: onLight.ink },
  btnBlack: { backgroundColor: '#000' },
  btnBlackText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnLime: { backgroundColor: colors.accent },
  btnLimeText: { fontSize: 16, fontWeight: '700', color: colors.textOnAccent },
});
