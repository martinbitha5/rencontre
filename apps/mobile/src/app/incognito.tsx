import { Redirect } from 'expo-router';
import { PAYMENTS_ENABLED } from '@/config/features';
import Incognito from '@/screens/Incognito/Incognito';

// Route neutralisée tant que PAYMENTS_ENABLED est false : l'offre d'abonnement
// Incognito reste écrite, elle n'est plus présentée. En mode gratuit
// l'incognito s'active directement depuis le profil ou les paramètres.
export default function IncognitoRoute() {
  if (!PAYMENTS_ENABLED) return <Redirect href="/(tabs)" />;
  return <Incognito />;
}
