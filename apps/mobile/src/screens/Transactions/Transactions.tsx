import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCoinTransactions } from '@/services/api';
import { CoinIcon } from '@/components/coins';
import { HeaderBackButton, ScreenHeader } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { formatCoins } from '@/config/economy';
import { colors } from '@/theme';
import type { CoinTransaction } from '@/types';
import { styles } from './Transactions.styles';

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
export default function Transactions() {
  const [transactions, setTransactions] = useState<CoinTransaction[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      getCoinTransactions()
        .then(setTransactions)
        .catch(() => setTransactions([]));
    }, []),
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Même en-tête que partout ailleurs : titre centré, pastille de retour
          à gauche. */}
      <ScreenHeader title="Transactions" left={<HeaderBackButton />} />

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
                {/* Pastille : fond voile sable, icône corail selon le type. */}
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
    </SafeAreaView>
  );
}
