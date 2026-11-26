import { Redirect } from 'expo-router';

// Atterrissage du lien profond zola://auth-callback, renvoyé par Supabase à
// la fin d'une connexion Google ou Apple. La session est posée dans
// providers/auth (createSessionFromUrl) : ici on ne fait que quitter la route
// pour que Gate décide de la suite (onboarding ou fil).
export default function AuthCallbackRoute() {
  return <Redirect href="/(auth)/welcome" />;
}
