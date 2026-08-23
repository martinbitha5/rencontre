import { StyleSheet } from 'react-native';
import { brandSurface, colors, onDark, onLight, radius, spacing } from '@/theme';

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brandSurface },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.35)' },
  safe: { flex: 1, justifyContent: 'space-between', padding: spacing.lg },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { marginBottom: spacing.lg },
  // Texte posé sur la vidéo : rose clair, pas magenta. Voir onDark.
  title: { color: onDark.brand, fontSize: 44, fontWeight: '800', letterSpacing: 10 },
  tagline: {
    color: 'rgba(255,255,255,.92)',
    fontSize: 16,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 24,
    maxWidth: 320,
  },
  actions: { gap: spacing.sm + 4 },
  btn: {
    height: 54,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLime: { backgroundColor: colors.accent },
  btnLimeText: { fontSize: 16, fontWeight: '700', color: colors.textOnAccent },
  // Bouton blanc posé sur la vidéo : son encre reste sombre dans les deux
  // thèmes, sans quoi le libellé disparaissait en mode sombre.
  btnWhite: { backgroundColor: '#fff' },
  btnWhiteText: { fontSize: 16, fontWeight: '700', color: onLight.ink },
  legal: {
    color: 'rgba(255,255,255,.65)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: spacing.xs,
  },
  legalLink: {
    color: onDark.brand,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
