import { useFocusEffect } from 'expo-router';
import { useCallback, type ComponentRef, type RefObject } from 'react';
import type { TextInput } from 'react-native';
import { onIntroDone } from '@/utils/introState';

// Instance d'un TextInput (React Native 0.88 : le type du composant n'est
// plus celui de son instance).
export type InputHandle = ComponentRef<typeof TextInput>;

// Remplace autoFocus sur les écrans de saisie.
//
// autoFocus ouvre le clavier dès le montage de l'écran, pendant l'animation
// d'arrivée. Sur Android, l'écran natif se met en place juste après et le
// champ perd le focus : le clavier sort puis se referme aussitôt. Et un écran
// monté puis quitté tout de suite (redirection au démarrage) faisait clignoter
// le clavier pour rien.
//
// Ici, le clavier ne s'ouvre que si l'écran est TOUJOURS affiché une fois sa
// transition terminée, et jamais par-dessus l'intro de démarrage.
export function useFocusWhenShown(
  ref: RefObject<InputHandle | null>,
  enabled = true,
  delayMs = 450,
) {
  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = onIntroDone(() => {
        timer = setTimeout(() => ref.current?.focus(), delayMs);
      });
      return () => {
        stop();
        if (timer) clearTimeout(timer);
      };
    }, [ref, enabled, delayMs]),
  );
}
