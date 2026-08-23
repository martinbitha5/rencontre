import { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Compensation clavier en JS pur, sans module natif. Sur Android, le SDK 54
// active l'edge-to-edge par défaut, ce qui neutralise adjustResize : la
// fenêtre ne rétrécit plus quand le clavier sort, il faut pousser nous-mêmes
// le composeur au-dessus. Sur iOS, keyboardWillShow anticipe l'animation.
//
// Garde-fou anti double compensation : si la fenêtre a réellement rétréci
// (adjustResize encore actif sur certains appareils), on ne rajoute rien.
export function useKeyboardInset(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  // Hauteur de fenêtre clavier fermé : référence pour détecter un resize.
  const baseHeight = useRef(Dimensions.get('window').height);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: KeyboardEvent) => {
      const kb = e.endCoordinates.height;
      const shrunk = baseHeight.current - Dimensions.get('window').height;
      // La fenêtre a déjà absorbé le clavier : rien à compenser en plus.
      setHeight(shrunk > kb * 0.5 ? 0 : kb);
    };
    const onHide = () => {
      baseHeight.current = Dimensions.get('window').height;
      setHeight(0);
    };

    const subs = [
      Keyboard.addListener(showEvent, onShow),
      Keyboard.addListener(hideEvent, onHide),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  // Le clavier recouvre déjà la zone de gestes du bas : on déduit cet inset,
  // sinon le composeur (déjà posé au-dessus via SafeArea) monterait trop haut.
  return Math.max(height - insets.bottom, 0);
}
