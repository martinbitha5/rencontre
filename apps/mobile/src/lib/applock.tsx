import * as SecureStore from 'expo-secure-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

// Verrou d'application par code secret.
//
// Ce que ça protège : quelqu'un qui prend le téléphone déverrouillé en main.
// Ce que ça NE protège PAS : les données elles-mêmes. Rien n'est chiffré ici,
// la session Supabase reste valide et les messages restent lisibles pour qui
// sait extraire le stockage de l'appareil. C'est une porte devant l'écran, pas
// un coffre — le dire clairement à l'utilisateur plutôt que de lui vendre une
// sécurité qu'il n'a pas.
//
// Le code vit dans le trousseau du système (Keychain iOS / Keystore Android)
// via expo-secure-store, jamais dans AsyncStorage.

const CODE_KEY = 'dowe.applock.code';
// Délai de grâce : revenir dans l'app après un aller-retour très court (ouvrir
// l'appareil photo, une notification) ne redemande pas le code.
const GRACE_MS = 30_000;

interface AppLockState {
  hasCode: boolean;
  locked: boolean;
  ready: boolean;
  setCode: (code: string) => Promise<void>;
  removeCode: (currentCode: string) => Promise<boolean>;
  unlock: (code: string) => Promise<boolean>;
  lockNow: () => void;
}

const AppLockContext = createContext<AppLockState | undefined>(undefined);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [hasCode, setHasCode] = useState(false);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  // Au démarrage : s'il existe un code, l'app s'ouvre verrouillée.
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(CODE_KEY);
        setHasCode(!!stored);
        setLocked(!!stored);
      } catch {
        // Trousseau indisponible : on n'enferme personne dehors.
        setHasCode(false);
        setLocked(false);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Retour au premier plan après une absence prolongée : on reverrouille.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        if (backgroundedAt.current === null) backgroundedAt.current = Date.now();
        return;
      }
      if (state === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (hasCode && since !== null && Date.now() - since > GRACE_MS) {
          setLocked(true);
        }
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [hasCode]);

  const setCode = useCallback(async (code: string) => {
    await SecureStore.setItemAsync(CODE_KEY, code, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    setHasCode(true);
    setLocked(false);
  }, []);

  const unlock = useCallback(async (code: string) => {
    const stored = await SecureStore.getItemAsync(CODE_KEY);
    if (stored && stored === code) {
      setLocked(false);
      return true;
    }
    return false;
  }, []);

  const removeCode = useCallback(async (currentCode: string) => {
    const stored = await SecureStore.getItemAsync(CODE_KEY);
    if (stored && stored !== currentCode) return false;
    await SecureStore.deleteItemAsync(CODE_KEY);
    setHasCode(false);
    setLocked(false);
    return true;
  }, []);

  const lockNow = useCallback(() => {
    if (hasCode) setLocked(true);
  }, [hasCode]);

  return (
    <AppLockContext.Provider
      value={{ hasCode, locked, ready, setCode, removeCode, unlock, lockNow }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock(): AppLockState {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock doit être utilisé dans <AppLockProvider>');
  return ctx;
}
