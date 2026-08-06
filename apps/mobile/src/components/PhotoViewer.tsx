import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const MAX_SCALE = 4;

// Visionneuse photo plein écran : pincer pour zoomer, glisser pour se
// déplacer, double-tap pour zoomer/réinitialiser, X ou tap simple pour fermer.
export function PhotoViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Nouvelle photo : repartir sans zoom.
  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    tx.value = 0;
    ty.value = 0;
    savedTx.value = 0;
    savedTy.value = 0;
  }, [uri, scale, savedScale, tx, ty, savedTx, savedTy]);

  const clampOffsets = () => {
    'worklet';
    const maxX = (width * (scale.value - 1)) / 2;
    const maxY = (height * (scale.value - 1)) / 2;
    tx.value = withTiming(Math.min(Math.max(tx.value, -maxX), maxX));
    ty.value = withTiming(Math.min(Math.max(ty.value, -maxY), maxY));
    savedTx.value = tx.value;
    savedTy.value = ty.value;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(Math.max(savedScale.value * e.scale, 1), MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      clampOffsets();
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value <= 1) return;
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      clampOffsets();
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedTx.value = 0;
        savedTy.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  // Tap simple = fermer, mais seulement quand on n'est pas zoomé.
  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (scale.value <= 1) runOnJS(onClose)();
    });

  const gesture = Gesture.Simultaneous(
    pinch,
    pan,
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal visible={uri !== null} transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.backdrop}>
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.imageWrap, style]}>
            {!!uri && (
              <Image source={{ uri }} style={styles.image} contentFit="contain" transition={120} />
            )}
          </Animated.View>
        </GestureDetector>
        <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={26} color="#ffffff" />
        </Pressable>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: { width: '100%', height: '100%' },
  image: { width: '100%', height: '100%' },
  closeBtn: {
    position: 'absolute',
    top: 54,
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
