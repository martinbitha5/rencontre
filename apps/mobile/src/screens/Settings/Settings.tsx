import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteMyAccount, setIncognito } from '@/services/api';
import { PAYMENTS_ENABLED } from '@/config/features';
import { SITE } from '@/config/support';
import { useAppLock } from '@/providers/applock';
import { BottomSheet } from './BottomSheet';
import { ScreenHeader } from '@/components/ui';
import { getPushPermission, registerForPushNotifications } from '@/services/notifications';
import { useAuth } from '@/providers/auth';
import { haptic } from '@/utils/haptics';
import {
  getThemePref,
  setThemePref,
  type ThemePref,
} from '@/utils/themePreference';
import { colors } from '@/theme';
import { styles } from './Settings.styles';
import { setDataSaverMode, useDataSaver, type DataSaverMode } from '@/utils/dataSaver';


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

// Libellé de l'état des notifications, à droite de la ligne.
const PUSH_LABELS = {
  granted: 'Activées',
  denied: 'Désactivées',
  undetermined: 'À activer',
  unavailable: '',
} as const;

// Ligne de réglage : libellé, valeur éventuelle, chevron. Les groupes sont
// séparés par une bande grise, sans titre.
// Économiseur de données (voir utils/dataSaver). Les économies de base
// (photos légères, miniatures, notes vocales compressées, vidéos au toucher)
// sont toujours actives : ce réglage décide seulement si l'app télécharge à
// l'avance pour gagner du temps.
const DATA_OPTIONS: {
  key: DataSaverMode;
  label: string;
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: 'auto',
    label: 'Automatique',
    detail: 'Économise tes mégas hors Wi-Fi',
    icon: 'sync-outline',
  },
  {
    key: 'on',
    label: 'Toujours',
    detail: 'Économise tes mégas partout',
    icon: 'leaf-outline',
  },
  {
    key: 'off',
    label: 'Jamais',
    detail: 'Les profils se chargent plus vite',
    icon: 'flash-outline',
  },
];

function Row({
  label,
  detail,
  onPress,
  danger,
}: {
  label: string;
  detail?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      accessibilityRole="button"
    >
      <Text style={[styles.rowLabel, danger && styles.rowDanger]}>{label}</Text>
      {!!detail && <Text style={styles.rowDetail}>{detail}</Text>}
      {!danger && <Ionicons name="chevron-forward" size={18} color={colors.text} />}
    </Pressable>
  );
}

function Gap() {
  return <View style={styles.gap} />;
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
  const [dataSheetOpen, setDataSheetOpen] = useState(false);
  const { mode: dataMode } = useDataSaver();
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
  // En mode gratuit l'abonnement n'existe plus, il n'y a donc pas d'offre où
  // renvoyer (voir ProfileHome, même traitement).
  const toggleIncognito = async (value: boolean) => {
    try {
      const res = await setIncognito(value);
      if (res.status === 'subscription_required') {
        if (PAYMENTS_ENABLED) {
          router.push('/incognito');
        } else {
          Alert.alert(
            'Mode Invisible indisponible',
            "Le mode Invisible n'est pas activable pour l'instant. Réessaie plus tard.",
          );
        }
        return;
      }
      await refreshProfile();
    } catch {
      Alert.alert('Erreur', "Impossible de changer le mode Invisible pour l'instant.");
    }
  };

  // Notifications : l'état vient du téléphone. On propose de les activer si
  // la question n'a jamais été posée, sinon on ouvre les réglages du
  // téléphone, seul endroit où elles se gèrent ensuite.
  const [pushState, setPushState] = useState<keyof typeof PUSH_LABELS>('unavailable');
  useEffect(() => {
    getPushPermission().then(setPushState);
  }, []);
  const onNotifications = async () => {
    if (pushState === 'unavailable') {
      Alert.alert(
        'Notifications',
        "Les notifications ne sont pas disponibles sur cette version de l'app. Elles marchent dans l'app installée depuis le store.",
      );
      return;
    }
    if (pushState === 'undetermined') {
      await registerForPushNotifications();
      setPushState(await getPushPermission());
      return;
    }
    Linking.openSettings().catch(() => {});
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
        <Row label="Modifier mon profil" onPress={() => router.push('/(tabs)/profile/edit')} />
        <Row label="Filtres de recherche" onPress={() => router.push('/preferences')} />

        <Gap />
        <Row
          label="Notifications"
          detail={PUSH_LABELS[pushState]}
          onPress={onNotifications}
        />
        <Row label="Apparence" detail={themeLabel} onPress={() => setThemeSheetOpen(true)} />
        <Row
          label="Économiseur de données"
          detail={DATA_OPTIONS.find((o) => o.key === dataMode)?.label}
          onPress={() => setDataSheetOpen(true)}
        />

        <Gap />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Mode Invisible</Text>
            <Text style={styles.rowHint}>
              {profile?.incognito
                ? 'Activé, tu n’apparais plus dans Rencontres.'
                : 'Ton profil reste visible dans Rencontres.'}
            </Text>
          </View>
          <Switch
            value={!!profile?.incognito}
            onValueChange={toggleIncognito}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor="#ffffff"
          />
        </View>
        <Row label="Confidentialité" onPress={() => router.push('/privacy')} />
        <Row
          label="Code secret"
          detail={hasCode ? 'Activé' : undefined}
          onPress={() => router.push('/app-lock')}
        />
        <Row
          label="Vérification du profil"
          detail={profile?.is_verified ? 'Vérifié' : undefined}
          onPress={() => router.push('/verify-profile')}
        />

        <Gap />
        <Row label="Questions fréquentes" onPress={() => openPage('faq.html')} />
        <Row label="Nous contacter" onPress={() => openPage('contact.html')} />
        <Row label="Conseils et sécurité" onPress={() => openPage('conseils.html')} />

        <Gap />
        <Row label="Conditions générales" onPress={() => openPage('conditions.html')} />
        <Row label="Politique de confidentialité" onPress={() => openPage('confidentialite.html')} />
        <Row label="Sécurité des enfants" onPress={() => openPage('securite-enfants.html')} />
        <Row label="Mentions légales" onPress={() => openPage('mentions-legales.html')} />

        <Gap />
        <Row label="Déconnexion" danger onPress={signOut} />
        <Row label="Supprimer mon compte" danger onPress={confirmDelete} />

        <Text style={styles.footer}>
          © 2026 Zola · version {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
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
      <BottomSheet
        visible={dataSheetOpen}
        onClose={() => setDataSheetOpen(false)}
        title="Économiseur de données"
      >
        {DATA_OPTIONS.map((option) => {
          const active = dataMode === option.key;
          return (
            <Pressable
              key={option.key}
              style={({ pressed }) => [
                styles.themeOption,
                active && styles.themeOptionActive,
                pressed && { opacity: 0.75 },
              ]}
              onPress={() => {
                setDataSaverMode(option.key);
                setDataSheetOpen(false);
              }}
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
      </BottomSheet>
    </SafeAreaView>
  );
}
