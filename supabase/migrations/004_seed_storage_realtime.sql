-- Dowe : seed villes RDC + storage + realtime (appliqué le 2026-07-24)
insert into public.cities (name, province) values
  ('Kinshasa', 'Kinshasa'),
  ('Lubumbashi', 'Haut-Katanga'),
  ('Mbuji-Mayi', 'Kasaï-Oriental'),
  ('Kananga', 'Kasaï-Central'),
  ('Kisangani', 'Tshopo'),
  ('Bukavu', 'Sud-Kivu'),
  ('Goma', 'Nord-Kivu'),
  ('Likasi', 'Haut-Katanga'),
  ('Kolwezi', 'Lualaba'),
  ('Tshikapa', 'Kasaï'),
  ('Matadi', 'Kongo-Central'),
  ('Mbandaka', 'Équateur'),
  ('Boma', 'Kongo-Central'),
  ('Uvira', 'Sud-Kivu'),
  ('Butembo', 'Nord-Kivu'),
  ('Beni', 'Nord-Kivu'),
  ('Bunia', 'Ituri'),
  ('Kikwit', 'Kwilu'),
  ('Bandundu', 'Kwilu'),
  ('Kalemie', 'Tanganyika'),
  ('Kindu', 'Maniema'),
  ('Isiro', 'Haut-Uele'),
  ('Gemena', 'Sud-Ubangi'),
  ('Kabinda', 'Lomami'),
  ('Mwene-Ditu', 'Lomami'),
  ('Gbadolite', 'Nord-Ubangi'),
  ('Inongo', 'Maï-Ndombe'),
  ('Boende', 'Tshuapa'),
  ('Lisala', 'Mongala'),
  ('Buta', 'Bas-Uele'),
  ('Lodja', 'Sankuru'),
  ('Kamina', 'Haut-Lomami'),
  ('Kenge', 'Kwango'),
  ('Luebo', 'Kasaï')
on conflict (name) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "photos_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos_storage_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos_storage_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.matches;
