// Edge Function « send-push » — notifications push Expo.
// Appelée uniquement par les triggers Postgres (via pg_net) avec un secret
// partagé dans l'en-tête x-push-secret ; jamais par les clients.
// Six cas : message dans une conversation, invitation DM (premier message
// d'un match pending), match mutuel (voir migration push_notifications_v2),
// les deux avis de fin d'Incognito (trigger profiles_incognito_expiry,
// migration 055) et la photo retirée par la modération (migration 063).
import { createClient } from 'npm:@supabase/supabase-js@2';

// Secret partagé : variable d'environnement PUSH_SECRET si définie
// (supabase secrets set PUSH_SECRET=...), sinon la valeur historique,
// identique à celle stockée dans Vault côté SQL.
const PUSH_SECRET =
  Deno.env.get('PUSH_SECRET') ??
  '8f9c0ceb97fdaf6240a3d20edbe557a083145083f53b317579e6e3f56eb754c4';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH = 100; // taille de lot recommandée par l'API Expo Push

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  channelId: 'default';
  data: Record<string, string>;
}

function push(
  to: string,
  title: string,
  body: string,
  data: Record<string, string>,
): PushMessage {
  return { to, title, body, sound: 'default', priority: 'high', channelId: 'default', data };
}

async function tokensFor(userId: string): Promise<string[]> {
  const { data } = await supabase.from('push_tokens').select('token').eq('user_id', userId);
  return (data ?? []).map((r: { token: string }) => r.token);
}

async function displayName(userId: string): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.display_name ?? 'Quelqu’un';
}

/** Envoie par lots et purge les tokens expirés (DeviceNotRegistered). */
async function sendAll(messages: PushMessage[]): Promise<void> {
  if (!messages.length) return;
  const dead: string[] = [];
  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const chunk = messages.slice(i, i + EXPO_BATCH);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk),
      });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      const tickets: { status: string; details?: { error?: string } }[] = json?.data ?? [];
      tickets.forEach((t, j) => {
        if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') {
          dead.push(chunk[j].to);
        }
      });
    } catch {
      // lot en échec : on continue avec les suivants
    }
  }
  if (dead.length) {
    await supabase.from('push_tokens').delete().in('token', dead);
  }
}

Deno.serve(async (req: Request) => {
  if (req.headers.get('x-push-secret') !== PUSH_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  let payload: Record<string, string>;
  try {
    payload = await req.json();
  } catch {
    return new Response('bad request', { status: 400 });
  }

  try {
    if (payload.type === 'message') {
      const { match_id, sender_id, kind, preview } = payload;
      const { data: match } = await supabase
        .from('matches')
        .select('user_a, user_b, status, initiated_by')
        .eq('id', match_id)
        .maybeSingle();
      if (!match) return new Response('ok');

      // Destinataire : l'autre membre du match, jamais l'expéditeur.
      const recipient = match.user_a === sender_id ? match.user_b : match.user_a;
      const [tokens, name] = await Promise.all([tokensFor(recipient), displayName(sender_id)]);
      if (!tokens.length) return new Response('ok');

      // Invitation DM : le match est encore pending et c'est l'initiateur qui
      // écrit. Le destinataire la retrouve dans l'onglet Activité.
      const isInvite = match.status === 'pending' && match.initiated_by === sender_id;
      if (isInvite) {
        await sendAll(
          tokens.map((to) =>
            push(to, 'Nouveau message', `${name} t'a écrit`, {
              type: 'dm_invite',
              match_id,
              url: '/(tabs)/likes',
            }),
          ),
        );
      } else {
        // Aperçu court seulement, jamais le contenu entier (tronqué côté SQL).
        const body =
          kind === 'audio'
            ? `${name} t'a envoyé une note vocale`
            : kind === 'image'
              ? `${name} t'a envoyé une photo`
              : kind === 'video'
                ? `${name} t'a envoyé une vidéo`
                : `${name} : ${preview || 'Nouveau message'}`;
        await sendAll(
          tokens.map((to) =>
            push(to, 'Nouveau message', body, {
              type: 'message',
              match_id,
              url: `/chat/${match_id}`,
            }),
          ),
        );
      }
    } else if (payload.type === 'match') {
      // Match actif dès la création (like mutuel) : on prévient les deux.
      const { match_id, user_a, user_b } = payload;
      const [tokensA, tokensB, nameA, nameB] = await Promise.all([
        tokensFor(user_a),
        tokensFor(user_b),
        displayName(user_a),
        displayName(user_b),
      ]);
      const make = (tokens: string[], otherName: string) =>
        tokens.map((to) =>
          push(to, 'Nouveau match !', `Tu peux discuter avec ${otherName}`, {
            type: 'match',
            match_id,
            url: `/chat/${match_id}`,
          }),
        );
      await sendAll([...make(tokensA, nameB), ...make(tokensB, nameA)]);
    } else if (payload.type === 'incognito_ending') {
      // Trigger profiles_incognito_expiry (migration 055) : l'abonnement
      // Incognito se termine dans moins de 3 jours. Le lien ouvre le Profil,
      // où la carte Incognito affiche l'échéance et permet de prolonger.
      const { user_id, until } = payload;
      const tokens = await tokensFor(user_id);
      if (!tokens.length) return new Response('ok');
      const date = until
        ? new Date(until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
        : null;
      const body = date
        ? `Tu redeviendras visible dans Rencontres le ${date}. Prolonge-le si tu veux rester discret.`
        : 'Tu redeviendras bientôt visible dans Rencontres. Prolonge-le si tu veux rester discret.';
      await sendAll(
        tokens.map((to) =>
          push(to, 'Ton mode Incognito se termine bientôt', body, {
            type: 'incognito_ending',
            url: '/(tabs)/profile',
          }),
        ),
      );
    } else if (payload.type === 'incognito_ended') {
      // Même trigger : l'échéance est passée, l'incognito vient d'être coupé.
      const { user_id } = payload;
      const tokens = await tokensFor(user_id);
      if (!tokens.length) return new Response('ok');
      await sendAll(
        tokens.map((to) =>
          push(
            to,
            'Ton mode Incognito est terminé',
            'Ton profil apparaît de nouveau dans Rencontres. Tu peux le réactiver depuis ton profil.',
            { type: 'incognito_ended', url: '/(tabs)/profile' },
          ),
        ),
      );
    } else if (payload.type === 'photo_removed') {
      // admin_delete_photo (migration 063) : la modération a retiré une photo.
      // Le lien ouvre Modifier le profil, qui affiche un bandeau au-dessus de
      // la grille. Le motif interne du backoffice n'est jamais envoyé.
      const { user_id, photos_left } = payload;
      const tokens = await tokensFor(user_id);
      if (!tokens.length) return new Response('ok');
      const body =
        photos_left === '0'
          ? "Elle ne respectait pas nos règles. Ton profil n'a plus de photo : ajoutes-en une pour rester visible."
          : 'Elle ne respectait pas nos règles. Touche ici pour en ajouter une nouvelle.';
      await sendAll(
        tokens.map((to) =>
          push(to, 'Une de tes photos a été retirée', body, {
            type: 'photo_removed',
            url: '/(tabs)/profile/edit?focus=photos',
          }),
        ),
      );
    }
  } catch {
    // Ne jamais faire échouer la requête du trigger : les push sont best-effort.
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
