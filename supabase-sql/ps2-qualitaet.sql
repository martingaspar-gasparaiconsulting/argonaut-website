-- ============================================================
-- ARGONAUT OS · Paket PS2 · Qualitaet & Rueckverfolgung — Stand 24.09.2026
--   qs_reklamation          8D-Reklamationen (Kunde / Lieferant / intern)
--   qs_lieferant_bewertung  Lieferanten-Bewertung A/B/C (nur Chef)
--   qs_rueckruf             Rueckrufe mit Checkliste, Abnehmern, Ruecklauf
--   gefahrstoff             Gefahrstoffverzeichnis nach § 6 GefStoffV
--
-- ADDITIV UND IDEMPOTENT: vier neue Tabellen, nichts Bestehendes angefasst.
-- Besitzer = Betrieb (coalesce(mein_chef_id(), auth.uid())), wie PG/PO.
-- RLS:
--   Reklamationen: Chef alles; Mitarbeiter lesen, anlegen, bearbeiten (8D ist
--                  Teamarbeit) — loeschen nur der Chef.
--   Lieferanten-Bewertung: nur Chef.
--   Rueckruf: Chef alles; Mitarbeiter lesen.
--   Gefahrstoffe: Chef alles; Mitarbeiter lesen (Beschaeftigte muessen
--                 Zugang zum Verzeichnis haben).
-- ============================================================

create table if not exists public.qs_reklamation (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default coalesce(mein_chef_id(), auth.uid()),
  nummer           text not null,
  richtung         text not null check (richtung in ('kunde', 'lieferant', 'intern')),
  eingang_am       date not null default current_date,
  gegenstand       text not null,
  charge_nr        text,
  partner          text,
  lieferant_id     text,
  kosten           numeric(12,2),
  schritte         jsonb not null default '{}'::jsonb,
  wirksam          boolean not null default false,
  abgeschlossen_am date,
  erstellt_von     uuid default auth.uid(),
  erstellt_am      timestamptz not null default now(),
  aktualisiert_am  timestamptz not null default now()
);
create unique index if not exists qs_reklamation_nummer_uidx on public.qs_reklamation (owner_user_id, nummer);
create index if not exists qs_reklamation_lieferant_idx on public.qs_reklamation (owner_user_id, lieferant_id);

create table if not exists public.qs_lieferant_bewertung (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null default auth.uid(),
  lieferant_id   text not null,
  lieferant_name text,
  datum          date not null default current_date,
  qualitaet      smallint check (qualitaet between 1 and 5),
  liefertreue    smallint check (liefertreue between 1 and 5),
  preis          smallint check (preis between 1 and 5),
  service        smallint check (service between 1 and 5),
  wert           smallint check (wert between 0 and 100),
  klasse         text check (klasse in ('A', 'B', 'C')),
  reklamationen  integer,
  notiz          text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists qs_lieferant_bewertung_idx on public.qs_lieferant_bewertung (owner_user_id, lieferant_id, datum desc);

create table if not exists public.qs_rueckruf (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default auth.uid(),
  art              text not null check (art in ('lebensmittel', 'produkt')),
  quelle           text not null check (quelle in ('charge_los', 'lm_chargen')),
  charge_id        text not null,
  charge_nr        text,
  produkt          text not null,
  grund            text,
  gestartet_am     date not null default current_date,
  schritte         jsonb not null default '{}'::jsonb,
  abnehmer         jsonb not null default '[]'::jsonb,
  zurueck          jsonb not null default '{}'::jsonb,
  abgeschlossen_am date,
  erstellt_am      timestamptz not null default now()
);
create index if not exists qs_rueckruf_owner_idx on public.qs_rueckruf (owner_user_id, gestartet_am desc);

create table if not exists public.gefahrstoff (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null default auth.uid(),
  bezeichnung          text not null,
  hersteller           text,
  h_saetze             text,
  piktogramme          text[] not null default '{}',
  signalwort           text check (signalwort is null or signalwort in ('Gefahr', 'Achtung')),
  mengenbereich        text,
  arbeitsbereiche      text,
  sdb_datum            date,
  betriebsanweisung_am date,
  ersatz_geprueft_am   date,
  notiz                text,
  erstellt_am          timestamptz not null default now(),
  aktualisiert_am      timestamptz not null default now()
);
create index if not exists gefahrstoff_owner_idx on public.gefahrstoff (owner_user_id);

alter table public.qs_reklamation enable row level security;
alter table public.qs_lieferant_bewertung enable row level security;
alter table public.qs_rueckruf enable row level security;
alter table public.gefahrstoff enable row level security;

do $$
begin
  -- Reklamationen
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='qs_reklamation' and policyname='qs_rek_chef') then
    create policy qs_rek_chef on public.qs_reklamation for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='qs_reklamation' and policyname='qs_rek_ma_select') then
    create policy qs_rek_ma_select on public.qs_reklamation for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='qs_reklamation' and policyname='qs_rek_ma_insert') then
    create policy qs_rek_ma_insert on public.qs_reklamation for insert to authenticated
      with check (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='qs_reklamation' and policyname='qs_rek_ma_update') then
    create policy qs_rek_ma_update on public.qs_reklamation for update to authenticated
      using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());
  end if;

  -- Lieferanten-Bewertung: nur Chef
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='qs_lieferant_bewertung' and policyname='qs_bew_chef') then
    create policy qs_bew_chef on public.qs_lieferant_bewertung for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;

  -- Rueckruf
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='qs_rueckruf' and policyname='qs_rr_chef') then
    create policy qs_rr_chef on public.qs_rueckruf for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='qs_rueckruf' and policyname='qs_rr_ma_select') then
    create policy qs_rr_ma_select on public.qs_rueckruf for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;

  -- Gefahrstoffe
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gefahrstoff' and policyname='gefahrstoff_chef') then
    create policy gefahrstoff_chef on public.gefahrstoff for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gefahrstoff' and policyname='gefahrstoff_ma_select') then
    create policy gefahrstoff_ma_select on public.gefahrstoff for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
end $$;

-- LESEN (Kontrolle): Regeln je Tabelle
select tablename, count(*) as regeln
from pg_policies
where schemaname = 'public' and tablename in ('qs_reklamation', 'qs_lieferant_bewertung', 'qs_rueckruf', 'gefahrstoff')
group by tablename
order by tablename;
