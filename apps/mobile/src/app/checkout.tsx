import { Redirect } from 'expo-router';
import { PAYMENTS_ENABLED } from '@/config/features';
import Checkout from '@/screens/Checkout/Checkout';

// Route neutralisée tant que PAYMENTS_ENABLED est false. Voir CLAUDE.md.
export default function CheckoutRoute() {
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)" />;
  return <Checkout />;
}
