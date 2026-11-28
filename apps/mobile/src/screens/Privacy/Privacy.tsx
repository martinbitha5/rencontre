import { Ionicons } from '@expo/vector-icons';

import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HeaderBackButton, ScreenHeader } from '@/components/ui';
import { PAYMENTS_ENABLED } from '@/config/features';
import { SITE } from '@/config/support';
import { useAuth } from '@/providers/auth';
import {
  getMyBlocks,
  setIncognito,
  unblockUser,
  updateMyProfile,
  updateSearchFilters,
  type BlockedUser,
} from '@/services/api';
import { colors } from '@/theme';
import { haptic } from '@/utils/haptics';
import { styles } from './Privacy.styles';
import { Photo } from '@/components/Photo';

// Gérer ta confidentialité : tout ce qui décide de qui te voit et qui peut
// t'écrire, au même endroit, avec des réglages qui agissent vraiment.
//   - Ta visibilité : le mode Invisible, et le filtre des messages directs.
//   - Personnes bloquées : la liste, et le déblocage (migration 065).
//   - Tes données : la politique, une copie de tes données, la suppression.
export default function Privacy() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [blocks, setBlocks] = useState<BlockedUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getMyBlocks()
        .then(setBlocks)
        .catch(() => setBlocks([]));
    }, []),
  );

  const toggleInvisible = async (value: boolean) => {
    if (busy) return;
    setBusy('invisible');
    try {
      const res = await setIncognito(value);
      if (res.status === 'subscription_required') {
        if (PAYMENTS_ENABLED) router.push('/incognito');
        else
          Alert.alert(
            'Mode Invisible indisponible',
            "Le mode Invisible n'est pas activable pour l'instant. Réessaie plus tard.",
          );
        return;
      }
      await refreshProfile();
    } catch {
      Alert.alert('Erreur', "Impossible de changer le mode Invisible pour l'instant.");
    } finally {
      setBusy(null);
    }
  };

  // Le filtre des DM passe par la même fonction serveur que les filtres de
  // recherche : on renvoie les deux autres réglages tels quels.
  const toggleDmStrict = async (value: boolean) => {
    if (busy || !profile) return;
    setBusy('dm');
    try {
      const res = await updateSearchFilters({
        onlineOnly: !!profile.filter_online_only,
        goals: profile.filter_goals ?? null,
        dmStrict: value,
      });
      if (res.status === 'insufficient_coins') {
        Alert.alert('Solde insuffisant', 'Ce réglage demande des pièces que tu n’as pas encore.');
        return;
      }
      await refreshProfile();
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer ce réglage pour l'instant.");
    } finally {
      setBusy(null);
    }
  };

  const toggleShowOnline = async (value: boolean) => {
    if (busy) return;
    setBusy('online');
    try {
      await updateMyProfile({ show_online: value });
      await refreshProfile();
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer ce réglage pour l'instant.");
    } finally {
      setBusy(null);
    }
  };

  const unblock = (b: BlockedUser) => {
    const name = b.display_name || 'cette personne';
    Alert.alert(
      `Débloquer ${name} ?`,
      'Vous pourrez de nouveau vous croiser dans Rencontres. Votre ancienne conversation, elle, reste fermée.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Débloquer',
          onPress: async () => {
            setBusy(b.user_id);
            try {
              await unblockUser(b.user_id);
              setBlocks((prev) => (prev ?? []).filter((x) => x.user_id !== b.user_id));
              haptic.success();
            } catch {
              Alert.alert('Erreur', 'Impossible de débloquer pour l’instant. Réessaie.');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  const openPage = (page: string) => WebBrowser.openBrowserAsync(`${SITE}/${page}`).catch(() => {});

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Confidentialité" left={<HeaderBackButton />} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Choisis qui te voit et qui peut t’écrire. Ton e-mail, ton numéro et ta position exacte ne
          sont jamais montrés aux autres membres, seule ta ville apparaît.
        </Text>

        <Text style={styles.sectionTitle}>Ta visibilité</Text>
        <View style={styles.card}>
          <ToggleRow
            icon="eye-off"
            dark
            title="Mode Invisible"
            text={
              profile?.incognito
                ? 'Activé. Tu n’apparais plus dans Rencontres, tu continues à voir tout le monde.'
                : 'Ton profil sort de Rencontres. Toi, tu continues à voir tout le monde.'
            }
            value={!!profile?.incognito}
            busy={busy === 'invisible'}
            onChange={toggleInvisible}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="radio-button-on"
            title="Afficher mon statut en ligne"
            text={
              profile?.show_online === false
                ? 'Coupé. Personne ne voit quand tu es en ligne ni quand tu l’étais.'
                : 'Les autres voient « En ligne » quand tu es là, et depuis quand tu ne l’es plus.'
            }
            value={profile?.show_online !== false}
            busy={busy === 'online'}
            onChange={toggleShowOnline}
          />
          <View style={styles.divider} />
          <ToggleRow
            icon="chatbubble-ellipses"
            title="Messages directs filtrés"
            text="Seuls les profils qui correspondent à tes critères de recherche peuvent t’écrire en premier."
            value={!!profile?.filter_dm_strict}
            busy={busy === 'dm'}
            onChange={toggleDmStrict}
          />
        </View>

        <Text style={styles.sectionTitle}>Personnes bloquées</Text>
        <View style={styles.card}>
          {blocks === null ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : blocks.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
              </View>
              <Text style={styles.emptyText}>
                Tu n’as bloqué personne. Bloquer quelqu’un se fait depuis son profil ou votre
                conversation.
              </Text>
            </View>
          ) : (
            blocks.map((b, i) => (
              <View key={b.user_id}>
                {i > 0 && <View style={styles.divider} />}
                <View style={styles.blockRow}>
                  {b.photo ? (
                    <Photo
                      path={b.photo}
                      style={styles.blockAvatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.blockAvatar, styles.blockAvatarEmpty]}>
                      <Ionicons name="person" size={20} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={styles.blockBody}>
                    <Text style={styles.blockName} numberOfLines={1}>
                      {b.display_name || 'Profil supprimé'}
                    </Text>
                    <Text style={styles.blockDate}>
                      Bloqué le {new Date(b.blocked_at).toLocaleDateString('fr-FR')}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => unblock(b)}
                    disabled={busy === b.user_id}
                    style={({ pressed }) => [styles.unblockBtn, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Débloquer ${b.display_name ?? ''}`}
                  >
                    {busy === b.user_id ? (
                      <ActivityIndicator size="small" color={colors.text} />
                    ) : (
                      <Text style={styles.unblockText}>Débloquer</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={styles.sectionTitle}>Tes données</Text>
        <View style={styles.card}>
          <LinkRow
            icon="document-text"
            title="Politique de confidentialité"
            text="Ce que Zola collecte, pourquoi, et combien de temps."
            onPress={() => openPage('confidentialite.html')}
          />
          <View style={styles.divider} />
          <LinkRow
            icon="download"
            title="Demander une copie de mes données"
            text="Écris-nous, on t’envoie tout ce que Zola garde sur toi."
            onPress={() => openPage('contact.html')}
          />
          <View style={styles.divider} />
          <LinkRow
            icon="trash"
            danger
            title="Supprimer mon compte"
            text="Ton profil, tes photos et tes messages sont effacés."
            onPress={() => router.push('/(tabs)/profile/settings')}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({
  icon,
  title,
  text,
  value,
  busy,
  dark,
  onChange,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  value: boolean;
  busy?: boolean;
  dark?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, dark && styles.rowIconDark]}>
        <Ionicons name={icon} size={20} color={dark ? '#ffffff' : colors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowText}>{text}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor="#ffffff"
          accessibilityLabel={title}
        />
      )}
    </View>
  );
}

function LinkRow({
  icon,
  title,
  text,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  text: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      accessibilityRole="button"
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        <Text style={styles.rowText}>{text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.text} />
    </Pressable>
  );
}
