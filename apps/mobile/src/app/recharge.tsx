import { Redirect } from 'expo-router';
import { PAYMENTS_ENABLED } from '@/config/features';
import Recharge from '@/screens/Recharge/Recharge';

// Route neutralisée tant que PAYMENTS_ENABLED est false : l'écran d'achat de
// pièces existe toujours, il n'est simplement plus atteignable (y compris par
// lien profond). Pour la réactivation, voir CLAUDE.md.
export default function RechargeRoute() {
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)" />;
  return <Recharge />;
}
