import React, { type ReactNode } from 'react';
import {
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Platform,
  TurboModuleRegistry,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';

// Clavier : un seul point d'entrée pour toute l'app.
//
// Pourquoi. Depuis qu'Android dessine l'app « bord à bord » (edge-to-edge,
// par défaut dans Expo), la fenêtre ne rétrécit plus quand le clavier sort :
// le KeyboardAvoidingView de React Native ne fait plus rien sur Android, et le
// bouton Envoyer restait caché sous le clavier sur certains téléphones.
//
// La solution des apps en production : react-native-keyboard-controller. Il
// lit le vrai mouvement du clavier, image par image, sur iOS comme sur
// Android, y compris dans les fenêtres (Modal), et fait remonter le contenu
// exactement de la hauteur du clavier, sans saut.
//
// Le module est natif. Dans une app où il n'est pas encore compilé (Expo Go
// selon sa version, ou un ancien build), le simple import ferait planter
// l'app : on ne le charge que si son module natif est présent, sinon on
// retombe sur la compensation en JS d'avant (useKeyboardInset).

type KeyboardControllerLib = typeof import('react-native-keyboard-controller');

// Sur le web, TurboModuleRegistry n'existe pas : on reste sur le repli JS.
const lib: KeyboardControllerLib | null =
  Platform.OS !== 'web' && TurboModuleRegistry?.get('KeyboardController')
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('react-native-keyboard-controller') as KeyboardControllerLib)
  : null;

export const hasKeyboardController = lib !== null;

// Zone de maintien d'un appui, à poser sur les boutons proches du clavier.
//
// Le bug du « double appui ». Quand le clavier sort, la barre de saisie
// remonte. Au premier contact, React Native mesure le bouton pour savoir si
// le doigt reste dessus ; sur Android cette mesure arrive parfois avec la
// position d'AVANT la remontée (sous le clavier). Le moindre glissement du
// doigt pendant l'appui le fait alors juger « sorti du bouton », et l'appui
// est annulé : il fallait appuyer deux fois. Avec une zone de maintien
// large, un appui commencé sur le bouton compte toujours.
export const KEYBOARD_PRESS_RETENTION = { top: 400, bottom: 400, left: 400, right: 400 };

// À poser une fois, à la racine de l'app.
export function KeyboardProvider({ children }: { children: ReactNode }) {
  if (!lib) return <>{children}</>;
  return (
    <lib.KeyboardProvider statusBarTranslucent navigationBarTranslucent preserveEdgeToEdge>
      {children}
    </lib.KeyboardProvider>
  );
}

type AvoidingProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  // Hauteur à ne pas compter (un en-tête posé au-dessus de la zone, par
  // exemple). La plupart des écrans n'en ont pas besoin.
  keyboardVerticalOffset?: number;
  enabled?: boolean;
  testID?: string;
};

// Remonte son contenu au-dessus du clavier, sur les deux plateformes.
function ControllerAvoidingView({ keyboardVerticalOffset = 0, enabled = true, style, children, testID }: AvoidingProps) {
  const KAV = lib!.KeyboardAvoidingView;
  return (
    <KAV behavior="padding" keyboardVerticalOffset={keyboardVerticalOffset} enabled={enabled} style={style} testID={testID}>
      {children}
    </KAV>
  );
}

// Repli sans module natif : padding iOS natif, et sur Android la hauteur du
// clavier mesurée en JS.
function FallbackAvoidingView({ keyboardVerticalOffset = 0, enabled = true, style, children, testID }: AvoidingProps) {
  const inset = useKeyboardInset();
  if (Platform.OS === 'ios') {
    return (
      <RNKeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={keyboardVerticalOffset}
        enabled={enabled}
        style={style}
        testID={testID}
      >
        {children}
      </RNKeyboardAvoidingView>
    );
  }
  return (
    <View style={[style, enabled && inset > 0 ? { paddingBottom: inset } : null]} testID={testID}>
      {children}
    </View>
  );
}

export const KeyboardAvoidingView = lib ? ControllerAvoidingView : FallbackAvoidingView;

// Hauteur du clavier à compenser, pour les rares vues qui se positionnent
// elles-mêmes (une feuille collée en bas d'une Modal). Déjà déduite de la
// zone de geste du bas, comme useKeyboardInset.
function useControllerKeyboardHeight(): number {
  const height = lib!.useKeyboardState((s) => (s.isVisible ? s.height : 0));
  const insets = useSafeAreaInsets();
  return Math.max(height - insets.bottom, 0);
}

export const useKeyboardHeight: () => number = lib ? useControllerKeyboardHeight : useKeyboardInset;

// Pour les longs formulaires : fait défiler jusqu'au champ touché pour qu'il
// reste visible au-dessus du clavier. Sans le module natif, ScrollView simple.
export const KeyboardAwareScrollView: typeof import('react-native').ScrollView = lib
  ? (lib.KeyboardAwareScrollView as unknown as typeof import('react-native').ScrollView)
  : // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('react-native').ScrollView as typeof import('react-native').ScrollView);
