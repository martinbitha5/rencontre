import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { getWallet } from '../api';
import { DEFAULT_DAILY_LIKES, ECONOMY_DEFAULTS } from '../config/economy';
import type { Wallet } from '../types';
import { useAuth } from './auth';
import { cacheGet, cacheSet } from './cache';

// Quota de likes tel que l'app doit l'afficher. `unlimited` vient de la
// vérification du profil : un compte vérifié like sans limite, un compte non
// vérifié consomme un quota quotidien. Le serveur reste seul juge (like_quota()
// côté Postgres) ; ce qui suit ne sert qu'à afficher la bonne chose.
export interface LikeQuota {
  unlimited: boolean;
  limit: number;
  left: number | null;
}

interface WalletState {
  wallet: Wallet | null;
  // Coûts toujours disponibles pour l'affichage, même avant le premier fetch.
  costs: typeof ECONOMY_DEFAULTS;
  likeQuota: LikeQuota;
  refresh: () => Promise<void>;
  // Applique le solde renvoyé par une RPC de débit sans refetch.
  apply: (patch: Partial<Wallet>) => void;
  // Décrémente le compteur local après un like accepté par le serveur, pour
  // éviter un aller-retour réseau à chaque swipe.
  consumeLike: () => void;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);

  const refresh = useCallback(async () => {
    if (!session || !profile?.is_onboarded) {
      setWallet(null);
      return;
    }
    try {
      const fresh = await getWallet();
      setWallet(fresh);
      cacheSet('wallet', fresh);
    } catch {
      // solde non critique : les écrans affichent un tiret en attendant
    }
  }, [session, profile?.is_onboarded]);

  useEffect(() => {
    // Solde connu affiché immédiatement, le réseau corrige ensuite.
    if (session && profile?.is_onboarded) {
      cacheGet<Wallet>('wallet').then((cached) => {
        if (cached) setWallet((w) => w ?? cached);
      });
    }
    refresh();
  }, [refresh, session, profile?.is_onboarded]);

  const apply = useCallback((patch: Partial<Wallet>) => {
    setWallet((w) => (w ? { ...w, ...patch } : w));
  }, []);

  const consumeLike = useCallback(() => {
    setWallet((w) => {
      if (!w || w.likes_unlimited || w.likes_left == null) return w;
      return { ...w, likes_left: Math.max(w.likes_left - 1, 0) };
    });
  }, []);

  const costs = {
    like_back_cost: wallet?.like_back_cost ?? ECONOMY_DEFAULTS.like_back_cost,
    dm_cost: wallet?.dm_cost ?? ECONOMY_DEFAULTS.dm_cost,
    free_dm_quota: wallet?.free_dm_quota ?? ECONOMY_DEFAULTS.free_dm_quota,
    incognito_cost: wallet?.incognito_cost ?? ECONOMY_DEFAULTS.incognito_cost,
    filter_online_cost: wallet?.filter_online_cost ?? ECONOMY_DEFAULTS.filter_online_cost,
    filter_goals_cost: wallet?.filter_goals_cost ?? ECONOMY_DEFAULTS.filter_goals_cost,
    filter_dm_cost: wallet?.filter_dm_cost ?? ECONOMY_DEFAULTS.filter_dm_cost,
  };

  // Tant que le portefeuille n'a pas répondu, on suppose le quota par défaut
  // plutôt que l'illimité : afficher une limite qui n'existe pas est bénin,
  // promettre l'illimité à un compte non vérifié ne l'est pas.
  const likeQuota: LikeQuota = {
    unlimited: wallet?.likes_unlimited ?? false,
    limit: wallet?.daily_like_limit ?? DEFAULT_DAILY_LIKES,
    left: wallet?.likes_left ?? null,
  };

  return (
    <WalletContext.Provider
      value={{ wallet, costs, likeQuota, refresh, apply, consumeLike }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet doit être utilisé dans <WalletProvider>');
  return ctx;
}
