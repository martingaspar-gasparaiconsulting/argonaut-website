-- ============================================================
-- ARGONAUT OS · Paket 268 (07.10.2026) · K7 Rechnung Fahrzeugverkauf
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
-- Bestehende Rechnungen bleiben unverändert (alle neuen Spalten leer).
--
--  1) rechnungen.steuer_sonderfall  'diff25a' | 'eu_ig' | 'ausfuhr' | leer
--       steuert PDF-Hinweis und E-Rechnungs-Kategorie (lib/steuerSonderfall.ts)
--  2) rechnungen.empfaenger_anschrift  Anschrift eines Freitext-Empfängers
--       (§ 14 Abs. 4 Nr. 1 UStG) — bisher stand bei Freitext-Empfängern
--       keine Anschrift auf dem PDF
--  3) rechnungen.vorab_bezahlt  vor der Rechnung verrechnet (Anzahlung,
--       Inzahlungnahme); mindert den Zahlbetrag auf PDF und E-Rechnung.
--       Eine Stornorechnung übernimmt den Wert NICHT (Paket 267 leert alle
--       Spalten mit „bezahlt" im Namen).
--  4) rechnungen.diff_bemessung / diff_steuer  § 25a: Marge netto und
--       Differenzsteuer — nur intern (Umsatzsteuer-Voranmeldung), nie auf
--       der Rechnung
--  5) kfz_verkauf.rechnung_id (eindeutig) + kfz_verkauf.lieferung
--       Doppelschutz: je Verkauf höchstens eine gültige Rechnung
-- ============================================================

-- 1–4) rechnungen ---------------------------------------------------------------
alter table public.rechnungen add column if not exists steuer_sonderfall text;
alter table public.rechnungen add column if not exists empfaenger_anschrift text;
alter table public.rechnungen add column if not exists vorab_bezahlt numeric(12,2);
alter table public.rechnungen add column if not exists diff_bemessung numeric(12,2);
alter table public.rechnungen add column if not exists diff_steuer numeric(12,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rechnungen_steuer_sonderfall_check') then
    alter table public.rechnungen add constraint rechnungen_steuer_sonderfall_check
      check (steuer_sonderfall is null or steuer_sonderfall in ('diff25a', 'eu_ig', 'ausfuhr'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rechnungen_empfaenger_anschrift_check') then
    alter table public.rechnungen add constraint rechnungen_empfaenger_anschrift_check
      check (empfaenger_anschrift is null or char_length(empfaenger_anschrift) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rechnungen_vorab_bezahlt_check') then
    alter table public.rechnungen add constraint rechnungen_vorab_bezahlt_check
      check (vorab_bezahlt is null or vorab_bezahlt >= 0);
  end if;
end $$;

-- 5) kfz_verkauf ----------------------------------------------------------------
alter table public.kfz_verkauf add column if not exists rechnung_id uuid references public.rechnungen(id) on delete set null;
alter table public.kfz_verkauf add column if not exists lieferung text not null default 'inland';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'kfz_verkauf_lieferung_check') then
    alter table public.kfz_verkauf add constraint kfz_verkauf_lieferung_check
      check (lieferung in ('inland', 'eu', 'ausfuhr'));
  end if;
end $$;

create unique index if not exists kfz_verkauf_rechnung_uq on public.kfz_verkauf (rechnung_id) where rechnung_id is not null;

-- KONTROLLE — Erwartung: rechnung_spalten = 5, regeln = 4, verkauf_spalten = 2, index = 1
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'rechnungen'
     and column_name in ('steuer_sonderfall', 'empfaenger_anschrift', 'vorab_bezahlt', 'diff_bemessung', 'diff_steuer')) as rechnung_spalten,
  (select count(*) from pg_constraint where conname in ('rechnungen_steuer_sonderfall_check', 'rechnungen_empfaenger_anschrift_check',
     'rechnungen_vorab_bezahlt_check', 'kfz_verkauf_lieferung_check')) as regeln,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'kfz_verkauf'
     and column_name in ('rechnung_id', 'lieferung')) as verkauf_spalten,
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'kfz_verkauf_rechnung_uq') as index;
