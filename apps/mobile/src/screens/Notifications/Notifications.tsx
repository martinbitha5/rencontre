import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeaderBackButton, ScreenHeader } from '@/components/ui';
import {
  getMyNotifications,
  markAllNotificationsRead,
  type UserNotification,
} from '@/services/api';
import { colors } from '@/theme';
import { haptic } from '@/utils/haptics';
import { clearUnreadNotices } from '@/utils/noticeSignal';
import { styles } from './Notifications.styles';

// Centre de notifications : tout ce que l'équipe Zola a décidé pour toi
// (photo retirée, vérification, avertissement, signalement traité...), même
// si le push n'est jamais arrivé ou a été effacé. Ouvrir l'écran marque tout
// comme lu ; les nouvelles restent signalées par un point rose jusqu'à la
// prochaine visite.

const ICONS: Record<string, { icon: keyof typeof Ionicons.glyphMap; tone: 'rose' | 'green' | 'orange' | 'grey' }> = {
  photo_removed: { icon: 'image', tone: 'orange' },
  verification_approved: { icon: 'checkmark-circle', tone: 'green' },
  verification_rejected: { icon: 'scan', tone: 'orange' },
  warning: { icon: 'warning', tone: 'orange' },
  account_restored: { icon: 'happy', tone: 'green' },
  incognito_granted: { icon: 'eye-off', tone: 'rose' },
  incognito_revoked: { icon: 'eye', tone: 'grey' },
  report_reviewed: { icon: 'shield-checkmark', tone: 'rose' },
};

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'À l’instant';
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? 'Hier' : `Il y a ${days} jours`;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<UserNotification[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await getMyNotifications();
      setItems(list);
      if (list.some((n) => !n.read_at)) {
        // Lu dès que la liste est affichée ; le point rose reste visible
        // pendant cette visite (on garde la liste telle qu'elle est arrivée).
        markAllNotificationsRead().catch(() => {});
      }
      clearUnreadNotices();
    } catch {
      setItems((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Notifications" left={<HeaderBackButton />} />
      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          contentContainerStyle={items.length ? styles.list : styles.emptyWrap}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-outline" size={30} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Rien de nouveau</Text>
              <Text style={styles.emptyText}>
                Les messages de l’équipe Zola sur ton compte arriveront ici.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const look = ICONS[item.type] ?? { icon: 'notifications', tone: 'rose' as const };
            return (
              <Pressable
                style={({ pressed }) => [styles.card, pressed && item.url && { opacity: 0.75 }]}
                disabled={!item.url}
                onPress={() => {
                  if (!item.url) return;
                  haptic.tap();
                  router.push(item.url as Href);
                }}
              >
                <View style={[styles.icon, styles[`tone_${look.tone}`]]}>
                  <Ionicons name={look.icon} size={20} color={styles[`ink_${look.tone}`].color} />
                </View>
                <View style={styles.body}>
                  <View style={styles.titleRow}>
                    <Text style={styles.title} numberOfLines={2}>
                      {item.title}
                    </Text>
                    {!item.read_at && <View style={styles.dot} />}
                  </View>
                  <Text style={styles.text}>{item.body}</Text>
                  <Text style={styles.time}>{when(item.created_at)}</Text>
                </View>
                {item.url ? (
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}
