import { Redirect } from 'expo-router';
import { PAYMENTS_ENABLED } from '@/config/features';
import Transactions from '@/screens/Transactions/Transactions';

// Route neutralisée tant que PAYMENTS_ENABLED est false. Voir CLAUDE.md.
export default function TransactionsRoute() {
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)/profile" />;
  return <Transactions />;
}
