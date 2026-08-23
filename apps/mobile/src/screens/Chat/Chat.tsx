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
  Animated,
  Easing,
  FlatList,
  InteractionManager,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  blockUser,
  chatMediaUrl,
  deleteMessage,
  getMatchState,
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
} from '@/services/api';
import { DoweMark } from '@/components/DoweLogo';
import { ProfileDetailModal } from '@/components/ProfileDetailModal';
import { ReportModal } from '@/components/ReportModal';
import { Centered, VerifiedBadge } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { cacheGet, cacheSet } from '@/utils/cache';
import { setActiveChatMatchId } from '@/services/notifications';
import { haptic } from '@/utils/haptics';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { realtimeChannel, supabase } from '@/services/supabase';
import { colors, isDark } from '@/theme';
import type { Message, Reaction, ViewableProfile } from '@/types';
import { styles } from './Chat.styles';

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

// Papier peint Velours : filigrane d'empreintes DoweMark, très discret,
// en positions déterministes derrière la liste. C'est le motif signature
// de Dowe, à la place de tout motif emprunté.
const WALL_PRINTS: { top: `${number}%`; left: `${number}%`; size: number; rotate: number }[] = [
  { top: '3%', left: '6%', size: 110, rotate: -14 },
  { top: '10%', left: '62%', size: 90, rotate: 12 },
  { top: '26%', left: '26%', size: 130, rotate: 8 },
  { top: '38%', left: '70%', size: 74, rotate: -10 },
  { top: '52%', left: '4%', size: 96, rotate: 16 },
  { top: '62%', left: '56%', size: 120, rotate: -8 },
  { top: '80%', left: '18%', size: 70, rotate: 10 },
  { top: '86%', left: '68%', size: 100, rotate: -16 },
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

// Repli stable pour la mémoïsation : une nouvelle [] à chaque rendu
// casserait React.memo sur toutes les bulles sans réaction.
const EMPTY_REACTIONS: Reaction[] = [];

// Une bulle et ses satellites (séparateur de date, réactions, état d'envoi).
// Mémoïsée : la frappe dans le composeur ou l'arrivée d'un message ne
// re-rend plus tout l'historique, seulement les lignes qui changent.
const MessageRow = React.memo(function MessageRow({
  item,
  mine,
  prevCreatedAt,
  prevSenderId,
  msgReactions,
  isLastMine,
  onLongPress,
  onOpenImage,
}: {
  item: Message;
  mine: boolean;
  prevCreatedAt: string | null;
  prevSenderId: string | null;
  msgReactions: Reaction[];
  isLastMine: boolean;
  onLongPress: (m: Message) => void;
  onOpenImage: (url: string) => void;
}) {
  const isMedia = item.media_path && (item.kind === 'image' || item.kind === 'video');
  const newDay = !prevCreatedAt || !sameDay(prevCreatedAt, item.created_at);
  // Un peu plus d'air quand la parole change de côté.
  const newGroup = !!prevCreatedAt && !newDay && prevSenderId !== item.sender_id;
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
          <Ionicons name="checkmark-done" size={13} color="rgba(255,255,255,0.9)" />
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
          onLongPress={() => onLongPress(item)}
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
              onLongPress={() => onLongPress(item)}
            />
          ) : item.kind === 'image' && item.media_path ? (
            <Pressable
              onPress={() => onOpenImage(chatMediaUrl(item.media_path!))}
              onLongPress={() => onLongPress(item)}
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
        {isLastMine && (
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
});

// Pastille rouge qui pulse pendant l'enregistrement, doublée d'une onde qui
// s'évase : le rythme dit « micro ouvert » sans chiffre ni spinner.
function RecordingDot() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.recordingDotWrap}>
      <Animated.View
        style={[
          styles.recordingDotHalo,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
            transform: [
              { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.8] }) },
            ],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.recordingDot,
          { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) },
        ]}
      />
    </View>
  );
}

// Barre de saisie isolée avec son propre état de brouillon : taper une
// lettre ne re-rend que cette barre, jamais la liste des bulles.
const ChatComposer = React.memo(function ChatComposer({
  sending,
  sendingMedia,
  onSendText,
  onPickMedia,
  onStartRecording,
}: {
  sending: boolean;
  sendingMedia: boolean;
  onSendText: (content: string) => Promise<boolean>;
  onPickMedia: () => void;
  onStartRecording: () => void;
}) {
  const [draft, setDraft] = useState('');

  const submit = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    haptic.impact();
    setDraft('');
    const ok = await onSendText(content);
    // Échec d'envoi : le texte revient dans le champ.
    if (!ok) setDraft(content);
  };

  return (
    <View style={styles.composer}>
      <Pressable
        style={[styles.attachBtn, sendingMedia && { opacity: 0.5 }]}
        onPress={onPickMedia}
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
          onPress={submit}
          disabled={sending}
        >
          <Ionicons name="paper-plane" size={20} color={colors.textOnAccent} />
        </Pressable>
      ) : (
        <Pressable
          style={[styles.sendBtn, sending && { opacity: 0.5 }]}
          onPress={onStartRecording}
          disabled={sending}
        >
          <Ionicons name="mic" size={20} color={colors.textOnAccent} />
        </Pressable>
      )}
    </View>
  );
});

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
  const insets = useSafeAreaInsets();
  // Android edge-to-edge : hauteur à ajouter sous le composeur pour qu'il
  // reste collé au clavier (voir src/lib/keyboard.ts).
  const keyboardInset = useKeyboardInset();

  // Un DM initial parti et resté sans réponse n'est PAS une conversation :
  // l'expéditeur a payé pour un message, pas pour un fil. Tant que la personne
  // n'a pas répondu, l'écran se lit mais ne s'écrit pas.
  //
  // L'état vient du serveur et non des paramètres de navigation, parce que
  // tous les chemins d'arrivée ne passent pas par un écran de l'app : lien
  // profond, appui sur une notification, navigation restaurée au redémarrage.
  // Un paramètre de route se falsifie ; `matches` non, RLS ne laisse lire que
  // les miens. `null` = on ne sait pas encore, on n'affiche rien plutôt que de
  // faire clignoter un composeur qui va disparaître.
  const [locked, setLocked] = useState<boolean | null>(null);
  useEffect(() => {
    if (!matchId || !myId) return;
    let cancelled = false;
    getMatchState(matchId)
      .then((state) => {
        if (cancelled) return;
        setLocked(state?.status === 'pending' && state.initiated_by === myId);
      })
      // Serveur injoignable : on verrouille. Entre laisser passer un message
      // gratuit et refuser un envoi légitime, c'est le refus qui se rattrape.
      .catch(() => {
        if (!cancelled) setLocked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [matchId, myId]);

  // Signale la conversation ouverte : les push de ce match n'affichent pas
  // de bannière tant qu'on est dessus (voir le handler dans lib/notifications).
  useEffect(() => {
    if (!matchId) return;
    setActiveChatMatchId(matchId);
    return () => setActiveChatMatchId(null);
  }, [matchId]);

  // Quand le clavier sort, on garde la fin de la conversation visible
  // (après que le padding du composeur s'est posé).
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    });
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
    // Purement cosmétique : ce fetch attend que le premier rendu soit posé.
    const task = InteractionManager.runAfterInteractions(() => {
      getProfileView(otherId)
        .then((p) => setOtherVerified(!!p?.is_verified))
        .catch(() => {});
    });
    return () => task.cancel();
  }, [resolveOtherId]);

  const applyReaction = useCallback((r: Reaction) => {
    setReactions((prev) => {
      const list = (prev[r.message_id] ?? []).filter((x) => x.user_id !== r.user_id);
      return { ...prev, [r.message_id]: [...list, r] };
    });
  }, []);

  // Ce que les écoutes temps réel consultent au moment où un événement tombe.
  // Passer par des refs garde l'abonnement stable : sans ça, l'arrivée de
  // `myId` (null au premier rendu) relançait l'effet et redemandait un canal
  // du même nom pendant que le précédent se fermait encore.
  const myIdRef = useRef(myId);
  const applyReactionRef = useRef(applyReaction);
  useEffect(() => {
    myIdRef.current = myId;
    applyReactionRef.current = applyReaction;
  }, [myId, applyReaction]);

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
    // Rien de tout ça ne conditionne le premier affichage : les réactions et
    // le marquage lu partent une fois l'écran posé, sans gêner l'ouverture.
    const deferred = InteractionManager.runAfterInteractions(() => {
      getReactions(matchId)
        .then((list) => {
          const grouped: Record<number, Reaction[]> = {};
          for (const r of list) (grouped[r.message_id] ??= []).push(r);
          setReactions(grouped);
        })
        .catch(() => {});
      markMessagesRead(matchId);
    });

    const channel = realtimeChannel(`chat-${matchId}`)
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
          if (msg.sender_id !== myIdRef.current) {
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
          applyReactionRef.current(payload.new as Reaction);
        },
      )
      .subscribe();

    return () => {
      deferred.cancel();
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // La fin de conversation reste en cache locale à mesure qu'elle évolue :
  // rouvrir le chat montre l'historique dans le même état qu'en le quittant,
  // sans attendre le réseau. Les bulles provisoires n'y entrent pas.
  useEffect(() => {
    if (!matchId || !messages.length) return;
    cacheSet(`messages:${matchId}`, messages.filter((m) => !m.pending).slice(-50));
  }, [messages, matchId]);

  // Envoi optimiste : la bulle apparaît sous le doigt, marquée d'une petite
  // horloge, avant la réponse du serveur. La ligne serveur la remplace dès
  // qu'elle existe ; en cas d'échec la bulle disparaît et le composeur
  // remet le texte dans le champ (retour `false`).
  const sendText = useCallback(
    async (content: string): Promise<boolean> => {
      if (!matchId || !myId) return false;
      setSending(true);
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
        return true;
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        Alert.alert('Erreur', "Le message n'a pas pu être envoyé.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [matchId, myId],
  );

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
    // Retour haptique dès l'appui sur le micro : la main sait que
    // l'enregistrement démarre avant même que l'interface bascule.
    haptic.impact();
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
    haptic.tap();
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
    // Même sensation que l'envoi d'un texte : l'appui sur « envoyer » compte.
    haptic.impact();
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

  // Poignées stables passées aux bulles mémoïsées : leur identité ne doit
  // pas changer à chaque rendu, sinon React.memo ne sert à rien.
  const openMsgAction = useCallback((m: Message) => setMsgAction(m), []);
  const openImage = useCallback((url: string) => setFullImage(url), []);

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
          // Chevron de retour, comme la maquette. La cible tactile est une
          // vraie boîte de 44 points et non un `hitSlop` : le débordement d'un
          // hitSlop se fait rogner par le conteneur du header sur Android, ce
          // qui laissait une zone utile de la taille de l'icône, contre le
          // bord de l'écran.
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Fermer la conversation"
            >
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
            <Pressable
              onPress={openMenu}
              style={styles.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Options de la conversation"
            >
              <Ionicons name="ellipsis-vertical" size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      {/* Papier peint : filigrane d'empreintes Dowe, purement décoratif */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {WALL_PRINTS.map((p, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              top: p.top,
              left: p.left,
              opacity: isDark ? 0.05 : 0.04,
              transform: [{ rotate: `${p.rotate}deg` }],
            }}
          >
            <DoweMark size={p.size} color={colors.primaryDeep} strokeWidth={1.6} />
          </View>
        ))}
      </View>
      <KeyboardAvoidingView
        style={styles.container}
        // iOS seulement : sur Android, l'edge-to-edge du SDK 54 rend le
        // KeyboardAvoidingView inopérant, c'est useKeyboardInset qui pousse
        // le composeur (jamais les deux à la fois : pas de double décalage).
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            // Historique plafonné à ~50 messages : des fenêtres de rendu
            // modérées suffisent et allègent le premier affichage.
            initialNumToRender={25}
            maxToRenderPerBatch={25}
            windowSize={11}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {"C'est un match ! Envoie le premier message."}
              </Text>
            }
            renderItem={({ item, index }) => {
              const prev = index > 0 ? messages[index - 1] : null;
              return (
                <MessageRow
                  item={item}
                  mine={item.sender_id === myId}
                  prevCreatedAt={prev?.created_at ?? null}
                  prevSenderId={prev?.sender_id ?? null}
                  msgReactions={reactions[item.id] ?? EMPTY_REACTIONS}
                  isLastMine={item.sender_id === myId && item.id === lastMineId}
                  onLongPress={openMsgAction}
                  onOpenImage={openImage}
                />
              );
            }}
          />
        )}

        {/* Sur Android, ce cadre pousse le composeur juste au-dessus du
            clavier ; sur iOS il ne fait rien (KeyboardAvoidingView s'en
            charge), l'inset restant à zéro. */}
        <View
          style={
            Platform.OS === 'android' && keyboardInset > 0
              ? { paddingBottom: keyboardInset }
              : null
          }
        >
          {locked === null ? null : locked ? (
            // Aucun composeur, aucun bouton média, aucun micro : il n'y a rien
            // à rouvrir tant que la personne n'a pas répondu.
            <View style={styles.lockedNotice}>
              <Ionicons name="paper-plane-outline" size={18} color={colors.textMuted} />
              <Text style={styles.lockedNoticeText}>
                Ton message est parti. Tu pourras écrire à nouveau dès que{' '}
                {name ?? 'cette personne'} aura répondu.
              </Text>
            </View>
          ) : recording ? (
            <View style={styles.composer}>
              <View style={styles.recordingPill}>
                <RecordingDot />
                <Text style={styles.recordingTimer}>{formatSeconds(recordSecs)}</Text>
                <Text style={styles.recordingLabel} numberOfLines={1}>
                  Note vocale…
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
            <ChatComposer
              sending={sending}
              sendingMedia={sendingMedia}
              onSendText={sendText}
              onPickMedia={pickAndSendMedia}
              onStartRecording={startRecording}
            />
          )}
        </View>
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
          {/* Ce bouton était une simple View : il n'avait aucun onPress et ne
              fermait que par ricochet, via le tap du fond. Posé en plus à 54
              points du haut — une valeur en dur — il tombait sous l'encoche sur
              les grands écrans, là où le tap ne portait plus. Vrai Pressable,
              et départ à l'inset réel. */}
          <Pressable
            style={[styles.fullImageClose, { top: Math.max(insets.top, 12) + 8 }]}
            onPress={() => setFullImage(null)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fermer la photo"
          >
            <Ionicons name="close" size={26} color="#ffffff" />
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
