-- ============================================================
-- BLOCK 12 · DOKUMENTE & KORRESPONDENZ — K1 DATENMODELL
-- korrespondenz (Geschäftsbriefe DIN 5008) | RLS owner-only | idempotent
-- Ausgeführt: Supabase znrjnndfzzydnhbyntwa (eu-north-1)
-- ============================================================

create table if not exists public.korrespondenz (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,

  brief_nummer      text,                          -- BR-JJJJ-XXXX (Vergabe in K2)
  brief_art         text not null default 'anschreiben'
                      check (brief_art in ('anschreiben','angebot','mahnung','kuendigung','allgemein')),
  status            text not null default 'entwurf'
                      check (status in ('entwurf','final','versendet')),

  betreff           text not null,
  brieftext         text,                          -- eigentlicher Fließtext

  -- Absender (Platzhalter, solange Firmen-Einstellungen nicht verbunden)
  absender_name     text,
  absender_anschrift text,

  -- Empfänger (Freitext für Solo-Betrieb; kontakt_id folgt im Finale)
  empfaenger_name   text,
  empfaenger_anschrift text,

  -- Platzhalter (NICHT verbunden — erst im Finale)
  firma_id          uuid,
  kunde_id          uuid,
  kontakt_id        uuid,

  versendet_am      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- INDIZES
create index if not exists idx_korr_owner  on public.korrespondenz(owner_user_id);
create index if not exists idx_korr_status on public.korrespondenz(status);
create index if not exists idx_korr_art    on public.korrespondenz(brief_art);

-- updated_at automatisch pflegen (Funktion existiert bereits aus Block 11 —
-- create or replace ist idempotent und ungefährlich)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_korr_updated on public.korrespondenz;
create trigger trg_korr_updated
  before update on public.korrespondenz
  for each row execute function public.set_updated_at();

-- ROW LEVEL SECURITY (owner-only)
alter table public.korrespondenz enable row level security;

drop policy if exists korr_select on public.korrespondenz;
create policy korr_select on public.korrespondenz
  for select using (owner_user_id = auth.uid());

drop policy if exists korr_insert on public.korrespondenz;
create policy korr_insert on public.korrespondenz
  for insert with check (owner_user_id = auth.uid());

drop policy if exists korr_update on public.korrespondenz;
create policy korr_update on public.korrespondenz
  for update using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists korr_delete on public.korrespondenz;
create policy korr_delete on public.korrespondenz
  for delete using (owner_user_id = auth.uid());
