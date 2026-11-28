import { StyleSheet } from 'react-native';
import { colors, spacing } from '@/theme';

// Onboarding : une question par écran sur fond clair. Titre gras aligné à
// gauche, explication grise dessous, réponses en lignes pleine largeur, et
// le bouton plein collé en bas.
export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { paddingBottom: spacing.xl },

  titleBlock: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 32,
    letterSpacing: -0.3,
    marginTop: spacing.md,
  },
  subtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },

  body: { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm },
  cardStack: { gap: spacing.sm },
  pillStack: { gap: spacing.md, marginTop: spacing.md },

  // Champ nu souligné : prénom, métier, présentation.
  nameBlock: { marginTop: spacing.sm, gap: spacing.xs },
  nameField: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  lineField: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    paddingVertical: spacing.sm,
  },
  bioField: {
    fontSize: 16,
    color: colors.text,
    minHeight: 110,
    paddingVertical: spacing.sm,
    lineHeight: 22,
  },
  bioCount: { fontSize: 12, color: colors.textMuted, textAlign: 'right' },

  // Date de naissance : trois cases.
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateCol: { flex: 1, gap: 6 },
  dateColWide: { flex: 1.3 },
  dateLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginLeft: 4 },
  dateBox: {
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardSolid,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  dateBoxOn: { borderColor: colors.text },
  ageHint: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.lg,
  },
  privacyText: { fontSize: 12, color: colors.textMuted },

  // Ville.
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, height: '100%' },
  // Sélecteur de pays : même pilule que la recherche de ville, texte centré
  // verticalement (un Text, pas un champ de saisie) et drapeau à gauche.
  countryValue: {
    flex: 1,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.text,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  countryFlag: {
    fontSize: 20,
    lineHeight: 24,
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  note: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginTop: spacing.xs },
  changeCity: { alignSelf: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  changeCityText: { fontSize: 15, fontWeight: '700', color: colors.primary, textDecorationLine: 'underline' },

  // Photos : grandes cases deux par ligne.
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: spacing.xs },
  photoCell: {
    width: '47.5%',
    flexGrow: 1,
    aspectRatio: 3 / 4,
    borderRadius: 18,
    overflow: 'hidden',
  },
  photoImg: { width: '100%', height: '100%' },
  photoEmpty: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Cases suivantes, pas encore accessibles : plus discrètes.
  photoEmptyIdle: { opacity: 0.55 },
  // Pastille « + » blanche en bas à droite, comme un bouton posé sur la case.
  photoPlus: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  // La case à remplir maintenant : pastille rose, l'oeil va droit dessus.
  photoPlusNext: { backgroundColor: colors.primary },
  mainTag: {
    position: 'absolute',
    left: 10,
    top: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mainTagText: { fontSize: 12, fontWeight: '800', color: '#ffffff' },
  photoRemove: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Taille.
  heightBlock: { gap: spacing.md, marginTop: spacing.sm },
  heightReadout: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  heightValue: { fontSize: 17, fontWeight: '700', color: colors.text },
  heightClearText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },

  // Centres d'intérêt.
  interestCount: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
