import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteMyAccount, setIncognito } from '@/services/api';
import { useAppLock } from '@/providers/applock';
import { BottomSheet } from './BottomSheet';
import { MenuRow, ScreenHeader, SectionLabel } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { haptic } from '@/utils/haptics';
import {
  getThemePref,
  setThemePref,
  type ThemePref,
} from '@/utils/themePreference';
import { colors } from '@/theme';
import { styles } from './Settings.styles';

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
          {"Le changement s'applique immédiatement : l'app se recharge un court instant."}
        </Text>
      </BottomSheet>
    </SafeAreaView>
  );
}
