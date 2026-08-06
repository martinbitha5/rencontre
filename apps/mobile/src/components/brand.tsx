import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { radius } from '../theme';

// Éléments d'identité visuelle. Le drapeau et les icônes de packs sont
// dessinés dans l'app (pas de perte de netteté selon la densité d'écran) ;
// les logos des opérateurs Mobile Money sont eux de vrais fichiers, une marque
// déposée ne se redessine pas.

// ---------------------------------------------------------------------------
// Drapeau de la RDC — bleu ciel, étoile jaune au canton, bande rouge en
// diagonale bordée de jaune. Marque que le paiement est local.
// ---------------------------------------------------------------------------
const DRC_BLUE = '#007fff';
const DRC_YELLOW = '#f7d618';
const DRC_RED = '#ce1021';

export function DrcFlag({ width = 30 }: { width?: number }) {
  const height = width * 0.667;
  // La diagonale du drapeau : atan(2/3) ≈ 34°, sens bas-gauche vers haut-droite.
  const band = {
    position: 'absolute' as const,
    left: -width / 2,
    width: width * 2,
    transform: [{ rotate: '-34deg' }],
  };
  const yellowH = height * 0.42;
  const redH = height * 0.26;
  return (
    <View style={[styles.flag, { width, height, borderRadius: Math.max(2, width * 0.08) }]}>
      <View
        style={[
          band,
          { top: (height - yellowH) / 2, height: yellowH, backgroundColor: DRC_YELLOW },
        ]}
      />
      <View
        style={[band, { top: (height - redH) / 2, height: redH, backgroundColor: DRC_RED }]}
      />
      <Ionicons
        name="star"
        size={width * 0.3}
        color={DRC_YELLOW}
        style={{ position: 'absolute', top: height * 0.06, left: width * 0.05 }}
      />
    </View>
  );
}

// Drapeau + mention du pays, pour les en-têtes de paiement.
export function LocalBadge({ width = 26 }: { width?: number }) {
  return (
    <View style={styles.localBadge}>
      <DrcFlag width={width} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Opérateurs Mobile Money — logos officiels des marques (assets/images/
// operators/, rendus PNG transparents des SVG de Wikimedia Commons). Ils
// servent à identifier le moyen de paiement choisi, usage nominatif habituel
// d'un tunnel de paiement ; les marques restent la propriété d'Airtel, Orange
// et Vodacom. Ne pas les déformer ni les recolorer : chaque charte l'interdit,
// d'où le contentFit « contain » et une tuile neutre en dessous.
// ---------------------------------------------------------------------------
const OPERATOR_BRANDS = {
  // Rouge sur fond transparent : il lui faut une tuile blanche pour ressortir.
  airtel: {
    source: require('../../assets/images/operators/airtel.png'),
    background: '#ffffff',
    bordered: true,
    inset: 0.14,
  },
  // Le logo EST le carré orange : plein cadre, sans marge ni fond ajouté.
  orange: {
    source: require('../../assets/images/operators/orange.png'),
    background: 'transparent',
    bordered: false,
    inset: 0,
  },
  // M-Pesa version VODACOM (téléphone rouge, feuille verte, « m-pesa ») :
  // c'est la marque utilisée en RDC, pas le logotype vert de Safaricom Kenya
  // que renvoie une recherche « M-Pesa ». Fond blanc d'origine, qui se fond
  // dans la tuile ; presque carré (1,18:1), donc marge comparable à Airtel.
  vodacom: {
    source: require('../../assets/images/operators/mpesa.png'),
    background: '#ffffff',
    bordered: true,
    inset: 0.12,
  },
} as const;

export type OperatorBrandId = keyof typeof OPERATOR_BRANDS;

export function OperatorLogo({ id, size = 40 }: { id: OperatorBrandId; size?: number }) {
  const brand = OPERATOR_BRANDS[id] ?? OPERATOR_BRANDS.airtel;
  return (
    <View
      style={[
        styles.operator,
        {
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: brand.background,
          padding: Math.round(size * brand.inset),
        },
        brand.bordered && styles.operatorBordered,
      ]}
    >
      <Image source={brand.source} style={styles.operatorImage} contentFit="contain" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Packs de pièces — une icône et une couleur par palier, du plus modeste au
// plus généreux. La clé vit dans config/economy.ts (CoinPack.icon).
// ---------------------------------------------------------------------------
const PACK_ICONS = {
  compass: { glyph: 'compass', color: '#c87941' },
  bolt: { glyph: 'bolt', color: '#8f9aa8' },
  rocket: { glyph: 'rocket', color: '#e0a93b' },
  crown: { glyph: 'crown', color: '#3f8fd4' },
  incognito: { glyph: 'user-secret', color: '#5b4b8a' },
  event: { glyph: 'ticket-alt', color: '#2f8f7a' },
} as const;

export type PackIconId = keyof typeof PACK_ICONS;

export function PackIcon({ id, size = 26 }: { id: PackIconId; size?: number }) {
  const icon = PACK_ICONS[id] ?? PACK_ICONS.compass;
  const box = size * 1.85;
  return (
    <View
      style={[
        styles.packIcon,
        { width: box, height: box, borderRadius: box / 2, backgroundColor: `${icon.color}1f` },
      ]}
    >
      <FontAwesome5 name={icon.glyph} size={size} color={icon.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  flag: { overflow: 'hidden', backgroundColor: DRC_BLUE },
  localBadge: { alignItems: 'center', justifyContent: 'center' },
  operator: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  // Liseré discret : sans lui, une tuile blanche disparaît sur une carte blanche.
  operatorBordered: { borderWidth: 1, borderColor: 'rgba(0,0,0,.08)' },
  operatorImage: { width: '100%', height: '100%' },
  packIcon: { alignItems: 'center', justifyContent: 'center', borderRadius: radius.full },
});
