import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrcFlag, PackIcon } from '../components/brand';
import { Reveal } from '../components/motion';
import { COIN_NAME, COIN_NAME_PLURAL, COIN_PACKS, formatCoins } from '../config/economy';
import { haptic } from '../lib/haptics';
import { colors, radius, shadows, spacing } from '../theme';

// Boutique de pièces : grille de packs sélectionnables puis bouton Continuer.
// L'en-tête porte le drapeau de la RDC — le paiement est local, pas le solde.
// Le crédit du solde se fait côté serveur via multipay-return, jamais par le
// client.
//
// Les pièces n'achètent que des actions dans l'application. L'entrée en soirée
// ne passe plus par ici : elle se paie en francs au moment du scan.
export default function Recharge() {
  const router = useRouter();
  const [selected, setSelected] = useState(1);

  const buy = () => {
    const pack = COIN_PACKS[selected] ?? COIN_PACKS[0];
    router.push({ pathname: '/payment', params: { kind: 'coins', id: pack.id } });
  };

  return (
    <View style={styles.screen}>
      {/* En-tête plein-bleed : le dégradé magenta passe derrière la barre de
          statut, la SafeArea vit à l'intérieur. */}
      <LinearGradient
        colors={[colors.headerGradFrom, colors.headerGradTo]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.headerGrad}
      >
        <SafeAreaView edges={['top']}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => router.back()}
              hitSlop={12}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Ionicons name="chevron-back" size={26} color="#ffffff" />
            </Pressable>
            <Text style={styles.headerTitle}>Obtenir des pièces</Text>
            <View style={styles.headerRight}>
              <DrcFlag width={28} />
            </View>
          </View>
          <Text style={styles.headerSub}>
            Achète des {COIN_NAME_PLURAL} et débloque toutes les options pour prendre le contrôle
            total de ton expérience.
          </Text>
        </SafeAreaView>
      </LinearGradient>

      {/* Feuille claire aux coins très arrondis, posée sur le bas du dégradé. */}
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.grid}>
            {COIN_PACKS.map((pack, i) => (
              <Reveal key={pack.id} index={i} style={styles.pack}>
                {/* Carte blanche sélectionnable : bordure accent et légère
                    ombre quand elle est choisie. */}
                <Pressable
                  onPress={() => {
                    haptic.select();
                    setSelected(i);
                  }}
                  style={({ pressed }) => [
                    styles.packCard,
                    selected === i && styles.packCardSelected,
                    pressed && { opacity: 0.92 },
                  ]}
                  accessibilityRole="button"
                >
                  <View style={styles.packBody}>
                    <PackIcon id={pack.icon} size={26} />
                    <Text style={styles.packName}>
                      {pack.name}
                      {pack.validityDays ? '*' : ''}
                    </Text>
                    {/* Emplacement toujours rendu, même vide : les prix
                        restent alignés d'une carte à l'autre. */}
                    <View style={styles.packTagSlot}>
                      {pack.tag ? (
                        <View style={styles.packTagPill}>
                          <Text style={styles.packTagText}>{pack.tag}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.packCoins}>
                      {formatCoins(pack.coins)} {COIN_NAME_PLURAL}
                    </Text>
                    <Text style={styles.packPrice}>{pack.priceCdfLabel}</Text>
                    <Text style={styles.packPriceUsd}>ou {pack.price}</Text>
                  </View>
                </Pressable>
              </Reveal>
            ))}
          </View>

          {COIN_PACKS.filter((p) => p.validityDays).map((p) => (
            <Text key={p.id} style={styles.footnote}>
              (*) Les {COIN_NAME_PLURAL} du pack {p.name} sont valables {p.validityDays} jours et
              sont dépensées en premier.
            </Text>
          ))}

          <Text style={styles.explain}>
            La {COIN_NAME} est la monnaie interne de Dowe : un simple solde rechargeable,
            utilisable uniquement dans {"l'application"}.
          </Text>

          {/* Bouton principal : pilule au dégradé fuchsia. */}
          <Pressable
            onPress={() => {
              haptic.impact();
              buy();
            }}
            style={({ pressed }) => [styles.buyBtn, pressed && { transform: [{ scale: 0.98 }] }]}
            accessibilityRole="button"
            accessibilityLabel="Continuer"
          >
            <LinearGradient
              colors={[colors.accent, colors.accentPressed]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.buyGrad}
            >
              <Text style={styles.buyText}>Continuer</Text>
            </LinearGradient>
          </Pressable>
          <Text style={styles.soon}>
            Paiement local par Mobile Money, ou international via {"l'App Store"} et Google Play.
          </Text>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.headerGradFrom },
  // Le dégradé descend sous la feuille : ses derniers points sont recouverts
  // par les coins arrondis.
  headerGrad: { paddingBottom: spacing.lg + 28 },
  headerRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    // Marge pour que le titre ne passe ni sous le chevron ni sous le drapeau.
    paddingHorizontal: 44,
  },
  backBtn: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.sm,
    bottom: 0,
    justifyContent: 'center',
  },
  headerRight: {
    position: 'absolute',
    right: spacing.md,
    top: spacing.sm,
    bottom: 0,
    justifyContent: 'center',
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 19,
    textAlign: 'center',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  // Feuille de contenu : coins hauts très arrondis, elle recouvre le dégradé.
  sheet: {
    flex: 1,
    marginTop: -28,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: spacing.sm + 2,
  },
  content: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.sm },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pack: { width: '48%', flexGrow: 1 },
  packCard: {
    backgroundColor: colors.cardSolid,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.md,
  },
  packCardSelected: {
    borderColor: colors.accent,
    ...shadows.card,
  },
  packBody: { alignItems: 'center', gap: 3, paddingVertical: spacing.xs },
  packName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
  },
  // Hauteur fixe : la pilule apparaît sans décaler les prix des autres cartes.
  packTagSlot: { height: 20, justifyContent: 'center' },
  packTagPill: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  packTagText: { fontSize: 11, fontWeight: '800', color: colors.textOnAccent },
  packCoins: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  packPrice: { fontSize: 15, fontWeight: '800', color: colors.accent },
  packPriceUsd: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  footnote: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
    marginTop: spacing.sm,
  },
  explain: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginVertical: spacing.sm,
  },
  buyBtn: { borderRadius: radius.full, ...shadows.card },
  buyGrad: {
    height: 54,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyText: { fontSize: 16, fontWeight: '700', color: colors.textOnAccent },
  soon: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
