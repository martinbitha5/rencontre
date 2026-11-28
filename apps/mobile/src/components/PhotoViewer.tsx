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
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { haptic } from '@/utils/haptics';

// Zoom maximal (relevé automatiquement pour les photos très allongées).
const MAX_SCALE = 4;
// Double toucher : au moins x2, davantage si la photo doit remplir l'écran.
const DOUBLE_TAP_SCALE = 2;
// Au-dessus de cette échelle, la photo compte comme zoomée.
const ZOOMED = 1.01;
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
  const win = useWindowDimensions();
  // Taille réelle de la modale (sous Android, la fenêtre et la modale
  // translucide n'ont pas toujours la même hauteur) : la loupe en dépend.
  const [size, setSize] = useState({ width: win.width, height: win.height });
  const { width, height } = size;
  const insets = useSafeAreaInsets();
  const initial = Math.min(Math.max(start, 0), uris.length - 1);
  const [current, setCurrent] = useState(initial);
  const [zoomed, setZoomed] = useState(false);
  const [chrome, setChrome] = useState(true);
  const listRef = useRef<FlatList<string>>(null);
  const thumbsRef = useRef<FlatList<string>>(null);
  // Glissement vertical de fermeture, partagé avec le fond et l'interface.
  const dragY = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (Math.abs(w - width) > 0.5 || Math.abs(h - height) > 0.5) setSize({ width: w, height: h });
  };

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
    <GestureHandlerRootView style={styles.root} onLayout={onLayout}>
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
        extraData={size}
        renderItem={({ item, index: i }) => (
          <ZoomablePage
            uri={item}
            width={width}
            height={height}
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

      {/* Vignettes, en bas : la photo affichée est cerclée. Masquées pendant le zoom. */}
      {chrome && !zoomed && uris.length > 1 && (
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
//
// Réécrite le 28/11/2026 sur le modèle des galeries natives (Photos iOS,
// Google Photos). Repère : écran = centre + t + s * point_de_la_photo, d'où
// l'ordre [translate, scale] du transform.
//   - Les bornes viennent de la photo AFFICHÉE (contain), pas de l'écran : on
//     ne glisse jamais dans les bandes noires, même sur une photo paysage.
//   - Le pincement s'applique par petits pas (scaleChange) autour du point
//     sous les doigts. Quand un doigt se lève ou se pose, le point focal saute :
//     on se recale sans bouger la photo, au lieu de la faire sauter.
//   - Un seul Pan pour tout : déplacement zoomé (élan, bord élastique) ou
//     glisser pour fermer à plat. Son activation est décidée sur le thread UI
//     (manualActivation), jamais par un état React qui reconfigurerait le
//     geste en plein mouvement.
//   - Poser le doigt arrête net l'élan.
//   - Au-delà du zoom max ou sous la taille normale, ça résiste, puis revient
//     en un seul mouvement amorti, ancré sous les doigts, sans rebond.
//   - Double toucher : remplit l'écran (au moins x2) là où on a touché.
//   - La photo est décodée en pleine résolution (allowDownscaling=false),
//     sinon expo-image la réduit à la taille de l'écran et le zoom est flou.
function ZoomablePage({
  uri,
  width,
  height,
  active,
  dragY,
  onZoomChange,
  onTap,
  onDismiss,
}: {
  uri: string;
  width: number;
  height: number;
  active: boolean;
  dragY: SharedValue<number>;
  onZoomChange: (zoomed: boolean) => void;
  onTap: () => void;
  onDismiss: () => void;
}) {
  const scale = useSharedValue(1);
  // Échelle visée, fin d'animation comprise : c'est elle qui fixe les bornes.
  const target = useSharedValue(1);
  // Échelle brute du pincement, avant la résistance aux extrêmes.
  const raw = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  // Taille réelle de la photo, connue au chargement.
  const imgW = useSharedValue(0);
  const imgH = useSharedValue(0);

  const pinching = useSharedValue(false);
  const lastFx = useSharedValue(0);
  const lastFy = useSharedValue(0);
  const lastPointers = useSharedValue(0);

  // 0 indécis, 1 déplacement dans la photo, 2 glisser pour fermer.
  const panMode = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const flinging = useSharedValue(false);
  const grabbed = useSharedValue(false);
  // Un pincement a eu lieu pendant ce Pan : c'est la fin du pincement qui
  // replace la photo, pas l'élan du Pan.
  const pinchedInPan = useSharedValue(false);

  // Une photo qu'on quitte se remet à plat, sans animation (elle est hors champ).
  useEffect(() => {
    if (active) return;
    cancelAnimation(scale);
    cancelAnimation(tx);
    cancelAnimation(ty);
    scale.set(1);
    target.set(1);
    raw.set(1);
    tx.set(0);
    ty.set(0);
  }, [active, scale, target, raw, tx, ty]);

  // Le parent bloque le défilement des photos tant qu'on pince ou qu'on est zoomé.
  useAnimatedReaction(
    () => pinching.value || target.value > ZOOMED,
    (z, prev) => {
      if (prev !== null && z !== prev) runOnJS(onZoomChange)(z);
    },
  );

  // Taille de la photo à l'échelle 1, posée en contain dans la page.
  const fitted = () => {
    'worklet';
    if (imgW.value <= 0 || imgH.value <= 0) return { w: width, h: height };
    const r = Math.min(width / imgW.value, height / imgH.value);
    return { w: imgW.value * r, h: imgH.value * r };
  };

  // Jusqu'où on peut se déplacer à l'échelle k sans voir de bande noire.
  const bounds = (k: number) => {
    'worklet';
    const f = fitted();
    return { x: Math.max(0, (f.w * k - width) / 2), y: Math.max(0, (f.h * k - height) / 2) };
  };

  // Échelle qui remplit l'écran (une photo paysage remplit la hauteur).
  const fillScale = () => {
    'worklet';
    const f = fitted();
    return Math.max(width / f.w, height / f.h);
  };

  const maxScale = () => {
    'worklet';
    return Math.max(MAX_SCALE, fillScale() * 2);
  };

  const clamp = (v: number, b: number) => {
    'worklet';
    return Math.min(Math.max(v, -b), b);
  };

  // Amène la loupe sur (k, x, y) en un seul mouvement, sans rebond.
  const animateTo = (k: number, x: number, y: number, duration = 220) => {
    'worklet';
    const cfg = { duration, easing: Easing.out(Easing.cubic) };
    flinging.set(false);
    target.set(k);
    raw.set(k);
    scale.set(withTiming(k, cfg));
    tx.set(withTiming(x, cfg));
    ty.set(withTiming(y, cfg));
  };

  const reset = () => {
    'worklet';
    animateTo(1, 0, 0);
  };

  // Remet la photo dans le cadre, à l'échelle visée.
  const settleBounds = () => {
    'worklet';
    const b = bounds(target.value);
    const nx = clamp(tx.value, b.x);
    const ny = clamp(ty.value, b.y);
    const cfg = { duration: 200, easing: Easing.out(Easing.cubic) };
    if (nx !== tx.value) tx.set(withTiming(nx, cfg));
    if (ny !== ty.value) ty.set(withTiming(ny, cfg));
  };

  // Au-delà du bord, le doigt n'entraîne plus la photo qu'au tiers.
  const rubber = (v: number, d: number, b: number) => {
    'worklet';
    const n = v + d;
    return Math.abs(n) <= b ? n : v + d * 0.33;
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      // Déjà en train de fermer d'un doigt : on ne mélange pas.
      if (panMode.value === 2) return;
      cancelAnimation(scale);
      cancelAnimation(tx);
      cancelAnimation(ty);
      flinging.set(false);
      pinching.set(true);
      pinchedInPan.set(true);
      raw.set(scale.value);
      lastFx.set(e.focalX - width / 2);
      lastFy.set(e.focalY - height / 2);
      lastPointers.set(e.numberOfPointers);
    })
    .onChange((e) => {
      if (!pinching.value) return;
      const fx = e.focalX - width / 2;
      const fy = e.focalY - height / 2;
      if (e.numberOfPointers < 2 || e.numberOfPointers !== lastPointers.value) {
        lastPointers.set(e.numberOfPointers);
        lastFx.set(fx);
        lastFy.set(fy);
        return;
      }
      raw.set(raw.value * e.scaleChange);
      const max = maxScale();
      const r = raw.value;
      const s =
        r < 1 ? Math.max(1 - (1 - r) * 0.4, 0.6) : r > max ? max * (1 + (r / max - 1) * 0.25) : r;
      // Le point qui était sous les doigts y reste, et suit leur glissement.
      const k = s / scale.value;
      tx.set(fx - (lastFx.value - tx.value) * k);
      ty.set(fy - (lastFy.value - ty.value) * k);
      scale.set(s);
      target.set(s);
      lastFx.set(fx);
      lastFy.set(fy);
    })
    .onFinalize(() => {
      if (!pinching.value) return;
      pinching.set(false);
      const s = scale.value;
      if (s <= 1.02) {
        reset();
        return;
      }
      // Revenir au zoom max en gardant le point sous les doigts, puis borner.
      const k = Math.min(s, maxScale());
      const ratio = k / s;
      const b = bounds(k);
      animateTo(
        k,
        clamp(lastFx.value - (lastFx.value - tx.value) * ratio, b.x),
        clamp(lastFy.value - (lastFy.value - ty.value) * ratio, b.y),
      );
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => {
      if (e.numberOfTouches !== 1) return;
      const t = e.allTouches[0];
      startX.set(t.absoluteX);
      startY.set(t.absoluteY);
      // Poser le doigt arrête l'élan.
      if (flinging.value) {
        cancelAnimation(tx);
        cancelAnimation(ty);
        flinging.set(false);
        grabbed.set(true);
      }
    })
    .onTouchesMove((e, manager) => {
      if (panMode.value !== 0) return;
      const t = e.allTouches[0];
      const dx = t.absoluteX - startX.value;
      const dy = t.absoluteY - startY.value;
      // Zoomé, ou deux doigts : déplacement dans la photo.
      if (target.value > ZOOMED || pinching.value || e.numberOfTouches > 1) {
        if (e.numberOfTouches > 1 || Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          panMode.set(1);
          manager.activate();
        }
        return;
      }
      // À plat, un doigt : horizontal pour la galerie, vertical pour fermer.
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy)) {
        manager.fail();
      } else if (Math.abs(dy) > 12) {
        panMode.set(2);
        manager.activate();
      }
    })
    .onChange((e) => {
      if (panMode.value === 2) {
        dragY.set(dragY.value + e.changeY);
        return;
      }
      if (panMode.value !== 1 || pinching.value) return;
      if (e.numberOfPointers === 1) pinchedInPan.set(false);
      const b = bounds(target.value);
      tx.set(rubber(tx.value, e.changeX, b.x));
      ty.set(rubber(ty.value, e.changeY, b.y));
    })
    .onEnd((e, success) => {
      if (panMode.value === 2) {
        const out = Math.abs(dragY.value) > DISMISS_DISTANCE || Math.abs(e.velocityY) > DISMISS_VELOCITY;
        if (success && out) {
          dragY.set(
            withTiming(Math.sign(dragY.value || 1) * height, { duration: 200 }, () => {
              runOnJS(onDismiss)();
            }),
          );
        } else {
          dragY.set(withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) }));
        }
        return;
      }
      if (panMode.value !== 1 || pinching.value || pinchedInPan.value) return;
      if (!success) {
        settleBounds();
        return;
      }
      // Élan, puis arrêt au bord ; si on a tiré au-delà, retour élastique.
      const b = bounds(target.value);
      flinging.set(true);
      tx.set(
        withDecay({
          velocity: e.velocityX,
          deceleration: 0.997,
          clamp: [-b.x, b.x],
          rubberBandEffect: true,
          rubberBandFactor: 0.9,
        }),
      );
      ty.set(
        withDecay({
          velocity: e.velocityY,
          deceleration: 0.997,
          clamp: [-b.y, b.y],
          rubberBandEffect: true,
          rubberBandFactor: 0.9,
        }),
      );
    })
    .onFinalize(() => {
      // Doigt posé pour stopper l'élan puis levé sans bouger : on reborne.
      if (grabbed.value && panMode.value === 0) settleBounds();
      grabbed.set(false);
      panMode.set(0);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .maxDistance(24)
    .onEnd((e, success) => {
      if (!success) return;
      if (target.value > ZOOMED) {
        reset();
        return;
      }
      // Remplir l'écran (au moins x2), centré là où le doigt a touché.
      const k = Math.min(Math.max(fillScale(), DOUBLE_TAP_SCALE), maxScale());
      const b = bounds(k);
      const fx = e.x - width / 2;
      const fy = e.y - height / 2;
      animateTo(k, clamp(-fx * (k - 1), b.x), clamp(-fy * (k - 1), b.y), 260);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDistance(10)
    .onEnd((_e, success) => {
      if (success) runOnJS(onTap)();
    });

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value + (active ? dragY.value : 0) },
      { scale: scale.value * (active ? interpolate(Math.abs(dragY.value), [0, 400], [1, 0.82], 'clamp') : 1) },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width, height }} collapsable={false}>
        <Animated.View style={[styles.page, style]}>
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
            transition={160}
            allowDownscaling={false}
            onLoad={(e) => {
              imgW.set(e.source.width);
              imgH.set(e.source.height);
            }}
          />
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
