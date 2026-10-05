-- ============================================================
-- ARGONAUT OS · Paket 206 (05.10.2026) · Stufe 3 B5 Branchenverzeichnis-Eintrag
--
-- Neu: Abhak-Stand je Verzeichnis (Google, Bing, Apple, Gelbe Seiten,
-- Das Örtliche, 11880) an den Firmendaten des Betriebs.
-- Geschrieben nur vom Server (/api/marketing/verzeichnisse, Modulrecht
-- Marketing „ändern"); die bestehenden Regeln von web_ci bleiben unverändert.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder geändert.
-- AUSSPERR-RISIKO: keines (eine neue Spalte mit Standardwert).
--
-- RÜCKWEG (nur im Notfall): alter table public.web_ci drop column verzeichnis_status;
--   (die Seite zeigt den Eintrag dann weiter, nur ohne Abhaken).
-- ============================================================

alter table public.web_ci add column if not exists verzeichnis_status jsonb not null default '{}'::jsonb;

comment on column public.web_ci.verzeichnis_status is
  'Paket 206: je Verzeichnis {eingetragen_am, link} — nur der Server schreibt.';

-- Kontrolle: spalte = 1 · leer_oder_objekt = Anzahl Zeilen in web_ci · kein_objekt = 0
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'web_ci' and column_name = 'verzeichnis_status') as spalte,
  (select count(*) from public.web_ci where jsonb_typeof(verzeichnis_status) = 'object') as leer_oder_objekt,
  (select count(*) from public.web_ci where jsonb_typeof(verzeichnis_status) <> 'object') as kein_objekt;
