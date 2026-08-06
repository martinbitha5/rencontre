import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { photoUrl, sendDirectMessage } from '../api';
import { COIN_NAME_PLURAL, formatCoins } from '../config/economy';
import { CoinIcon } from './coins';
import { haptic } from '../lib/haptics';
import { useWallet } from '../lib/wallet';
import type { DirectMessageResult } from '../types';

// Écran d'envoi du premier message : PLEIN ÉCRAN, pas une petite carte. La
// photo du profil habille tout le fond (floutée), le portrait net trône au
// centre, et l'écriture devient un moment à part entière. Les informations
// affichées restent simples : à qui on écrit, ce que ça coûte, une seule
// règle dite avec des mots de tous les jours.
//
// La logique est inchangée : mêmes règles de contenu, même envoi, même
// contrat (target / onClose / onResult) pour les écrans qui l'utilisent.

interface Target {
  user_id: string;
  display_name: string;
  // Présent sur les profils du feed et des favoris : sert au fond et au
  // portrait. Sans photo, l'écran retombe sur le dégradé de marque.
  photos?: { path: string }[];
}

const DM_MAX = 150;

// Un premier DM ne doit pas permettre de partager des coordonnées : pas de
// chiffres (numéros de téléphone), pas de caractères spéciaux (@, handles,
// liens) et pas de noms de réseaux sociaux ou de messageries.
const FORBIDDEN_SPECIALS = /[@#$%^&*()_+=<>[\]{}/\\|~:;"`€£§°]/;
const FORBIDDEN_KEYWORDS =
  /\b(whatsapp|instagram|insta|facebook|telegram|snapchat|tiktok|gmail|e?-?mail|num[ée]ro|t[ée]l[ée]phone)\b/i;

// Les règles sont techniques, leur affichage ne doit pas l'être : chaque
// refus se dit en une phrase simple.
function dmContentError(text: string): string | null {
  if (!text) return null;
  if (/[0-9]/.test(text)) {
    return 'Évite les chiffres : garde ton numéro pour plus tard.';
  }
  if (FORBIDDEN_SPECIALS.test(text)) {
    return 'Utilise seulement des lettres et une ponctuation simple.';
  }
  if (FORBIDDEN_KEYWORDS.test(text)) {
    return "Les réseaux sociaux attendront : fais d'abord connaissance ici.";
  }
  return null;
}

// Composer le premier message vers un profil sans match.
// La tarification est décidée côté serveur ; ici on ne fait qu'afficher
// le quota gratuit restant ou le coût.
export function DirectMessageModal({
  target,
  onClose,
  onResult,
}: {
  target: Target | null;
  onClose: () => void;
  onResult: (result: DirectMessageResult, target: Target) => void;
}) {
  const { wallet, costs } = useWallet();
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentError = dmContentError(draft.trim());

  useEffect(() => {
    setDraft('');
    setError(null);
    setSending(false);
  }, [target?.user_id]);

  const freeLeft = wallet
    ? Math.max(wallet.free_dm_quota - wallet.free_dms_used, 0)
    : null;

  const send = async () => {
    const content = draft.trim();
    if (!content || !target || sending || dmContentError(content)) return;
    setSending(true);
    setError(null);
    try {
      const result = await sendDirectMessage(target.user_id, content);
      onResult(result, target);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(
        msg.includes('dm_filtre')
          ? "Ce profil ne reçoit que les messages des personnes qui correspondent à ses critères."
          : msg.includes('message_contenu_interdit')
            ? 'Ton message semble contenir un numéro ou un réseau social. Reformule-le simplement.'
            : "Le message n'est pas parti. Réessaie.",
      );
      setSending(false);
    }
  };

  const photoPath = target?.photos?.[0]?.path ?? null;
  const shownError = contentError ?? error;

  return (
    <Modal
      visible={target !== null}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.screen}>
        {/* Fond : la photo du profil, floutée et assombrie. L'écran est un
            tête-à-tête, pas un formulaire. */}
        {photoPath ? (
          <Image
            source={{ uri: photoUrl(photoPath) }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={40}
          />
        ) : (
          <LinearGradient
            colors={['#1c0b13', '#4a1030', '#9d174d']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <LinearGradient
          colors={['rgba(28,11,19,0.55)', 'rgba(28,11,19,0.75)', 'rgba(28,11,19,0.92)']}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.flex}
          >
            <View style={styles.topBar}>
              <Pressable
                onPress={() => {
                  haptic.tap();
                  onClose();
                }}
                hitSlop={12}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
              >
                <Ionicons name="close" size={22} color="#ffffff" />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Portrait net dans un anneau dégradé, posé sur le fond flouté. */}
              <View style={styles.avatarRing}>
                <LinearGradient
                  colors={['#ec4899', '#f472b6']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.avatarClip}>
                  {photoPath ? (
                    <Image
                      source={{ uri: photoUrl(photoPath) }}
                      style={styles.avatar}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Ionicons name="person" size={38} color="rgba(255,255,255,0.8)" />
                    </View>
                  )}
                </View>
              </View>

              <Text style={styles.title}>Un premier mot pour {target?.display_name}</Text>
              <Text style={styles.subtitle}>
                Parle avec ton cœur et reste courtois(e). Si {target?.display_name} répond,
                le match se crée et votre conversation commence.
              </Text>

              <View style={styles.inputCard}>
                <TextInput
                  style={styles.input}
                  placeholder="Écris quelque chose de sympa…"
                  placeholderTextColor="rgba(255,255,255,0.45)"
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={DM_MAX}
                  autoFocus
                />
                <Text style={styles.counter}>
                  {draft.length}/{DM_MAX}
                </Text>
              </View>

              <View style={styles.ruleRow}>
                <Ionicons name="shield-checkmark-outline" size={15} color="rgba(255,255,255,0.65)" />
                <Text style={styles.ruleText}>
                  Pas de numéro ni de réseaux sociaux : juste des mots.
                </Text>
              </View>

              {!!shownError && <Text style={styles.error}>{shownError}</Text>}
            </ScrollView>

            <View style={styles.footer}>
              <View style={styles.costRow}>
                {freeLeft !== null && freeLeft > 0 ? (
                  <>
                    <View style={styles.freePill}>
                      <Text style={styles.freePillText}>Offert</Text>
                    </View>
                    <Text style={styles.costText}>
                      Encore {freeLeft} message{freeLeft > 1 ? 's' : ''} offert
                      {freeLeft > 1 ? 's' : ''}
                    </Text>
                  </>
                ) : (
                  <>
                    <CoinIcon size={15} />
                    <Text style={styles.costText}>
                      {formatCoins(costs.dm_cost)} {COIN_NAME_PLURAL}
                    </Text>
                  </>
                )}
              </View>

              <Pressable
                onPress={() => {
                  haptic.impact();
                  send();
                }}
                disabled={!draft.trim() || contentError !== null || sending}
                style={({ pressed }) => [
                  styles.sendBtn,
                  (!draft.trim() || contentError !== null) && { opacity: 0.4 },
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
              >
                <LinearGradient
                  colors={['#ec4899', '#be185d']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                {sending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Text style={styles.sendText}>Envoyer</Text>
                    <Ionicons name="paper-plane" size={17} color="#ffffff" />
                  </>
                )}
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1c0b13' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
    overflow: 'hidden',
    marginBottom: 18,
  },
  avatarClip: { flex: 1, borderRadius: 45, overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  avatarFallback: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 25,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    maxWidth: 320,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: 8,
    marginBottom: 22,
  },
  inputCard: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    padding: 16,
  },
  input: {
    minHeight: 120,
    maxHeight: 200,
    fontSize: 17,
    lineHeight: 24,
    color: '#ffffff',
    textAlignVertical: 'top',
  },
  counter: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  ruleText: { color: 'rgba(255,255,255,0.65)', fontSize: 13 },
  error: {
    color: '#fda4af',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 12,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  freePill: {
    backgroundColor: 'rgba(74,222,128,0.2)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  freePillText: { color: '#4ade80', fontSize: 12, fontWeight: '800' },
  costText: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },
  sendBtn: {
    height: 56,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendText: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
});
