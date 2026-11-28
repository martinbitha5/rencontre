import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getTesterProgress, testerCheckin } from '@/services/api';
import { haptic } from '@/utils/haptics';
import { onIntroDone } from '@/utils/introState';
import { colors, flame } from '@/theme';
import type { TesterProgress } from '@/types';

// Programme testeur : 14 jours d'utilisation avant le lancement officiel sur
// Google Play. Chaque jour où le testeur ouvre l'app, une fenêtre lui propose
// de confirmer sa présence d'un appui. Au 14e jour confirmé, sa récompense
// est notée côté serveur (migration 078). Le profil montre le tableau des 14
// cases.
//
// Le client ne compte rien : la date du jour, le nombre de jours et la
// récompense viennent de tester_progress / tester_checkin.
//
// Réservé à Android, seule plateforme en test fermé. Visible aussi sur le web
// en développement pour travailler l'écran.

const ENABLED = Platform.OS === 'android' || (__DEV__ && Platform.OS === 'web');

const INK = '#101113';

// --- État partagé ---------------------------------------------------------
// La fenêtre du jour et la carte du profil lisent le même état : confirmer
// dans l'une met l'autre à jour sans nouvel appel réseau.
let current: TesterProgress | null = null;
const listeners = new Set<(p: TesterProgress | null) => void>();

function publish(p: TesterProgress | null) {
  current = p;
  listeners.forEach((fn) => fn(p));
}

async function refreshProgress(): Promise<TesterProgress | null> {
  try {
    const p = await getTesterProgress();
    publish(p);
    return p;
  } catch {
    return current;
  }
}

function useTesterProgress() {
  const [progress, setProgress] = useState<TesterProgress | null>(current);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    listeners.add(setProgress);
    return () => {
      listeners.delete(setProgress);
    };
  }, []);

  const checkin = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    try {
      const p = await testerCheckin();
      publish(p);
      haptic.success();
      return p;
    } catch {
      setFailed(true);
      haptic.error();
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return { progress, busy, failed, checkin, refresh: refreshProgress };
}

// --- Le tableau des 14 cases ------------------------------------------------
function DaysGrid({ days, required }: { days: number; required: number }) {
  return (
    <View style={styles.grid} accessibilityLabel={`${days} jours confirmés sur ${required}`}>
      {Array.from({ length: required }, (_, i) => {
        const done = i < days;
        const next = i === days;
        return (
          <View
            key={i}
            style={[styles.cell, next && styles.cellNext]}
          >
            {done ? (
              <LinearGradient colors={flame} style={styles.cellFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Ionicons name="checkmark" size={16} color="#ffffff" />
              </LinearGradient>
            ) : (
              <Text style={styles.cellNum}>{i + 1}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function FlameButton({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [styles.btnWrap, pressed && { opacity: 0.9 }]}
      accessibilityRole="button"
    >
      <LinearGradient colors={flame} style={styles.btn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        {busy ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.btnText}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

// --- La fenêtre du jour ------------------------------------------------------
// Montée une fois dans les onglets. Elle s'ouvre après l'intro, puis à chaque
// retour de l'app au premier plan, tant que le jour n'est pas confirmé.
// « Plus tard » la referme jusqu'au prochain retour dans l'app.
export function TesterCheckinPrompt() {
  const { progress, busy, failed, checkin, refresh } = useTesterProgress();
  const [visible, setVisible] = useState(false);
  const [justDone, setJustDone] = useState(false);

  useEffect(() => {
    if (!ENABLED) return;
    const check = async () => {
      const p = await refresh();
      if (p && p.active && !p.checked_today && !p.completed) {
        setJustDone(false);
        setVisible(true);
      }
    };
    const stop = onIntroDone(() => {
      void check();
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [refresh]);

  if (!ENABLED || !progress) return null;

  const confirm = async () => {
    const p = await checkin();
    if (p) setJustDone(true);
  };

  const day = Math.min(progress.days + (justDone ? 0 : 1), progress.required);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.halo} />
          <Text style={styles.kicker}>TESTEUR ZOLA</Text>

          {justDone ? (
            progress.completed ? (
              <>
                <Text style={styles.title}>Les {progress.required} jours sont validés</Text>
                <Text style={styles.text}>
                  Merci d’avoir testé Zola avant tout le monde. Ta récompense est débloquée,
                  {` ${progress.reward_label.charAt(0).toLowerCase()}${progress.reward_label.slice(1)}.`}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.title}>Jour {progress.days} validé</Text>
                <Text style={styles.text}>
                  Encore {progress.required - progress.days} jour
                  {progress.required - progress.days > 1 ? 's' : ''}. Reviens demain pour cocher la case suivante.
                </Text>
              </>
            )
          ) : (
            <>
              <Text style={styles.title}>
                Jour {day} sur {progress.required}
              </Text>
              <Text style={styles.text}>
                Confirme ta présence du jour. Après {progress.required} jours, ta récompense de testeur est débloquée.
              </Text>
            </>
          )}

          <DaysGrid days={progress.days} required={progress.required} />

          {failed && <Text style={styles.error}>Pas de connexion. Réessaie dans un instant.</Text>}

          {justDone ? (
            <FlameButton label="Continuer" onPress={() => setVisible(false)} />
          ) : (
            <>
              <FlameButton label="Je confirme ma présence" onPress={() => void confirm()} busy={busy} />
              <Pressable onPress={() => setVisible(false)} style={styles.later} accessibilityRole="button">
                <Text style={styles.laterText}>Plus tard</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// --- La carte du profil ------------------------------------------------------
// Dans « Mes atouts ». Elle se relit à chaque affichage du profil.
export function TesterProgramCard() {
  const { progress, busy, failed, checkin, refresh } = useTesterProgress();

  useEffect(() => {
    if (ENABLED) void refresh();
  }, [refresh]);

  if (!ENABLED || !progress || (!progress.active && !progress.completed)) return null;

  const left = Math.max(progress.required - progress.days, 0);

  return (
    <View style={styles.card}>
      <View style={styles.halo} />
      <Text style={styles.kicker}>PROGRAMME TESTEUR</Text>
      <Text style={styles.cardTitle}>
        {progress.completed
          ? 'Récompense débloquée'
          : `${progress.days} jour${progress.days > 1 ? 's' : ''} sur ${progress.required}`}
      </Text>
      <Text style={styles.cardText}>
        {progress.completed
          ? `Merci d’avoir testé Zola avant tout le monde. ${progress.reward_label}.`
          : progress.checked_today
            ? `Aujourd’hui est confirmé. Encore ${left} jour${left > 1 ? 's' : ''}, reviens demain.`
            : 'Ouvre Zola chaque jour et confirme ta présence. Au bout de 14 jours, ta récompense est débloquée.'}
      </Text>

      <DaysGrid days={progress.days} required={progress.required} />

      {failed && <Text style={styles.error}>Pas de connexion. Réessaie dans un instant.</Text>}

      {!progress.completed && !progress.checked_today && progress.active && (
        <FlameButton label="Confirmer aujourd’hui" onPress={() => void checkin()} busy={busy} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: INK,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 18,
    gap: 14,
    overflow: 'hidden',
  },
  card: {
    borderRadius: 26,
    backgroundColor: INK,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    gap: 14,
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    top: -90,
    right: -70,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.primary,
    opacity: 0.35,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#ff8fb5',
    textAlign: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  cardText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  cell: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  cellNext: { borderWidth: 2, borderColor: '#ff8fb5' },
  cellFill: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellNum: { fontSize: 13, fontWeight: '800', color: 'rgba(255, 255, 255, 0.6)' },
  btnWrap: { borderRadius: 999, overflow: 'hidden' },
  btn: {
    height: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '800', color: '#ffffff' },
  later: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  laterText: { fontSize: 15, fontWeight: '700', color: 'rgba(255, 255, 255, 0.7)' },
  error: { fontSize: 14, fontWeight: '600', color: '#ff8fb5', textAlign: 'center' },
});
