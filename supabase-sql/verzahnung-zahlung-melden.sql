-- ============================================================
-- ARGONAUT OS · Verzahnung · Kunde meldet „bezahlt"
-- Ein weiches Signal an der Rechnung: der Kunde hat im Portal auf „Ich habe
-- bezahlt" geklickt. KEINE automatische Bezahlt-Setzung — der Betrieb prüft
-- und bestätigt (später übernimmt das die Bankanbindung). Idempotent.
-- ============================================================

alter table rechnungen add column if not exists zahlung_gemeldet_am timestamptz;

-- Ausgänge: Eingangsbelege (Lieferantenrechnungen) als bezahlt markierbar.
alter table eingangsbelege add column if not exists bezahlt_am date;
