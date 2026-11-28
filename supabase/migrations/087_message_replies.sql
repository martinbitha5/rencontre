-- ---------------------------------------------------------------------------
-- 087 : répondre à un message précis (28/11/2026)
--
-- Dans une conversation, balayer une bulle vers la droite cite ce message :
-- la réponse porte reply_to_id, et l'app affiche le message cité au-dessus
-- de la réponse. Si le message cité est supprimé, la réponse reste, sans
-- citation (on delete set null).
--
-- Garde-fou : on ne peut citer qu'un message de la MÊME conversation. Une
-- référence vers une autre conversation (forgée à la main) est effacée par
-- le trigger, jamais lue : elle ne peut pas servir à lire un message d'un
-- autre fil.
-- ---------------------------------------------------------------------------

alter table public.messages
  add column if not exists reply_to_id bigint references public.messages (id) on delete set null;

comment on column public.messages.reply_to_id is
  'Message cité par cette réponse (même conversation). null = pas de citation.';

create index if not exists messages_reply_to_id_idx
  on public.messages (reply_to_id) where reply_to_id is not null;

create or replace function public.messages_check_reply()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from public.messages r
     where r.id = new.reply_to_id and r.match_id = new.match_id
  ) then
    new.reply_to_id := null;
  end if;
  return new;
end $function$;

drop trigger if exists messages_check_reply on public.messages;
create trigger messages_check_reply
  before insert on public.messages
  for each row execute function public.messages_check_reply();

grant insert (reply_to_id) on public.messages to authenticated;
grant select (reply_to_id) on public.messages to authenticated;
