-- ============================================================
-- ARGONAUT OS · Paket 183 (30.09.2026) · WhatsApp-Anmeldung mit Bestätigung
--
-- VOR dem Push ausführen (der neue Code liest diese Spalten).
-- Nur neue Spalten + ein Index, nichts wird gelöscht oder umgestellt.
-- Mehrfach ausführbar.
--
--   bestaetigungs_code         Code aus dem Formular, bis die Person antwortet
--   bestaetigung_angefragt_am  wann das Formular ausgefüllt wurde (7 Tage gültig)
--   bestaetigt_am              wann die WhatsApp-Bestätigung ankam
--   bestaetigung_nachweis      Meta-Kennung der Bestätigungs-Nachricht
--   abgemeldet_am              wann „STOP" kam
-- ============================================================

alter table public.whatsapp_kontakt add column if not exists bestaetigungs_code text;
alter table public.whatsapp_kontakt add column if not exists bestaetigung_angefragt_am timestamptz;
alter table public.whatsapp_kontakt add column if not exists bestaetigt_am timestamptz;
alter table public.whatsapp_kontakt add column if not exists bestaetigung_nachweis text;
alter table public.whatsapp_kontakt add column if not exists abgemeldet_am timestamptz;

create index if not exists whatsapp_kontakt_owner_telefon_idx
  on public.whatsapp_kontakt (owner_user_id, telefon);

-- KONTROLLE — Erwartung: neue_spalten = 5.
-- alte_formular_aktiv = Nummern, die früher OHNE Bestätigung über das
-- Formular aktiv wurden (bleiben aktiv; Entscheidung bei Martin).
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'whatsapp_kontakt'
       and column_name in ('bestaetigungs_code','bestaetigung_angefragt_am','bestaetigt_am','bestaetigung_nachweis','abgemeldet_am')) as neue_spalten,
  (select count(*) from public.whatsapp_kontakt where status = 'aktiv' and quelle = 'opt-in' and bestaetigt_am is null) as alte_formular_aktiv,
  (select count(*) from public.whatsapp_kontakt where status = 'aktiv') as aktiv_gesamt;
