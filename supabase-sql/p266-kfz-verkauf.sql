-- ============================================================
-- ARGONAUT OS · Paket 266 (07.10.2026) · K6 Verkaufsunterlagen
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--  1) kfz_verkauf  Verkaufsvorgang je Bestandsfahrzeug: Käufer (Verbraucher
--                  oder Unternehmer), Preis, Zusatzleistungen, Inzahlungnahme
--                  aus dem Ankauf (kfz_ankauf), Anzahlung, Zahlart,
--                  Sachmängelhaftung, Reservierung, Übergabe, Unterschriften
--                  (Verweise auf ARGONAUT-Sign), GwG-Haken bei Bargeld.
--  Schutz gegen Doppelverkauf: je Fahrzeug nur EIN Vorgang, der nicht
--  storniert ist (eindeutiger Index). Ein in Zahlung genommenes Fahrzeug
--  kann nur in EINEM laufenden Verkauf verrechnet werden.
-- Keine Ausweisnummern: nur Haken „Ausweis geprüft" (GwG läuft über
-- /dashboard/kfz/gwg). Rechte wie Paket 181: Besitzer = Betrieb (Auslöser
-- p181_besitzer), Mitarbeiter lesen mit Modul „kfz", schreiben mit
-- Schreibrecht „kfz", löschen nur der Chef.
-- ============================================================

create table if not exists public.kfz_verkauf (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null,
  bestand_id         uuid not null references public.kfz_bestand(id) on delete cascade,
  nr                 text,
  status             text not null default 'angebot' check (status in ('angebot', 'reserviert', 'vertrag', 'uebergeben', 'storniert')),
  -- Käufer
  kaeufer_art        text not null default 'verbraucher' check (kaeufer_art in ('verbraucher', 'unternehmer')),
  kaeufer_name       text check (kaeufer_name is null or char_length(kaeufer_name) <= 120),
  kaeufer_firma      text check (kaeufer_firma is null or char_length(kaeufer_firma) <= 120),
  kaeufer_anschrift  text check (kaeufer_anschrift is null or char_length(kaeufer_anschrift) <= 300),
  kaeufer_tel        text check (kaeufer_tel is null or char_length(kaeufer_tel) <= 40),
  kaeufer_email      text check (kaeufer_email is null or char_length(kaeufer_email) <= 160),
  kaeufer_ustid      text check (kaeufer_ustid is null or char_length(kaeufer_ustid) <= 20),
  kontakt_id         uuid,
  ausweis_geprueft   boolean not null default false,
  -- Preis und Zahlung (brutto)
  preis_brutto       numeric(12,2) check (preis_brutto is null or preis_brutto >= 0),
  zusatz             jsonb not null default '[]'::jsonb check (jsonb_typeof(zusatz) = 'array'),
  inzahlung_ankauf_id uuid references public.kfz_ankauf(id) on delete set null,
  inzahlung_betrag   numeric(12,2) check (inzahlung_betrag is null or inzahlung_betrag >= 0),
  anzahlung          numeric(12,2) check (anzahlung is null or anzahlung >= 0),
  anzahlung_am       date,
  anzahlung_art      text check (anzahlung_art is null or anzahlung_art in ('bar', 'ueberweisung', 'karte')),
  rest_art           text check (rest_art is null or rest_art in ('bar', 'ueberweisung', 'karte', 'finanzierung')),
  gwg_erledigt       boolean not null default false,
  -- Vertrag
  gewaehr            text not null default 'gesetzlich' check (gewaehr in ('gesetzlich', 'ein_jahr', 'ausgeschlossen')),
  gewaehr_gesondert  boolean not null default false,
  angebot_gueltig_bis date,
  reserviert_bis     date,
  vertrag_am         date,
  liefertermin       date,
  vereinbarungen     text check (vereinbarungen is null or char_length(vereinbarungen) <= 2000),
  -- Übergabe
  uebergabe_am       date,
  km_uebergabe       integer check (km_uebergabe is null or km_uebergabe >= 0),
  schluessel         integer check (schluessel is null or schluessel >= 0),
  papiere            text[] not null default '{}',
  -- Unterschriften über ARGONAUT-Sign: {"kaufvertrag": "<token>", …}
  signaturen         jsonb not null default '{}'::jsonb check (jsonb_typeof(signaturen) = 'object'),
  storno_grund       text check (storno_grund is null or char_length(storno_grund) <= 300),
  erstellt_von       uuid default auth.uid(),
  erstellt_am        timestamptz not null default now(),
  aktualisiert_am    timestamptz not null default now()
);
-- Spalte für Spalte nachziehen (falls die Tabelle aus einem Vorab-Stand schon existiert)
alter table public.kfz_verkauf add column if not exists kaeufer_ustid text;
alter table public.kfz_verkauf add column if not exists storno_grund text;

create index if not exists kfz_verkauf_owner_idx on public.kfz_verkauf (owner_user_id, status, erstellt_am);
create unique index if not exists kfz_verkauf_nr_uq on public.kfz_verkauf (owner_user_id, nr) where nr is not null;
-- Doppelverkauf verhindern: je Fahrzeug höchstens ein laufender Vorgang
create unique index if not exists kfz_verkauf_ein_laufender_uq on public.kfz_verkauf (bestand_id) where status <> 'storniert';
-- Ein Inzahlungnahme-Fahrzeug nur in einem laufenden Verkauf
create unique index if not exists kfz_verkauf_inzahlung_uq on public.kfz_verkauf (inzahlung_ankauf_id) where inzahlung_ankauf_id is not null and status <> 'storniert';

alter table public.kfz_verkauf enable row level security;

drop trigger if exists p181_besitzer on public.kfz_verkauf;
create trigger p181_besitzer before insert or update on public.kfz_verkauf
  for each row execute function public.p181_besitzer();

drop policy if exists kfzv_owner_all on public.kfz_verkauf;
create policy kfzv_owner_all on public.kfz_verkauf for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_verkauf;
create policy p181_ma_select on public.kfz_verkauf for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_verkauf;
create policy p181_ma_insert on public.kfz_verkauf for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_verkauf;
create policy p181_ma_update on public.kfz_verkauf for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- KONTROLLE — Erwartung: tabelle = 1, regeln = 4, ausloeser = 1, rls_an = true, indizes = 5
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'kfz_verkauf') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_verkauf') as regeln,
  (select count(*) from pg_trigger where tgrelid = 'public.kfz_verkauf'::regclass and not tgisinternal) as ausloeser,
  (select relrowsecurity from pg_class where oid = 'public.kfz_verkauf'::regclass) as rls_an,
  (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'kfz_verkauf') as indizes;
