import { Ionicons } from '@expo/vector-icons';
import { requireOptionalNativeModule } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { onIntroDone } from '@/utils/introState';
import { colors, flame } from '@/theme';

// Mise à jour de l'app, détectée AUTOMATIQUEMENT auprès du store : rien à
// saisir nulle part quand une nouvelle version est publiée.
//   - Android : Google Play (API « in-app updates » de Play Core) compare la
//     version installée à celle du store pour cet appareil ;
//   - iPhone  : l'App Store (iTunes Search API).
// Dès qu'une version plus récente existe, une fenêtre aux couleurs de Zola le
// signale. « Mettre à jour » lance la mise à jour native de Google Play
// (plein écran, l'app redémarre toute seule à la fin) ou la fiche App Store.
// « Plus tard » la referme jusqu'au prochain lancement de l'app.
//
// Vérifié après l'intro, puis à chaque retour de l'app au premier plan.
// Rien en développement ni sur le web : Expo Go n'est pas installé depuis un
// store. Google Play ne répond que pour une app installée depuis le Play
// Store (piste de test comprise).

// Le module natif n'existe que dans un build EAS (pas dans Expo Go, ni dans un
// build plus ancien que son ajout). On ne charge donc la bibliothèque que si
// son module natif est présent : sinon l'import seul fait planter l'app au
// démarrage (« Cannot find native module 'ExpoInAppUpdates' »).
type InAppUpdates = typeof import('expo-in-app-updates');
const inAppUpdates: InAppUpdates | null = requireOptionalNativeModule('ExpoInAppUpdates')
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-in-app-updates') as InAppUpdates)
  : null;

const INK = '#101113';
const ANDROID_PACKAGE = 'com.zolardc.app';

async function openStorePage() {
  if (Platform.OS !== 'android') return;
  try {
    await Linking.openURL(`market://details?id=${ANDROID_PACKAGE}`);
  } catch {
    await Linking.openURL(`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`).catch(() => {});
  }
}

export function UpdatePrompt() {
  const [visible, setVisible] = useState(false);
  const [starting, setStarting] = useState(false);
  // Une fois « Plus tard » choisi, on ne redemande plus pendant cette session.
  const dismissed = useRef(false);
  const immediateAllowed = useRef(true);

  useEffect(() => {
    if (__DEV__ || Platform.OS === 'web' || !inAppUpdates) return;

    const check = async () => {
      if (dismissed.current) return;
      try {
        const info = await inAppUpdates.checkForUpdate();
        if (!info.updateAvailable) return;
        immediateAllowed.current = info.immediateAllowed !== false;
        setVisible(true);
      } catch {
        // Store injoignable ou app installée hors store : on réessaiera.
      }
    };

    const stop = onIntroDone(() => {
      void check();
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, []);

  if (!visible) return null;

  const update = async () => {
    setStarting(true);
    try {
      // Android : mise à jour immédiate (écran Google Play, redémarrage
      // automatique). iPhone : fiche App Store par-dessus l'app.
      if (!inAppUpdates) {
        await openStorePage();
        setVisible(false);
        return;
      }
      const started = await inAppUpdates.startUpdate(
        Platform.OS === 'android' ? immediateAllowed.current : undefined,
      );
      if (!started) await openStorePage();
      setVisible(false);
    } catch {
      await openStorePage();
    } finally {
      setStarting(false);
    }
  };

  const later = () => {
    dismissed.current = true;
    setVisible(false);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={later}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.halo} />
          <View style={styles.icon}>
            <Ionicons name="arrow-down-circle" size={34} color="#ffffff" />
          </View>
          <Text style={styles.title}>Nouvelle version de Zola</Text>
          <Text style={styles.text}>
            Une mise à jour est disponible, avec des corrections et des nouveautés. Elle ne prend
            qu’un instant.
          </Text>
          <Pressable
            onPress={() => void update()}
            disabled={starting}
            style={({ pressed }) => [styles.btnWrap, (pressed || starting) && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <LinearGradient colors={flame} style={styles.btn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={styles.btnText}>{starting ? 'Ouverture…' : 'Mettre à jour'}</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={later} style={styles.later} accessibilityRole="button">
            <Text style={styles.laterText}>Plus tard</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: INK,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 18,
    gap: 14,
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  icon: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
  },
  btnWrap: { borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  btn: { height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
  later: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  laterText: { fontSize: 15, fontWeight: '700', color: 'rgba(255, 255, 255, 0.7)' },
});
