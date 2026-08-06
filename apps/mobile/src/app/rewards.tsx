import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { claimReward, getRewards, redeemReferralCode } from '../api';
import { CoinIcon } from '../components/coins';
import { PressableScale, Reveal } from '../components/motion';
import { Button, Input, ScreenHeader } from '../components/ui';
import { COIN_NAME_PLURAL, formatCoins } from '../config/economy';
import { useWallet } from '../lib/wallet';
import { colors, isDark, radius, spacing } from '../theme';
import type { RewardKind, RewardsState } from '../types';

const SITE = 'https://dowe-eight.vercel.app';

// Libellés des primes. L'ordre d'affichage suit celui renvoyé par le serveur.
const REWARD_COPY: Record<RewardKind, { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }> = {
  referral: {
    icon: 'people-outline',
    title: 'Parraine un ami',
    text: "Pour chaque ami que tu invites et qui fait vérifier son compte.",
  },
  share_app: {
    icon: 'share-social-outline',
    title: "Partage l'application",
    text: "Fais connaître Dowe autour de toi, une seule fois.",
  },
  verify_account: {
    icon: 'shield-checkmark-outline',
    title: 'Certifie ton compte',
    text: 'Les profils vérifiés sont mieux mis en avant et reçoivent plus de réponses.',
  },
};

export default function Rewards() {
  const router = useRouter();
  const { refresh } = useWallet();
  const [state, setState] = useState<RewardsState | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    getRewards()
      .then(setState)
      .catch(() => {});
    refresh();
  }, [refresh]);

  useFocusEffect(reload);

  // Le crédit est décidé par le serveur : on ne fait qu'annoncer le résultat.
  const claim = async (kind: RewardKind) => {
    setBusy(true);
    try {
      const res = await claimReward(kind);
      if (res.status === 'granted') {
        Alert.alert(
          'Pièces créditées',
          `+${formatCoins(res.amount)} ${COIN_NAME_PLURAL} ajoutées à ton solde.`,
        );
      } else if (res.status === 'not_eligible') {
        Alert.alert(
          'Pas encore',
          "Fais d'abord vérifier ton profil, la prime tombera juste après.",
        );
      } else if (res.status === 'already_claimed') {
        Alert.alert('Déjà reçue', 'Cette récompense a déjà été créditée.');
      }
      reload();
    } catch {
      Alert.alert('Erreur', 'Impossible de contacter le serveur. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const shareApp = async () => {
    try {
      const res = await Share.share({
        message: `Rejoins-moi sur Dowe, l'application de rencontre en RDC. ${SITE}`,
      });
      if (res.action === Share.sharedAction) await claim('share_app');
    } catch {
      // partage annulé : rien à faire
    }
  };

  const submitCode = async () => {
    setBusy(true);
    try {
      const res = await redeemReferralCode(code.trim().toUpperCase());
      const message = {
        ok: 'Code enregistré. Ton parrain sera récompensé dès que ton compte sera vérifié.',
        already_referred: 'Tu as déjà un parrain.',
        unknown_code: "Ce code n'existe pas.",
        self_referral: 'On ne peut pas se parrainer soi-même.',
        too_late: 'Ton compte est déjà vérifié, le code ne peut plus être ajouté.',
      }[res.status];
      Alert.alert(res.status === 'ok' ? 'Merci' : 'Code refusé', message);
      if (res.status === 'ok') setCode('');
      reload();
    } catch {
      Alert.alert('Erreur', 'Impossible de contacter le serveur. Réessaie.');
    } finally {
      setBusy(false);
    }
  };

  const onPressReward = (kind: RewardKind, claimed: boolean) => {
    if (claimed) return;
    // Le parrainage a son propre écran (code, avantages, invitation).
    if (kind === 'referral') return router.push('/referral');
    if (kind === 'share_app') return shareApp();
    if (!state?.is_verified) return router.push('/verify-profile');
    return claim('verify_account');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Obtenir des pièces" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <LinearGradient
          colors={[colors.washFrom, colors.washTo]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroTitle}>RÉCOMPENSES</Text>
          <Text style={styles.heroText}>
            Gagne des {COIN_NAME_PLURAL} gratuites en effectuant des actions simples qui
            contribuent à notre croissance.
          </Text>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillText}>
              Solde : {state ? formatCoins(state.balance) : '–'}
            </Text>
            <CoinIcon size={15} />
          </View>
        </LinearGradient>

        <View style={styles.sheet}>
          <PressableScale
            style={[styles.card, styles.cardFeatured]}
            onPress={() => router.push('/recharge')}
            accessibilityRole="button"
            accessibilityLabel="Acheter des pièces"
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Recommandé</Text>
            </View>
            <View style={[styles.cardIcon, styles.cardIconFeatured]}>
              <CoinIcon size={22} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>Acheter des pièces</Text>
              <Text style={styles.cardText}>
                Grâce aux {COIN_NAME_PLURAL}, tu peux discuter avec qui tu veux sur
                l'application.
              </Text>
            </View>
          </PressableScale>

          {(state?.rewards ?? []).map((reward, i) => {
            const copy = REWARD_COPY[reward.kind];
            if (!copy) return null;
            return (
              <Reveal key={reward.kind} index={i}>
                <PressableScale
                  disabled={busy || reward.claimed}
                  style={[styles.card, reward.claimed && styles.cardDone]}
                  onPress={() => onPressReward(reward.kind, reward.claimed)}
                  accessibilityRole="button"
                  accessibilityLabel={`${copy.title}, ${reward.claimed ? 'déjà reçue' : `${reward.amount} pièces`}`}
                >
                <View style={styles.amountPill}>
                  {reward.claimed ? (
                    <Ionicons name="checkmark" size={16} color={colors.success} />
                  ) : (
                    <>
                      <Text style={styles.amountText}>{formatCoins(reward.amount)}</Text>
                      <CoinIcon size={12} />
                    </>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{copy.title}</Text>
                  <Text style={styles.cardText}>{copy.text}</Text>
                  {reward.kind === 'referral' && !!state?.referral_code && (
                    <Text style={styles.codeLine}>
                      Ton code : <Text style={styles.code}>{state.referral_code}</Text>
                      {state.referrals_paid > 0
                        ? ` · ${state.referrals_paid} filleul${state.referrals_paid > 1 ? 's' : ''} récompensé${state.referrals_paid > 1 ? 's' : ''}`
                        : ''}
                    </Text>
                  )}
                </View>
                  <Ionicons
                    name={reward.claimed ? 'checkmark-circle' : 'chevron-forward'}
                    size={reward.claimed ? 20 : 18}
                    color={reward.claimed ? colors.success : colors.textMuted}
                  />
                </PressableScale>
              </Reveal>
            );
          })}

          {/* L'incognito n'est pas une récompense en pièces : il a sa propre
              section pour ne pas se faire passer pour une prime gratuite. */}
          <Text style={styles.sectionLabel}>Aller plus loin</Text>
          <PressableScale
            style={styles.card}
            onPress={() => router.push('/incognito')}
            accessibilityRole="button"
            accessibilityLabel="Deviens invisible, mode Incognito"
          >
            <View style={styles.cardIcon}>
              <Ionicons name="eye-off-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>Deviens invisible</Text>
              <Text style={styles.cardText}>
                Passe en mode Incognito : ton profil sort du fil Rencontres et ton statut en
                ligne reste privé.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </PressableScale>

          {state && !state.has_sponsor && !state.is_verified && (
            <View style={styles.sponsorBox}>
              <Text style={styles.sponsorTitle}>Tu as un code de parrainage ?</Text>
              <Text style={styles.cardText}>
                Entre-le avant la vérification de ton compte pour que ton parrain soit
                récompensé.
              </Text>
              <Input
                placeholder="Ex. TJXFDJ"
                autoCapitalize="characters"
                maxLength={6}
                value={code}
                onChangeText={setCode}
              />
              <Button
                title="Valider le code"
                onPress={submitCode}
                loading={busy}
                disabled={code.trim().length < 6}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  hero: {
    marginHorizontal: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.primaryDeep,
  },
  heroText: { fontSize: 14, color: colors.primaryDeep, lineHeight: 20, opacity: 0.85 },
  heroPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: spacing.xs,
  },
  heroPillText: { fontSize: 14, fontWeight: '800', color: colors.primaryDeep },
  sheet: { padding: spacing.md, gap: spacing.sm },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardFeatured: { borderColor: colors.accent, borderWidth: 2, paddingTop: spacing.lg },
  cardDone: { backgroundColor: colors.surface },
  cardIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  // Écrin doré de la pièce : décliné par thème, le crème fixe restait un rond
  // clair en mode sombre.
  cardIconFeatured: { backgroundColor: isDark ? 'rgba(244, 180, 0, 0.18)' : '#fdf3d6' },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  cardText: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  codeLine: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  code: { fontWeight: '800', color: colors.primary, letterSpacing: 1 },
  amountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 62,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  amountText: { fontSize: 14, fontWeight: '800', color: colors.primaryDeep },
  badge: {
    position: 'absolute',
    top: -10,
    right: spacing.md,
    backgroundColor: colors.success,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#ffffff' },
  sponsorBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  sponsorTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
});
