import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getCities, updateMyProfile, updateSearchFilters } from '../../../api';
import { CoinIcon, InsufficientCoinsModal } from '../../../components/coins';
import { RangeSlider } from '../../../components/RangeSlider';
import { Button, ScreenHeader, Segmented, VerifiedBadge } from '../../../components/ui';
import { COIN_NAME_PLURAL, formatCoins } from '../../../config/economy';
import { useAuth } from '../../../lib/auth';
import { useWallet } from '../../../lib/wallet';
import { GOAL_OPTIONS, RELIGION_OPTIONS } from '../../../profileOptions';
import { colors, radius, shadows, spacing } from '../../../theme';
import type { City, Gender } from '../../../types';

type TriState = 'oui' | 'non' | null;

// Le rose doux des toggles, à la manière de la maquette : assez teinté pour
// se lire activé, assez clair pour rester léger.
const TOGGLE_PINK = '#f472b6';

// Une icône par intention, posée dans la carte de sélection.
const GOAL_ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  mariage: { name: 'heart', color: '#e11d48' },
  relation_serieuse: { name: 'ribbon', color: '#db2777' },
  amitie: { name: 'people', color: '#6d28d9' },
  rien_de_serieux: { name: 'flash', color: '#0284c7' },
  je_me_laisse_surprendre: { name: 'sparkles', color: '#d97706' },
};

// Badge de coût en pièces, posé sur le coin d'une carte premium.
function CostBadge({ cost }: { cost: number }) {
  return (
    <View style={styles.costBadge}>
      <Text style={styles.costBadgeText}>{formatCoins(cost)}</Text>
      <CoinIcon size={12} />
    </View>
  );
}

// Oui / Non / Pas de préférence, à la Heyama.
function TriStateRow({
  title,
  value,
  onChange,
}: {
  title: string;
  value: TriState;
  onChange: (v: TriState) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Segmented<'oui' | 'non' | 'any'>
        options={[
          { key: 'oui', label: 'Oui' },
          { key: 'non', label: 'Non' },
          { key: 'any', label: 'Pas de préférence' },
        ]}
        value={value ?? 'any'}
        onChange={(k) => onChange(k === 'any' ? null : k)}
      />
    </View>
  );
}

// Chips multi-sélection avec coche + pilule « Pas de préférence » (= null).
function MultiChips({
  title,
  options,
  values,
  onChange,
  badge,
}: {
  title: string;
  options: { value: string; label: string }[];
  values: string[] | null;
  onChange: (v: string[] | null) => void;
  badge?: number;
}) {
  const toggle = (v: string) => {
    if (values === null) {
      onChange([v]);
      return;
    }
    const next = values.includes(v) ? values.filter((x) => x !== v) : [...values, v];
    onChange(next.length ? next : null);
  };
  return (
    <View style={styles.card}>
      {typeof badge === 'number' && <CostBadge cost={badge} />}
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.chipWrap}>
        {options.map((o) => {
          const active = values !== null && values.includes(o.value);
          return (
            <Pressable
              key={o.value}
              style={[styles.checkChip, active && styles.checkChipActive]}
              onPress={() => toggle(o.value)}
            >
              <Text style={[styles.checkChipText, active && { color: colors.primary }]}>
                {o.label}
              </Text>
              {active && (
                <View style={styles.chipBadge}>
                  <Ionicons name="checkmark" size={10} color={colors.textOnPrimary} />
                </View>
              )}
            </Pressable>
          );
        })}
        <Pressable
          style={[styles.noPrefPill, values === null && styles.noPrefPillActive]}
          onPress={() => onChange(null)}
        >
          <Text
            style={[styles.noPrefText, values === null && { color: colors.textOnPrimary }]}
          >
            Pas de préférence
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// Filtres de recherche, structure Heyama : ville + tout le pays, filtre DM,
// âge, intentions, sexe, enfants, en ligne, religions, fumeurs.
export default function SearchPreferences() {
  const { profile, refreshProfile } = useAuth();
  const { costs, apply } = useWallet();
  const [insufficientCost, setInsufficientCost] = useState<number | null>(null);
  const [lookingFor, setLookingFor] = useState<Gender | null>(profile?.looking_for ?? null);
  const [ageMin, setAgeMin] = useState(profile?.age_min ?? 18);
  const [ageMax, setAgeMax] = useState(profile?.age_max ?? 99);
  const [cityId, setCityId] = useState<number | null>(profile?.city_id ?? null);
  const [wholeCountry, setWholeCountry] = useState(profile?.search_whole_country ?? false);
  const [dmStrict, setDmStrict] = useState(profile?.filter_dm_strict ?? false);
  const [verifiedOnly, setVerifiedOnly] = useState(profile?.filter_verified_only ?? false);
  const [goals, setGoals] = useState<string[] | null>(profile?.filter_goals ?? null);
  const [religions, setReligions] = useState<string[] | null>(profile?.filter_religions ?? null);
  const [hasChildren, setHasChildren] = useState<TriState>(profile?.filter_has_children ?? null);
  const [smoking, setSmoking] = useState<TriState>(profile?.filter_smoking ?? null);
  const [onlineOnly, setOnlineOnly] = useState(profile?.filter_online_only ?? false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getCities().then(setCities).catch(() => {});
  }, []);

  const cityName = useMemo(
    () => cities.find((c) => c.id === cityId)?.name ?? '…',
    [cities, cityId],
  );

  const sameArray = (a: string[] | null, b: string[] | null) =>
    JSON.stringify(a === null ? null : [...a].sort()) ===
    JSON.stringify(b === null ? null : [...b].sort());

  // Coût des options payantes en cours d'ACTIVATION (le serveur ne débite
  // que le passage de inactif à actif ; désactiver reste gratuit). Tant que
  // ce total est positif, le bouton du bas devient « Payer X pièces ».
  const pendingCost =
    (onlineOnly && !profile?.filter_online_only ? costs.filter_online_cost : 0) +
    (goals !== null && (profile?.filter_goals ?? null) === null ? costs.filter_goals_cost : 0) +
    (dmStrict && !profile?.filter_dm_strict ? costs.filter_dm_cost : 0);

  const dirty =
    lookingFor !== (profile?.looking_for ?? null) ||
    ageMin !== (profile?.age_min ?? 18) ||
    ageMax !== (profile?.age_max ?? 99) ||
    cityId !== (profile?.city_id ?? null) ||
    wholeCountry !== (profile?.search_whole_country ?? false) ||
    dmStrict !== (profile?.filter_dm_strict ?? false) ||
    verifiedOnly !== (profile?.filter_verified_only ?? false) ||
    !sameArray(goals, profile?.filter_goals ?? null) ||
    !sameArray(religions, profile?.filter_religions ?? null) ||
    hasChildren !== (profile?.filter_has_children ?? null) ||
    smoking !== (profile?.filter_smoking ?? null) ||
    onlineOnly !== (profile?.filter_online_only ?? false);

  const save = async () => {
    const min = Math.max(18, ageMin);
    const max = Math.min(99, ageMax);
    if (min > max) {
      return Alert.alert('Filtres invalides', "L'âge minimum dépasse l'âge maximum.");
    }
    if (!lookingFor) {
      return Alert.alert('Filtres invalides', 'Choisis qui tu veux rencontrer.');
    }
    if (!cityId) {
      return Alert.alert('Filtres invalides', 'Choisis ta ville.');
    }
    setSaving(true);
    try {
      // Filtres gratuits d'abord (update direct sous RLS).
      await updateMyProfile({
        looking_for: lookingFor,
        age_min: min,
        age_max: max,
        city_id: cityId,
        search_whole_country: wholeCountry,
        filter_verified_only: verifiedOnly,
        filter_religions: religions,
        filter_has_children: hasChildren,
        filter_smoking: smoking,
      });
      // Filtres premium ensuite : la RPC débite les pièces à l'activation.
      const result = await updateSearchFilters({
        onlineOnly,
        goals,
        dmStrict,
      });
      if (result.status === 'insufficient_coins') {
        apply({ balance: result.balance });
        await refreshProfile();
        setInsufficientCost(result.cost);
        return;
      }
      apply({ balance: result.balance });
      await refreshProfile();
      setCityPickerOpen(false);
      Alert.alert(
        'Filtres enregistrés',
        result.charged > 0
          ? `Ton deck Rencontres est mis à jour (${result.charged} pièces débitées).`
          : 'Ton deck Rencontres est mis à jour.',
      );
    } catch {
      Alert.alert('Erreur', "Impossible d'enregistrer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Filtres" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Affine ta recherche pour voir les profils qui te correspondent le mieux.
        </Text>

        {/* Ville + périmètre de recherche. Le toggle dit « uniquement dans la
            ville » : il est l'inverse de search_whole_country en base. */}
        <View style={styles.card}>
          <Pressable style={styles.cityRow} onPress={() => setCityPickerOpen((v) => !v)}>
            <Text style={styles.rowLabel}>Ville</Text>
            <Text style={styles.cityValue} numberOfLines={1}>
              {cityName}, République démocratique du Congo
            </Text>
          </Pressable>
          {cityPickerOpen && (
            <View style={[styles.chipWrap, { marginTop: spacing.sm }]}>
              {cities.map((c) => {
                const active = cityId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    style={[styles.checkChip, active && styles.checkChipActive]}
                    onPress={() => setCityId(c.id)}
                  >
                    <Text style={[styles.checkChipText, active && { color: colors.primary }]}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={[styles.rowBetween, { marginTop: spacing.md }]}>
            <Text style={styles.rowLabel}>Chercher uniquement dans la ville</Text>
            <Switch
              value={!wholeCountry}
              onValueChange={(v) => setWholeCountry(!v)}
              trackColor={{ true: TOGGLE_PINK, false: colors.border }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* Filtre de réception des DM (premium) */}
        <View style={styles.card}>
          <CostBadge cost={costs.filter_dm_cost} />
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: spacing.md }}>
              <Text style={styles.cardTitle}>Messages Directs (DM)</Text>
              <Text style={styles.hint}>
                Active cela pour ne recevoir que les DM des profils qui correspondent exactement
                à tes critères. Sans cela, tout le monde peut t'envoyer un DM.
              </Text>
            </View>
            <Switch
              value={dmStrict}
              onValueChange={setDmStrict}
              trackColor={{ true: TOGGLE_PINK, false: colors.border }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* Âge : deux poignées sur un rail, la fourchette s'affiche en clair */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Âge</Text>
            <Text style={styles.rowValue}>
              Entre {ageMin}-{ageMax} ans
            </Text>
          </View>
          <RangeSlider
            min={18}
            max={99}
            initialLow={ageMin}
            initialHigh={ageMax}
            onChange={(low, high) => {
              setAgeMin(low);
              setAgeMax(high);
            }}
          />
        </View>

        {/* Profils certifiés uniquement (gratuit) */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.verifiedLabelRow}>
              <Text style={styles.rowLabel}>Profils certifiés uniquement</Text>
              <VerifiedBadge size={18} />
            </View>
            <Switch
              value={verifiedOnly}
              onValueChange={setVerifiedOnly}
              trackColor={{ true: TOGGLE_PINK, false: colors.border }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* Intentions (premium) : cartes icône + libellé, coche sur le coin */}
        <View style={styles.card}>
          <CostBadge cost={costs.filter_goals_cost} />
          <Text style={styles.cardTitle}>
            Montrer uniquement les profils ayant ces intentions
          </Text>
          <View style={styles.chipWrap}>
            {GOAL_OPTIONS.map((o) => {
              const active = goals !== null && goals.includes(o.value);
              const icon = GOAL_ICONS[o.value];
              const toggleGoal = () => {
                if (goals === null) {
                  setGoals([o.value]);
                  return;
                }
                const next = goals.includes(o.value)
                  ? goals.filter((x) => x !== o.value)
                  : [...goals, o.value];
                setGoals(next.length ? next : null);
              };
              return (
                <Pressable
                  key={o.value}
                  style={[styles.goalCard, active && styles.goalCardActive]}
                  onPress={toggleGoal}
                >
                  {icon && <Ionicons name={icon.name} size={17} color={icon.color} />}
                  <Text style={[styles.goalCardText, active && { color: colors.primary }]}>
                    {o.label}
                  </Text>
                  {active && (
                    <View style={styles.chipBadge}>
                      <Ionicons name="checkmark" size={10} color={colors.textOnPrimary} />
                    </View>
                  )}
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.noPrefPill, goals === null && styles.noPrefPillActive]}
              onPress={() => setGoals(null)}
            >
              <Text style={[styles.noPrefText, goals === null && { color: colors.textOnPrimary }]}>
                Pas de préférence
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Sexe */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sexe</Text>
          <View style={styles.genderRow}>
            {(
              [
                { key: 'homme', label: 'Homme' },
                { key: 'femme', label: 'Femme' },
              ] as { key: Gender; label: string }[]
            ).map((g) => {
              const active = lookingFor === g.key;
              return (
                <Pressable
                  key={g.key}
                  style={styles.genderItem}
                  onPress={() => setLookingFor(g.key)}
                >
                  <View style={[styles.checkbox, active && styles.checkboxActive]}>
                    <Ionicons
                      name="checkmark"
                      size={16}
                      color={active ? colors.textOnPrimary : colors.border}
                    />
                  </View>
                  <Text style={[styles.genderLabel, active && { color: colors.text }]}>
                    {g.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Enfants */}
        <TriStateRow
          title="Montrer les profils ayant des enfants"
          value={hasChildren}
          onChange={setHasChildren}
        />

        {/* En ligne uniquement (premium) */}
        <View style={styles.card}>
          <CostBadge cost={costs.filter_online_cost} />
          <View style={styles.rowBetween}>
            <View style={styles.onlineLabelRow}>
              <Text style={styles.cardTitle}>Profils en ligne uniquement</Text>
              <View style={styles.onlineDot} />
            </View>
            <Switch
              value={onlineOnly}
              onValueChange={setOnlineOnly}
              trackColor={{ true: TOGGLE_PINK, false: colors.border }}
              thumbColor="#ffffff"
            />
          </View>
        </View>

        {/* Religions */}
        <MultiChips
          title="Religion(s) souhaitée(s)"
          options={RELIGION_OPTIONS.map((r) => ({ value: r, label: r }))}
          values={religions}
          onChange={setReligions}
        />

        {/* Fumeurs */}
        <TriStateRow
          title="Montrer les profils fumeurs"
          value={smoking}
          onChange={setSmoking}
        />

        <View style={styles.footerZone}>
          {dirty && pendingCost === 0 ? (
            <Button title="Enregistrer" onPress={save} loading={saving} />
          ) : !dirty ? (
            <Text style={styles.footerIdle}>Aucune modification effectuée.</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Une option payante vient d'être choisie : barre fixe en bas de
          l'écran, le montant est annoncé avant de débiter. */}
      {pendingCost > 0 && (
        <View style={styles.payBar}>
          <View style={styles.payBarInfo}>
            <CoinIcon size={16} />
            <Text style={styles.payBarText}>
              Option premium — {formatCoins(pendingCost)} {COIN_NAME_PLURAL}
            </Text>
          </View>
          <Button
            title={`Payer ${formatCoins(pendingCost)} ${COIN_NAME_PLURAL}`}
            onPress={save}
            loading={saving}
          />
        </View>
      )}

      <InsufficientCoinsModal
        cost={insufficientCost}
        onClose={() => setInsufficientCost(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: 0 },
  intro: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  costBadge: {
    position: 'absolute',
    top: -11,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
    zIndex: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  costBadgeText: { fontSize: 12, fontWeight: '800', color: colors.text },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  rowValue: { fontSize: 14, fontWeight: '600', color: colors.primary, flexShrink: 1 },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  checkChip: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  checkChipActive: { borderColor: colors.primary, backgroundColor: colors.surface },
  checkChipText: { fontSize: 14, fontWeight: '600', color: colors.text },
  chipBadge: {
    position: 'absolute',
    top: -5,
    right: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPrefPill: {
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  noPrefPillActive: { backgroundColor: colors.primary },
  noPrefText: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  // Ville : libellé et valeur rose sur la même ligne, comme la maquette.
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cityValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent,
  },
  verifiedLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  // Cartes d'intention : icône + libellé, coche ronde posée sur le coin.
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.cardSolid,
  },
  goalCardActive: { borderColor: colors.accent, backgroundColor: colors.surface },
  goalCardText: { fontSize: 14, fontWeight: '700', color: colors.text },
  genderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  genderItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  genderLabel: { fontSize: 16, fontWeight: '600', color: colors.textMuted },
  onlineLabelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    marginBottom: spacing.sm,
  },
  footerZone: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    justifyContent: 'center',
  },
  footerIdle: {
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
    paddingVertical: spacing.md,
  },
  payBar: {
    backgroundColor: colors.card,
    padding: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
    ...shadows.floating,
    shadowOffset: { width: 0, height: -6 },
  },
  payBarInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  payBarText: { fontSize: 13, fontWeight: '700', color: colors.text },
});
