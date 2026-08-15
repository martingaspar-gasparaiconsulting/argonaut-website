-- ============================================================
-- ARGONAUT OS · Thema 2 · Import-Center Stufe 2 (Schritt 1/5)
--
-- Stufe 1 (bereits live) ist ein Launcher: Vorlage laden, zum Modul springen.
-- Stufe 2 macht das Import-Center selbst arbeitsfaehig: Datei hochladen,
-- Spalten zuordnen, importieren, Fehlerbericht lesen.
--
-- Diese Tabelle ist das GEDAECHTNIS dieser Vorgaenge:
--   · sie protokolliert jeden Import (wer, was, wie viele Zeilen, welche Fehler)
--   · sie merkt sich die Spalten-Zuordnung, damit derselbe Datei-Aufbau beim
--     naechsten Mal mit einem Klick wieder passt
--
-- Die hochgeladene Datei selbst wird NICHT gespeichert: sie wird im Browser
-- gelesen und direkt verarbeitet. Kein Storage, keine Altlasten, kein DSGVO-
-- Ballast — nur das Ergebnis und die Zuordnung bleiben stehen.
--
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

create table if not exists public.import_jobs (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  ziel           text not null,                       -- kontakte | artikel | rechnungen | ...
  dateiname      text,
  status         text not null default 'laeuft',      -- laeuft | fertig | teilweise | abgebrochen
  kopfzeilen     jsonb not null default '[]'::jsonb,  -- Spaltennamen, wie sie in der Datei standen
  mapping        jsonb not null default '{}'::jsonb,  -- { "Firma": "firma", "E-Mail": "email", ... }
  zeilen_gesamt  integer not null default 0,
  zeilen_ok      integer not null default 0,
  zeilen_fehler  integer not null default 0,
  fehler         jsonb not null default '[]'::jsonb,  -- [{ "zeile": 12, "feld": "email", "meldung": "..." }]
  als_vorlage    boolean not null default false,      -- Zuordnung zum Wiederverwenden merken
  vorlage_name   text,
  erstellt_am    timestamptz not null default now(),
  beendet_am     timestamptz
);
create index if not exists import_jobs_idx on public.import_jobs (owner_user_id, ziel, erstellt_am desc);
create index if not exists import_jobs_vorlagen_idx on public.import_jobs (owner_user_id, ziel) where als_vorlage = true;

alter table public.import_jobs enable row level security;

drop policy if exists ij_select on public.import_jobs;
create policy ij_select on public.import_jobs for select to public using ((auth.uid() = owner_user_id));
drop policy if exists ij_select_ma on public.import_jobs;
create policy ij_select_ma on public.import_jobs for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ij_insert on public.import_jobs;
create policy ij_insert on public.import_jobs for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists ij_update on public.import_jobs;
create policy ij_update on public.import_jobs for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ij_delete on public.import_jobs;
create policy ij_delete on public.import_jobs for delete to public using ((auth.uid() = owner_user_id));
