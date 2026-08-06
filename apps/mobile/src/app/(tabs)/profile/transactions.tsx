import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCoinTransactions } from '../../../api';
import { CoinIcon } from '../../../components/coins';
import { Reveal } from '../../../components/motion';
import { ScreenHeader } from '../../../components/ui';
import { formatCoins } from '../../../config/economy';
import { colors, radius, shadows, spacing } from '../../../theme';
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
  const [transactions, setTransactions] = useState<CoinTransaction[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      getCoinTransactions()
        .then(setTransactions)
        .catch(() => setTransactions([]));
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Mes transactions" />
      <FlatList
        data={transactions ?? []}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={styles.content}
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
              <View style={styles.txCard}>
                <View style={[styles.txIcon, positive ? styles.txIconIn : styles.txIconOut]}>
                  <Ionicons
                    name={meta.icon}
                    size={24}
                    color={positive ? colors.success : colors.danger}
                  />
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
                  <CoinIcon size={16} />
                </View>
              </View>
            </Reveal>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: 0, gap: spacing.sm },
  emptyWrap: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 15, color: colors.textMuted },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.card,
  },
  txIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Entrée d'argent : halo vert très pâle ; sortie : halo neutre. Le signe et
  // la couleur du montant portent déjà le sens, le halo ne fait qu'appuyer.
  txIconIn: { backgroundColor: '#eaf6df' },
  txIconOut: { backgroundColor: colors.inputBg },
  txBody: { flex: 1, gap: 1 },
  txLabel: { fontSize: 16.5, fontWeight: '800', color: colors.text },
  txDetail: { fontSize: 13, color: colors.textMuted },
  txDate: { fontSize: 12.5, color: colors.textMuted, marginTop: 2 },
  txAmountWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  txAmount: { fontSize: 18, fontWeight: '800', color: colors.success },
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
