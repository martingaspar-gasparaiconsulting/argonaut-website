-- ============================================================================
-- ARGONAUT OS · Webinar-Nachtrag  ·  14.09.2026
-- Beim Bau der Routen aufgefallen: die Tabelle webinar_anmeldung verlangt
-- `token` (not null), hatte aber keinen Vorgabewert — und es fehlte ein
-- eigener Abmelde-Token.
--
-- WARUM ZWEI TOKEN: Der Bestaetigungs-Token steht in genau EINER Mail und ist
-- danach verbraucht. Der Abmelde-Token steht in JEDER Mail und lebt ewig.
-- Denselben fuer beides zu nehmen hiesse: wer einen alten Abmeldelink findet,
-- kann damit eine Anmeldung bestaetigen.
--
-- ADDITIV und IDEMPOTENT. `set default` aendert KEINEN Datentyp und keine
-- bestehende Zeile — es legt nur fest, was beim naechsten Einfuegen gilt.
-- ============================================================================

alter table public.webinar_anmeldung
  add column if not exists abmelde_token text;

-- Vorgabewerte, damit eine Route den Token nicht vergessen kann.
alter table public.webinar_anmeldung
  alter column token set default gen_random_uuid()::text;
alter table public.webinar_anmeldung
  alter column abmelde_token set default gen_random_uuid()::text;

-- Falls schon Zeilen ohne Abmelde-Token existieren: nachtragen.
update public.webinar_anmeldung
   set abmelde_token = gen_random_uuid()::text
 where abmelde_token is null;

create unique index if not exists webinar_anmeldung_abmelde_uniq
  on public.webinar_anmeldung (abmelde_token);

-- Kontrolle -------------------------------------------------------------------
-- Erwartung: beide Spalten haben einen Vorgabewert, 0 Zeilen ohne Abmelde-Token.
select 'Spalten mit Vorgabewert' as was,
       count(*)::text as zahl
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'webinar_anmeldung'
   and column_name in ('token', 'abmelde_token')
   and column_default is not null
union all
select 'Zeilen ohne Abmelde-Token', count(*)::text
  from public.webinar_anmeldung
 where abmelde_token is null;
