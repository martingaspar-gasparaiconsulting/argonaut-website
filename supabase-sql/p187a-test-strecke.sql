-- ============================================================
-- ARGONAUT OS · Paket 187a (01.10.2026) · Test-Mailstrecke ab Freischaltung
--
-- VOR dem Push ausführen (der neue Cron liest diese Spalten).
-- Nur zwei neue Spalten + einmaliges Nachtragen. Nichts wird gelöscht.
-- Mehrfach ausführbar.
--
--   dossier_leads.test_start_am  wann der Testzugang freigeschaltet wurde
--   dossier_leads.test_ende_am   wann er endet (= profiles.demo_ablauf)
--
-- Gesetzt werden sie ab jetzt automatisch beim „Demo setzen" im Command
-- Center. Unten werden nur Strecken nachgetragen, die schon laufen UND deren
-- Konto bereits freigeschaltet ist (gleiche E-Mail, demo = true).
-- ============================================================

alter table public.dossier_leads add column if not exists test_start_am timestamptz;
alter table public.dossier_leads add column if not exists test_ende_am  timestamptz;

-- Nachtragen für laufende Strecken mit schon freigeschaltetem Konto.
-- Start = Ende − 7 Tage (bisheriger Standard), höchstens jetzt.
update public.dossier_leads d
   set test_ende_am  = p.demo_ablauf,
       test_start_am = least(now(), p.demo_ablauf - interval '7 days')
  from auth.users u
  join public.profiles p on p.id = u.id
 where d.seq_quelle = 'test'
   and d.seq_status = 'aktiv'
   and d.test_start_am is null
   and p.demo = true
   and p.demo_ablauf is not null
   and lower(u.email) = lower(d.email);

-- KONTROLLE — Erwartung: neue_spalten = 2.
-- laufend_mit_zugang = laufende Strecken, die jetzt Start/Ende kennen
-- laufend_ohne_zugang = laufende Strecken ohne freigeschaltetes Konto
--   (die warten nach dem Willkommens-Mail auf Ihre Freischaltung)
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'dossier_leads'
       and column_name in ('test_start_am', 'test_ende_am')) as neue_spalten,
  (select count(*) from public.dossier_leads
     where seq_quelle = 'test' and seq_status = 'aktiv' and test_start_am is not null) as laufend_mit_zugang,
  (select count(*) from public.dossier_leads
     where seq_quelle = 'test' and seq_status = 'aktiv' and test_start_am is null) as laufend_ohne_zugang;
