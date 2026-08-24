import { Redirect } from 'expo-router';
import { PAYMENTS_ENABLED } from '@/config/features';
import MobileMoney from '@/screens/MobileMoney/MobileMoney';

// Route neutralisée tant que PAYMENTS_ENABLED est false. Voir CLAUDE.md.
export default function MobileMoneyRoute() {
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)" />;
  return <MobileMoney />;
}
