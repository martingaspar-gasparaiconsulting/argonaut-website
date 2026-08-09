-- ============================================================
-- ARGONAUT OS · Multistandort · Vorlagen-Sammelbecken (Block D · Pool #1)
-- Zentraler Vorlagen-Pool: EIN Ort, aus dem jede Filiale zieht. Vorlagen mit
-- „empfohlen"-Kennzeichnung; Chef + Filialleiter befüllen, alle nutzen.
--
-- Filial-Sichtbarkeit FAIL-OPEN: standort_id NULL = zentral (überall sichtbar),
-- standort_id gesetzt = zusätzlich nur diese Filiale. Nichts verschwindet.
--
-- RLS: Chef (Eigentümer) volle Rechte; Mitarbeiter des Chefs (mein_chef_id())
-- dürfen ebenfalls lesen/schreiben — die UI begrenzt das Verwalten auf
-- Chef + Filialleiter (Muster wie kfz_fahrzeuge/bau_lv).
-- Additiv · idempotent · NICHT destruktiv.
-- ============================================================

create table if not exists public.vorlage_pool (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  kategorie       text not null default 'text',
  titel           text not null,
  inhalt          text,
  empfohlen       boolean not null default false,
  standort_id     uuid references public.standorte(id) on delete set null,  -- NULL = zentral
  erstellt_von    uuid,                                                      -- auth.uid() des Erstellers
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);

create index if not exists vorlage_pool_owner_idx
  on public.vorlage_pool (owner_user_id);
create index if not exists vorlage_pool_standort_idx
  on public.vorlage_pool (standort_id);
create index if not exists vorlage_pool_kategorie_idx
  on public.vorlage_pool (kategorie);

alter table public.vorlage_pool enable row level security;

-- Chef: volle Rechte auf die eigenen Vorlagen.
drop policy if exists vorlage_pool_owner_all on public.vorlage_pool;
create policy vorlage_pool_owner_all on public.vorlage_pool
  as PERMISSIVE for ALL to public
  using ((auth.uid() = owner_user_id))
  with check ((auth.uid() = owner_user_id));

-- Mitarbeiter des Chefs: lesen.
drop policy if exists vorlage_pool_select_ma on public.vorlage_pool;
create policy vorlage_pool_select_ma on public.vorlage_pool
  as PERMISSIVE for SELECT to public
  using ((owner_user_id = mein_chef_id()));

-- Mitarbeiter des Chefs: anlegen (UI begrenzt auf Chef + Filialleiter).
drop policy if exists vorlage_pool_insert_ma on public.vorlage_pool;
create policy vorlage_pool_insert_ma on public.vorlage_pool
  as PERMISSIVE for INSERT to public
  with check ((owner_user_id = mein_chef_id()));

-- Mitarbeiter des Chefs: ändern.
drop policy if exists vorlage_pool_update_ma on public.vorlage_pool;
create policy vorlage_pool_update_ma on public.vorlage_pool
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = mein_chef_id()))
  with check ((owner_user_id = mein_chef_id()));

-- Mitarbeiter des Chefs: löschen.
drop policy if exists vorlage_pool_delete_ma on public.vorlage_pool;
create policy vorlage_pool_delete_ma on public.vorlage_pool
  as PERMISSIVE for DELETE to public
  using ((owner_user_id = mein_chef_id()));
