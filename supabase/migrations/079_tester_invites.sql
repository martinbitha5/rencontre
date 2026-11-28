-- ---------------------------------------------------------------------------
-- 079 : registre des invitations testeur envoyées (27/11/2026)
--
-- Une ligne par adresse invitée au test fermé Google Play. Sert de garde
-- contre le double envoi : la fonction tester-invite-send n'écrit à une
-- adresse que si elle n'a pas déjà le statut 'sent'. Rejouer l'envoi ne
-- renvoie donc rien à ceux qui l'ont déjà reçu, et ne retente que les échecs.
--
-- Aucune policy : seul le service_role (fonctions Edge) lit et écrit.
-- ---------------------------------------------------------------------------

create table if not exists public.tester_invites (
  email text primary key check (email = lower(email)),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  brevo_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

alter table public.tester_invites enable row level security;

comment on table public.tester_invites is
  'Invitations au test fermé Android envoyées par Brevo. Garde anti double envoi.';
