import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UnicornMascot } from '../components/mascot';
import { GlassSurface, PressableScale, Reveal } from '../components/motion';
import { Button } from '../components/ui';
import { INCOGNITO_PLANS, planSavingPercent } from '../config/economy';
import { colors, radius, spacing } from '../theme';

// Ce que l'abonnement débloque RÉELLEMENT aujourd'hui. Toute ligne ajoutée ici
// est une promesse faite à quelqu'un qui paie : ne rien lister qui ne soit pas
// déjà implémenté et vérifiable dans l'app.
const PERKS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  {
    icon: 'eye-off-outline',
    title: 'Deviens invisible',
    text: "Ton profil sort du fil Rencontres. Personne ne tombe dessus par hasard.",
  },
  {
    icon: 'globe-outline',
    title: 'Cache ton statut en ligne',
    text: "Ta dernière activité n'est plus affichée aux profils qui te découvrent.",
  },
  {
    icon: 'lock-closed-outline',
    title: "Sécurise l'application",
    text: "Verrouille Dowe avec un code secret à l'ouverture.",
  },
  {
    icon: 'compass-outline',
    title: 'Continue à explorer',
    text: "Tu vois tout le monde et tu écris en premier, sans laisser de trace dans leurs vues.",
  },
];

export default function Incognito() {
  const router = useRouter();
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

        <Text style={styles.title}>Passe en mode Incognito</Text>
        <Text style={styles.subtitle}>
          Disparais du fil public tout en gardant le contrôle.
        </Text>

        <LinearGradient
          colors={[colors.washFrom, colors.washTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.perksCard}
        >
          <Text style={styles.perksTitle}>Tout ce que tu débloques avec Incognito</Text>
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
                  <Text style={styles.planPrice}>{plan.priceCdfLabel}</Text>
                  <Text style={styles.planPriceUsd}>ou {plan.price}</Text>
                </View>
              </PressableScale>
            );
          })}
        </View>

        <Text style={styles.noCommit}>
          Abonnement sans engagement : il ne se renouvelle pas tout seul, tu reprends la main à
          l'échéance.
        </Text>
      </ScrollView>

      <GlassSurface intensity={60} style={styles.footer}>
        <View style={styles.footerInner}>
          <Button title="Continuer" variant="secondary" onPress={subscribe} />
        </View>
      </GlassSurface>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.lg },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start' },
  // La licorne porte son propre halo : pas de pastille de fond en plus.
  heroIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginLeft: 'auto',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  title: {
    fontSize: 25,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  perksCard: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  perksTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.primaryDeep,
    textAlign: 'center',
    marginBottom: 2,
  },
  perkRow: { flexDirection: 'row', gap: spacing.sm },
  perkBody: { flex: 1, gap: 2 },
  perkTitle: { fontSize: 15, fontWeight: '700', color: colors.primaryDeep },
  perkText: { fontSize: 13, color: colors.primaryDeep, opacity: 0.8, lineHeight: 18 },
  plansTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  plansRow: { flexDirection: 'row', gap: spacing.sm },
  // La répartition dans la rangée vit sur l'enveloppe animée, l'habillage sur
  // la zone tactile.
  planOuter: { flex: 1 },
  plan: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  planActive: { borderColor: colors.primary, borderWidth: 2 },
  planBadge: {
    backgroundColor: colors.primary,
    paddingVertical: 4,
    alignItems: 'center',
  },
  planBadgeEmpty: { backgroundColor: colors.surface },
  planBadgeText: { fontSize: 11, fontWeight: '800', color: colors.textOnPrimary },
  planBody: { alignItems: 'center', paddingVertical: spacing.md, gap: 2 },
  planMonths: { fontSize: 26, fontWeight: '800', color: colors.text },
  planMonthsUnit: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  planPrice: { fontSize: 13, fontWeight: '800', color: colors.primary, textAlign: 'center' },
  planPriceUsd: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  noCommit: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 18,
  },
  footer: { borderRadius: 0 },
  footerInner: { padding: spacing.md },
});
