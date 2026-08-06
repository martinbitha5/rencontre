import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Variables EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_KEY manquantes (voir .env.example)',
  );
}

// Exposés pour les rares appels REST directs (révocation de session en
// arrière-plan à la déconnexion).
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_KEY = supabaseKey;

// Sur web (y compris le rendu Node d'expo-router), AsyncStorage pointe vers
// window.localStorage et plante quand `window` n'existe pas. On ne fournit
// AsyncStorage que sur natif ; ailleurs supabase-js gère le stockage seul.
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: Platform.OS !== 'web',
    detectSessionInUrl: false,
  },
});

// Rafraîchit le token quand l'app revient au premier plan
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
