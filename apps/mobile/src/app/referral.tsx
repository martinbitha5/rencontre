import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getRewards } from '../api';
import { Button, ScreenHeader } from '../components/ui';
import { formatCoins } from '../config/economy';
import { haptic } from '../lib/haptics';
import { colors, isDark, radius, spacing } from '../theme';
import type { RewardsState } from '../types';

const SITE = 'https://dowe-eight.vercel.app';

// Écran Parrainage, structure à la Heyama : grand titre avec le montant,
// section « Tu obtiens », section « Avantage pour tes amis », le code avec
// son bouton Copier, le lien FAQ, et le bouton Inviter des amis en bas.
export default function Referral() {
  const [state, setState] = useState<RewardsState | null>(null);
  const [copied, setCopied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      getRewards().then(setState).catch(() => {});
    }, []),
  );

  const sponsorAmount =
    state?.rewards.find((r) => r.kind === 'referral')?.amount ?? 0;
  const friendBonus = state?.referred_bonus ?? 0;

  const copyCode = async () => {
    if (!state) return;
    await Clipboard.setStringAsync(state.referral_code).catch(() => {});
    haptic.success();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const invite = async () => {
    if (!state) return;
    try {
      await Share.share({
        message:
          `Rejoins-moi sur Dowe, l'application de rencontre de la RDC. ` +
          `Inscris-toi avec mon code de parrainage ${state.referral_code} : ` +
          `tu recevras ${formatCoins(friendBonus)} pièces bonus à la vérification de ton compte. ${SITE}`,
      });
    } catch {
      // partage annulé : rien à faire
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="Parrainage" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>
          Tu veux gagner {sponsorAmount ? formatCoins(sponsorAmount) : '…'} pièces avec
          chaque parrainage ?
        </Text>
        <Text style={styles.subtitle}>
          Pour chaque ami que tu invites avec succès à s'inscrire et à faire vérifier son
          compte.
        </Text>

        <Text style={styles.sectionTitle}>Tu obtiens</Text>
        <View style={styles.benefitRow}>
          <View style={[styles.benefitIcon, styles.benefitIconGift]}>
            <Ionicons name="gift" size={22} color="#16a34a" />
          </View>
          <View style={styles.benefitBody}>
            <Text style={styles.benefitTitle}>
              {formatCoins(sponsorAmount)} pièces gratuites par ami parrainé
            </Text>
            <Text style={styles.benefitText}>
              Créditées dès que ton ami s'inscrit avec ton code et fait vérifier son
              compte.
            </Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Avantage pour tes amis</Text>
        <View style={styles.benefitRow}>
          <View style={[styles.benefitIcon, styles.benefitIconFriend]}>
            <Ionicons name="happy" size={22} color={colors.accent} />
          </View>
          <View style={styles.benefitBody}>
            <Text style={styles.benefitTitle}>
              {formatCoins(friendBonus)} pièces offertes à chaque ami
            </Text>
            <Text style={styles.benefitText}>
              Un bonus crédité à ton ami dès la vérification de son compte, s'il s'est
              inscrit avec ton code.
            </Text>
          </View>
        </View>

        <Text style={styles.codeLabel}>Ton code</Text>
        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{state?.referral_code ?? '……'}</Text>
          <Pressable
            style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.85 }]}
            onPress={copyCode}
            disabled={!state}
          >
            <Text style={styles.copyBtnText}>{copied ? 'Copié' : 'Copier'}</Text>
          </Pressable>
        </View>

        {state && state.referrals_paid > 0 && (
          <Text style={styles.paidLine}>
            {state.referrals_paid} filleul{state.referrals_paid > 1 ? 's' : ''} déjà
            récompensé{state.referrals_paid > 1 ? 's' : ''}.
          </Text>
        )}

        <Text style={styles.faqLine}>
          Tu as d'autres questions ?{' '}
          <Text
            style={styles.faqLink}
            onPress={() => WebBrowser.openBrowserAsync(`${SITE}/faq.html`).catch(() => {})}
          >
            Consulter la FAQ
          </Text>
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Inviter des amis" onPress={invite} disabled={!state} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: spacing.xs },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    lineHeight: 33,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.accent,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  benefitRow: { flexDirection: 'row', gap: spacing.md },
  benefitIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitIconGift: { backgroundColor: isDark ? 'rgba(22,163,74,.18)' : '#dcfce7' },
  benefitIconFriend: { backgroundColor: isDark ? 'rgba(219,39,119,.18)' : '#fde7f1' },
  benefitBody: { flex: 1, gap: 3 },
  benefitTitle: { fontSize: 16, fontWeight: '800', color: colors.text, lineHeight: 22 },
  benefitText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  codeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
  },
  codeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    padding: 6,
    gap: spacing.sm,
  },
  codeText: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 3,
    color: colors.text,
  },
  copyBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  copyBtnText: { fontSize: 14, fontWeight: '800', color: colors.textOnAccent },
  paidLine: { fontSize: 13, color: colors.success, fontWeight: '600', marginTop: spacing.sm },
  faqLine: { fontSize: 14, color: colors.textMuted, marginTop: spacing.lg },
  faqLink: { color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' },
  footer: { padding: spacing.md, paddingTop: spacing.sm },
});
