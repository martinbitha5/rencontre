import { Stack } from 'expo-router';
import React from 'react';
import { isIOS } from '../../theme';

export default function AuthLayout() {
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
