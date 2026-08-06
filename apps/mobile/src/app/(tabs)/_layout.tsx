import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import React, { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMyPhotos, touchLastActive } from '../../api';
import { cacheSet } from '../../lib/cache';
import { registerForPushNotifications } from '../../lib/notifications';
import { prefetchPhotos } from '../../lib/preload';
import { colors, glass, isDark, isIOS, m3, shadows } from '../../theme';

// Battement de coeur de présence. Le badge « En ligne » repose sur
// last_active_at avec un seuil de 15 minutes : un signal toutes les 4 minutes
// garde le statut vrai tant que l'app est à l'écran, quel que soit l'onglet.
// À l'arrière-plan le minuteur s'arrête ; c'est la disparition du signal qui
// fait office de déconnexion, il n'y a rien à envoyer en quittant.
const HEARTBEAT_MS = 4 * 60 * 1000;

// Hauteur utile de la barre (hors zone de geste système). iOS : barre de verre
// compacte qui flotte sur le contenu. Android : barre de navigation M3, plus
// haute pour loger la pilule d'indicateur et le libellé.
const BAR_HEIGHT = isIOS ? 56 : 68;

// Icône d'onglet Android : la pilule Material derrière l'icône active. C'est
// elle, et non un changement de couleur seul, qui dit « tu es ici » en M3.
function M3TabIcon({
  name,
  focused,
  color,
}: {
  name: keyof typeof Ionicons.glyphMap;
  focused: boolean;
  color: string;
}) {
  return (
    <View style={[styles.m3Pill, focused && { backgroundColor: m3.secondaryContainer }]}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}

function tabIcon(active: keyof typeof Ionicons.glyphMap, inactive: keyof typeof Ionicons.glyphMap) {
  // Fonction de rendu passée à tabBarIcon, pas un composant nommé.
  // eslint-disable-next-line react/display-name
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => {
    const name = focused ? active : inactive;
    if (isIOS) return <Ionicons name={name} size={size} color={color} />;
    return <M3TabIcon name={name} focused={focused} color={color} />;
  };
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const barHeight = BAR_HEIGHT + insets.bottom;

  // L'utilisateur est connecté et onboardé dès qu'il atteint les onglets :
  // bon moment pour demander la permission et enregistrer le token push.
  useEffect(() => {
    registerForPushNotifications();
  }, []);

  // Préchauffage du profil : mes photos partent en cache (données + images)
  // dès l'arrivée sur les onglets. Ouvrir l'onglet Profil ensuite affiche
  // l'avatar et les infos sans aucun délai visible.
  useEffect(() => {
    getMyPhotos()
      .then((photos) => {
        cacheSet('my-photos', photos);
        prefetchPhotos(photos.map((p) => p.storage_path));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    touchLastActive();
    let timer = setInterval(touchLastActive, HEARTBEAT_MS);
    const sub = AppState.addEventListener('change', (appState) => {
      // Un seul minuteur à la fois : celui en cours s'arrête au changement
      // d'état, et un neuf repart uniquement si l'app revient à l'écran.
      clearInterval(timer);
      if (appState === 'active') {
        touchLastActive();
        timer = setInterval(touchLastActive, HEARTBEAT_MS);
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Actif en fuchsia sur les deux plateformes : c'est la signature de la
        // référence Heyama (icône et libellé roses, inactifs gris).
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        // iOS : barre de verre. Posée en absolu pour que le contenu défile
        // dessous et se devine au travers du flou ; le fond est peint par
        // tabBarBackground, la barre elle-même reste transparente.
        // Android : barre de navigation M3, opaque sur surface tonique,
        // détachée par l'élévation plutôt que par un trait.
        tabBarStyle: isIOS
          ? {
              position: 'absolute',
              height: barHeight,
              backgroundColor: 'transparent',
              borderTopWidth: 0,
              ...shadows.floating,
              shadowOffset: { width: 0, height: -6 },
              // Après le spread : une barre transparente ne doit pas porter
              // l'élévation de `floating`, sinon le verre traîne une ombre.
              elevation: 0,
            }
          : {
              height: barHeight,
              paddingTop: 6,
              paddingBottom: insets.bottom + 10,
              backgroundColor: m3.surfaceContainer,
              borderTopWidth: 0,
              elevation: 3,
            },
        tabBarBackground: isIOS
          ? () => (
              <View style={styles.glassBar}>
                <BlurView
                  intensity={60}
                  tint={isDark ? 'dark' : 'light'}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.glassBarTint} />
                {/* Reflet : fil de lumière sur l'arête du verre. */}
                <View style={styles.glassBarHighlight} />
              </View>
            )
          : undefined,
        // La barre iOS flotte : chaque scène garde son fond et réserve la
        // hauteur de la barre, aucun écran n'a à s'en préoccuper.
        sceneStyle: isIOS
          ? { backgroundColor: colors.background, paddingBottom: barHeight }
          : { backgroundColor: colors.background },
        tabBarLabelStyle: isIOS
          ? { fontWeight: '700', fontSize: 11 }
          : { fontWeight: '600', fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Rencontres',
          tabBarIcon: tabIcon('grid', 'grid-outline'),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Discussions',
          tabBarIcon: tabIcon('chatbubbles', 'chatbubbles-outline'),
        }}
      />
      <Tabs.Screen
        name="likes"
        options={{
          title: 'Activité',
          tabBarIcon: tabIcon('heart', 'heart-outline'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: tabIcon('person', 'person-outline'),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  glassBar: { ...StyleSheet.absoluteFillObject, overflow: 'hidden' },
  glassBarTint: { ...StyleSheet.absoluteFillObject, backgroundColor: glass.tint },
  glassBarHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: glass.highlight,
  },
  m3Pill: {
    width: 60,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
