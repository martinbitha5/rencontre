-- 065 : voir les personnes que j'ai bloquées, et les débloquer.
--
-- block_user() existait (migration 003) mais rien ne permettait de revenir en
-- arrière ni même de revoir sa liste. L'écran « Gérer ta confidentialité »
-- de l'app s'appuie sur ces deux fonctions.
--
-- Débloquer retire seulement le blocage : les deux profils peuvent de nouveau
-- se croiser. Une conversation fermée par le blocage RESTE fermée (on ne
-- rouvre pas en silence un échange que l'un des deux avait coupé).

create or replace function public.get_my_blocks()
returns table(user_id uuid, display_name text, photo text, blocked_at timestamptz)
language sql
stable security definer
set search_path to ''
as $$
  select b.blocked_id,
         p.display_name,
         (select ph.storage_path from public.photos ph
           where ph.user_id = b.blocked_id order by ph.position limit 1),
         b.created_at
    from public.blocks b
    left join public.profiles p on p.user_id = b.blocked_id
   where b.blocker_id = (select auth.uid())
   order by b.created_at desc
   limit 500;
$$;

create or replace function public.unblock_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'non_authentifie'; end if;
  delete from public.blocks where blocker_id = v_me and blocked_id = p_target;
end $$;

revoke execute on function public.get_my_blocks() from public, anon;
revoke execute on function public.unblock_user(uuid) from public, anon;
grant execute on function public.get_my_blocks() to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
