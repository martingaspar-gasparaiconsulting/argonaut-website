-- ============================================================
-- ARGONAUT OS · Bündel 32 · Tier-Fachpaket
-- Tierkartei (mit Halter) + Behandlungen/Impfungen mit Wiederholungsfrist.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.tier_tiere (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  halter        text,
  name          text not null default 'Tier',
  art           text,                                  -- Hund/Katze/Pferd/Rind ...
  rasse         text,
  geburtsdatum  date,
  chip_nr       text,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists tier_tiere_idx on public.tier_tiere (owner_user_id, name);

create table if not exists public.tier_behandlungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  tier_id       uuid not null references public.tier_tiere(id) on delete cascade,
  datum         date not null default current_date,
  art           text not null default 'behandlung',    -- behandlung | impfung | untersuchung
  bezeichnung   text not null default '',
  naechste_faellig date,                                -- z.B. Wiederholungsimpfung
  preis         numeric(12,2) not null default 0,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists tier_beh_idx on public.tier_behandlungen (tier_id, datum desc);

alter table public.tier_tiere enable row level security;
alter table public.tier_behandlungen enable row level security;

drop policy if exists tt_owner_all on public.tier_tiere;
create policy tt_owner_all on public.tier_tiere for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists tt_select_ma on public.tier_tiere;
create policy tt_select_ma on public.tier_tiere for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists tt_insert_ma on public.tier_tiere;
create policy tt_insert_ma on public.tier_tiere for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists tb_owner_all on public.tier_behandlungen;
create policy tb_owner_all on public.tier_behandlungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists tb_select_ma on public.tier_behandlungen;
create policy tb_select_ma on public.tier_behandlungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists tb_insert_ma on public.tier_behandlungen;
create policy tb_insert_ma on public.tier_behandlungen for insert to public with check ((owner_user_id = mein_chef_id()));
