-- ============================================================
-- ARGONAUT OS · Paket 164 (29.09.2026) · Zwei-Faktor-Anmeldung, Stufe 1
--
--   zwei_faktor_notfall    Pruefsummen der Notfall-Codes (nie die Codes selbst)
--   zwei_faktor_ereignisse Nachweis: eingerichtet, Notfall-Code benutzt,
--                          Fehlversuch, Codes erneuert, entfernt
--
-- NEU, sonst nichts. Mehrfach ausfuehrbar. SPERRT NIEMANDEN AUS: Stufe 1 fragt
-- den Code nur bei Nutzern ab, die selbst einen zweiten Faktor eingerichtet haben.
-- Die Notfall-Codes liest und schreibt nur der Server (keine Regel fuer Nutzer).
-- Die Ereignisse sieht jeder Nutzer fuer sich selbst.
-- ============================================================

create table if not exists public.zwei_faktor_notfall (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  code_hash   text not null,
  erstellt_am timestamptz not null default now(),
  benutzt_am  timestamptz
);
create unique index if not exists zwei_faktor_notfall_uidx on public.zwei_faktor_notfall (user_id, code_hash);
alter table public.zwei_faktor_notfall enable row level security;
-- bewusst KEINE Regel: nur der Server (Service-Schluessel) kommt heran

create table if not exists public.zwei_faktor_ereignisse (
  id       uuid primary key default gen_random_uuid(),
  user_id  uuid not null,
  art      text not null check (art in ('eingerichtet', 'codes_erneuert', 'notfall_benutzt', 'fehlversuch', 'entfernt')),
  zeit     timestamptz not null default now()
);
create index if not exists zwei_faktor_ereignisse_idx on public.zwei_faktor_ereignisse (user_id, zeit desc);
alter table public.zwei_faktor_ereignisse enable row level security;
drop policy if exists zfe_eigene_select on public.zwei_faktor_ereignisse;
create policy zfe_eigene_select on public.zwei_faktor_ereignisse for select to authenticated using (user_id = auth.uid());

-- Kontrolle: erwartet 5 | 0 | 4 | 1
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'zwei_faktor_notfall') as notfall_spalten,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'zwei_faktor_notfall') as notfall_regeln,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'zwei_faktor_ereignisse') as ereignis_spalten,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'zwei_faktor_ereignisse') as ereignis_regeln;
