import { Redirect } from 'expo-router';
import { PAYMENTS_ENABLED } from '@/config/features';
import Referral from '@/screens/Referral/Referral';

// Le parrainage est libellé en pièces de bout en bout : il suit donc le sort
// de l'économie de pièces tant que PAYMENTS_ENABLED est false. Voir CLAUDE.md.
export default function ReferralRoute() {
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)" />;
  return <Referral />;
}
