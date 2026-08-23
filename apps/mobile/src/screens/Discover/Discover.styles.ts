import { StyleSheet } from 'react-native';
import { colors, radius, shadows, spacing } from '@/theme';

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  // L'empreinte en filigrane, calée en haut à droite, légèrement hors cadre.
  watermark: {
    position: 'absolute',
    top: 2,
    right: -16,
    opacity: 0.07,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  brand: { fontSize: 30, fontWeight: '800', color: colors.primaryDeep },
  headerGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.cardSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    // Coin signature Velours, version resserrée pour ce petit conteneur.
    borderRadius: 16,
    borderBottomRightRadius: 6,
    padding: 6,
  },
  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
  },
  balanceText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  // Boutons carrés de l'en-tête : crème, bordure hairline café, et le même
  // coin signature que leur conteneur.
  headerBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderBottomRightRadius: 5,
    backgroundColor: colors.cardSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quotaBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  quotaText: { flex: 1, color: colors.text, fontSize: 13, fontWeight: '600' },
  quotaAction: { color: colors.primary, fontSize: 12, fontWeight: '800' },
  deck: { flex: 1, margin: spacing.md, marginTop: 0 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 18,
    paddingBottom: spacing.md,
  },
  // Cercle crème (surface de carte) : son X garde l'encre café fixe
  // (onLight), et l'ombre chaude de l'échelle commune le fait flotter.
  actionBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.cardSolid,
    ...shadows.floating,
  },
  actionInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Ambre du DM : la couleur des pièces habille le message payant, qui se
  // distingue ainsi du corail du like d'un coup d'oeil.
  msgBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.purple,
  },
  // Pastille blanche portant la pièce dorée : la monnaie interne garde sa
  // couleur propre sur tous les écrans.
  msgCostBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  likeBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 280,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(23,18,23,.6)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.cardSolid,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalIcon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Variante calme de modalIcon : le magenta annonce une action à faire, or
  // cette pastille-là ne fait qu'informer. Rose pâle sur encre prune.
  modalIconSoft: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primaryDeep,
    textAlign: 'center',
  },
  matchText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
});
