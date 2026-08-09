-- ============================================================
-- ARGONAUT OS · Multistandort · Lager je Filiale (Block D · #4, Push 1)
-- Additive Filial-Bestands-Ebene NEBEN dem globalen artikel.aktueller_bestand.
-- Der globale Bestand bleibt UNVERÄNDERT die Gesamtsumme (Sicherheitsnetz —
-- nichts wird überschrieben). Diese Tabellen ergänzen den Bestand JE FILIALE
-- und die Umlagerungen zwischen Filialen.
--
-- Grund (SAFETY-FIRST): Heute ist der Bestand EIN Feld je Artikel. Würde man die
-- Artikel-Liste einfach filial-filtern, überschrieben zwei Filialen denselben
-- globalen Wert. Darum eigene Bestands-Zeilen je (Artikel, Standort).
--
-- RLS wie kfz_fahrzeuge/bau_lv: Chef volle Rechte; Mitarbeiter des Chefs
-- (mein_chef_id()) dürfen lesen/schreiben (Lager ist operativ).
-- Additiv · idempotent · NICHT destruktiv.
-- ============================================================

-- 1) Bestand je (Artikel, Standort) -------------------------------------------
create table if not exists public.artikel_bestand_standort (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  artikel_id      uuid not null references public.artikel(id)   on delete cascade,
  standort_id     uuid not null references public.standorte(id) on delete cascade,
  bestand         numeric not null default 0,
  aktualisiert_am timestamptz not null default now(),
  unique (artikel_id, standort_id)
);

create index if not exists artikel_bestand_standort_owner_idx    on public.artikel_bestand_standort (owner_user_id);
create index if not exists artikel_bestand_standort_artikel_idx  on public.artikel_bestand_standort (artikel_id);
create index if not exists artikel_bestand_standort_standort_idx on public.artikel_bestand_standort (standort_id);

alter table public.artikel_bestand_standort enable row level security;

drop policy if exists abs_owner_all on public.artikel_bestand_standort;
create policy abs_owner_all on public.artikel_bestand_standort
  as PERMISSIVE for ALL to public
  using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));

drop policy if exists abs_select_ma on public.artikel_bestand_standort;
create policy abs_select_ma on public.artikel_bestand_standort
  as PERMISSIVE for SELECT to public using ((owner_user_id = mein_chef_id()));

drop policy if exists abs_insert_ma on public.artikel_bestand_standort;
create policy abs_insert_ma on public.artikel_bestand_standort
  as PERMISSIVE for INSERT to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists abs_update_ma on public.artikel_bestand_standort;
create policy abs_update_ma on public.artikel_bestand_standort
  as PERMISSIVE for UPDATE to public
  using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

drop policy if exists abs_delete_ma on public.artikel_bestand_standort;
create policy abs_delete_ma on public.artikel_bestand_standort
  as PERMISSIVE for DELETE to public using ((owner_user_id = mein_chef_id()));

-- 2) Umlagerungen zwischen Filialen -------------------------------------------
create table if not exists public.lager_umlagerung (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null,
  artikel_id      uuid not null references public.artikel(id)   on delete cascade,
  von_standort_id uuid not null references public.standorte(id) on delete cascade,
  nach_standort_id uuid not null references public.standorte(id) on delete cascade,
  menge           numeric not null,
  datum           date not null default current_date,
  notiz           text,
  erstellt_von    uuid,
  erstellt_am     timestamptz not null default now()
);

create index if not exists lager_umlagerung_owner_idx   on public.lager_umlagerung (owner_user_id);
create index if not exists lager_umlagerung_artikel_idx on public.lager_umlagerung (artikel_id);
create index if not exists lager_umlagerung_datum_idx   on public.lager_umlagerung (datum);

alter table public.lager_umlagerung enable row level security;

drop policy if exists lum_owner_all on public.lager_umlagerung;
create policy lum_owner_all on public.lager_umlagerung
  as PERMISSIVE for ALL to public
  using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));

drop policy if exists lum_select_ma on public.lager_umlagerung;
create policy lum_select_ma on public.lager_umlagerung
  as PERMISSIVE for SELECT to public using ((owner_user_id = mein_chef_id()));

drop policy if exists lum_insert_ma on public.lager_umlagerung;
create policy lum_insert_ma on public.lager_umlagerung
  as PERMISSIVE for INSERT to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists lum_delete_ma on public.lager_umlagerung;
create policy lum_delete_ma on public.lager_umlagerung
  as PERMISSIVE for DELETE to public using ((owner_user_id = mein_chef_id()));
