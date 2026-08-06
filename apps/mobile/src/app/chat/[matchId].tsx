import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  blockUser,
  chatMediaUrl,
  deleteMessage,
  getMessages,
  getProfileView,
  getReactions,
  markMessagesRead,
  photoUrl,
  reactToMessage,
  removeReaction,
  reportUser,
  sendAudioMessage,
  sendMediaMessage,
  sendMessage,
  unmatch,
  voiceUrl,
} from '../../api';
import { ProfileDetailModal } from '../../components/ProfileDetailModal';
import { ReportModal } from '../../components/ReportModal';
import { Centered } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { cacheGet, cacheSet } from '../../lib/cache';
import { haptic } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../theme';
import type { Message, Reaction, ViewableProfile } from '../../types';

const REACTION_EMOJIS = ['❤️', '😂', '😍', '😮', '😢', '👍'];

function formatSeconds(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Bulle de note vocale : lecture/pause + position.
function VoiceBubble({
  path,
  mine,
  onLongPress,
}: {
  path: string;
  mine: boolean;
  onLongPress?: () => void;
}) {
  const player = useAudioPlayer({ uri: voiceUrl(path) });
  const status = useAudioPlayerStatus(player);
  const fg = mine ? '#ffffff' : colors.primary;

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish) player.seekTo(0);
    player.play();
  };

  return (
    <Pressable
      style={styles.voiceRow}
      onPress={toggle}
      onLongPress={onLongPress}
      delayLongPress={280}
    >
      <Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={32} color={fg} />
      <Text style={[styles.voiceText, { color: fg }]}>
        {formatSeconds(status.currentTime > 0 ? status.currentTime : status.duration)}
      </Text>
      <Ionicons name="mic-outline" size={16} color={fg} />
    </Pressable>
  );
}

// Bulle vidéo : lecteur inline avec contrôles natifs.
function VideoBubble({ path }: { path: string }) {
  const player = useVideoPlayer(chatMediaUrl(path));
  return (
    <VideoView
      player={player}
      style={styles.mediaBubble}
      nativeControls
      contentFit="cover"
    />
  );
}

export default function Chat() {
  const { matchId, name, otherUserId, photoPath } = useLocalSearchParams<{
    matchId: string;
    name?: string;
    otherUserId?: string;
    photoPath?: string;
  }>();
  const router = useRouter();
  const { session } = useAuth();
  const myId = session?.user.id;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [fullImage, setFullImage] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<number, Reaction[]>>({});
  const [msgAction, setMsgAction] = useState<Message | null>(null);
  const [profileView, setProfileView] = useState<ViewableProfile | null>(null);
  const listRef = useRef<FlatList<Message>>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const headerHeight = useHeaderHeight();

  // Quand le clavier sort, on garde la fin de la conversation visible.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () =>
      listRef.current?.scrollToEnd({ animated: true }),
    );
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // otherUserId vient des params de route ; repli sur les messages reçus
  // pour les anciennes navigations sans ce paramètre.
  const resolveOtherId = useCallback(
    () => otherUserId ?? messages.find((m) => m.sender_id !== myId)?.sender_id,
    [otherUserId, messages, myId],
  );

  const applyReaction = useCallback((r: Reaction) => {
    setReactions((prev) => {
      const list = (prev[r.message_id] ?? []).filter((x) => x.user_id !== r.user_id);
      return { ...prev, [r.message_id]: [...list, r] };
    });
  }, []);

  useEffect(() => {
    if (!matchId) return;
    // Historique connu affiché immédiatement, le réseau corrige ensuite.
    cacheGet<Message[]>(`messages:${matchId}`).then((cached) => {
      if (cached && cached.length) {
        setMessages((prev) => (prev.length ? prev : cached));
        setLoading(false);
      }
    });
    getMessages(matchId)
      .then((fresh) => {
        setMessages(fresh);
        // On ne garde en local que la fin de la conversation.
        cacheSet(`messages:${matchId}`, fresh.slice(-50));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    getReactions(matchId)
      .then((list) => {
        const grouped: Record<number, Reaction[]> = {};
        for (const r of list) (grouped[r.message_id] ??= []).push(r);
        setReactions(grouped);
      })
      .catch(() => {});
    markMessagesRead(matchId);

    const channel = supabase
      .channel(`chat-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
          );
          if (msg.sender_id !== myId) {
            // Petit retour au creux de la main quand un message tombe.
            haptic.message();
            markMessagesRead(matchId);
          }
        },
      )
      // Accusés de lecture : quand l'autre ouvre la conversation, ses
      // read_at se posent en base et reviennent ici en UPDATE — la coche
      // « Lu » s'allume en direct sous mes messages.
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          );
        },
      )
      // Les DELETE realtime ne portent que la clé primaire : filtre côté client.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const oldId = (payload.old as { id?: number }).id;
          if (oldId) setMessages((prev) => prev.filter((m) => m.id !== oldId));
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `match_id=eq.${matchId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const old = payload.old as { message_id?: number; user_id?: string };
            if (old.message_id && old.user_id) {
              setReactions((prev) => ({
                ...prev,
                [old.message_id!]: (prev[old.message_id!] ?? []).filter(
                  (x) => x.user_id !== old.user_id,
                ),
              }));
            }
            return;
          }
          applyReaction(payload.new as Reaction);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId, myId, applyReaction]);

  // La fin de conversation reste en cache locale à mesure qu'elle évolue :
  // rouvrir le chat montre l'historique dans le même état qu'en le quittant,
  // sans attendre le réseau. Les bulles provisoires n'y entrent pas.
  useEffect(() => {
    if (!matchId || !messages.length) return;
    cacheSet(`messages:${matchId}`, messages.filter((m) => !m.pending).slice(-50));
  }, [messages, matchId]);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (!content || !matchId || !myId || sending) return;
    haptic.impact();
    setSending(true);
    setDraft('');
    // Envoi optimiste : la bulle apparaît sous le doigt, marquée d'une petite
    // horloge, avant la réponse du serveur. La ligne serveur la remplace dès
    // qu'elle existe ; en cas d'échec la bulle disparaît et le texte revient
    // dans le champ.
    const tempId = -Date.now();
    const temp: Message = {
      id: tempId,
      match_id: matchId,
      sender_id: myId,
      content,
      kind: 'text',
      media_path: null,
      created_at: new Date().toISOString(),
      read_at: null,
      pending: true,
    };
    setMessages((prev) => [...prev, temp]);
    try {
      const msg = await sendMessage(matchId, content);
      setMessages((prev) => {
        // Le realtime a pu livrer la ligne serveur avant la réponse du RPC :
        // on retire la bulle provisoire et on dédoublonne.
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return withoutTemp.some((m) => m.id === msg.id) ? withoutTemp : [...withoutTemp, msg];
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(content);
      Alert.alert('Erreur', "Le message n'a pas pu être envoyé.");
    } finally {
      setSending(false);
    }
  }, [draft, matchId, myId, sending]);

  // Photo ou vidéo depuis la galerie.
  const pickAndSendMedia = useCallback(async () => {
    if (!matchId || sendingMedia) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      videoMaxDuration: 60,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    const kind = asset.type === 'video' ? 'video' : 'image';
    setSendingMedia(true);
    try {
      const msg = await sendMediaMessage(matchId, asset.uri, kind, asset.mimeType ?? undefined);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } catch {
      Alert.alert(
        'Erreur',
        kind === 'video'
          ? "La vidéo n'a pas pu être envoyée (60 s et 25 Mo maximum)."
          : "La photo n'a pas pu être envoyée.",
      );
    } finally {
      setSendingMedia(false);
    }
  }, [matchId, sendingMedia]);

  const startRecording = useCallback(async () => {
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Micro non autorisé', 'Autorise le micro pour envoyer des notes vocales.');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordSecs(0);
      setRecording(true);
    } catch {
      Alert.alert('Erreur', "Impossible de démarrer l'enregistrement.");
    }
  }, [recorder]);

  const cancelRecording = useCallback(async () => {
    setRecording(false);
    try {
      await recorder.stop();
    } catch {
      // rien à annuler si l'enregistreur n'a pas démarré
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  }, [recorder]);

  const sendRecording = useCallback(async () => {
    if (!matchId || sending) return;
    setSending(true);
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      const uri = recorder.uri;
      if (!uri) throw new Error('enregistrement introuvable');
      const msg = await sendAudioMessage(matchId, uri);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } catch {
      Alert.alert('Erreur', "La note vocale n'a pas pu être envoyée.");
    } finally {
      setSending(false);
    }
  }, [matchId, sending, recorder]);

  // Voir le profil complet de la personne, match ou pas.
  const openProfile = useCallback(async () => {
    const otherId = resolveOtherId();
    if (!otherId) return;
    const profile = await getProfileView(otherId).catch(() => null);
    if (profile) setProfileView(profile);
    else Alert.alert('Profil indisponible', "Ce profil ne peut pas être affiché pour l'instant.");
  }, [resolveOtherId]);

  const pickReaction = async (emoji: string) => {
    const msg = msgAction;
    setMsgAction(null);
    if (!msg || !myId) return;
    const existing = (reactions[msg.id] ?? []).find((r) => r.user_id === myId);
    try {
      if (existing?.emoji === emoji) {
        // re-choisir le même emoji retire la réaction
        setReactions((prev) => ({
          ...prev,
          [msg.id]: (prev[msg.id] ?? []).filter((r) => r.user_id !== myId),
        }));
        await removeReaction(msg.id);
      } else {
        applyReaction({
          message_id: msg.id,
          match_id: msg.match_id,
          user_id: myId,
          emoji,
          created_at: new Date().toISOString(),
        });
        await reactToMessage(msg, emoji);
      }
    } catch {
      // la vérité reviendra par le realtime
    }
  };

  const confirmDeleteMessage = () => {
    const msg = msgAction;
    setMsgAction(null);
    if (!msg) return;
    Alert.alert('Supprimer ce message ?', 'Il disparaîtra pour vous deux.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
          try {
            await deleteMessage(msg.id);
          } catch {
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg].sort((a, b) => a.id - b.id),
            );
            Alert.alert('Erreur', "Le message n'a pas pu être supprimé.");
          }
        },
      },
    ]);
  };

  const openMenu = () => {
    Alert.alert(name ?? 'Options', undefined, [
      {
        text: 'Signaler le profil',
        style: 'destructive',
        onPress: () => setReporting(true),
      },
      {
        text: 'Bloquer cette personne',
        style: 'destructive',
        onPress: async () => {
          const otherId = resolveOtherId();
          if (otherId) await blockUser(otherId).catch(() => {});
          else if (matchId) await unmatch(matchId).catch(() => {});
          router.back();
        },
      },
      {
        text: 'Supprimer le match',
        style: 'destructive',
        onPress: async () => {
          if (!matchId) return;
          await unmatch(matchId).catch(() => {});
          router.back();
        },
      },
      { text: 'Annuler', style: 'cancel' },
    ]);
  };

  const submitReport = async (reason: string, details: string) => {
    setReporting(false);
    const otherId = resolveOtherId();
    if (!otherId) return;
    try {
      // La conversation est jointe au dossier : l'équipe peut vérifier ce qui
      // s'est dit sans avoir à demander une capture d'écran.
      await reportUser(otherId, reason, details, matchId ?? null);
      await blockUser(otherId);
      Alert.alert(
        'Signalement envoyé',
        'Notre équipe examine le dossier. Le profil est bloqué : vous ne vous verrez plus.',
      );
      router.back();
    } catch {
      Alert.alert('Erreur', 'Impossible de signaler ce profil.');
    }
  };

  // L'état détaillé (Distribué / Lu) ne s'écrit que sous mon dernier message :
  // les coches suffisent sur les précédents, l'écran reste léger.
  const lastMineId = [...messages].reverse().find((m) => m.sender_id === myId)?.id;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen
        options={{
          // pas de bouton retour ici : geste système uniquement
          headerLeft: () => null,
          headerBackVisible: false,
          gestureEnabled: true,
          headerTitle: () => (
            <Pressable style={styles.headerTitle} onPress={openProfile} hitSlop={6}>
              {photoPath ? (
                <Image
                  source={{ uri: photoUrl(photoPath) }}
                  style={styles.headerAvatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
                  <Text style={styles.headerAvatarLetter}>
                    {name?.[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
              )}
              <Text style={styles.headerName} numberOfLines={1}>
                {name ?? 'Discussion'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={openMenu} hitSlop={12}>
              <Ionicons name="ellipsis-vertical" size={20} color={colors.primaryDeep} />
            </Pressable>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior="padding"
        // Hauteur réelle de l'en-tête (varie selon encoche / Dynamic Island) :
        // un décalage faussé, même de quelques pixels, cache la barre de saisie.
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        {loading ? (
          <Centered>
            <ActivityIndicator size="large" color={colors.primary} />
          </Centered>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            contentContainerStyle={styles.list}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                C'est un match ! Envoie le premier message.
              </Text>
            }
            renderItem={({ item }) => {
              const mine = item.sender_id === myId;
              const isMedia =
                item.media_path && (item.kind === 'image' || item.kind === 'video');
              const msgReactions = reactions[item.id] ?? [];
              return (
                <View style={mine ? styles.msgColMine : styles.msgColTheirs}>
                  <Pressable
                    onLongPress={() => setMsgAction(item)}
                    delayLongPress={280}
                    style={[
                      styles.bubble,
                      mine ? styles.bubbleMine : styles.bubbleTheirs,
                      isMedia && styles.bubbleMedia,
                    ]}
                  >
                    {item.kind === 'audio' && item.media_path ? (
                      <VoiceBubble
                        path={item.media_path}
                        mine={mine}
                        onLongPress={() => setMsgAction(item)}
                      />
                    ) : item.kind === 'image' && item.media_path ? (
                      <Pressable
                        onPress={() => setFullImage(chatMediaUrl(item.media_path!))}
                        onLongPress={() => setMsgAction(item)}
                        delayLongPress={280}
                      >
                        <Image
                          source={{ uri: chatMediaUrl(item.media_path) }}
                          style={styles.mediaBubble}
                          contentFit="cover"
                          transition={150}
                        />
                      </Pressable>
                    ) : item.kind === 'video' && item.media_path ? (
                      <VideoBubble path={item.media_path} />
                    ) : (
                      <Text style={[styles.bubbleText, mine && { color: '#fff' }]}>
                        {item.content}
                      </Text>
                    )}
                  </Pressable>
                  {msgReactions.length > 0 && (
                    <View style={styles.reactionsPill}>
                      {[...new Set(msgReactions.map((r) => r.emoji))].map((emoji) => {
                        const count = msgReactions.filter((r) => r.emoji === emoji).length;
                        return (
                          <Text key={emoji} style={styles.reactionText}>
                            {emoji}
                            {count > 1 ? ` ${count}` : ''}
                          </Text>
                        );
                      })}
                    </View>
                  )}
                  {/* État du message : horloge le temps de l'envoi, une coche
                      quand le serveur l'a distribué, deux coches roses quand
                      l'autre l'a lu. Le libellé n'accompagne que le dernier. */}
                  {mine && (
                    <View style={styles.statusRow}>
                      {item.pending ? (
                        <>
                          <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                          {item.id === lastMineId && (
                            <Text style={styles.statusText}>Envoi…</Text>
                          )}
                        </>
                      ) : item.read_at ? (
                        <>
                          <Ionicons name="checkmark-done" size={14} color={colors.accent} />
                          {item.id === lastMineId && (
                            <Text style={[styles.statusText, { color: colors.accent }]}>Lu</Text>
                          )}
                        </>
                      ) : (
                        <>
                          <Ionicons name="checkmark" size={14} color={colors.textMuted} />
                          {item.id === lastMineId && (
                            <Text style={styles.statusText}>Distribué</Text>
                          )}
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            }}
          />
        )}

        {recording ? (
          <View style={styles.composer}>
            <View style={styles.recordingInfo}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>
                Enregistrement… {formatSeconds(recordSecs)}
              </Text>
            </View>
            <Pressable style={styles.cancelBtn} onPress={cancelRecording} hitSlop={6}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
            <Pressable
              style={[styles.sendBtn, sending && { opacity: 0.5 }]}
              onPress={sendRecording}
              disabled={sending}
            >
              <Ionicons name="send" size={20} color={colors.textOnAccent} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.composer}>
            <Pressable
              style={[styles.attachBtn, sendingMedia && { opacity: 0.5 }]}
              onPress={pickAndSendMedia}
              disabled={sendingMedia}
              hitSlop={6}
            >
              {sendingMedia ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="image-outline" size={22} color={colors.primary} />
              )}
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Écris un message…"
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={2000}
            />
            {draft.trim() ? (
              <Pressable
                style={[styles.sendBtn, sending && { opacity: 0.5 }]}
                onPress={send}
                disabled={sending}
              >
                <Ionicons name="send" size={20} color={colors.textOnAccent} />
              </Pressable>
            ) : (
              <Pressable
                style={[styles.sendBtn, sending && { opacity: 0.5 }]}
                onPress={startRecording}
                disabled={sending}
              >
                <Ionicons name="mic" size={20} color={colors.textOnAccent} />
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      <ReportModal
        visible={reporting}
        name={name ?? null}
        onSubmit={submitReport}
        onCancel={() => setReporting(false)}
      />

      {/* Profil de l'autre personne, accessible depuis l'en-tête */}
      <ProfileDetailModal profile={profileView} onClose={() => setProfileView(null)} />

      {/* Appui long sur un message : réagir ou supprimer */}
      <Modal
        visible={msgAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMsgAction(null)}
      >
        <Pressable style={styles.actionOverlay} onPress={() => setMsgAction(null)}>
          <View style={styles.actionCard}>
            <View style={styles.emojiRow}>
              {REACTION_EMOJIS.map((emoji) => (
                <Pressable
                  key={emoji}
                  style={({ pressed }) => [styles.emojiBtn, pressed && { opacity: 0.6 }]}
                  onPress={() => pickReaction(emoji)}
                >
                  <Text style={styles.emojiText}>{emoji}</Text>
                </Pressable>
              ))}
            </View>
            {msgAction?.sender_id === myId && (
              <Pressable style={styles.actionRow} onPress={confirmDeleteMessage}>
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
                <Text style={styles.actionRowTextDanger}>Supprimer le message</Text>
              </Pressable>
            )}
            <Pressable style={styles.actionRow} onPress={() => setMsgAction(null)}>
              <Ionicons name="close-outline" size={20} color={colors.textMuted} />
              <Text style={styles.actionRowText}>Annuler</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* Photo en plein écran */}
      <Modal
        visible={fullImage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setFullImage(null)}
      >
        <Pressable style={styles.fullImageOverlay} onPress={() => setFullImage(null)}>
          {fullImage && (
            <Image source={{ uri: fullImage }} style={styles.fullImage} contentFit="contain" />
          )}
          <View style={styles.fullImageClose}>
            <Ionicons name="close" size={26} color="#ffffff" />
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerAvatar: { width: 32, height: 32, borderRadius: 16 },
  headerAvatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarLetter: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.primaryDeep,
    maxWidth: 200,
  },
  list: { padding: spacing.md, gap: 6, flexGrow: 1 },
  emptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xl,
    fontSize: 15,
  },
  msgColMine: { alignSelf: 'flex-end', alignItems: 'flex-end', maxWidth: '78%' },
  msgColTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start', maxWidth: '78%' },
  bubble: {
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  reactionsPill: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: -6,
    marginHorizontal: 6,
  },
  reactionText: { fontSize: 13 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
    marginRight: 4,
  },
  statusText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  actionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(14,15,12,.55)',
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  actionCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.sm,
  },
  emojiBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiText: { fontSize: 24 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.xs,
  },
  actionRowText: { fontSize: 16, color: colors.text },
  actionRowTextDanger: { fontSize: 16, color: colors.danger, fontWeight: '600' },
  bubbleText: { fontSize: 15, color: colors.text, lineHeight: 21 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 42,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.danger,
  },
  recordingText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  voiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
    minWidth: 120,
  },
  voiceText: { fontSize: 14, fontWeight: '600' },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleMedia: { padding: 3, backgroundColor: 'transparent', borderWidth: 0 },
  mediaBubble: {
    width: 210,
    height: 270,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  fullImageOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: { width: '100%', height: '85%' },
  fullImageClose: {
    position: 'absolute',
    top: 54,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
