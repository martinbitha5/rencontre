-- Dowe : notifications push (appliqué le 2026-07-25)
-- À chaque nouveau message ou match, un trigger appelle l'Edge Function
-- « send-push » (via pg_net, asynchrone) qui envoie les push Expo.
-- La fonction est protégée par le secret partagé x-push-secret.

create extension if not exists pg_net;

create or replace function public.notify_push_new_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://sbsxgwdpdjxsrxcccwno.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', '8f9c0ceb97fdaf6240a3d20edbe557a083145083f53b317579e6e3f56eb754c4'
    ),
    body := jsonb_build_object(
      'type', 'message',
      'match_id', new.match_id,
      'sender_id', new.sender_id,
      'content', left(new.content, 120)
    )
  );
  return new;
end $$;

create or replace function public.notify_push_new_match()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://sbsxgwdpdjxsrxcccwno.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', '8f9c0ceb97fdaf6240a3d20edbe557a083145083f53b317579e6e3f56eb754c4'
    ),
    body := jsonb_build_object(
      'type', 'match',
      'match_id', new.id,
      'user_a', new.user_a,
      'user_b', new.user_b
    )
  );
  return new;
end $$;

drop trigger if exists messages_push_notify on public.messages;
create trigger messages_push_notify
  after insert on public.messages
  for each row execute function public.notify_push_new_message();

drop trigger if exists matches_push_notify on public.matches;
create trigger matches_push_notify
  after insert on public.matches
  for each row execute function public.notify_push_new_match();
