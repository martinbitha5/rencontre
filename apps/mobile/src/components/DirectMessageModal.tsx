import { Ionicons } from '@expo/vector-icons';

import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView, KEYBOARD_PRESS_RETENTION } from '@/components/keyboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendDirectMessage } from '@/services/api';
import { COIN_NAME_PLURAL, formatCoins } from '@/config/economy';
import { PAYMENTS_ENABLED } from '@/config/features';
import { haptic } from '@/utils/haptics';
import { useWallet } from '@/providers/wallet';
import { colors, flame, keyboardAppearance } from '@/theme';
import type { DirectMessageResult } from '@/types';
import { Photo } from '@/components/Photo';

// Écran d'envoi du premier message, plein écran et clair : en-tête avec retour
// et titre centré, la carte du destinataire, un grand champ encadré qui
// signale le minimum de caractères, le compteur, la règle de contenu, puis le
// coût et le bouton d'envoi en bas.
//
// La logique est inchangée : mêmes règles de contenu, même envoi, même
// contrat (target / onClose / onResult) pour les écrans qui l'utilisent.
//
// Les marges de la fenêtre viennent du provider racine, qui traverse la
// Modal : sur Android à barre d'état translucide, une SafeAreaView native ne
// les recevait pas et le bouton de sortie passait sous la barre d'état.

interface Target {
  user_id: string;
  display_name: string;
  // Présent sur les profils du feed et des favoris : sert au fond et au
  // portrait. Sans photo, l'écran retombe sur le dégradé de marque.
  photos?: { path: string }[];
}

const DM_MAX = 150;
// Un « salut » d'une lettre ne lance pas une conversation : deux au minimum.
const DM_MIN = 2;

// Largeur maximale de la colonne de contenu : sur tablette ou en paysage,
// le formulaire reste une colonne lisible au centre au lieu de s'étirer.
const COLUMN_MAX = 480;

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
  // Marges de la fenêtre, lues dans le contexte du provider racine : elles
  // valent dans une Modal là où la SafeAreaView native ne les voit pas. Si
  // même elles sont nulles sur Android (anciens appareils), la hauteur de la
  // barre d'état sert de plancher, puisque la Modal passe dessous.
  const insets = useSafeAreaInsets();
  const topInset = Math.max(
    insets.top,
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0,
  );
  // Clavier ouvert : le portrait et le sous-titre s'effacent, le champ prend
  // toute la hauteur libre. Ce qu'on écrit reste visible en entier, sans
  // avoir à faire défiler quoi que ce soit.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subs = [
      Keyboard.addListener(showEvent, () => setKeyboardOpen(true)),
      Keyboard.addListener(hideEvent, () => setKeyboardOpen(false)),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);
  const showHero = !keyboardOpen;

  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);
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
    if (content.length < DM_MIN || !target || sending || dmContentError(content)) return;
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

  // Fermer range d'abord le clavier : sinon, sur Android, il reste parfois
  // affiché une fraction de seconde au-dessus de l'écran de dessous.
  const close = () => {
    if (sending) return;
    Keyboard.dismiss();
    onClose();
  };

  const photoPath = target?.photos?.[0]?.path ?? null;
  const shownError = contentError ?? error;

  const trimmed = draft.trim();
  const tooShort = trimmed.length < DM_MIN;
  const canSend = !tooShort && contentError === null && !sending;
  const left = DM_MAX - draft.length;

  return (
    <Modal
      visible={target !== null}
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      {/* Les marges vivent sur cette vue, pas sur le KeyboardAvoidingView :
          en mode padding, il écrase le paddingBottom qu'on lui donne. */}
      <View
        style={[
          styles.screen,
          {
            paddingTop: topInset,
            paddingBottom: insets.bottom,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          },
        ]}
      >
        <KeyboardAvoidingView
          // Le champ et le bouton Envoyer restent au-dessus du clavier, sur
          // iOS comme sur Android (components/keyboard).
          style={styles.flex}
        >
          {/* En-tête : retour à gauche, titre centré. */}
          <View style={styles.header}>
            <Pressable
              onPress={() => {
                haptic.tap();
                close();
              }}
              hitSlop={12}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel="Retour"
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.5 }]}
            >
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Envoyer un DM
            </Text>
            <View style={styles.headerBtn} />
          </View>

          <View style={[styles.body, styles.column]}>
            {/* À qui l'on écrit. La carte s'efface quand le clavier monte :
                le champ garde la place. */}
            {showHero && (
              <View style={styles.recipient}>
                {photoPath ? (
                  <Photo
                    path={photoPath}
                    style={styles.avatar}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Ionicons name="person" size={24} color={colors.primary} />
                  </View>
                )}
                <View style={styles.recipientText}>
                  <Text style={styles.recipientName} numberOfLines={1}>
                    {target?.display_name}
                  </Text>
                  <Text style={styles.recipientHint} numberOfLines={1}>
                    Ton message arrive dans ses DMs
                  </Text>
                </View>
                <View style={styles.recipientBadge}>
                  <Ionicons name="chatbubble-ellipses" size={18} color={colors.primary} />
                </View>
              </View>
            )}

            <Text style={styles.lead}>
              Écris un message direct à {target?.display_name}. Parle avec ton cœur et surtout,
              sois poli(e).
            </Text>

            <View
              style={[
                styles.field,
                focused && styles.fieldFocused,
                shownError ? styles.fieldError : null,
              ]}
            >
              <TextInput
                keyboardAppearance={keyboardAppearance}
                style={styles.input}
                placeholder="Écris quelque chose de sympa"
                placeholderTextColor={colors.textMuted}
                value={draft}
                onChangeText={setDraft}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                multiline
                maxLength={DM_MAX}
                autoFocus
                scrollEnabled
              />
              {tooShort && <Text style={styles.minHint}>Min. {DM_MIN}</Text>}
            </View>

            <Text style={[styles.meta, left <= 15 && styles.metaWarn]}>
              {left} caractère{left > 1 ? 's' : ''} restant{left > 1 ? 's' : ''}
            </Text>

            {shownError ? (
              <Text style={styles.error}>{shownError}</Text>
            ) : (
              <View style={styles.ruleRow}>
                <Ionicons name="shield-checkmark-outline" size={15} color={colors.textMuted} />
                <Text style={styles.ruleText}>
                  Pas de numéro ni de réseaux sociaux, juste des mots.
                </Text>
              </View>
            )}
          </View>

          <View style={[styles.footer, styles.column]}>
            {/* Le coût, dit en une phrase. Rien à payer tant que l'app est
                gratuite. */}
            <Text style={styles.cost}>
              {!PAYMENTS_ENABLED
                ? 'Ce DM est gratuit.'
                : freeLeft !== null && freeLeft > 0
                  ? `Ce DM est offert. Encore ${freeLeft} message${freeLeft > 1 ? 's' : ''} offert${freeLeft > 1 ? 's' : ''}.`
                  : `Ce DM te coûtera ${formatCoins(costs.dm_cost)} ${COIN_NAME_PLURAL}.`}
            </Text>

            <Pressable
              onPress={() => {
                haptic.impact();
                send();
              }}
              pressRetentionOffset={KEYBOARD_PRESS_RETENTION}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Envoyer le message"
              style={({ pressed }) => [
                styles.sendBtn,
                !canSend && !sending && styles.sendBtnOff,
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              {(canSend || sending) && (
                <LinearGradient
                  colors={flame}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
              )}
              {sending ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Text style={[styles.sendText, !canSend && styles.sendTextOff]}>Envoyer</Text>
                  <Ionicons
                    name="paper-plane"
                    size={17}
                    color={canSend ? '#ffffff' : colors.textMuted}
                  />
                </>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: colors.primaryDeep,
    letterSpacing: -0.2,
  },
  // Colonne bornée en largeur : tablette et paysage compris.
  column: { width: '100%', maxWidth: COLUMN_MAX, alignSelf: 'center' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  recipient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 12,
    marginBottom: 16,
  },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: {
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipientText: { flex: 1, minWidth: 0 },
  recipientName: { fontSize: 16, fontWeight: '800', color: colors.text },
  recipientHint: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  recipientBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.selected,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lead: { fontSize: 15, lineHeight: 22, color: colors.textMuted, marginBottom: 14 },
  // Le champ prend la hauteur libre (bornée) ; il défile à l'intérieur
  // seulement si le message dépasse encore.
  field: {
    flex: 1,
    minHeight: 120,
    maxHeight: 240,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32,
    backgroundColor: colors.background,
  },
  fieldFocused: { borderColor: colors.primary },
  fieldError: { borderColor: colors.danger },
  input: {
    flex: 1,
    fontSize: 17,
    lineHeight: 24,
    color: colors.text,
    textAlignVertical: 'top',
  },
  minHint: {
    position: 'absolute',
    right: 14,
    bottom: 10,
    fontSize: 14,
    fontWeight: '700',
    color: colors.danger,
  },
  meta: {
    marginTop: 8,
    paddingHorizontal: 4,
    fontSize: 13,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  metaWarn: { color: colors.danger, fontWeight: '700' },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 4,
    minHeight: 20,
  },
  ruleText: { color: colors.textMuted, fontSize: 13, flexShrink: 1 },
  // L'erreur prend la place de la règle : même hauteur, rien ne saute.
  error: {
    color: colors.danger,
    fontSize: 13,
    marginTop: 10,
    paddingHorizontal: 4,
    minHeight: 20,
  },
  footer: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10, gap: 12 },
  cost: { textAlign: 'center', fontSize: 14, fontWeight: '600', color: colors.textMuted },
  sendBtn: {
    height: 56,
    borderRadius: 999,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  sendBtnOff: { backgroundColor: colors.surface },
  sendText: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
  sendTextOff: { color: colors.textMuted },
});
