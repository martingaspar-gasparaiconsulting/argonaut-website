-- ============================================================
-- ARGONAUT OS · Paket PG · Gesprächsprotokolle mit Nachfass — Stand 24.09.2026
--   gespraech_protokoll   ein Protokoll je Besprechung (Kunde, Baustelle,
--                         Lieferant, intern) mit Nachfass-Termin
--
-- ADDITIV UND IDEMPOTENT: eine neue Tabelle, nichts Bestehendes angefasst.
-- Besitzer ist immer der Betrieb (Chef): Ein Mitarbeiter legt fuer den
-- Betrieb an (owner_user_id = mein_chef_id() per Standardwert).
-- RLS: Chef alles. Mitarbeiter sehen die Protokolle des Betriebs, legen an
-- und aendern NUR selbst angelegte. Loeschen nur der Chef.
--
-- Am Ende ZWEI Lese-Abfragen (aendern nichts) fuer Paket PG Teil 2
-- (Firmen-Wissen): wie die Dokumentensuche heute gebaut ist.
-- ============================================================

create table if not exists public.gespraech_protokoll (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null default coalesce(mein_chef_id(), auth.uid()),
  erstellt_von       uuid not null default auth.uid(),
  art                text not null default 'kunde' check (art in ('kunde', 'baustelle', 'lieferant', 'intern')),
  titel              text not null,
  datum              date not null,
  ort                text,
  kontakt_id         uuid,
  teilnehmer         jsonb not null default '[]'::jsonb,
  inhalt             jsonb not null default '{}'::jsonb,
  protokoll_text     text not null,
  roh                text,
  nachfass_am        date,
  nachfass_erledigt  boolean not null default false,
  erstellt_am        timestamptz not null default now(),
  aktualisiert_am    timestamptz not null default now()
);
create index if not exists gespraech_protokoll_owner_idx on public.gespraech_protokoll (owner_user_id, datum desc);
create index if not exists gespraech_protokoll_nachfass_idx on public.gespraech_protokoll (owner_user_id, nachfass_am) where nachfass_erledigt = false;

alter table public.gespraech_protokoll enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gespraech_protokoll' and policyname='gespraech_chef') then
    create policy gespraech_chef on public.gespraech_protokoll for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gespraech_protokoll' and policyname='gespraech_ma_select') then
    create policy gespraech_ma_select on public.gespraech_protokoll for select to authenticated
      using (owner_user_id = mein_chef_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gespraech_protokoll' and policyname='gespraech_ma_insert') then
    create policy gespraech_ma_insert on public.gespraech_protokoll for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='gespraech_protokoll' and policyname='gespraech_ma_update') then
    create policy gespraech_ma_update on public.gespraech_protokoll for update to authenticated
      using (owner_user_id = mein_chef_id() and erstellt_von = auth.uid())
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
  end if;
end $$;

-- ------------------------------------------------------------
-- Ergebnis in EINER Tabelle (der Supabase-Editor zeigt nur die letzte):
--   Zeile 1: die neue Tabelle (erwartet: true)
--   danach NUR LESEN, aendert nichts: wie die Dokumentensuche gebaut ist
--   (Grundlage fuer Paket PG Teil 2, Firmen-Wissen). Bitte Screenshot.
-- ------------------------------------------------------------
select '1 tabelle' as art, t.tablename::text as name, t.rowsecurity::text as inhalt
from pg_tables t where t.schemaname = 'public' and t.tablename = 'gespraech_protokoll'
union all
select '2 funktion', p.proname::text,
       (case when p.prosecdef then 'SECURITY DEFINER' else 'normal' end) || ' | ' ||
       pg_get_function_arguments(p.oid) || ' | ' ||
       left(regexp_replace(pg_get_functiondef(p.oid), '\s+', ' ', 'g'), 1600)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'match_document_chunks'
union all
select '3 regel ' || r.tablename, r.policyname::text, r.cmd || ' | ' || coalesce(r.qual, '') || ' | ' || coalesce(r.with_check, '')
from pg_policies r
where r.schemaname = 'public' and r.tablename in ('documents', 'document_chunks')
order by 1, 2;
