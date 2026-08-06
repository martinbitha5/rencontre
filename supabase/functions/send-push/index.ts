// Edge Function « send-push » — envoie les notifications push Expo.
// Appelée uniquement par les triggers Postgres (via pg_net) avec un secret
// partagé ; jamais par les clients. Voir migration 007_push_notifications.sql.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PUSH_SECRET = '8f9c0ceb97fdaf6240a3d20edbe557a083145083f53b317579e6e3f56eb754c4';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface PushMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: Record<string, string>;
}

async function tokensFor(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);
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

/** Envoie les push et purge les tokens expirés (DeviceNotRegistered). */
async function sendAll(messages: PushMessage[]): Promise<void> {
  if (!messages.length) return;
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) return;
  const json = await res.json().catch(() => null);
  const tickets: { status: string; details?: { error?: string } }[] = json?.data ?? [];
  const dead: string[] = [];
  tickets.forEach((t, i) => {
    if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') {
      dead.push(messages[i].to);
    }
  });
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
      const { match_id, sender_id, content } = payload;
      const { data: match } = await supabase
        .from('matches')
        .select('user_a, user_b')
        .eq('id', match_id)
        .maybeSingle();
      if (!match) return new Response('ok');
      const recipient = match.user_a === sender_id ? match.user_b : match.user_a;
      const [tokens, name] = await Promise.all([
        tokensFor(recipient),
        displayName(sender_id),
      ]);
      await sendAll(
        tokens.map((to) => ({
          to,
          title: name,
          body: content || 'Nouveau message',
          sound: 'default' as const,
          data: { type: 'message', match_id },
        })),
      );
    } else if (payload.type === 'match') {
      const { match_id, user_a, user_b } = payload;
      const [tokensA, tokensB, nameA, nameB] = await Promise.all([
        tokensFor(user_a),
        tokensFor(user_b),
        displayName(user_a),
        displayName(user_b),
      ]);
      const make = (tokens: string[], otherName: string) =>
        tokens.map((to) => ({
          to,
          title: 'Nouveau match',
          body: `Tu as matché avec ${otherName}. Dis bonjour !`,
          sound: 'default' as const,
          data: { type: 'match', match_id },
        }));
      await sendAll([...make(tokensA, nameB), ...make(tokensB, nameA)]);
    }
  } catch {
    // Ne jamais faire échouer la requête du trigger : les push sont best-effort.
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
