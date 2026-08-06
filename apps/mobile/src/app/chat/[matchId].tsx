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
import { Centered, VerifiedBadge } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { cacheGet, cacheSet } from '../../lib/cache';
import { haptic } from '../../lib/haptics';
import { supabase } from '../../lib/supabase';
import { colors, isDark, radius, spacing } from '../../theme';
import type { Message, Reaction, ViewableProfile } from '../../types';

const REACTION_EMOJIS = ['❤️', '😂', '😍', '😮', '😢', '👍'];

function formatSeconds(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Heure courte « 14:05 » affichée dans la bulle.
function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const DAYS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

// Libellé des séparateurs de date, ex. « Dim. 02 Août ».
function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}`;
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// Papier peint : grille déterministe de coeurs très discrets derrière la liste.
const WALL_HEARTS: { top: `${number}%`; left: `${number}%`; size: number; rotate: number }[] = [
  { top: '2%', left: '10%', size: 26, rotate: -12 },
  { top: '4%', left: '62%', size: 30, rotate: 10 },
  { top: '11%', left: '34%', size: 22, rotate: 6 },
  { top: '13%', left: '86%', size: 26, rotate: -8 },
  { top: '20%', left: '6%', size: 32, rotate: 8 },
  { top: '23%', left: '54%', size: 24, rotate: -14 },
  { top: '30%', left: '28%', size: 28, rotate: 12 },
  { top: '32%', left: '78%', size: 34, rotate: -6 },
  { top: '40%', left: '10%', size: 24, rotate: -10 },
  { top: '42%', left: '58%', size: 26, rotate: 8 },
  { top: '49%', left: '34%', size: 30, rotate: -12 },
  { top: '52%', left: '84%', size: 22, rotate: 14 },
  { top: '59%', left: '6%', size: 28, rotate: 10 },
  { top: '61%', left: '52%', size: 32, rotate: -8 },
  { top: '69%', left: '26%', size: 24, rotate: 6 },
  { top: '71%', left: '80%', size: 28, rotate: -12 },
  { top: '78%', left: '8%', size: 34, rotate: -6 },
  { top: '81%', left: '56%', size: 22, rotate: 12 },
  { top: '88%', left: '32%', size: 26, rotate: -10 },
  { top: '90%', left: '82%', size: 30, rotate: 8 },
];

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

  // Badge bleu de l'en-tête : le statut vérifié n'arrive pas par les params
  // de route, on le lit une seule fois depuis le profil de l'autre personne.
  const [otherVerified, setOtherVerified] = useState(false);
  const verifiedFetched = useRef(false);
  useEffect(() => {
    if (verifiedFetched.current) return;
    const otherId = resolveOtherId();
    if (!otherId) return;
    verifiedFetched.current = true;
    getProfileView(otherId)
      .then((p) => setOtherVerified(!!p?.is_verified))
      .catch(() => {});
  }, [resolveOtherId]);

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
          headerBackVisible: false,
          gestureEnabled: true,
          // Chevron de retour, comme la maquette.
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </Pressable>
          ),
          headerTitle: () => (
            <Pressable style={styles.headerTitle} onPress={openProfile} hitSlop={6}>
              <View>
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
                {/* Badge certifié posé en bas à gauche de l'avatar */}
                {otherVerified && (
                  <View style={styles.headerBadge}>
                    <VerifiedBadge size={14} />
                  </View>
                )}
              </View>
              <Text style={styles.headerName} numberOfLines={1}>
                {name ?? 'Discussion'}
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={openMenu} hitSlop={12}>
              <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      {/* Papier peint : coeurs répétés, purement décoratif */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {WALL_HEARTS.map((h, i) => (
          <Ionicons
            key={i}
            name="heart-outline"
            size={h.size}
            color={colors.accent}
            style={{
              position: 'absolute',
              top: h.top,
              left: h.left,
              opacity: isDark ? 0.04 : 0.05,
              transform: [{ rotate: `${h.rotate}deg` }],
            }}
          />
        ))}
      </View>
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
                {"C'est un match ! Envoie le premier message."}
              </Text>
            }
            renderItem={({ item, index }) => {
              const mine = item.sender_id === myId;
              const isMedia =
                item.media_path && (item.kind === 'image' || item.kind === 'video');
              const msgReactions = reactions[item.id] ?? [];
              const prev = index > 0 ? messages[index - 1] : null;
              const newDay = !prev || !sameDay(prev.created_at, item.created_at);
              // Un peu plus d'air quand la parole change de côté.
              const newGroup = !!prev && !newDay && prev.sender_id !== item.sender_id;
              const metaColor = mine ? 'rgba(255,255,255,0.75)' : colors.textMuted;
              // Heure dans la bulle ; pour mes messages, suivie de l'état :
              // horloge le temps de l'envoi, une coche quand le serveur l'a
              // distribué, deux coches claires quand l'autre l'a lu.
              const meta = (
                <>
                  <Text
                    style={[
                      styles.metaTime,
                      { color: isMedia ? 'rgba(255,255,255,0.9)' : metaColor },
                    ]}
                  >
                    {formatTime(item.created_at)}
                  </Text>
                  {mine &&
                    (item.pending ? (
                      <Ionicons
                        name="time-outline"
                        size={12}
                        color={isMedia ? 'rgba(255,255,255,0.9)' : metaColor}
                      />
                    ) : item.read_at ? (
                      <Ionicons name="checkmark-done" size={13} color="#fbcfe8" />
                    ) : (
                      <Ionicons
                        name="checkmark"
                        size={13}
                        color={isMedia ? 'rgba(255,255,255,0.9)' : metaColor}
                      />
                    ))}
                </>
              );
              return (
                <View style={newGroup && styles.groupGap}>
                  {/* Séparateur de date : pilule centrée « Dim. 02 Août » */}
                  {newDay && (
                    <View style={styles.dayRow}>
                      <Text style={styles.dayPill}>{formatDayLabel(item.created_at)}</Text>
                    </View>
                  )}
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
                      {/* Sur les médias, l'heure se pose sur l'image dans une
                          petite pastille sombre ; sinon en pied de bulle. */}
                      {isMedia ? (
                        <View style={styles.mediaMeta}>{meta}</View>
                      ) : (
                        <View style={styles.metaRow}>{meta}</View>
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
                    {/* Le libellé d'état n'accompagne que mon dernier message. */}
                    {mine && item.id === lastMineId && (
                      <Text
                        style={[
                          styles.statusText,
                          !item.pending && item.read_at !== null && { color: colors.accent },
                        ]}
                      >
                        {item.pending ? 'Envoi…' : item.read_at ? 'Lu' : 'Distribué'}
                      </Text>
                    )}
                  </View>
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
              <Ionicons name="paper-plane" size={20} color={colors.textOnAccent} />
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
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="image-outline" size={22} color={colors.accent} />
              )}
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder="Tape ton message"
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
                <Ionicons name="paper-plane" size={20} color={colors.textOnAccent} />
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
  headerAvatar: { width: 38, height: 38, borderRadius: 19 },
  headerAvatarFallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarLetter: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // Pastille du badge certifié, superposée en bas à gauche de l'avatar.
  headerBadge: {
    position: 'absolute',
    bottom: -2,
    left: -3,
    backgroundColor: colors.cardSolid,
    borderRadius: 9,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
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
  // Espace entre deux groupes de parole (6 de gap + 8 = 14).
  groupGap: { marginTop: 8 },
  dayRow: { alignItems: 'center', marginVertical: spacing.sm },
  dayPill: {
    backgroundColor: 'rgba(70,60,70,0.7)',
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  bubble: {
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
    borderBottomRightRadius: 6,
  },
  bubbleTheirs: {
    backgroundColor: colors.cardSolid,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  metaTime: { fontSize: 11 },
  // Sur une photo ou une vidéo : petite pastille sombre en bas à droite.
  mediaMeta: {
    position: 'absolute',
    bottom: 9,
    right: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
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
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 2,
    marginRight: 4,
  },
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
  bubbleText: { fontSize: 16, color: colors.text, lineHeight: 22 },
  // Barre de saisie posée directement sur le fond, sans bandeau.
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 120,
    borderRadius: radius.full,
    backgroundColor: colors.cardSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.cardSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 46,
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
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.cardSolid,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
