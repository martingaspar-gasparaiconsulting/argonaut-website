-- ============================================================
-- ARGONAUT OS · Thema 1 · Automations-Bauer + Regel-Engine (Schritt 1/6)
-- Zwei Tabellen: die Regeln selbst und ein Ausfuehrungs-Protokoll.
-- Aufbau einer Regel:  AUSLOESER -> BEDINGUNG -> WARTEZEIT -> AKTION
-- Der Motor (spaeter /api/cron/automationen) liest 'automation_regeln',
-- prueft was faellig ist, feuert die Aktion und schreibt nach 'automation_log'.
-- Der Unique-Index auf (regel_id, ziel_typ, ziel_id) verhindert, dass dieselbe
-- Regel dasselbe Objekt zweimal bearbeitet.
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

-- ---------- 1) Die Regeln ----------
create table if not exists public.automation_regeln (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  name           text not null default 'Neue Automation',
  beschreibung   text,
  trigger_typ    text not null,                      -- z.B. rechnung_ueberfaellig | angebot_ohne_antwort | kunde_neu | aufgabe_faellig | termin_morgen | lager_unter_mindest
  trigger_config jsonb not null default '{}'::jsonb, -- Feinheiten zum Ausloeser (z.B. {"tage":14})
  bedingung      jsonb not null default '[]'::jsonb, -- Liste: [{"feld":"betrag","operator":">=","wert":500}]
  aktion_typ     text not null,                      -- z.B. mahnung_erstellen | aufgabe_anlegen | status_aendern | mail_senden | notiz_anlegen
  aktion_config  jsonb not null default '{}'::jsonb, -- Feinheiten zur Aktion (Betreff, Text, Zielstatus, Empfaenger ...)
  wartezeit_tage integer not null default 0,         -- erst X Tage nach dem Ausloeser feuern
  aktiv          boolean not null default true,
  zuletzt_lauf_am timestamptz,
  erstellt_am    timestamptz not null default now()
);
create index if not exists automation_regeln_idx on public.automation_regeln (owner_user_id, aktiv, trigger_typ);

alter table public.automation_regeln enable row level security;

drop policy if exists ar_select on public.automation_regeln;
create policy ar_select on public.automation_regeln for select to public using ((auth.uid() = owner_user_id));
drop policy if exists ar_select_ma on public.automation_regeln;
create policy ar_select_ma on public.automation_regeln for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ar_insert on public.automation_regeln;
create policy ar_insert on public.automation_regeln for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists ar_update on public.automation_regeln;
create policy ar_update on public.automation_regeln for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ar_delete on public.automation_regeln;
create policy ar_delete on public.automation_regeln for delete to public using ((auth.uid() = owner_user_id));

-- ---------- 2) Das Protokoll ----------
create table if not exists public.automation_log (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  regel_id       uuid references public.automation_regeln(id) on delete cascade,
  ziel_typ       text,                                -- z.B. rechnung | angebot | kunde | aufgabe
  ziel_id        uuid,                                -- betroffener Datensatz
  ergebnis       text not null default 'ok',          -- ok | fehler | uebersprungen
  meldung        text,
  details        jsonb not null default '{}'::jsonb,
  ausgefuehrt_am timestamptz not null default now()
);
create index if not exists automation_log_idx on public.automation_log (owner_user_id, ausgefuehrt_am desc);
create unique index if not exists automation_log_einmalig on public.automation_log (regel_id, ziel_typ, ziel_id) where ziel_id is not null and ergebnis = 'ok';

alter table public.automation_log enable row level security;

drop policy if exists al_select on public.automation_log;
create policy al_select on public.automation_log for select to public using ((auth.uid() = owner_user_id));
drop policy if exists al_select_ma on public.automation_log;
create policy al_select_ma on public.automation_log for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists al_insert on public.automation_log;
create policy al_insert on public.automation_log for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists al_update on public.automation_log;
create policy al_update on public.automation_log for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists al_delete on public.automation_log;
create policy al_delete on public.automation_log for delete to public using ((auth.uid() = owner_user_id));
