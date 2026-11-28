import { StyleSheet } from 'react-native';
import { colors, isDark, spacing } from '@/theme';

// Onglet Profil : en-tête blanc (titre, raccourcis, identité, question), puis
// une zone grise où les cartes blanches se détachent, comme sur le site.
const AVATAR = 128;
const RING = 148;
// Fond de la zone des cartes : gris très clair en clair, un cran au-dessus du
// noir en sombre.
const PANEL_BG = isDark ? '#16171a' : '#f4f4f6';
// Liseré de la pastille de la cloche : la couleur du fond, pour la détacher.
const PANEL_BADGE_RING = PANEL_BG;
// Encre sombre fixe : pastille du pourcentage, bloc « soirées », Incognito.
const INK = '#101113';

export const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: { flexGrow: 1 },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 10,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  topTitle: { fontSize: 32, fontWeight: '900', color: colors.primaryDeep, letterSpacing: -0.6 },
  topIcons: { flexDirection: 'row', alignItems: 'center' },
  topIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  topBadge: {
    position: 'absolute',
    top: 4,
    right: 3,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: PANEL_BADGE_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },

  // Identité.
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  avatarWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', top: 0, left: 0 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  avatarFallback: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Pastille du pourcentage, à cheval sur le bas de l'anneau.
  percentPill: {
    position: 'absolute',
    bottom: 2,
    alignSelf: 'center',
    backgroundColor: isDark ? colors.primary : INK,
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 4,
  },
  percentText: { fontSize: 14, fontWeight: '800', color: '#ffffff', fontVariant: ['tabular-nums'] },
  identityText: { flex: 1, minWidth: 0, gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  nameCompact: { fontSize: 23, letterSpacing: -0.3 },
  name: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.primaryDeep,
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  goalChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  goalText: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  goalTextCompact: { fontSize: 14 },

  // Question : la prochaine chose à faire.
  promptWrap: { paddingHorizontal: 20, paddingBottom: spacing.lg },
  prompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  promptIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promptText: { flex: 1, fontSize: 17, lineHeight: 24, fontWeight: '600', color: colors.text },

  // Onglets soulignés.
  // Deux boutons côte à côte, bien séparés : on voit tout de suite qu'on
  // peut toucher l'un ou l'autre.
  tabs: {
    paddingHorizontal: 20,
    paddingTop: spacing.sm,
    paddingBottom: 12,
    backgroundColor: colors.background,
  },
  tabsTrack: {
    flexDirection: 'row',
    gap: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: PANEL_BG,
  },
  tabOn: { backgroundColor: colors.primary },
  tabText: { fontSize: 16, fontWeight: '800', color: colors.text },
  tabTextOn: { color: '#ffffff' },

  // Zone grise des cartes.
  panel: {
    flexGrow: 1,
    backgroundColor: PANEL_BG,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: spacing.xl * 2,
    gap: 14,
  },

  // Tuiles d'état.
  tiles: { flexDirection: 'row', gap: 12 },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: colors.cardSolid,
  },
  tileIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBody: { flex: 1, minWidth: 0, gap: 2 },
  tileLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tileValue: { fontSize: 17, fontWeight: '800', color: colors.text },

  // Carte vedette : bloc sombre à halo rose, comme sur le site.
  feature: {
    borderRadius: 26,
    backgroundColor: INK,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    overflow: 'hidden',
    gap: 14,
  },
  featureHalo: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  featureKicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#ff8fb5',
    textAlign: 'center',
  },
  featureTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  featureBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  featureBtnText: { fontSize: 16, fontWeight: '800', color: INK },
  featureList: {
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 18,
    padding: 16,
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.92)',
  },

  // Cartes d'action.
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 24,
    backgroundColor: colors.cardSolid,
  },
  actionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconDark: { backgroundColor: INK },
  actionBody: { flex: 1, gap: 4 },
  actionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  actionText: { fontSize: 14, lineHeight: 19, color: colors.textMuted },
});
