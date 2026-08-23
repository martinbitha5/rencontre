import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DrcFlag, PackIcon } from '@/components/brand';
import { HeaderBackButton, ScreenHeader } from '@/components/ui';
import { Reveal } from '@/components/motion';
import { COIN_NAME, COIN_NAME_PLURAL, COIN_PACKS, formatCoins } from '@/config/economy';
import { haptic } from '@/utils/haptics';
import { colors } from '@/theme';
import { styles } from './Recharge.styles';

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
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Même en-tête que le portefeuille et les transactions : titre centré,
          pastille de retour à gauche, drapeau à droite (le paiement est
          local). Le sous-titre suit, sous la barre. */}
      <ScreenHeader
        title="Obtenir des pièces"
        left={<HeaderBackButton />}
        right={<DrcFlag width={28} />}
      />
      <Text style={styles.headerSub}>
        Achète des {COIN_NAME_PLURAL} et débloque toutes les options pour prendre le contrôle
        total de ton expérience.
      </Text>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grid}>
          {COIN_PACKS.map((pack, i) => (
            <Reveal key={pack.id} index={i} style={styles.pack}>
              {/* Carte crème sélectionnable : bordure corail et légère ombre
                  quand elle est choisie. */}
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

        {/* Bouton principal : plein corail, coin signature. */}
        <Pressable
          onPress={() => {
            haptic.impact();
            buy();
          }}
          style={({ pressed }) => [
            styles.buyBtn,
            pressed && { backgroundColor: colors.accentPressed, transform: [{ scale: 0.98 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Continuer"
        >
          <Text style={styles.buyText}>Continuer</Text>
        </Pressable>
        <Text style={styles.soon}>
          Paiement local par Mobile Money, ou international via {"l'App Store"} et Google Play.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
