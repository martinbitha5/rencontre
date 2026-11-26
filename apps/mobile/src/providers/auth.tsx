import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/services/supabase';
import type { Profile } from '@/types';
import { cacheGet, cacheSet } from '@/utils/cache';

WebBrowser.maybeCompleteAuthSession();

// Le profil en mémoire est réutilisé tel quel tant que l'app reste ouverte :
// naviguer entre les écrans ne le recharge jamais. Il n'est relu au serveur
// qu'au retour au premier plan après au moins cette absence, ou sur demande
// explicite (refreshProfile après une modification).
const PROFILE_STALE_MS = 10 * 60 * 1000;

// Dernier profil connu, gardé sur le téléphone (cache local vidé à la
// déconnexion). Au démarrage, l'app s'ouvre aussitôt avec lui et relit la base
// en arrière-plan : avant, l'intro restait affichée le temps d'un aller-retour
// réseau, plusieurs secondes sur un réseau mobile lent, et indéfiniment hors
// ligne.
const profileKey = (userId: string) => `profile:${userId}`;

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  // Vrai tant que le profil de la session courante n'est pas chargé : sans ça,
  // la navigation croirait à tort que le compte n'est pas encore onboardé.
  syncing: boolean;
  refreshProfile: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  // Envoie un code de vérification par e-mail. 'not_found' = aucun compte
  // avec cet e-mail (uniquement quand createUser est false).
  sendEmailCode: (email: string, createUser: boolean) => Promise<'sent' | 'not_found' | string>;
  verifyEmailCode: (email: string, code: string) => Promise<string | null>;
  signInWithOAuth: (provider: 'google' | 'apple') => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

const redirectTo = Linking.createURL('/auth-callback');

async function createSessionFromUrl(url: string): Promise<void> {
  const params = parseParams(url);
  if (params['error_description']) throw new Error(params['error_description']);
  const accessToken = params['access_token'];
  const refreshToken = params['refresh_token'];
  if (!accessToken || !refreshToken) return;
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;
}

function parseParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const fragment = url.split('#')[1] ?? url.split('?')[1] ?? '';
  for (const pair of fragment.split('&')) {
    const [k, v] = pair.split('=');
    if (k && v) out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

// Supabase renvoie ses erreurs en anglais technique ("Invalid login
// credentials", "User already registered"...). On ne montre jamais ça tel
// quel : chaque cas connu a sa phrase en français, et le reste tombe sur un
// message générique compréhensible.
function friendlyAuthError(error: { code?: string; message: string } | null): string {
  if (!error) return 'Une erreur est survenue. Réessaie dans un instant.';
  const msg = error.message ?? '';
  const code = error.code ?? '';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) {
    return 'E-mail ou mot de passe incorrect.';
  }
  if (code === 'user_already_exists' || /already registered/i.test(msg)) {
    return 'Un compte existe déjà avec cet e-mail. Essaie plutôt de te connecter.';
  }
  if (code === 'weak_password' || /password should be at least/i.test(msg)) {
    return 'Le mot de passe est trop court : il faut au moins 6 caractères.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) {
    return 'Confirme d’abord ton adresse : ouvre le lien reçu par e-mail.';
  }
  if (/rate limit|security purposes|after \d+ seconds|too many requests/i.test(msg)) {
    return 'Trop de tentatives. Attends un peu avant de réessayer.';
  }
  if (/invalid format|unable to validate email|invalid email/i.test(msg)) {
    return 'Cette adresse e-mail ne semble pas valide. Vérifie-la.';
  }
  if (/network|fetch|connection|timeout/i.test(msg)) {
    return 'Connexion impossible. Vérifie ton réseau et réessaie.';
  }
  return 'Une erreur est survenue. Réessaie dans un instant.';
}

// Session de départ, robuste hors ligne.
//
// Quand le jeton d'accès a expiré, getSession() tente de le renouveler. Sans
// réseau, ce renouvellement échoue (AuthRetryableFetchError, « The Internet
// connection appears to be offline ») et getSession() répond session: null,
// alors que la session est toujours intacte dans le stockage. L'app croyait
// donc l'utilisateur déconnecté et affichait l'écran d'accueil.
//
// Dans ce cas précis, on relit la session stockée et on ouvre l'app avec elle
// et le profil en cache. Le client Supabase renouvelle le jeton tout seul dès
// que le réseau revient (TOKEN_REFRESHED). Un refus réel du serveur (jeton
// révoqué) n'est pas une erreur réseau : il reste traité comme une
// déconnexion.
//
// Durée bornée : hors ligne, Supabase réessaie le renouvellement pendant
// jusqu'à 30 s, et l'intro attendait tout ce temps avant de s'effacer. Passé
// STARTUP_SESSION_MS, on décide avec la session stockée.
const STARTUP_SESSION_MS = 2500;

async function storedSession(): Promise<Session | null> {
  try {
    const key = (supabase.auth as unknown as { storageKey: string }).storageKey;
    const raw = await AsyncStorage.getItem(key);
    const stored = raw ? (JSON.parse(raw) as Session) : null;
    return stored?.access_token && stored.refresh_token && stored.user ? stored : null;
  } catch {
    return null;
  }
}

async function startupSession(): Promise<{ session: Session | null; offline: boolean }> {
  const timedOut = Symbol('timeout');
  const res = await Promise.race([
    supabase.auth.getSession(),
    new Promise<typeof timedOut>((r) => setTimeout(() => r(timedOut), STARTUP_SESSION_MS)),
  ]);
  if (res === timedOut) return { session: await storedSession(), offline: true };
  const { data, error } = res;
  if (data.session || !error || !isAuthRetryableFetchError(error)) {
    return { session: data.session, offline: false };
  }
  return { session: await storedSession(), offline: true };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // Date de la dernière lecture réussie : pilote le rechargement au retour au
  // premier plan, et rien d'autre.
  const profileLoadedAt = useRef(0);
  const sessionRef = useRef<Session | null>(null);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const loadProfile = useCallback(async (s: Session | null): Promise<Profile | null> => {
    if (!s) {
      setProfile(null);
      return null;
    }
    const fetchProfile = () =>
      supabase.from('profiles').select('*').eq('user_id', s.user.id).maybeSingle();

    let { data, error } = await fetchProfile();
    if (error) {
      // Réseau capricieux : une seconde tentative avant d'abandonner.
      await new Promise((r) => setTimeout(r, 600));
      ({ data, error } = await fetchProfile());
    }

    // Session refusée par le serveur (jeton expiré, compte supprimé) : la
    // session locale est un fantôme. Sans ce nettoyage, l'app garde une
    // session invalide, ne charge aucun profil, et la navigation conclut à
    // tort « compte non onboardé » — d'où l'onboarding affiché à la place de
    // l'écran de connexion, et les appels authentifiés qui échouent ensuite.
    const authFailed =
      !!error &&
      (/(jwt|token|expired|not authenticated|unauthorized)/i.test(error.message ?? '') ||
        error.code === 'PGRST301' ||
        error.code === '401');
    if (authFailed) {
      cacheSet(profileKey(s.user.id), null);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      setProfile(null);
      return null;
    }

    // Toujours en échec réseau : on garde le profil déjà connu plutôt que de
    // le vider, sinon l'app renverrait vers l'onboarding un compte complet.
    if (error) return null;

    // Session valide mais aucun profil : le compte a disparu côté base. Même
    // conclusion, on repart proprement de l'écran d'accueil.
    if (!data) {
      cacheSet(profileKey(s.user.id), null);
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      setProfile(null);
      return null;
    }

    profileLoadedAt.current = Date.now();
    setProfile(data as Profile);
    cacheSet(profileKey(s.user.id), data);
    return data as Profile;
  }, []);

  useEffect(() => {
    startupSession().then(async ({ session: s, offline }) => {
      if (s) {
        const cached = await cacheGet<Profile>(profileKey(s.user.id));
        if (cached?.is_onboarded) {
          // Ouverture immédiate avec le profil connu, relecture en arrière-plan.
          setSession(s);
          setProfile(cached);
          setLoading(false);
          loadProfile(s);
          return;
        }
        // Démarrage à froid sans compte complet connu sur ce téléphone :
        // inscription laissée en plan, session d'un essai précédent, ou profil
        // illisible faute de réseau. L'app ne saute pas d'elle-même dans
        // l'onboarding : après l'intro, l'accueil laisse choisir entre créer
        // un compte et se connecter (se reconnecter reprend l'inscription là
        // où elle en était).
        const fresh = offline ? null : await loadProfile(s);
        if (!fresh?.is_onboarded) {
          // On ne coupe la session que pour un compte réellement pas fini. Un
          // profil illisible (réseau) n'efface rien : la session reste stockée
          // et la prochaine ouverture avec du réseau la reprendra.
          if (fresh) await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          setProfile(null);
          setLoading(false);
          return;
        }
        setSession(s);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      // La session de départ est déjà traitée par getSession() ci-dessus.
      // Sans ce filtre, le profil était chargé une seconde fois au démarrage,
      // et l'intro attendait ce doublon (drapeau syncing) avant de s'effacer.
      if (event === 'INITIAL_SESSION') return;
      // Renouvellement de jeton : l'utilisateur n'a pas changé, le profil en
      // mémoire reste bon. Relire la base ici ferait repartir une requête à
      // chaque rafraîchissement automatique de session.
      if (event === 'TOKEN_REFRESHED') {
        // Ne réveille pas une session écartée au démarrage (compte pas fini,
        // voir plus haut) : seule une session déjà ouverte est mise à jour.
        if (!sessionRef.current) return;
        setSession(s);
        // Démarrage hors ligne : le profil affiché vient du cache. Le premier
        // renouvellement réussi signale le retour du réseau, on le relit.
        if (s && profileLoadedAt.current === 0) loadProfile(s);
        return;
      }
      // Session et drapeau posés dans le même rendu : la navigation attend
      // le profil avant de décider où envoyer l'utilisateur.
      setSession(s);
      setSyncing(!!s);
      try {
        await loadProfile(s);
      } finally {
        setSyncing(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  // Retour au premier plan après une longue absence : le profil servi peut
  // dater (solde de filtres, vérification passée entre-temps...), on le relit.
  // Une absence courte ne déclenche rien, une navigation encore moins.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (Date.now() - profileLoadedAt.current < PROFILE_STALE_MS) return;
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) loadProfile(data.session);
      });
    });
    return () => sub.remove();
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    await loadProfile(data.session);
  }, [loadProfile]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? friendlyAuthError(error) : null;
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: friendlyAuthError(error), needsConfirmation: false };
    // Session absente + utilisateur créé = confirmation d'e-mail activée
    // côté Supabase : il faut prévenir l'utilisateur au lieu de rester muet.
    return { error: null, needsConfirmation: !data.session && !!data.user };
  }, []);

  const sendEmailCode = useCallback(async (email: string, createUser: boolean) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: createUser },
    });
    if (!error) return 'sent' as const;
    // shouldCreateUser:false + utilisateur inconnu → Supabase répond
    // "Signups not allowed for otp" (code otp_disabled).
    if (error.code === 'otp_disabled' || /signups not allowed/i.test(error.message)) {
      return 'not_found' as const;
    }
    if (/rate limit|after \d+ seconds/i.test(error.message)) {
      return 'Trop de demandes. Attends un peu avant de renvoyer un code.';
    }
    return friendlyAuthError(error);
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (!error) return null;
    if (/expired|invalid/i.test(error.message)) {
      return 'Code invalide ou expiré. Vérifie le code ou renvoie-en un.';
    }
    return friendlyAuthError(error);
  }, []);

  const signInWithOAuth = useCallback(async (provider: 'google' | 'apple') => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return friendlyAuthError(error);
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type === 'success') {
        await createSessionFromUrl(res.url);
        return null;
      }
      return 'Connexion annulée';
    } catch {
      return 'La connexion n’a pas abouti. Réessaie dans un instant.';
    }
  }, []);

  const signOut = useCallback(async () => {
    // Déconnexion LOCALE uniquement, et rien d'autre.
    //
    // Une version précédente lançait en plus une révocation globale en
    // arrière-plan (POST /logout?scope=global). Danger réel, constaté : cette
    // requête part après que l'écran d'accueil est affiché ; si la personne se
    // reconnecte dans la foulée, la révocation arrive APRÈS la nouvelle
    // connexion et tue la session toute neuve. On se retrouve alors avec une
    // session stockée localement mais morte côté serveur : le profil ne
    // charge plus, la navigation croit à un compte non onboardé et renvoie
    // vers l'onboarding, et tout appel authentifié échoue. Ne jamais
    // réintroduire cette révocation différée.
    //
    // Effacer la session du stockage suffit : le jeton ne subsiste nulle part
    // sur l'appareil.
    const [{ unregisterPushToken }, { cacheClear }] = await Promise.all([
      import('@/services/notifications'),
      import('@/utils/cache'),
    ]);
    // Le retrait du token push doit passer AVANT la coupure (après, RLS le
    // refuse). Borné à une seconde : un réseau lent ne retient personne.
    await Promise.race([
      Promise.allSettled([unregisterPushToken(), cacheClear()]),
      new Promise((r) => setTimeout(r, 1000)),
    ]);
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        syncing,
        refreshProfile,
        signInWithEmail,
        signUpWithEmail,
        sendEmailCode,
        verifyEmailCode,
        signInWithOAuth,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}
