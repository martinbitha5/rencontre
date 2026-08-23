import { Stack } from 'expo-router';
import React from 'react';
import { isIOS } from '@/theme';

// Pile interne de l'onglet Profil : menu, mon profil, édition,
// portefeuille, paramètres, préférences. En-têtes custom dans chaque écran.
export default function ProfileLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        // Glissement natif iOS, fondu montant Material sur Android.
        animation: isIOS ? 'default' : 'fade_from_bottom',
      }}
    />
  );
}
