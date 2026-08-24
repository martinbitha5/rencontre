import { Redirect } from 'expo-router';
import { PAYMENTS_ENABLED } from '@/config/features';
import Rewards from '@/screens/Rewards/Rewards';

// Écran de l'économie de pièces : neutralisé tant que PAYMENTS_ENABLED est
// false, puisque plus aucune pièce n'est affichée ni dépensée. Voir CLAUDE.md.
export default function RewardsRoute() {
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)" />;
  return <Rewards />;
}
