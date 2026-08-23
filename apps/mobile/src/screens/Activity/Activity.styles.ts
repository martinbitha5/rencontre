import { StyleSheet } from 'react-native';
import { colors, radius, shadows, sigCorner, spacing } from '@/theme';

export const styles = StyleSheet.create({
  // Tout l'écran vit sur l'ivoire : plus de dégradé, plus de feuille.
  root: { flex: 1, backgroundColor: colors.background },
  header: { position: 'relative' },
  // Filigrane d'empreinte : le logo en café presque transparent, qui déborde
  // légèrement du coin haut droit de l'écran.
  watermark: {
    position: 'absolute',
    top: -10,
    right: -14,
    opacity: 0.07,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.primaryDeep,
    padding: spacing.md,
  },
  // Rangée d'onglets sous le titre, sur l'ivoire : espacement régulier,
  // défile si besoin.
  tabs: {
    flexGrow: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
  },
  tab: { alignItems: 'center', paddingHorizontal: spacing.sm },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textMuted,
  },
  tabTextActive: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryDeep,
  },
  // Trait souligné corail arrondi centré sous le libellé actif ; transparent
  // sur les inactifs pour que la rangée ne bouge pas d'un pixel au changement.
  tabUnderline: {
    width: 24,
    height: 3,
    borderRadius: 2,
    marginTop: 6,
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: { backgroundColor: colors.accent },
  // Le pager occupe tout le reste de l'écran, directement sur l'ivoire.
  pagerWrap: { flex: 1, marginTop: spacing.sm },
  // Chaque page du pager occupe la hauteur disponible : les listes défilent
  // dans leur page, l'état vide se centre.
  pageList: { flex: 1 },
  // Padding bas généreux : la barre d'onglets flotte au-dessus du contenu.
  listContent: { paddingVertical: spacing.sm, paddingBottom: spacing.xl },
  sentContent: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
  // Contrôle segmenté Reçus / Envoyés : piste en voile café au coin
  // signature, le segment actif est une pilule corail au texte blanc.
  dmSegmentWrap: { paddingHorizontal: spacing.md, marginTop: spacing.sm },
  dmSegment: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderBottomRightRadius: 6,
    padding: 3,
  },
  dmSegmentItem: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dmSegmentItemActive: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 6,
  },
  dmSegmentText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  dmSegmentTextActive: { color: colors.textOnAccent, fontWeight: '800' },
  // Cartes des DMs envoyés : carte crème au coin signature, elle porte le
  // message entier, l'état de lecture et la corbeille.
  sentCard: {
    backgroundColor: colors.cardSolid,
    borderRadius: 24,
    borderBottomRightRadius: sigCorner,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadows.card,
  },
  sentHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sentTime: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  sentMessage: { fontSize: 15, color: colors.text, lineHeight: 21 },
  sentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sentStatus: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sentStatusText: { fontSize: 13.5, fontWeight: '600', color: colors.textMuted },
  trashBtn: {
    width: 46,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyMascot: { marginBottom: spacing.lg },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 22,
  },
  // Rangées de liste : posées sur l'ivoire, avatar rond badgé, nom gras,
  // sous-texte gris, heure ou action à droite, séparées par un trait hairline.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  rowAvatar: { width: 54, height: 54, borderRadius: 27 },
  rowAvatarLetter: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  // Le badge bleu mord sur le coin de l'avatar, posé sur une pastille du fond
  // pour rester net sur la photo.
  rowBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 1,
  },
  rowName: { fontSize: 17, fontWeight: '700', color: colors.text },
  rowSub: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  rowTime: { fontSize: 13, color: colors.textMuted },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  rowSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.md + 54 + spacing.md,
  },
  noPhoto: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  // Pilule d'action accent (répondre, liker en retour avec son coût).
  accentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  accentPillText: { fontSize: 13, fontWeight: '800', color: colors.textOnAccent },
  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
