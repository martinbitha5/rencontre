import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteMyAccount, setIncognito } from '../../../api';
import { useAppLock } from '../../../lib/applock';
import { BottomSheet } from '../../../components/BottomSheet';
import { MenuRow, ScreenHeader, SectionLabel } from '../../../components/ui';
import { useAuth } from '../../../lib/auth';
import { haptic } from '../../../lib/haptics';
import {
  getThemePref,
  setThemePref,
  type ThemePref,
} from '../../../lib/theme-preference';
import { colors, radius, spacing } from '../../../theme';

const SITE = 'https://dowe-eight.vercel.app';

// Les trois modes d'apparence, présentés dans la feuille de choix.
const THEME_OPTIONS: {
  key: ThemePref;
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: 'system',
    label: 'Système',
    detail: 'Suit le réglage du téléphone',
    icon: 'phone-portrait-outline',
  },
  { key: 'light', label: 'Clair', detail: 'Toujours le thème clair', icon: 'sunny-outline' },
  { key: 'dark', label: 'Sombre', detail: 'Toujours le thème sombre', icon: 'moon-outline' },
];

// Carte arrondie regroupant les rangées d'une section.
function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.sectionCard}>{children}</View>;
}

export default function Settings() {
  const router = useRouter();
  const { profile, refreshProfile, signOut } = useAuth();
  const { hasCode } = useAppLock();

  // Thème : la valeur vit dans AsyncStorage, l'application passe par un
  // rechargement du bundle (voir lib/theme-preference.ts). Le choix se fait
  // dans une feuille qui glisse depuis le bas.
  const [themePref, setThemePrefState] = useState<ThemePref>('system');
  const [themeSheetOpen, setThemeSheetOpen] = useState(false);
  useEffect(() => {
    getThemePref().then(setThemePrefState);
  }, []);
  const changeTheme = (pref: ThemePref) => {
    haptic.select();
    setThemePrefState(pref);
    setThemeSheetOpen(false);
    setThemePref(pref);
  };
  const themeLabel =
    THEME_OPTIONS.find((o) => o.key === themePref)?.label ?? 'Système';

  // Même règle qu'ailleurs : activer demande un abonnement, couper est libre.
  const toggleIncognito = async (value: boolean) => {
    try {
      const res = await setIncognito(value);
      if (res.status === 'subscription_required') {
        router.push('/incognito');
        return;
      }
      await refreshProfile();
    } catch {
      Alert.alert('Erreur', "Impossible de changer le mode incognito pour l'instant.");
    }
  };

  const openPage = (path: string) => {
    WebBrowser.openBrowserAsync(`${SITE}/${path}`).catch(() => {});
  };

  const confirmDelete = () => {
    Alert.alert(
      'Supprimer mon compte',
      'Toutes tes données (profil, photos, matchs, messages) seront définitivement supprimées. Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer définitivement',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMyAccount();
            } catch {
              Alert.alert('Erreur', 'Suppression impossible. Réessaie.');
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Paramètres" />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>Préférences</SectionLabel>
        <SectionCard>
          <MenuRow
            icon="options-outline"
            label="Filtres de recherche"
            onPress={() => router.push('/(tabs)/profile/preferences')}
          />
        </SectionCard>

        <SectionLabel>Apparence</SectionLabel>
        <SectionCard>
          <MenuRow
            icon="color-palette-outline"
            label="Thème"
            detail={themeLabel}
            onPress={() => setThemeSheetOpen(true)}
          />
        </SectionCard>

        <SectionLabel>Vie privée</SectionLabel>
        <SectionCard>
          <View style={styles.switchRow}>
            <View style={styles.switchRowIcon}>
              <Ionicons name="eye-off-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchRowLabel}>Mode incognito</Text>
              <Text style={styles.switchRowDetail}>
                {profile?.incognito
                  ? 'Activé : tu n’apparais plus dans Rencontres'
                  : 'Ton profil reste visible dans Rencontres'}
              </Text>
            </View>
            <Switch
              value={!!profile?.incognito}
              onValueChange={toggleIncognito}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor="#ffffff"
            />
          </View>
          <MenuRow
            icon="lock-closed-outline"
            label="Code secret"
            detail={hasCode ? 'Activé' : undefined}
            onPress={() => router.push('/app-lock')}
          />
        </SectionCard>

        <SectionLabel>Assistance</SectionLabel>
        <SectionCard>
          <MenuRow
            icon="chatbox-ellipses-outline"
            label="Nous contacter"
            onPress={() => openPage('contact.html')}
          />
          <MenuRow
            icon="heart-circle-outline"
            label="Conseils et sécurité"
            onPress={() => openPage('conseils.html')}
          />
        </SectionCard>

        <SectionLabel>À propos</SectionLabel>
        <SectionCard>
          <MenuRow
            icon="document-text-outline"
            label="Conditions générales"
            onPress={() => openPage('conditions.html')}
          />
          <MenuRow
            icon="shield-checkmark-outline"
            label="Politique de confidentialité"
            onPress={() => openPage('confidentialite.html')}
          />
          <MenuRow
            icon="alert-circle-outline"
            label="Sécurité des enfants"
            onPress={() => openPage('securite-enfants.html')}
          />
          <MenuRow
            icon="business-outline"
            label="Mentions légales"
            onPress={() => openPage('mentions-legales.html')}
          />
        </SectionCard>

        <View style={styles.accountZone}>
          <Pressable onPress={signOut} hitSlop={8}>
            <Text style={styles.signOutLink}>Déconnexion</Text>
          </Pressable>
          <Pressable onPress={confirmDelete} hitSlop={8}>
            <Text style={styles.deleteLink}>Supprimer mon compte</Text>
          </Pressable>
          <Text style={styles.footer}>
            © 2026 Dowe · version {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
      </ScrollView>

      {/* Choix du thème : feuille glissée depuis le bas, comme les écrans de
          paiement. Le changement recharge l'app un court instant. */}
      <BottomSheet
        visible={themeSheetOpen}
        onClose={() => setThemeSheetOpen(false)}
        title="Apparence"
      >
        {THEME_OPTIONS.map((option) => {
          const active = themePref === option.key;
          return (
            <Pressable
              key={option.key}
              style={({ pressed }) => [
                styles.themeOption,
                active && styles.themeOptionActive,
                pressed && { opacity: 0.75 },
              ]}
              onPress={() => changeTheme(option.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
            >
              <View style={styles.themeOptionIcon}>
                <Ionicons
                  name={option.icon}
                  size={20}
                  color={active ? colors.primary : colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.themeOptionLabel, active && { color: colors.primary }]}>
                  {option.label}
                </Text>
                <Text style={styles.themeOptionDetail}>{option.detail}</Text>
              </View>
              <Ionicons
                name={active ? 'radio-button-on' : 'radio-button-off'}
                size={22}
                color={active ? colors.primary : colors.border}
              />
            </Pressable>
          );
        })}
        <Text style={styles.themeHint}>
          Le changement s'applique immédiatement : l'app se recharge un court instant.
        </Text>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: 0 },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    backgroundColor: colors.card,
  },
  switchRowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  switchRowDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  themeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    marginBottom: spacing.sm,
  },
  themeOptionActive: { borderColor: colors.primary },
  themeOptionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeOptionLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  themeOptionDetail: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  themeHint: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  accountZone: {
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  signOutLink: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.danger,
    textDecorationLine: 'underline',
  },
  deleteLink: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.danger,
    textDecorationLine: 'underline',
  },
  footer: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
