import { Ionicons } from "@expo/vector-icons";
import React, { type ComponentRef, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PressableScale } from "@/components/motion";
import type { PhotoSource } from "@/services/photoPicker";
import { colors, motion, spacing } from "@/theme";

// Choix de la source d'une photo de profil : la galerie ou l'appareil photo.
// Plein écran, deux grands ronds faciles à viser au pouce, et des conseils
// repliables en bas pour réussir sa photo. Aux couleurs du site : ronds rose
// pâle, icônes à l'encre du texte.

const TIPS = [
  {
    icon: "happy-outline",
    text: "Ton visage bien visible, sans lunettes de soleil.",
  },
  {
    icon: "person-outline",
    text: "Seul(e) sur la photo principale, pas en groupe.",
  },
  { icon: "sunny-outline", text: "Une photo récente, nette et bien éclairée." },
  {
    icon: "ban-outline",
    text: "Pas de nudité, pas de mineurs, pas de photo volée.",
  },
] as const;

const OPTIONS: {
  source: PhotoSource;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}[] = [
  { source: "library", icon: "images", label: "Tes photos" },
  { source: "camera", icon: "camera", label: "Appareil photo" },
];

// Apparition par le bas, lancée au montage. Les animations « entering » de
// Reanimated ne partent pas dans une Modal sur le web : celle-ci, si.
function Rise({
  delay = 0,
  children,
}: {
  delay?: number;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) t.set(withDelay(delay, withSpring(1, motion.spring.gentle)));
  }, [t, delay, reduced]);
  const st = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [{ translateY: (1 - t.value) * 18 }],
  }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

export function PhotoSourceSheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  // Appelé avec la source choisie ; la feuille se ferme d'elle-même avant.
  onPick: (source: PhotoSource) => void;
}) {
  const insets = useSafeAreaInsets();
  const [tipsOpen, setTipsOpen] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const choose = (source: PhotoSource) => {
    onClose();
    // Laisse la feuille commencer à se fermer : une seule Modal à l'écran à
    // la fois, sinon iOS refuse d'ouvrir la galerie par-dessus.
    setTimeout(() => onPick(source), 350);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={[
          styles.screen,
          {
            paddingTop: insets.top + spacing.sm,
            paddingBottom: insets.bottom + spacing.md,
          },
        ]}
      >
        <Pressable
          onPress={onClose}
          hitSlop={12}
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        >
          <Ionicons name="close" size={32} color={colors.text} />
        </Pressable>

        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <Rise>
            <Text style={styles.title}>Ajouter des photos depuis</Text>
          </Rise>

          <View style={styles.options}>
            {OPTIONS.map((o, i) => (
              <Rise key={o.source} delay={80 + motion.stagger(i) * 2}>
                <PressableScale
                  onPress={() => choose(o.source)}
                  scaleTo={0.94}
                  style={styles.option}
                  accessibilityRole="button"
                  accessibilityLabel={o.label}
                >
                  <View style={styles.circle}>
                    <Ionicons name={o.icon} size={46} color={colors.text} />
                  </View>
                  <Text style={styles.optionLabel}>{o.label}</Text>
                </PressableScale>
              </Rise>
            ))}
          </View>

          <View style={styles.flex} />

          {/* Conseils repliables, comme un aide-mémoire. */}
          <Pressable
            onPress={() => {
              setTipsOpen((v) => !v);
              // Les conseils dépliés restent visibles même sur un petit écran.
              setTimeout(
                () => scroll.current?.scrollToEnd({ animated: true }),
                60,
              );
            }}
            style={styles.tipsHead}
            accessibilityRole="button"
            accessibilityState={{ expanded: tipsOpen }}
          >
            <Ionicons name="sparkles" size={22} color={colors.primary} />
            <Text style={styles.tipsTitle}>Conseils pour une bonne photo</Text>
            <View style={styles.tipsChevron}>
              <Ionicons
                name={tipsOpen ? "chevron-down" : "chevron-up"}
                size={16}
                color={colors.background}
              />
            </View>
          </Pressable>
          {tipsOpen && (
            <Rise>
              <View style={styles.tips}>
                {TIPS.map((t) => (
                  <View key={t.text} style={styles.tipRow}>
                    <View style={styles.tipIcon}>
                      <Ionicons
                        name={t.icon}
                        size={16}
                        color={colors.primary}
                      />
                    </View>
                    <Text style={styles.tipText}>{t.text}</Text>
                  </View>
                ))}
              </View>
            </Rise>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const CIRCLE = 128;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  flex: { flex: 1, minHeight: spacing.xl },
  body: { flexGrow: 1 },
  close: {
    width: 48,
    height: 48,
    marginLeft: -8,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: spacing.lg,
    fontSize: 26,
    fontWeight: "800",
    color: colors.primaryDeep,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  options: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xl,
    marginTop: 44,
  },
  option: { alignItems: "center", gap: 12 },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    backgroundColor: colors.selected,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: { fontSize: 17, fontWeight: "700", color: colors.text },
  tipsHead: { alignItems: "center", gap: 8, paddingVertical: spacing.sm },
  tipsTitle: { fontSize: 15, fontWeight: "600", color: colors.text },
  tipsChevron: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  tips: {
    marginTop: spacing.sm,
    gap: 12,
    backgroundColor: colors.inputBg,
    borderRadius: 20,
    padding: spacing.md,
  },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  tipIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.selected,
    alignItems: "center",
    justifyContent: "center",
  },
  tipText: { flex: 1, fontSize: 14, color: colors.text, lineHeight: 19 },
});
