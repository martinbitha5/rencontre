import { Redirect } from 'expo-router';
import { PAYMENTS_ENABLED } from '@/config/features';
import PaymentMethods from '@/screens/PaymentMethods/PaymentMethods';

// Route neutralisée tant que PAYMENTS_ENABLED est false. Voir CLAUDE.md.
export default function PaymentRoute() {
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)" />;
  return <PaymentMethods />;
}
