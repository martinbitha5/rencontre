import { Redirect } from 'expo-router';
import { PAYMENTS_ENABLED } from '@/config/features';
import CheckoutReturn from '@/screens/CheckoutReturn/CheckoutReturn';

// Atterrissage du lien profond dowe://checkout-return. Neutralisé tant que
// PAYMENTS_ENABLED est false : aucun paiement n'étant initié, aucun retour
// n'est attendu. Voir CLAUDE.md.
export default function CheckoutReturnRoute() {
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)" />;
  return <CheckoutReturn />;
}
