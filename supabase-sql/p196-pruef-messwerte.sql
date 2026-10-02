-- ============================================================
-- ARGONAUT OS · Paket 196 (02.10.2026) · Messwerte in Prüfprotokollen
--
-- Additiv und mehrfach ausführbar. Fügt der Tabelle pruef_punkt vier
-- leere Spalten hinzu: Messwert, Einheit, untere und obere Grenze.
-- Bestehende Prüfpunkte bleiben unverändert (alle neuen Felder leer).
-- Keine Rechte-Änderung: die Spalten gehören zu den vorhandenen Zeilen,
-- es gelten die bisherigen Regeln von pruef_punkt.
-- Reihenfolge egal: Die Seite speichert auch ohne diese Spalten (dann
-- steht der Messwert im Hinweis-Text) — mit den Spalten als echte Zahl.
-- ============================================================

alter table if exists public.pruef_punkt add column if not exists messwert  numeric;
alter table if exists public.pruef_punkt add column if not exists einheit   text;
alter table if exists public.pruef_punkt add column if not exists grenz_min numeric;
alter table if exists public.pruef_punkt add column if not exists grenz_max numeric;

comment on column public.pruef_punkt.messwert  is 'Paket 196: gemessener Wert (z. B. 1,92) — leer bei reinen Sicht-/Erprobungspunkten';
comment on column public.pruef_punkt.einheit   is 'Paket 196: Einheit des Messwerts (Ω, MΩ, ms, mA, V)';
comment on column public.pruef_punkt.grenz_min is 'Paket 196: untere Grenze — Messwert darunter = Mangel';
comment on column public.pruef_punkt.grenz_max is 'Paket 196: obere Grenze — Messwert darüber = Mangel';

-- Kontrolle — Erwartung: neue_spalten = 4
select count(*) as neue_spalten
from information_schema.columns
where table_schema = 'public' and table_name = 'pruef_punkt'
  and column_name in ('messwert', 'einheit', 'grenz_min', 'grenz_max');
