-- ============================================================
-- ARGONAUT OS · Bündel 19 · Bau & Handwerk komplett
-- Leistungsverzeichnis (LV) mit Positionen & Nachträgen sowie Abnahme-
-- protokolle mit Mängelliste. Aus einem LV entsteht per Brücke eine Rechnung.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.bau_lv (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  projekt_id     uuid references public.projekte(id) on delete set null,
  kontakt_id     uuid references public.kontakte(id) on delete set null,
  titel          text not null default 'Leistungsverzeichnis',
  kunde_name     text,
  status         text not null default 'entwurf',   -- entwurf | beauftragt | abgerechnet
  netto_summe    numeric(12,2) not null default 0,
  notiz          text,
  rechnung_id    uuid,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists bau_lv_idx on public.bau_lv (owner_user_id, status, erstellt_am desc);

create table if not exists public.bau_lv_positionen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  lv_id          uuid not null references public.bau_lv(id) on delete cascade,
  ordnungszahl   text,                               -- z.B. 01.02.003
  kurztext       text not null default '',
  langtext       text,
  menge          numeric(12,3) not null default 0,
  einheit        text not null default 'Stk',
  einzelpreis    numeric(12,2) not null default 0,   -- netto (EP)
  mwst_satz      numeric(5,2) not null default 19,
  gesamt_netto   numeric(12,2) not null default 0,   -- GP
  ist_nachtrag   boolean not null default false,
  nachtrag_grund text,
  position       integer not null default 1
);
create index if not exists bau_lv_positionen_idx on public.bau_lv_positionen (lv_id, position);

create table if not exists public.bau_abnahmen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  projekt_id     uuid references public.projekte(id) on delete set null,
  lv_id          uuid references public.bau_lv(id) on delete set null,
  titel          text not null default 'Abnahme',
  datum          date not null default current_date,
  ort            text,
  teilnehmer     text,
  art            text not null default 'voll',        -- voll | unter_vorbehalt | verweigert
  maengel        jsonb not null default '[]'::jsonb,   -- [{beschreibung, frist, behoben}]
  unterschrift_name text,
  notiz          text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists bau_abnahmen_idx on public.bau_abnahmen (owner_user_id, datum desc);

alter table public.bau_lv enable row level security;
alter table public.bau_lv_positionen enable row level security;
alter table public.bau_abnahmen enable row level security;

-- bau_lv
drop policy if exists blv_owner_all on public.bau_lv;
create policy blv_owner_all on public.bau_lv for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists blv_select_ma on public.bau_lv;
create policy blv_select_ma on public.bau_lv for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists blv_insert_ma on public.bau_lv;
create policy blv_insert_ma on public.bau_lv for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists blv_update_ma on public.bau_lv;
create policy blv_update_ma on public.bau_lv for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

-- bau_lv_positionen
drop policy if exists blvp_owner_all on public.bau_lv_positionen;
create policy blvp_owner_all on public.bau_lv_positionen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists blvp_select_ma on public.bau_lv_positionen;
create policy blvp_select_ma on public.bau_lv_positionen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists blvp_insert_ma on public.bau_lv_positionen;
create policy blvp_insert_ma on public.bau_lv_positionen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists blvp_update_ma on public.bau_lv_positionen;
create policy blvp_update_ma on public.bau_lv_positionen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));
drop policy if exists blvp_delete_ma on public.bau_lv_positionen;
create policy blvp_delete_ma on public.bau_lv_positionen for delete to public using ((owner_user_id = mein_chef_id()));

-- bau_abnahmen
drop policy if exists bab_owner_all on public.bau_abnahmen;
create policy bab_owner_all on public.bau_abnahmen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists bab_select_ma on public.bau_abnahmen;
create policy bab_select_ma on public.bau_abnahmen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists bab_insert_ma on public.bau_abnahmen;
create policy bab_insert_ma on public.bau_abnahmen for insert to public with check ((owner_user_id = mein_chef_id()));
