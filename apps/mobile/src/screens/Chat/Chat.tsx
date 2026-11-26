import { Ionicons } from '@expo/vector-icons';
import {
  AudioModule,
  RecordingPresets,
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
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { PhotoViewer } from '@/components/PhotoViewer';
import { ProfileDetailModal } from '@/components/ProfileDetailModal';
import { ReportModal } from '@/components/ReportModal';
import { Centered, VerifiedBadge } from '@/components/ui';
import { useAuth } from '@/providers/auth';
import { claimAudioFocus, releaseAudioFocus } from '@/utils/audioSession';
import { cacheGet, cacheSet } from '@/utils/cache';
import { setActiveChatMatchId } from '@/services/notifications';
import { haptic } from '@/utils/haptics';
import { useKeyboardInset } from '@/hooks/useKeyboardInset';
import { realtimeChannel, supabase } from '@/services/supabase';
import { colors, keyboardAppearance } from '@/theme';
import { timeAgo, type Message, type Reaction, type ViewableProfile } from '@/types';
import { afterInteractions } from '@/utils/afterInteractions';
import { styles } from './Chat.styles';
import { safeBack } from '@/utils/safeBack';

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
function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// ---------------------------------------------------------------------------
// Une seule lecture à la fois
//
// Notes vocales et vidéos s'inscrivent ici quand elles démarrent. Lancer une
// lecture arrête celle qui jouait : deux voix ne se superposent jamais.
// Démarrer un enregistrement coupe aussi tout ce qui joue.
// ---------------------------------------------------------------------------
type PlaybackOwner = object;
let nowPlaying: { owner: PlaybackOwner; stop: () => void } | null = null;

function claimPlayback(owner: PlaybackOwner, stop: () => void) {
  if (nowPlaying && nowPlaying.owner !== owner) {
    try {
      nowPlaying.stop();
    } catch {
      // lecteur déjà libéré : rien à arrêter
    }
  }
  nowPlaying = { owner, stop };
}

function releasePlayback(owner: PlaybackOwner) {
  if (nowPlaying?.owner === owner) nowPlaying = null;
}

function stopAllPlayback() {
  const current = nowPlaying;
  nowPlaying = null;
  try {
    current?.stop();
  } catch {
    // déjà arrêté
  }
}

// Onde de la note vocale : des barres de hauteur fixe tirées du chemin du
// fichier, pour que chaque note ait sa silhouette et la garde d'un rendu à
// l'autre. La partie écoutée se remplit au fil de la lecture.
const WAVE_BARS = 24;
function waveFor(path: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < path.length; i++) {
    h ^= path.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const bars: number[] = [];
  for (let i = 0; i < WAVE_BARS; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    bars.push(0.25 + ((h >>> 0) % 1000) / 1333);
  }
  return bars;
}

// Bulle de note vocale : lecture/pause, onde qui se remplit, durée.
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
  const [owner] = useState<PlaybackOwner>(() => ({}));
  const [bars] = useState(() => waveFor(path));
  const fg = mine ? '#ffffff' : colors.text;
  const dim = mine ? 'rgba(255,255,255,0.45)' : 'rgba(127,110,125,0.45)';

  // La note vocale met la musique de la personne en pause le temps de
  // jouer, puis la lui rend : focus pris avant play(), rendu dès que la
  // lecture s'arrête (fin, pause, interruption système, démontage).
  const holdsFocus = useRef(false);
  useEffect(() => {
    if (!status.playing) {
      releasePlayback(owner);
      if (holdsFocus.current) {
        holdsFocus.current = false;
        releaseAudioFocus();
      }
    }
  }, [status.playing, owner]);
  useEffect(
    () => () => {
      releasePlayback(owner);
      if (holdsFocus.current) {
        holdsFocus.current = false;
        releaseAudioFocus();
      }
    },
    [owner],
  );

  const toggle = async () => {
    haptic.tap();
    if (status.playing) {
      player.pause();
      return;
    }
    // Arrête la note ou la vidéo qui jouait avant de lancer celle-ci.
    claimPlayback(owner, () => player.pause());
    // didJustFinish ne dure qu'un instant : on se fie à la position réelle.
    // Une note lue jusqu'au bout reste calée à la fin, play() n'y jouerait
    // rien, il faut revenir au début pour pouvoir la réécouter.
    const dur = player.duration || status.duration;
    const atEnd =
      status.didJustFinish || (dur > 0 && player.currentTime >= dur - 0.25);
    if (atEnd) await player.seekTo(0);
    if (!holdsFocus.current) {
      holdsFocus.current = true;
      await claimAudioFocus();
    }
    player.play();
  };

  const progress =
    status.duration > 0 ? Math.min(1, Math.max(0, status.currentTime / status.duration)) : 0;
  const shownSecs =
    status.playing || status.currentTime > 0 ? status.currentTime : status.duration;

  return (
    <Pressable
      style={styles.voiceRow}
      onPress={toggle}
      onLongPress={onLongPress}
      delayLongPress={280}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? 'Mettre la note vocale en pause' : 'Écouter la note vocale'}
    >
      <View style={[styles.voicePlay, mine ? styles.voicePlayMine : styles.voicePlayTheirs]}>
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={16}
          color={mine ? colors.accent : '#ffffff'}
          style={!status.playing && { marginLeft: 2 }}
        />
      </View>
      <View style={styles.wave}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={[
              styles.waveBar,
              { height: 4 + h * 20, backgroundColor: i / WAVE_BARS < progress ? fg : dim },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.voiceText, { color: fg }]}>{formatSeconds(shownSecs)}</Text>
    </Pressable>
  );
}

// Bulle vidéo : lecteur inline avec contrôles natifs.
function VideoBubble({ path }: { path: string }) {
  const player = useVideoPlayer(chatMediaUrl(path), (p) => {
    // Ne coupe la musique que pendant qu'elle joue avec le son (le défaut
    // natif iOS, doNotMix, la couperait même à l'arrêt).
    p.audioMixingMode = 'auto';
  });
  const [owner] = useState<PlaybackOwner>(() => ({}));
  // expo-video prend le focus quand la vidéo joue mais ne le rend jamais :
  // on le rend nous-mêmes à l'arrêt pour que la musique reprenne.
  const holdsFocus = useRef(false);
  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }) => {
      if (isPlaying) {
        // Une vidéo qui démarre coupe la note vocale en cours, et inversement.
        claimPlayback(owner, () => player.pause());
        if (!holdsFocus.current) {
          holdsFocus.current = true;
          claimAudioFocus();
        }
      } else {
        releasePlayback(owner);
        if (holdsFocus.current) {
          holdsFocus.current = false;
          releaseAudioFocus();
        }
      }
    });
    return () => {
      sub.remove();
      releasePlayback(owner);
      if (holdsFocus.current) {
        holdsFocus.current = false;
        releaseAudioFocus();
      }
    };
  }, [player, owner]);
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

// Un message fait d'emojis seuls (jusqu'à 6) s'affiche en grand, sans bulle.
let EMOJI_ONLY: RegExp | null = null;
try {
  EMOJI_ONLY = new RegExp('^(?:\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\u200d|\\ufe0f|\\s)+$', 'u');
} catch {
  EMOJI_ONLY = null;
}
function isEmojiOnly(text: string | null): boolean {
  if (!text || !EMOJI_ONLY) return false;
  const t = text.trim();
  if (!t || /[0-9#*]/.test(t) || !EMOJI_ONLY.test(t)) return false;
  return Array.from(t.replace(/[\s‍️]/g, '')).length <= 6;
}

// Repère horaire centré : l'heure seule aujourd'hui, le jour et l'heure dans
// la semaine, la date au-delà. Ex. « MAR. 12:08 ».
const MONTHS_SHORT = [
  'JANV.', 'FÉVR.', 'MARS', 'AVR.', 'MAI', 'JUIN',
  'JUIL.', 'AOÛT', 'SEPT.', 'OCT.', 'NOV.', 'DÉC.',
];
const TIME_GAP_MS = 60 * 60 * 1000;
const GROUP_GAP_MS = 10 * 60 * 1000;
function formatStamp(iso: string): string {
  const d = new Date(iso);
  const time = formatTime(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return time;
  const days = (now.getTime() - d.getTime()) / 86400000;
  if (days < 7) return `${DAYS[d.getDay()].toUpperCase()} ${time}`;
  const date = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear()
    ? `${date} ${time}`
    : `${date} ${d.getFullYear()} ${time}`;
}

// Position d'un message dans sa grappe : les coins intérieurs se resserrent
// pour que les bulles d'une même personne se lisent comme un seul bloc.
type GroupPos = 'single' | 'first' | 'middle' | 'last';

function cornerStyle(mine: boolean, pos: GroupPos) {
  const big = 20;
  const small = 5;
  const topInner = pos === 'middle' || pos === 'last' ? small : big;
  const bottomInner = pos === 'first' || pos === 'middle' ? small : big;
  return mine
    ? {
        borderTopLeftRadius: big,
        borderBottomLeftRadius: big,
        borderTopRightRadius: topInner,
        borderBottomRightRadius: bottomInner,
      }
    : {
        borderTopRightRadius: big,
        borderBottomRightRadius: big,
        borderTopLeftRadius: topInner,
        borderBottomLeftRadius: bottomInner,
      };
}

// Petite photo ronde de l'autre personne, posée au pied de sa grappe.
function TinyAvatar({ path, name, size }: { path?: string; name?: string; size: number }) {
  return path ? (
    <Image
      source={{ uri: photoUrl(path) }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      cachePolicy="memory-disk"
    />
  ) : (
    <View
      style={[
        styles.tinyFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.tinyFallbackText, { fontSize: size * 0.45 }]}>
        {name?.[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
}

// Un message et ses satellites : repère horaire, avatar, réactions, état.
// Mémoïsée : la frappe dans le composeur ou l'arrivée d'un message ne
// re-rend plus tout l'historique, seulement les lignes qui changent.
const MessageRow = React.memo(function MessageRow({
  item,
  mine,
  stamp,
  pos,
  msgReactions,
  status,
  otherPhoto,
  otherName,
  onLongPress,
  onOpenImage,
}: {
  item: Message;
  mine: boolean;
  // Repère horaire à afficher au-dessus, ou null.
  stamp: string | null;
  pos: GroupPos;
  msgReactions: Reaction[];
  // État sous mon dernier message : envoi, envoyé, ou vu.
  status: 'pending' | 'sent' | 'seen' | null;
  otherPhoto?: string;
  otherName?: string;
  onLongPress: (m: Message) => void;
  onOpenImage: (url: string) => void;
}) {
  // Toucher une bulle montre son heure exacte, comme dans les messageries.
  const [showTime, setShowTime] = useState(false);
  const isMedia = item.media_path && (item.kind === 'image' || item.kind === 'video');
  const bigEmoji = item.kind === 'text' && isEmojiOnly(item.content);
  const tail = pos === 'single' || pos === 'last';
  const grouped = pos === 'middle' || pos === 'last';

  const body =
    item.kind === 'audio' && item.media_path ? (
      <VoiceBubble path={item.media_path} mine={mine} onLongPress={() => onLongPress(item)} />
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
    ) : bigEmoji ? (
      <Text style={styles.bigEmoji}>{item.content}</Text>
    ) : (
      <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.content}</Text>
    );

  return (
    <View style={grouped ? styles.rowGrouped : styles.rowNewGroup}>
      {!!stamp && <Text style={styles.stamp}>{stamp}</Text>}
      <View style={[styles.msgLine, mine ? styles.msgLineMine : styles.msgLineTheirs]}>
        {/* Colonne avatar : la photo n'apparaît qu'au pied de la grappe. */}
        {!mine && (
          <View style={styles.avatarCol}>
            {tail && <TinyAvatar path={otherPhoto} name={otherName} size={28} />}
          </View>
        )}
        <View style={mine ? styles.msgColMine : styles.msgColTheirs}>
          <Pressable
            onPress={() => setShowTime((v) => !v)}
            onLongPress={() => onLongPress(item)}
            delayLongPress={280}
            style={({ pressed }) => [
              bigEmoji
                ? styles.emojiBubble
                : [
                    styles.bubble,
                    mine ? styles.bubbleMine : styles.bubbleTheirs,
                    cornerStyle(mine, pos),
                    isMedia && styles.bubbleMedia,
                    item.pending && styles.bubblePending,
                  ],
              pressed && { opacity: 0.85 },
            ]}
          >
            {body}
          </Pressable>
          {msgReactions.length > 0 && (
            <View style={[styles.reactionsPill, mine ? styles.reactionsMine : styles.reactionsTheirs]}>
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
          {showTime && <Text style={styles.tapTime}>{formatStamp(item.created_at)}</Text>}
        </View>
      </View>
      {/* Sous mon dernier message : la photo de l'autre quand c'est lu,
          sinon depuis quand c'est parti. */}
      {status === 'seen' ? (
        <View style={styles.seenRow}>
          <TinyAvatar path={otherPhoto} name={otherName} size={16} />
        </View>
      ) : status ? (
        <Text style={styles.statusText}>
          {status === 'pending' ? 'Envoi…' : `Envoyé ${timeAgo(item.created_at)}`}
        </Text>
      ) : null}
    </View>
  );
});

// Pastille rouge qui pulse pendant l'enregistrement, doublée d'une onde qui
// s'évase : le rythme dit « micro ouvert » sans chiffre ni spinner.
function RecordingDot() {
  const [pulse] = useState(() => new Animated.Value(0));

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
//
// Gabarit des messageries : « + » pour joindre une photo ou une vidéo, champ
// arrondi avec le micro à l'intérieur, et à droite l'envoi quand il y a du
// texte, sinon un coeur envoyé d'un seul geste.
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
  const hasText = !!draft.trim();

  const submit = async () => {
    const content = draft.trim();
    if (!content || sending) return;
    haptic.impact();
    setDraft('');
    const ok = await onSendText(content);
    // Échec d'envoi : le texte revient dans le champ.
    if (!ok) setDraft(content);
  };

  const sendHeart = () => {
    if (sending) return;
    haptic.impact();
    onSendText('❤️');
  };

  return (
    <View style={styles.composer}>
      <Pressable
        style={({ pressed }) => [styles.iconBtn, (pressed || sendingMedia) && { opacity: 0.5 }]}
        onPress={onPickMedia}
        disabled={sendingMedia}
        hitSlop={6}
        accessibilityLabel="Envoyer une photo ou une vidéo"
      >
        {sendingMedia ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Ionicons name="add-circle" size={30} color={colors.accent} />
        )}
      </Pressable>
      <View style={styles.inputPill}>
        <TextInput
          keyboardAppearance={keyboardAppearance}
          style={styles.input}
          placeholder="Message"
          placeholderTextColor={colors.textMuted}
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={2000}
        />
        {!hasText && (
          <Pressable
            onPress={onStartRecording}
            disabled={sending}
            hitSlop={8}
            style={({ pressed }) => [styles.inPillBtn, pressed && { opacity: 0.5 }]}
            accessibilityLabel="Enregistrer une note vocale"
          >
            <Ionicons name="mic" size={22} color={colors.accent} />
          </Pressable>
        )}
      </View>
      <Pressable
        style={({ pressed }) => [
          styles.iconBtn,
          (sending || pressed) && { opacity: 0.5 },
          pressed && { transform: [{ scale: 0.9 }] },
        ]}
        onPress={hasText ? submit : sendHeart}
        disabled={sending}
        hitSlop={6}
        accessibilityLabel={hasText ? 'Envoyer' : 'Envoyer un coeur'}
      >
        <Ionicons name={hasText ? 'send' : 'heart'} size={hasText ? 24 : 28} color={colors.accent} />
      </Pressable>
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
    const task = afterInteractions(() => {
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
    const deferred = afterInteractions(() => {
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
    // Plus rien ne joue pendant qu'on parle.
    stopAllPlayback();
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Micro non autorisé', 'Autorise le micro pour envoyer des notes vocales.');
      return;
    }
    try {
      // Le micro prend le focus : la musique se tait le temps de parler,
      // sinon elle serait captée par l'enregistrement.
      await claimAudioFocus({ recording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecordSecs(0);
      setRecording(true);
    } catch {
      await releaseAudioFocus();
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
    await releaseAudioFocus();
  }, [recorder]);

  const sendRecording = useCallback(async () => {
    if (!matchId || sending) return;
    // Même sensation que l'envoi d'un texte : l'appui sur « envoyer » compte.
    haptic.impact();
    setSending(true);
    setRecording(false);
    try {
      await recorder.stop();
      await releaseAudioFocus();
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
          safeBack(router);
        },
      },
      {
        text: 'Supprimer le match',
        style: 'destructive',
        onPress: async () => {
          if (!matchId) return;
          await unmatch(matchId).catch(() => {});
          safeBack(router);
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
      safeBack(router);
    } catch {
      Alert.alert('Erreur', 'Impossible de signaler ce profil.');
    }
  };

  // L'état détaillé (Distribué / Lu) ne s'écrit que sous mon dernier message :
  // les coches suffisent sur les précédents, l'écran reste léger.
  const lastMineId = [...messages].reverse().find((m) => m.sender_id === myId)?.id;
  const lastId = messages[messages.length - 1]?.id;

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
              onPress={() => safeBack(router)}
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
              const next = index < messages.length - 1 ? messages[index + 1] : null;
              const at = (m: Message) => new Date(m.created_at).getTime();
              // Repère horaire : nouveau jour, ou plus d'une heure de silence.
              const breaks = (a: Message, b: Message) =>
                !sameDay(a.created_at, b.created_at) || at(b) - at(a) > TIME_GAP_MS;
              const stamp = !prev || breaks(prev, item) ? formatStamp(item.created_at) : null;
              // Grappe : même personne, sans repère entre deux, à moins de 10 min.
              const joinsPrev =
                !!prev && !stamp && prev.sender_id === item.sender_id && at(item) - at(prev) < GROUP_GAP_MS;
              const joinsNext =
                !!next &&
                !breaks(item, next) &&
                next.sender_id === item.sender_id &&
                at(next) - at(item) < GROUP_GAP_MS;
              const pos: GroupPos = joinsPrev
                ? joinsNext
                  ? 'middle'
                  : 'last'
                : joinsNext
                  ? 'first'
                  : 'single';
              const mine = item.sender_id === myId;
              // L'état ne s'écrit que sous mon dernier message, s'il clôt le fil.
              const status =
                mine && item.id === lastMineId && item.id === lastId
                  ? item.pending
                    ? 'pending'
                    : item.read_at
                      ? 'seen'
                      : 'sent'
                  : null;
              return (
                <MessageRow
                  item={item}
                  mine={mine}
                  stamp={stamp}
                  pos={pos}
                  msgReactions={reactions[item.id] ?? EMPTY_REACTIONS}
                  status={status}
                  otherPhoto={photoPath || undefined}
                  otherName={name}
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

      {/* Photo en plein écran : la même galerie que sur les profils. */}
      <PhotoViewer
        uris={fullImage ? [fullImage] : null}
        onClose={() => setFullImage(null)}
      />
    </SafeAreaView>
  );
}
