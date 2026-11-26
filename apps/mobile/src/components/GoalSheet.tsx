import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { GOAL_OPTIONS, goalHint, goalIcon } from '@/profileOptions';
import { BottomSheet } from '@/screens/Settings/BottomSheet';
import { colors, flame } from '@/theme';
import { haptic } from '@/utils/haptics';

// Choix de l'intention, depuis la pastille du Profil. Une carte par
// intention : l'icône, le nom, une phrase qui dit ce qu'elle veut dire, et un
// bouton rond. On choisit, puis on confirme avec « Ajouter à mon profil » :
// rien ne part au premier toucher.
export function GoalSheet({
  visible,
  current,
  saving,
  onClose,
  onSave,
}: {
  visible: boolean;
  current: string | null;
  saving: boolean;
  onClose: () => void;
  onSave: (value: string) => void;
}) {
  const { height } = useWindowDimensions();
  // Choix en cours, repris de la valeur enregistrée à chaque ouverture.
  const [picked, setPicked] = useState<string | null>(current);
  const [openedFor, setOpenedFor] = useState(visible);
  if (visible !== openedFor) {
    setOpenedFor(visible);
    if (visible) setPicked(current);
  }

  const unchanged = picked === current;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        <Text style={styles.title}>Que recherches-tu ?</Text>
        <Text style={styles.lead}>
          Les belles rencontres commencent par l’honnêteté. Tu pourras changer d’envie à tout moment.
        </Text>
      </View>

      {/* Les cartes défilent si l'écran est court ; le bouton reste visible. */}
      <ScrollView
        style={{ maxHeight: Math.round(height * 0.55) }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      >
        {GOAL_OPTIONS.map((o) => {
          const on = picked === o.value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                haptic.select();
                setPicked(o.value);
              }}
              style={({ pressed }) => [
                styles.card,
                on && styles.cardOn,
                pressed && { transform: [{ scale: 0.985 }] },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.label}
            >
              <Ionicons name={goalIcon(o.value)} size={30} color={colors.text} />
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle}>{o.label}</Text>
                {!!goalHint(o.value) && <Text style={styles.cardHint}>{goalHint(o.value)}</Text>}
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>
                {on && <View style={styles.radioDot} />}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={() => picked && onSave(picked)}
        disabled={!picked || saving || unchanged}
        style={({ pressed }) => [
          styles.cta,
          (!picked || unchanged) && styles.ctaOff,
          pressed && { opacity: 0.9 },
        ]}
        accessibilityRole="button"
      >
        {!!picked && !unchanged && (
          <LinearGradient
            colors={flame}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        )}
        {saving ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={[styles.ctaText, (!picked || unchanged) && styles.ctaTextOff]}>
            {unchanged && current ? 'C’est déjà ton intention' : 'Ajouter à mon profil'}
          </Text>
        )}
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: 'center', paddingHorizontal: 8, paddingTop: 4, paddingBottom: 18, gap: 8 },
  title: {
    fontSize: 25,
    fontWeight: '900',
    color: colors.primaryDeep,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  lead: { fontSize: 15, lineHeight: 21, color: colors.textMuted, textAlign: 'center' },
  list: { gap: 12, paddingBottom: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  cardOn: { backgroundColor: colors.selected },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  cardHint: { fontSize: 14.5, lineHeight: 20, color: colors.text, opacity: 0.8 },
  radio: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Choisi : anneau épais rose, point blanc au centre.
  radioOn: { borderWidth: 0, backgroundColor: colors.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#ffffff' },
  cta: {
    marginTop: 18,
    height: 58,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { backgroundColor: colors.surface },
  ctaText: { fontSize: 17, fontWeight: '800', color: '#ffffff' },
  ctaTextOff: { color: colors.textMuted },
});
