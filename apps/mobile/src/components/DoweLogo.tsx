import React, { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

// Le logo Dowe : l'empreinte digitale. C'est le glyphe du favicon du site et
// de l'icône de l'app (Lucide « fingerprint », ISC). Il est défini ici en
// tracés vectoriels centraux (stroke), ce qui permet à la fois un rendu net à
// toutes les tailles et l'animation de dessin progressif du démarrage.

const AnimatedPath = Animated.createAnimatedComponent(Path);

export const LOGO_VIEWBOX = '0 0 24 24';

// Chaque tracé avec une longueur légèrement surestimée : la longueur sert de
// motif de pointillé pour l'animation de dessin (strokeDashoffset), et une
// surestimation cache entièrement le trait au départ sans jamais le tronquer
// à l'arrivée. Ordre = ordre de dessin : les deux arches d'abord, puis les
// crêtes intérieures, les finitions ensuite.
export const LOGO_PATHS = [
  { d: 'M2 12a10 10 0 0 1 18-6', len: 26 }, // grande arche
  { d: 'M9 6.8a6 6 0 0 1 9 5.2v2', len: 15.5 }, // arche interne
  { d: 'M21.8 16c.2-2 .131-5.354 0-6', len: 6.8 }, // bord droit
  { d: 'M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2', len: 10.6 }, // crête gauche
  { d: 'M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4', len: 8 }, // crête centrale
  { d: 'M14 13.12c0 2.38 0 6.38-1 8.88', len: 9.9 }, // crête longue
  { d: 'M8.65 22c.21-.66.45-1.32.57-2', len: 2.5 }, // finition basse gauche
  { d: 'M17.29 21.02c.12-.6.43-2.3.5-3.02', len: 3.5 }, // finition basse droite
] as const;

// Le point isolé à gauche : dessiné en dernier, il « signe » l'empreinte.
export const LOGO_DOT = 'M2 16h.01';

// Chronologie du dessin (ms). Exportée pour que les écrans qui enchaînent
// autre chose derrière (wordmark, sortie) se calent dessus.
const STAGGER = 55; // départ décalé de chaque tracé
const DOT_AT = 680; // apparition du point
const FLASH_AT = 780; // éclat de lumière quand le logo est complet
export const LOGO_FORMED_MS = 1050; // logo formé, éclat retombé

const DRAW_EASE = Easing.bezier(0.22, 1, 0.36, 1);

function drawDuration(len: number) {
  return 340 + len * 6;
}

// ---------------------------------------------------------------------------
// Logo statique, pour les badges et écrans où il n'y a rien à animer.
// ---------------------------------------------------------------------------
export function DoweMark({
  size = 48,
  color = '#ffffff',
  strokeWidth = 2,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox={LOGO_VIEWBOX}>
      {LOGO_PATHS.map((p) => (
        <Path
          key={p.d}
          d={p.d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ))}
      <Path
        d={LOGO_DOT}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Logo qui se dessine : chaque ligne d'empreinte se trace en fluide et en
// décalé, le point apparaît, puis un éclat blanc traverse le glyphe complet.
// Tout tourne sur le thread UI (Reanimated), aucun re-render par frame.
// ---------------------------------------------------------------------------

function DrawnPath({
  d,
  len,
  index,
  color,
  strokeWidth,
  instant,
}: {
  d: string;
  len: number;
  index: number;
  color: string;
  strokeWidth: number;
  instant: boolean;
}) {
  const dash = useSharedValue(instant ? 0 : len);

  useEffect(() => {
    if (instant) return;
    dash.value = withDelay(
      index * STAGGER,
      withTiming(0, { duration: drawDuration(len), easing: DRAW_EASE }),
    );
  }, [dash, index, len, instant]);

  const props = useAnimatedProps(() => ({ strokeDashoffset: dash.value }));

  return (
    <AnimatedPath
      d={d}
      animatedProps={props}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${len} ${len}`}
      fill="none"
    />
  );
}

export function FingerprintDraw({
  size = 120,
  color = '#ffffff',
  glowColor,
  strokeWidth = 2,
  pulse = false,
}: {
  size?: number;
  color?: string;
  // Couleur de la lueur sous les traits ; par défaut celle des traits.
  glowColor?: string;
  strokeWidth?: number;
  // Après formation, respiration douce de la lueur (états d'attente : tant
  // que le chargement derrière n'est pas fini, le logo reste vivant).
  pulse?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const glow = glowColor ?? color;

  const dotOpacity = useSharedValue(reduceMotion ? 1 : 0);
  const flashOpacity = useSharedValue(0);
  const glowOpacity = useSharedValue(reduceMotion ? 0.25 : 0);
  const tilt = useSharedValue(reduceMotion ? 0 : -14);
  const zoom = useSharedValue(reduceMotion ? 1 : 0.93);

  useEffect(() => {
    if (reduceMotion) {
      if (pulse) {
        glowOpacity.value = withRepeat(
          withSequence(
            withTiming(0.45, { duration: 900, easing: Easing.inOut(Easing.quad) }),
            withTiming(0.2, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
        );
      }
      return;
    }
    tilt.value = withTiming(0, { duration: 950, easing: Easing.out(Easing.cubic) });
    zoom.value = withTiming(1, { duration: 950, easing: Easing.out(Easing.cubic) });
    glowOpacity.value = withTiming(0.25, { duration: 700, easing: Easing.out(Easing.quad) });
    dotOpacity.value = withDelay(DOT_AT, withTiming(1, { duration: 140 }));
    // L'éclat : le glyphe entier s'illumine brièvement, comme un capteur qui
    // reconnaît l'empreinte.
    flashOpacity.value = withDelay(
      FLASH_AT,
      withSequence(
        withTiming(0.9, { duration: 110, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }),
      ),
    );
    if (pulse) {
      glowOpacity.value = withDelay(
        LOGO_FORMED_MS,
        withRepeat(
          withSequence(
            withTiming(0.45, { duration: 900, easing: Easing.inOut(Easing.quad) }),
            withTiming(0.2, { duration: 900, easing: Easing.inOut(Easing.quad) }),
          ),
          -1,
        ),
      );
    }
  }, [reduceMotion, pulse, tilt, zoom, glowOpacity, dotOpacity, flashOpacity]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${tilt.value}deg` }, { scale: zoom.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));
  const dotProps = useAnimatedProps(() => ({ strokeOpacity: dotOpacity.value }));

  return (
    <Animated.View style={[{ width: size, height: size }, containerStyle]}>
      {/* Lueur : le même glyphe, plus épais et estompé, sous les traits nets. */}
      <Animated.View style={[{ position: 'absolute' }, glowStyle]}>
        <Svg width={size} height={size} viewBox={LOGO_VIEWBOX}>
          {LOGO_PATHS.map((p) => (
            <Path
              key={p.d}
              d={p.d}
              stroke={glow}
              strokeWidth={strokeWidth + 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          <Path d={LOGO_DOT} stroke={glow} strokeWidth={strokeWidth + 2} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} viewBox={LOGO_VIEWBOX}>
        {LOGO_PATHS.map((p, i) => (
          <DrawnPath
            key={p.d}
            d={p.d}
            len={p.len}
            index={i}
            color={color}
            strokeWidth={strokeWidth}
            instant={reduceMotion}
          />
        ))}
        <AnimatedPath
          d={LOGO_DOT}
          animatedProps={dotProps}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
      {/* Éclat de reconnaissance : version blanche du glyphe, par-dessus. */}
      <Animated.View style={[StyleSheetAbsolute, flashStyle]} pointerEvents="none">
        <Svg width={size} height={size} viewBox={LOGO_VIEWBOX}>
          {LOGO_PATHS.map((p) => (
            <Path
              key={p.d}
              d={p.d}
              stroke="#ffffff"
              strokeWidth={strokeWidth + 0.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          <Path d={LOGO_DOT} stroke="#ffffff" strokeWidth={strokeWidth + 0.6} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

const StyleSheetAbsolute = { position: 'absolute' as const, top: 0, left: 0 };
