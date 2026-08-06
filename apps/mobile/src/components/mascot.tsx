import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

// Mascotte Dowe : une licorne kawaii dans la palette de l'app (crinière rose,
// mèches rose et violette, corne dorée). Chaque écran a sa pose : elle tient
// un téléphone pour les DMs, un cœur pour les likes, une loupe pour les vues
// et une étoile pour les favoris. Dessinée en vectoriel pour rester nette à
// toutes les tailles.

export type MascotVariant = 'dm' | 'likes' | 'views' | 'favorites';

const DARK = '#831843';
const LIME = '#f9a8d4';
const OUTLINE = '#f3d0e2';

// Les deux sabots qui tiennent l'objet, dessinés par-dessus lui.
function Hooves({ lx, rx, y }: { lx: number; rx: number; y: number }) {
  return (
    <>
      <Ellipse cx={lx} cy={y} rx={9} ry={8} fill="#ffffff" stroke={OUTLINE} strokeWidth={3} />
      <Ellipse cx={rx} cy={y} rx={9} ry={8} fill="#ffffff" stroke={OUTLINE} strokeWidth={3} />
    </>
  );
}

// L'objet tenu, propre à chaque page.
function HeldObject({ variant }: { variant: MascotVariant }) {
  if (variant === 'dm') {
    return (
      <>
        {/* téléphone incliné, écran lime avec lignes de conversation */}
        <G transform="rotate(-4 100 156)">
          <Rect x={80} y={138} width={40} height={34} rx={7} fill={DARK} />
          <Rect x={84} y={142} width={32} height={26} rx={4} fill={LIME} />
          <Rect x={88} y={147} width={18} height={3.4} rx={1.7} fill={DARK} opacity={0.8} />
          <Rect x={88} y={153} width={24} height={3.4} rx={1.7} fill={DARK} opacity={0.55} />
          <Rect x={88} y={159} width={14} height={3.4} rx={1.7} fill={DARK} opacity={0.35} />
        </G>
        <Hooves lx={76} rx={124} y={158} />
        {/* bulle « en train d'écrire » qui s'échappe vers le haut */}
        <Path
          d="M124 120 h26 a5 5 0 0 1 5 5 v12 a5 5 0 0 1 -5 5 h-11 l-8 8 v-8 h-7 a5 5 0 0 1 -5 -5 v-12 a5 5 0 0 1 5 -5 Z"
          fill={LIME}
          stroke="#ffffff"
          strokeWidth={3}
          transform="translate(14 -38)"
        />
        <Circle cx={146} cy={93} r={2.1} fill={DARK} />
        <Circle cx={153} cy={93} r={2.1} fill={DARK} />
        <Circle cx={160} cy={93} r={2.1} fill={DARK} />
      </>
    );
  }
  if (variant === 'likes') {
    return (
      <>
        {/* grand cœur serré contre elle */}
        <Path
          d="M100 172 C84 160 76 151 76 141.5 C76 133.5 82.5 128 89.5 128 C94 128 98.5 130.5 100 134 C101.5 130.5 106 128 110.5 128 C117.5 128 124 133.5 124 141.5 C124 151 116 160 100 172 Z"
          fill="#ef5777"
          stroke="#ffffff"
          strokeWidth={3}
        />
        <Circle cx={90} cy={139} r={4} fill="#ffffff" opacity={0.55} />
        <Hooves lx={78} rx={122} y={154} />
      </>
    );
  }
  if (variant === 'views') {
    return (
      <>
        {/* loupe inclinée, verre bleuté */}
        <G transform="rotate(-14 118 150)">
          <Circle
            cx={118}
            cy={146}
            r={17}
            fill="#cfe9ff"
            fillOpacity={0.85}
            stroke={DARK}
            strokeWidth={5}
          />
          <Path
            d="M112 140 Q117 135 123 139"
            stroke="#ffffff"
            strokeWidth={3.4}
            fill="none"
            strokeLinecap="round"
          />
          <Rect
            x={127}
            y={158}
            width={9}
            height={22}
            rx={4.5}
            fill={DARK}
            transform="rotate(-45 131.5 169)"
          />
        </G>
        <Hooves lx={82} rx={118} y={156} />
      </>
    );
  }
  return (
    <>
      {/* étoile dorée présentée fièrement */}
      <Path
        d="M100 124 L107.4 139.6 L124.5 141.8 L112 153.7 L115.2 170.6 L100 162.4 L84.8 170.6 L88 153.7 L75.5 141.8 L92.6 139.6 Z"
        fill="#F4B400"
        stroke="#ffffff"
        strokeWidth={3}
      />
      <Circle cx={93} cy={145} r={3.4} fill="#ffffff" opacity={0.6} />
      <Hooves lx={78} rx={122} y={156} />
    </>
  );
}

export function UnicornMascot({
  variant,
  size = 190,
}: {
  variant: MascotVariant;
  size?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      {/* halo de fond */}
      <Circle cx={100} cy={104} r={88} fill="#fce7f3" />
      {/* étincelles */}
      <Path d="M34 60 l3.2 7.8 7.8 3.2 -7.8 3.2 -3.2 7.8 -3.2 -7.8 -7.8 -3.2 7.8 -3.2 Z" fill="#F4B400" />
      <Path d="M170 84 l2.6 6.2 6.2 2.6 -6.2 2.6 -2.6 6.2 -2.6 -6.2 -6.2 -2.6 6.2 -2.6 Z" fill="#b998e8" />
      <Path d="M158 40 l2 4.8 4.8 2 -4.8 2 -2 4.8 -2 -4.8 -4.8 -2 4.8 -2 Z" fill={LIME} />
      {/* corps */}
      <Path
        d="M38 130 Q38 74 100 74 Q162 74 162 130 Q162 168 100 168 Q38 168 38 130 Z"
        fill="#ffffff"
        stroke={OUTLINE}
        strokeWidth={3}
      />
      {/* oreilles */}
      <Path d="M56 82 Q52 58 70 52 Q80 66 74 80 Z" fill="#ffffff" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M144 82 Q148 58 130 52 Q120 66 126 80 Z" fill="#ffffff" stroke={OUTLINE} strokeWidth={3} />
      <Path d="M62 76 Q60 64 70 60 Q75 68 71 76 Z" fill="#f7b8cd" />
      <Path d="M138 76 Q140 64 130 60 Q125 68 129 76 Z" fill="#f7b8cd" />
      {/* corne dorée */}
      <Path d="M100 16 L112 56 Q100 62 88 56 Z" fill="#F4B400" />
      <Path d="M92.5 42 L108.8 45.5 L107 51 L91 46.5 Z" fill="#d99e00" />
      <Path d="M95.5 30 L105.5 33 L104.4 37.8 L94.3 34.5 Z" fill="#d99e00" />
      {/* crinière : trois vagues lime / rose / violette */}
      <Path d="M58 92 Q48 68 76 58 Q78 74 92 70 Q100 68 98 78 Q94 92 76 94 Q64 96 58 92 Z" fill={LIME} />
      <Path d="M84 62 Q98 50 114 60 Q122 66 114 74 Q104 80 98 78 Q100 68 92 70 Q86 68 84 62 Z" fill="#f7a8c4" />
      <Path d="M112 84 Q124 60 142 76 Q152 86 140 96 Q124 102 112 84 Z" fill="#b998e8" />
      {/* yeux */}
      <Ellipse cx={76} cy={113} rx={10.5} ry={12.5} fill="#20221c" />
      <Ellipse cx={124} cy={113} rx={10.5} ry={12.5} fill="#20221c" />
      <Circle cx={79.5} cy={108} r={3.6} fill="#ffffff" />
      <Circle cx={127.5} cy={108} r={3.6} fill="#ffffff" />
      <Circle cx={73} cy={117} r={1.8} fill="#ffffff" opacity={0.7} />
      <Circle cx={121} cy={117} r={1.8} fill="#ffffff" opacity={0.7} />
      {/* joues */}
      <Ellipse cx={57} cy={129} rx={9} ry={6} fill="#f9c1d2" />
      <Ellipse cx={143} cy={129} rx={9} ry={6} fill="#f9c1d2" />
      {/* bouche : sourire ouvert compact */}
      <Path d="M90 131 Q100 129 110 131 Q108 143 100 143 Q92 143 90 131 Z" fill="#5c3a35" />
      <Path d="M94 139 Q100 136 106 139 Q103 143 100 143 Q97 143 94 139 Z" fill="#f78fb3" />
      {/* l'objet tenu, différent par page */}
      <HeldObject variant={variant} />
    </Svg>
  );
}
