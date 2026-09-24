-- ============================================================
-- ARGONAUT OS · Paket PJ · Fuhrpark (B18) + Geraete mit QR (B24) — 24.09.2026
--   fahrzeuge          + uvv_bis, leasing_ende, fahrer_name (nur neue Spalten)
--   fahrzeug_eintrag   Tanken, Laden, km, Schaden, Uebergabe, Werkstatt, Reifen
--   geraet_ereignis    Ausgabe, Rueckgabe, Defekt, Standort, Pruefung, Reparatur
--
-- ADDITIV UND IDEMPOTENT: drei neue Spalten, zwei neue Tabellen. Nichts
-- Bestehendes wird geaendert oder geloescht.
-- Die Tabellen fahrzeuge und inventar haben keine SQL-Datei im Repo. Die
-- Fremdschluessel werden deshalb nur gesetzt, wenn die id dort wirklich
-- uuid ist (sonst bleibt die Spalte ohne Fremdschluessel — kein Abbruch).
-- RLS: Chef alles. Mitarbeiter sehen die Eintraege des Betriebs und duerfen
-- NUR hinzufuegen, was von unterwegs kommt (Tanken, km, Schaden, Uebergabe /
-- Mitnehmen, Zurueckgeben, Defekt, Standort, Notiz). Pruefung, Reparatur,
-- Kosten fuer Werkstatt und Reifen, Aendern und Loeschen: nur der Chef.
-- ============================================================

alter table public.fahrzeuge add column if not exists uvv_bis date;
alter table public.fahrzeuge add column if not exists leasing_ende date;
alter table public.fahrzeuge add column if not exists fahrer_name text;

create table if not exists public.fahrzeug_eintrag (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  erstellt_von  uuid default auth.uid(),
  fahrzeug_id   uuid not null,
  art           text not null check (art in ('tanken', 'laden', 'werkstatt', 'reifen', 'schaden', 'km', 'uebergabe', 'sonstiges')),
  datum         date not null default current_date,
  km_stand      integer check (km_stand is null or km_stand between 0 and 5000000),
  betrag_brutto numeric(12,2),
  menge         numeric(10,2),
  fahrer_name   text,
  beschreibung  text,
  erledigt      boolean not null default false,
  erstellt_am   timestamptz not null default now()
);
create index if not exists fahrzeug_eintrag_fz_idx on public.fahrzeug_eintrag (fahrzeug_id, datum desc);
create index if not exists fahrzeug_eintrag_owner_idx on public.fahrzeug_eintrag (owner_user_id, art);

create table if not exists public.geraet_ereignis (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null default coalesce(mein_chef_id(), auth.uid()),
  erstellt_von         uuid default auth.uid(),
  inventar_id          uuid not null,
  art                  text not null check (art in ('ausgabe', 'rueckgabe', 'pruefung', 'reparatur', 'defekt', 'standort', 'notiz')),
  datum                date not null default current_date,
  person_name          text,
  standort             text,
  bestanden            boolean,
  naechste_pruefung_am date,
  bemerkung            text,
  erstellt_am          timestamptz not null default now()
);
create index if not exists geraet_ereignis_inv_idx on public.geraet_ereignis (inventar_id, datum desc);
create index if not exists geraet_ereignis_owner_idx on public.geraet_ereignis (owner_user_id, art);

-- Fremdschluessel nur, wenn fahrzeuge.id / inventar.id wirklich uuid sind
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='fahrzeuge' and column_name='id' and data_type='uuid')
     and not exists (select 1 from pg_constraint where conname='fahrzeug_eintrag_fahrzeug_fk') then
    alter table public.fahrzeug_eintrag add constraint fahrzeug_eintrag_fahrzeug_fk
      foreign key (fahrzeug_id) references public.fahrzeuge(id) on delete cascade;
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='inventar' and column_name='id' and data_type='uuid')
     and not exists (select 1 from pg_constraint where conname='geraet_ereignis_inventar_fk') then
    alter table public.geraet_ereignis add constraint geraet_ereignis_inventar_fk
      foreign key (inventar_id) references public.inventar(id) on delete cascade;
  end if;
end $$;

alter table public.fahrzeug_eintrag enable row level security;
alter table public.geraet_ereignis enable row level security;

do $$
begin
  -- fahrzeug_eintrag
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fahrzeug_eintrag' and policyname='fahrzeug_eintrag_chef') then
    create policy fahrzeug_eintrag_chef on public.fahrzeug_eintrag for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fahrzeug_eintrag' and policyname='fahrzeug_eintrag_ma_select') then
    create policy fahrzeug_eintrag_ma_select on public.fahrzeug_eintrag for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='fahrzeug_eintrag' and policyname='fahrzeug_eintrag_ma_insert') then
    create policy fahrzeug_eintrag_ma_insert on public.fahrzeug_eintrag for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid()
                  and art in ('tanken', 'laden', 'km', 'schaden', 'uebergabe') and erledigt = false);
  end if;

  -- geraet_ereignis
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='geraet_ereignis' and policyname='geraet_ereignis_chef') then
    create policy geraet_ereignis_chef on public.geraet_ereignis for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='geraet_ereignis' and policyname='geraet_ereignis_ma_select') then
    create policy geraet_ereignis_ma_select on public.geraet_ereignis for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='geraet_ereignis' and policyname='geraet_ereignis_ma_insert') then
    create policy geraet_ereignis_ma_insert on public.geraet_ereignis for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid()
                  and art in ('ausgabe', 'rueckgabe', 'defekt', 'standort', 'notiz'));
  end if;
end $$;

-- Kontrolle + LESEN: EINE Ergebnistabelle (der Editor zeigt nur das letzte Ergebnis).
-- Zeigt auch, ob Mitarbeiter fahrzeuge / inventar ueberhaupt lesen duerfen.
select '1 tabelle' as art, tablename as name, rowsecurity::text as wert
  from pg_tables where schemaname = 'public' and tablename in ('fahrzeug_eintrag', 'geraet_ereignis', 'fahrzeuge', 'inventar')
union all
select '2 id-typ', table_name, data_type
  from information_schema.columns where table_schema = 'public' and table_name in ('fahrzeuge', 'inventar') and column_name = 'id'
union all
select '3 fremdschluessel', conname, 'ja'
  from pg_constraint where conname in ('fahrzeug_eintrag_fahrzeug_fk', 'geraet_ereignis_inventar_fk')
union all
select '4 neue spalte', column_name, data_type
  from information_schema.columns where table_schema = 'public' and table_name = 'fahrzeuge' and column_name in ('uvv_bis', 'leasing_ende', 'fahrer_name')
union all
select '5 regel', tablename || ' / ' || policyname, cmd || ' · ' || coalesce(qual, with_check, '')
  from pg_policies where schemaname = 'public' and tablename in ('fahrzeug_eintrag', 'geraet_ereignis', 'fahrzeuge', 'inventar')
order by 1, 2;
