import { Redirect } from 'expo-router';
import { PAYMENTS_ENABLED } from '@/config/features';
import Wallet from '@/screens/Wallet/Wallet';

// Route neutralisée tant que PAYMENTS_ENABLED est false. Voir CLAUDE.md.
export default function WalletRoute() {
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)/profile" />;
  return <Wallet />;
}
