import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { UnicornMascot } from '@/components/mascot';
import { GlassSurface, PressableScale, Reveal } from '@/components/motion';
import { Button } from '@/components/ui';
import { INCOGNITO_PLANS, planSavingPercent } from '@/config/economy';
import { INCOGNITO_PERKS as PERKS } from '@/config/incognito';
import { colors, spacing } from '@/theme';
import { styles } from './Incognito.styles';

// Ce que l'abonnement débloque vit dans config/incognito.ts : la même liste
// nourrit la feuille d'introduction du profil, une promesse ne peut pas
// diverger d'un écran à l'autre.

export default function Incognito() {
  const router = useRouter();
  const storeName = Platform.OS === 'ios' ? 'App Store' : 'Google Play';
  // La barre du bas est en verre pleine largeur : elle file jusqu'au bord de
  // l'écran, et le bouton remonte au-dessus de la barre de gestes.
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState(1);

  const subscribe = () => {
    const plan = INCOGNITO_PLANS[selected] ?? INCOGNITO_PLANS[0];
    router.push({ pathname: '/payment', params: { kind: 'incognito', id: plan.id } });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroRow}>
          {/* La mascotte de l'app plutôt qu'un pictogramme : l'écran vend un
              abonnement, il mérite un accueil qui a de la personnalité. */}
          <View style={styles.heroIcon}>
            <UnicornMascot variant="views" size={96} />
          </View>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        <Text style={styles.title}>Passe en mode Invisible</Text>
        <Text style={styles.subtitle}>
          Disparais du fil public tout en gardant le contrôle.
        </Text>

        <LinearGradient
          colors={[colors.washFrom, colors.washTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.perksCard}
        >
          <Text style={styles.perksTitle}>Tout ce que tu débloques avec le mode Invisible</Text>
          {PERKS.map((perk, i) => (
            <Reveal key={perk.title} index={i} style={styles.perkRow}>
              <Ionicons name={perk.icon} size={22} color={colors.primary} />
              <View style={styles.perkBody}>
                <Text style={styles.perkTitle}>{perk.title}</Text>
                <Text style={styles.perkText}>{perk.text}</Text>
              </View>
            </Reveal>
          ))}
        </LinearGradient>

        <Text style={styles.plansTitle}>Nos forfaits</Text>
        <View style={styles.plansRow}>
          {INCOGNITO_PLANS.map((plan, i) => {
            const saving = planSavingPercent(plan);
            const active = selected === i;
            return (
              <PressableScale
                key={plan.id}
                onPress={() => setSelected(i)}
                containerStyle={styles.planOuter}
                style={[styles.plan, active && styles.planActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Forfait ${plan.months} mois, ${plan.priceCdfLabel}`}
              >
                <View style={[styles.planBadge, saving <= 0 && styles.planBadgeEmpty]}>
                  <Text style={styles.planBadgeText}>
                    {saving > 0 ? `Économise ${saving} %` : ' '}
                  </Text>
                </View>
                <View style={styles.planBody}>
                  <Text style={styles.planMonths}>
                    {plan.months} <Text style={styles.planMonthsUnit}>Mois</Text>
                  </Text>
                  <Text style={styles.planPrice}>
                    {Platform.OS === 'web' ? plan.priceCdfLabel : 'Prix du store'}
                  </Text>
                  <Text style={styles.planPriceUsd}>
                    {Platform.OS === 'web' ? `ou ${plan.price}` : `${storeName} à l’étape suivante`}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </View>

        <Text style={styles.noCommit}>
          {"Abonnement sans engagement : il ne se renouvelle pas tout seul, tu reprends la main à l'échéance."}
        </Text>
      </ScrollView>

      <GlassSurface intensity={60} style={styles.footer}>
        <View style={[styles.footerInner, { paddingBottom: spacing.md + insets.bottom }]}>
          <Button title="Continuer" variant="secondary" onPress={subscribe} />
        </View>
      </GlassSurface>
    </SafeAreaView>
  );
}
