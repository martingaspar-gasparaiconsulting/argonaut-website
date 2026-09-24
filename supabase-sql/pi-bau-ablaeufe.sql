-- ============================================================
-- ARGONAUT OS · Paket PI · Bau-Ablaeufe (B16) — Stand 24.09.2026
--   bau_nachtrag          Nachtraege als Ablauf (entdeckt -> abgerechnet)
--   bau_gewaehrleistung   Gewaehrleistung je Abnahme + Sicherheit
--   bau_maengelruege      Maengelruegen nach der Abnahme
--
-- ADDITIV UND IDEMPOTENT: drei neue Tabellen, nichts Bestehendes angefasst.
-- RLS nach Tenant-Muster:
--   Chef: alles.
--   Mitarbeiter: Nachtraege des Betriebs SEHEN und NEU MELDEN (nur Status
--   'entdeckt' — Mehraufwand direkt von der Baustelle). Aendern, loeschen,
--   Preise festlegen: nur der Chef. Gewaehrleistung (Sicherheiten, Betraege)
--   sieht nur der Chef. Maengelruegen: Mitarbeiter nur lesen (Termin sehen).
-- ============================================================

create table if not exists public.bau_nachtrag (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(mein_chef_id(), auth.uid()),
  erstellt_von      uuid default auth.uid(),
  projekt_id        uuid references public.projekte(id) on delete set null,
  lv_id             uuid references public.bau_lv(id) on delete set null,
  nummer            text,
  titel             text not null,
  art               text not null default 'zusaetzlich' check (art in ('zusaetzlich', 'geaendert', 'menge', 'behinderung', 'stundenlohn')),
  vertragsart       text not null default 'unklar' check (vertragsart in ('vob', 'bgb', 'unklar')),
  status            text not null default 'entdeckt' check (status in ('entdeckt', 'angekuendigt', 'angeboten', 'beauftragt', 'abgelehnt', 'abgerechnet')),
  beschreibung      text,
  ursache           text,
  entdeckt_am       date not null default current_date,
  angekuendigt_am   date,
  ausfuehrung_ab    date,
  angeboten_am      date,
  antwort_bis       date,
  beauftragt_am     date,
  beauftragt_durch  text,
  abgelehnt_am      date,
  positionen        jsonb not null default '[]'::jsonb,
  betrag_netto      numeric(12,2),
  in_lv_uebernommen boolean not null default false,
  notiz             text,
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now()
);
create index if not exists bau_nachtrag_owner_idx on public.bau_nachtrag (owner_user_id, status, erstellt_am desc);
create index if not exists bau_nachtrag_lv_idx on public.bau_nachtrag (lv_id);

create table if not exists public.bau_gewaehrleistung (
  id                      uuid primary key default gen_random_uuid(),
  owner_user_id           uuid not null default auth.uid(),
  projekt_id              uuid references public.projekte(id) on delete set null,
  lv_id                   uuid references public.bau_lv(id) on delete set null,
  abnahme_id              uuid references public.bau_abnahmen(id) on delete set null,
  bezeichnung             text not null,
  kunde_name              text,
  abnahme_am              date not null,
  regelwerk               text not null default 'individuell' check (regelwerk in ('vob_bauwerk', 'vob_sonst', 'bgb_bauwerk', 'bgb_sonst', 'individuell')),
  monate                  integer check (monate is null or monate between 1 and 360),
  sicherheit_art          text not null default 'keine' check (sicherheit_art in ('keine', 'einbehalt', 'buergschaft')),
  sicherheit_betrag       numeric(12,2),
  sicherheit_rueckgabe_am date,
  sicherheit_zurueck_am   date,
  notiz                   text,
  erstellt_am             timestamptz not null default now(),
  aktualisiert_am         timestamptz not null default now()
);
create index if not exists bau_gewaehrleistung_owner_idx on public.bau_gewaehrleistung (owner_user_id, abnahme_am desc);

create table if not exists public.bau_maengelruege (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null default auth.uid(),
  gewaehrleistung_id uuid not null references public.bau_gewaehrleistung(id) on delete cascade,
  eingang_am         date not null default current_date,
  schriftlich        boolean not null default true,
  beschreibung       text not null,
  frist_kunde        date,
  status             text not null default 'gemeldet' check (status in ('gemeldet', 'geprueft', 'termin', 'behoben', 'abgelehnt')),
  termin_am          date,
  behoben_am         date,
  abgenommen_am      date,
  ergebnis           text,
  kosten             numeric(12,2),
  erstellt_am        timestamptz not null default now(),
  aktualisiert_am    timestamptz not null default now()
);
create index if not exists bau_maengelruege_gw_idx on public.bau_maengelruege (gewaehrleistung_id, eingang_am desc);
create index if not exists bau_maengelruege_owner_idx on public.bau_maengelruege (owner_user_id, status);

alter table public.bau_nachtrag enable row level security;
alter table public.bau_gewaehrleistung enable row level security;
alter table public.bau_maengelruege enable row level security;

do $$
begin
  -- bau_nachtrag: Chef alles
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_nachtrag' and policyname='bau_nachtrag_chef') then
    create policy bau_nachtrag_chef on public.bau_nachtrag for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  -- bau_nachtrag: Mitarbeiter lesen
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_nachtrag' and policyname='bau_nachtrag_ma_select') then
    create policy bau_nachtrag_ma_select on public.bau_nachtrag for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
  -- bau_nachtrag: Mitarbeiter melden neu — nur Status 'entdeckt', ohne Preis
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_nachtrag' and policyname='bau_nachtrag_ma_insert') then
    create policy bau_nachtrag_ma_insert on public.bau_nachtrag for insert to authenticated
      with check (owner_user_id = mein_chef_id() and status = 'entdeckt' and betrag_netto is null and erstellt_von = auth.uid());
  end if;

  -- bau_gewaehrleistung: nur Chef
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_gewaehrleistung' and policyname='bau_gewaehrleistung_chef') then
    create policy bau_gewaehrleistung_chef on public.bau_gewaehrleistung for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;

  -- bau_maengelruege: Chef alles, Mitarbeiter lesen
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_maengelruege' and policyname='bau_maengelruege_chef') then
    create policy bau_maengelruege_chef on public.bau_maengelruege for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='bau_maengelruege' and policyname='bau_maengelruege_ma_select') then
    create policy bau_maengelruege_ma_select on public.bau_maengelruege for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
end $$;

-- Kontrolle: EINE Ergebnistabelle (der Editor zeigt nur das letzte Ergebnis)
select 'tabelle' as art, tablename as name, rowsecurity::text as wert
  from pg_tables where schemaname = 'public' and tablename in ('bau_nachtrag', 'bau_gewaehrleistung', 'bau_maengelruege')
union all
select 'regel', tablename || ' / ' || policyname, cmd
  from pg_policies where schemaname = 'public' and tablename in ('bau_nachtrag', 'bau_gewaehrleistung', 'bau_maengelruege')
order by 1 desc, 2;
