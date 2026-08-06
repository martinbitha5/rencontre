import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrcFlag, PackIcon } from '../components/brand';
import { Reveal } from '../components/motion';
import { Button, ScreenHeader, SelectableCard } from '../components/ui';
import { COIN_NAME, COIN_NAME_PLURAL, COIN_PACKS, formatCoins } from '../config/economy';
import { colors, spacing } from '../theme';

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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Acheter des pièces" right={<DrcFlag width={28} />} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>
          Achète des {COIN_NAME_PLURAL} et débloque toutes les options pour prendre le contrôle
          total de ton expérience.
        </Text>

        <View style={styles.grid}>
          {COIN_PACKS.map((pack, i) => (
            <Reveal key={pack.id} index={i} style={styles.pack}>
              <SelectableCard selected={selected === i} onPress={() => setSelected(i)}>
                <View style={styles.packBody}>
                  <PackIcon id={pack.icon} size={26} />
                  <Text style={styles.packName}>
                    {pack.name}
                    {pack.validityDays ? '*' : ''}
                  </Text>
                  {/* Toujours rendu, même vide : les prix restent alignés
                      d'une carte à l'autre. */}
                  <Text style={styles.packTag}>{pack.tag ?? ' '}</Text>
                  <Text style={styles.packCoins}>
                    {formatCoins(pack.coins)} {COIN_NAME_PLURAL}
                  </Text>
                  <Text style={styles.packPrice}>{pack.priceCdfLabel}</Text>
                  <Text style={styles.packPriceUsd}>ou {pack.price}</Text>
                </View>
              </SelectableCard>
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
          utilisable uniquement dans l'application.
        </Text>

        <Button title="Continuer" onPress={buy} />
        <Text style={styles.soon}>
          Paiement local par Mobile Money, ou international via l'App Store et Google Play.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: 0, gap: spacing.sm },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
    marginBottom: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pack: { width: '48%', flexGrow: 1 },
  packBody: { alignItems: 'center', gap: 3, paddingVertical: spacing.xs },
  packName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
  },
  packTag: { fontSize: 11, fontWeight: '800', color: colors.primary },
  packCoins: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  packPrice: { fontSize: 15, fontWeight: '800', color: colors.primary },
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
  soon: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
