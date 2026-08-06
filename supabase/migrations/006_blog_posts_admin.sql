-- Dowe : blog + administrateurs (appliqué le 2026-07-25)
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 200),
  excerpt text default '' check (char_length(excerpt) <= 400),
  content text not null default '',
  cover_url text,
  published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_published_idx on public.posts (published_at desc) where published;

create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.posts enable row level security;

create policy "admin_users_select_self" on public.admin_users
  for select to authenticated using (user_id = (select auth.uid()));

create policy "posts_public_read" on public.posts
  for select to anon, authenticated
  using (published or exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

create policy "posts_admin_write" on public.posts
  for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog', 'blog', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "blog_storage_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'blog' and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "blog_storage_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'blog' and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
create policy "blog_storage_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog' and exists (select 1 from public.admin_users a where a.user_id = (select auth.uid())));
