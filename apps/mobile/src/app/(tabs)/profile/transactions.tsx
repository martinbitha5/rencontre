import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCoinTransactions } from '../../../api';
import { CoinIcon } from '../../../components/coins';
import { Reveal } from '../../../components/motion';
import { formatCoins } from '../../../config/economy';
import { colors, spacing } from '../../../theme';
import type { CoinTransaction } from '../../../types';

// Chaque type de mouvement a son visage : libellé, icône et sous-titre.
// L'icône rend la liste scannable d'un coup d'œil, sans lire les libellés.
const KIND_META: Record<
  CoinTransaction['kind'],
  { label: string; detail: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  welcome: { label: 'Bonus de bienvenue', detail: 'Offert à l\'inscription', icon: 'gift' },
  recharge: { label: 'Recharge', detail: 'Achat de pièces', icon: 'wallet' },
  like_back: { label: 'Like en retour', detail: 'Match immédiat', icon: 'heart' },
  dm: { label: 'Message direct', detail: 'Premier pas envoyé', icon: 'chatbubble-ellipses' },
  event: { label: 'Entrée soirée', detail: 'Accès à une soirée', icon: 'ticket' },
  admin: { label: 'Ajustement', detail: 'Opération Dowe', icon: 'construct' },
  filter: { label: 'Filtre de recherche', detail: 'Option premium activée', icon: 'options' },
  filter_online: {
    label: 'Filtre En ligne',
    detail: 'Profils en ligne uniquement',
    icon: 'radio-button-on',
  },
  filter_goals: {
    label: 'Filtre intentions',
    detail: 'Profils selon leurs intentions',
    icon: 'heart-circle',
  },
  filter_dm: {
    label: 'Filtre DM',
    detail: 'DM réservés aux profils compatibles',
    icon: 'chatbubbles',
  },
  reward: { label: 'Récompense', detail: 'Mission accomplie', icon: 'trophy' },
  expire: { label: 'Pièces expirées', detail: 'Fin de validité', icon: 'hourglass' },
};

// Aujourd'hui / Hier / date : plus parlant qu'une date brute sur les
// mouvements récents, qui sont ceux qu'on vient vérifier.
function formatDay(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diffDays === 0) return `Aujourd'hui, ${time}`;
  if (diffDays === 1) return `Hier, ${time}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}, ${time}`;
}

// Historique complet des mouvements de pièces, sorti du portefeuille pour
// garder celui-ci lisible.
export default function TransactionsScreen() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<CoinTransaction[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      getCoinTransactions()
        .then(setTransactions)
        .catch(() => setTransactions([]));
    }, []),
  );

  return (
    <View style={styles.screen}>
      {/* En-tête plein-bleed : le dégradé magenta passe derrière la barre de
          statut, la SafeArea vit à l'intérieur. */}
      <LinearGradient
        colors={[colors.headerGradFrom, colors.headerGradTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.headerGrad}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Ionicons name="chevron-back" size={26} color="#ffffff" />
            </Pressable>
            <Text style={styles.headerTitle}>Transactions</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>

      {/* Feuille claire aux coins très arrondis, posée sur le bas du dégradé. */}
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <FlatList
          data={transactions ?? []}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={styles.content}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="receipt-outline" size={30} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyText}>
                {transactions === null ? 'Chargement…' : "Aucune transaction pour l'instant."}
              </Text>
            </View>
          }
          ListFooterComponent={
            transactions && transactions.length > 0 ? (
              <View style={styles.secureRow}>
                <Ionicons name="lock-closed-outline" size={13} color={colors.textMuted} />
                <Text style={styles.secureText}>Transactions sécurisées</Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => {
            const meta = KIND_META[item.kind] ?? {
              label: item.kind,
              detail: 'Mouvement de pièces',
              icon: 'swap-horizontal' as const,
            };
            const positive = item.amount > 0;
            return (
              <Reveal index={Math.min(index, 8)}>
                <View style={styles.txRow}>
                  {/* Pastille : fond voile rose, icône accent selon le type. */}
                  <View style={styles.txIcon}>
                    <Ionicons name={meta.icon} size={20} color={colors.accent} />
                  </View>
                  <View style={styles.txBody}>
                    <Text style={styles.txLabel}>{meta.label}</Text>
                    <Text style={styles.txDetail}>{meta.detail}</Text>
                    <Text style={styles.txDate}>{formatDay(item.created_at)}</Text>
                  </View>
                  <View style={styles.txAmountWrap}>
                    <Text style={[styles.txAmount, !positive && styles.txAmountNeg]}>
                      {positive ? '+' : '-'}
                      {formatCoins(Math.abs(item.amount))}
                    </Text>
                    <CoinIcon size={15} />
                  </View>
                </View>
              </Reveal>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.headerGradFrom },
  // Le dégradé descend sous la feuille : ses derniers points sont recouverts
  // par les coins arrondis.
  headerGrad: { paddingBottom: spacing.lg + 28 },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
  },
  backBtn: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.sm,
    bottom: 0,
    justifyContent: 'center',
  },
  // Feuille de contenu : coins hauts très arrondis, elle recouvre le dégradé.
  sheet: {
    flex: 1,
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm + 2,
  },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  emptyWrap: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.washFrom,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 15, color: colors.textMuted },
  // Rangée de transaction : pastille, libellé, montant. Les séparateurs
  // hairline remplacent les cartes individuelles.
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.washFrom,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 40 + spacing.md,
  },
  txBody: { flex: 1, gap: 1 },
  txLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  txDetail: { fontSize: 13, color: colors.textMuted },
  txDate: { fontSize: 13, color: colors.textMuted, marginTop: 1 },
  txAmountWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  txAmount: { fontSize: 17, fontWeight: '800', color: colors.success },
  txAmountNeg: { color: colors.danger },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: spacing.md,
  },
  secureText: { fontSize: 12, color: colors.textMuted },
});
