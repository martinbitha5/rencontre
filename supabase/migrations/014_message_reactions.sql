-- Dowe : réactions emoji + suppression de ses messages (appliqué le 2026-07-26)

create table public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index message_reactions_match_idx on public.message_reactions (match_id);
alter table public.message_reactions enable row level security;

-- Lisibles par les deux participants de la conversation.
create policy "message_reactions_select" on public.message_reactions
  for select to authenticated using (
    exists (
      select 1 from public.matches m
      where m.id = message_reactions.match_id
        and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
    )
  );

-- On ne réagit qu'en son nom, sur un message de sa propre conversation.
create policy "message_reactions_insert_own" on public.message_reactions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.messages ms
      join public.matches m on m.id = ms.match_id
      where ms.id = message_reactions.message_id
        and ms.match_id = message_reactions.match_id
        and m.is_active
        and (m.user_a = (select auth.uid()) or m.user_b = (select auth.uid()))
    )
  );
create policy "message_reactions_update_own" on public.message_reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "message_reactions_delete_own" on public.message_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Supprimer ses propres messages (les réactions suivent par cascade).
create policy "messages_delete_own" on public.messages
  for delete to authenticated using (sender_id = (select auth.uid()));

alter publication supabase_realtime add table public.message_reactions;
