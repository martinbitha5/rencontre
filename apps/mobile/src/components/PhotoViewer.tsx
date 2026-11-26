import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { haptic } from '@/utils/haptics';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;
// Distance verticale (ou vitesse) au-delà de laquelle le glissement ferme.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

// Galerie photo plein écran.
//
// - Balayer à gauche ou à droite passe d'une photo à l'autre, en douceur.
// - Pincer ou toucher deux fois zoome ; zoomé, on se déplace dans la photo.
// - Glisser vers le bas (sans zoom) ferme : la photo suit le doigt et le fond
//   s'éclaircit, comme dans les galeries des téléphones.
// - Un toucher simple masque ou montre le compteur et les vignettes.
export function PhotoViewer({
  uris,
  index = 0,
  onClose,
  onIndexChange,
}: {
  uris: string[] | null;
  index?: number;
  onClose: () => void;
  // Prévenu à chaque photo affichée : l'écran d'origine peut reprendre là.
  onIndexChange?: (index: number) => void;
}) {
  const visible = !!uris && uris.length > 0;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {visible && (
        <Gallery uris={uris!} start={index} onClose={onClose} onIndexChange={onIndexChange} />
      )}
    </Modal>
  );
}

function Gallery({
  uris,
  start,
  onClose,
  onIndexChange,
}: {
  uris: string[];
  start: number;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const initial = Math.min(Math.max(start, 0), uris.length - 1);
  const [current, setCurrent] = useState(initial);
  const [zoomed, setZoomed] = useState(false);
  const [chrome, setChrome] = useState(true);
  const listRef = useRef<FlatList<string>>(null);
  const thumbsRef = useRef<FlatList<string>>(null);
  // Glissement vertical de fermeture, partagé avec le fond et l'interface.
  const dragY = useSharedValue(0);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== current && i >= 0 && i < uris.length) {
      setCurrent(i);
      onIndexChange?.(i);
      haptic.select();
    }
  };

  // Les vignettes suivent la photo affichée.
  useEffect(() => {
    if (uris.length > 1) {
      thumbsRef.current?.scrollToIndex({ index: current, animated: true, viewPosition: 0.5 });
    }
  }, [current, uris.length]);

  const goTo = (i: number) => {
    haptic.select();
    listRef.current?.scrollToIndex({ index: i, animated: true });
    setCurrent(i);
    onIndexChange?.(i);
  };

  const toggleChrome = useCallback(() => setChrome((c) => !c), []);

  const backdrop = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dragY.value), [0, 300], [1, 0.25], 'clamp'),
  }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(dragY.value), [0, 80], [1, 0], 'clamp'),
  }));

  return (
    <GestureHandlerRootView style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
      <FlatList
        ref={listRef}
        data={uris}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed && uris.length > 1}
        initialScrollIndex={initial}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(u, i) => `${i}-${u}`}
        onMomentumScrollEnd={onScrollEnd}
        decelerationRate="fast"
        renderItem={({ item, index: i }) => (
          <ZoomablePage
            uri={item}
            width={width}
            active={i === current}
            dragY={dragY}
            onZoomChange={setZoomed}
            onTap={toggleChrome}
            onDismiss={onClose}
          />
        )}
      />

      {/* Compteur et bouton fermer, en haut. */}
      {chrome && (
        <Animated.View
          style={[styles.top, { paddingTop: Math.max(insets.top, 12) + 6 }, chromeStyle]}
          pointerEvents="box-none"
        >
          <View style={styles.topSide} />
          {uris.length > 1 ? (
            <View style={styles.counter}>
              <Text style={styles.counterText}>
                {current + 1} / {uris.length}
              </Text>
            </View>
          ) : (
            <View />
          )}
          <View style={styles.topSide}>
            <Pressable
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Fermer la photo"
            >
              <Ionicons name="close" size={24} color="#ffffff" />
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Vignettes, en bas : la photo affichée est cerclée. */}
      {chrome && uris.length > 1 && (
        <Animated.View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) + 8 }, chromeStyle]}>
          <FlatList
            ref={thumbsRef}
            data={uris}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(u, i) => `t${i}-${u}`}
            contentContainerStyle={styles.thumbs}
            getItemLayout={(_, i) => ({ length: THUMB + THUMB_GAP, offset: (THUMB + THUMB_GAP) * i, index: i })}
            onScrollToIndexFailed={() => {}}
            renderItem={({ item, index: i }) => (
              <Pressable
                onPress={() => goTo(i)}
                style={[styles.thumb, i === current && styles.thumbOn]}
                accessibilityLabel={`Photo ${i + 1}`}
              >
                <Image source={{ uri: item }} style={styles.thumbImg} contentFit="cover" />
              </Pressable>
            )}
          />
        </Animated.View>
      )}
    </GestureHandlerRootView>
  );
}

// Une page de la galerie : sa propre loupe, son propre glissement de fermeture.
function ZoomablePage({
  uri,
  width,
  active,
  dragY,
  onZoomChange,
  onTap,
  onDismiss,
}: {
  uri: string;
  width: number;
  active: boolean;
  dragY: SharedValue<number>;
  onZoomChange: (zoomed: boolean) => void;
  onTap: () => void;
  onDismiss: () => void;
}) {
  const { height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const [isZoomed, setIsZoomed] = useState(false);

  const setZoom = useCallback(
    (z: boolean) => {
      setIsZoomed(z);
      onZoomChange(z);
    },
    [onZoomChange],
  );

  // Une photo qu'on quitte se remet à plat.
  useEffect(() => {
    if (active) return;
    scale.set(withTiming(1));
    savedScale.set(1);
    tx.set(0);
    ty.set(0);
    savedTx.set(0);
    savedTy.set(0);
  }, [active, scale, savedScale, tx, ty, savedTx, savedTy]);

  // Ramène la photo dans le cadre, pour l'échelle `s` (la cible d'une
  // animation de zoom en cours, sinon l'échelle actuelle).
  const clamp = (s?: number) => {
    'worklet';
    const k = s ?? scale.value;
    const maxX = (width * (k - 1)) / 2;
    const maxY = (height * (k - 1)) / 2;
    const nx = Math.min(Math.max(tx.value, -maxX), maxX);
    const ny = Math.min(Math.max(ty.value, -maxY), maxY);
    tx.set(withSpring(nx, { damping: 20, stiffness: 200 }));
    ty.set(withSpring(ny, { damping: 20, stiffness: 200 }));
    savedTx.set(nx);
    savedTy.set(ny);
  };

  const reset = () => {
    'worklet';
    scale.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
    savedScale.set(1);
    tx.set(withTiming(0));
    ty.set(withTiming(0));
    savedTx.set(0);
    savedTy.set(0);
    runOnJS(setZoom)(false);
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.set(Math.min(Math.max(savedScale.value * e.scale, 0.8), MAX_SCALE));
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        reset();
        return;
      }
      savedScale.set(scale.value);
      clamp();
      runOnJS(setZoom)(true);
    });

  // Zoomé : se déplacer dans la photo.
  const panZoomed = Gesture.Pan()
    .enabled(isZoomed)
    .onUpdate((e) => {
      tx.set(savedTx.value + e.translationX);
      ty.set(savedTy.value + e.translationY);
    })
    .onEnd(() => {
      clamp();
    });

  // À plat : glisser vers le bas (ou le haut) ferme. Échoue dès que le geste
  // part à l'horizontale, pour laisser la main au défilement des photos.
  const panDismiss = Gesture.Pan()
    .enabled(!isZoomed)
    .activeOffsetY([-12, 12])
    .failOffsetX([-14, 14])
    .onUpdate((e) => {
      dragY.set(e.translationY);
    })
    .onEnd((e) => {
      if (Math.abs(e.translationY) > DISMISS_DISTANCE || Math.abs(e.velocityY) > DISMISS_VELOCITY) {
        dragY.set(
          withTiming(Math.sign(e.translationY || 1) * height, { duration: 200 }, () => {
            runOnJS(onDismiss)();
          }),
        );
      } else {
        dragY.set(withSpring(0, { damping: 18, stiffness: 220 }));
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd((e) => {
      if (scale.value > 1) {
        reset();
      } else {
        // Zoome là où le doigt a touché.
        const focusX = (width / 2 - e.x) * (DOUBLE_TAP_SCALE - 1);
        const focusY = (height / 2 - e.y) * (DOUBLE_TAP_SCALE - 1);
        scale.set(withTiming(DOUBLE_TAP_SCALE, { duration: 240, easing: Easing.out(Easing.cubic) }));
        savedScale.set(DOUBLE_TAP_SCALE);
        tx.set(focusX);
        ty.set(focusY);
        clamp(DOUBLE_TAP_SCALE);
        runOnJS(setZoom)(true);
      }
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      runOnJS(onTap)();
    });

  const gesture = Gesture.Simultaneous(
    pinch,
    Gesture.Race(panZoomed, panDismiss),
    Gesture.Exclusive(doubleTap, singleTap),
  );

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value + (active ? dragY.value : 0) },
      { scale: scale.value * (active ? interpolate(Math.abs(dragY.value), [0, 400], [1, 0.82], 'clamp') : 1) },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height }}>
        <Animated.View style={[styles.page, style]}>
          <Image source={{ uri }} style={styles.image} contentFit="contain" transition={160} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const THUMB = 46;
const THUMB_GAP = 8;

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: '#000000' },
  page: { flex: 1 },
  image: { width: '100%', height: '100%' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  topSide: { width: 44, alignItems: 'flex-end' },
  counter: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  counterText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  thumbs: { paddingHorizontal: 16, gap: THUMB_GAP, flexGrow: 1, justifyContent: 'center' },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: 'hidden',
    opacity: 0.55,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  thumbOn: { opacity: 1, borderColor: '#ffffff' },
  thumbImg: { width: '100%', height: '100%' },
});
