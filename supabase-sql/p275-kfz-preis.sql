-- ============================================================
-- ARGONAUT OS · Paket 275 (08.10.2026) · K12a Markt und Preis (eigene Daten)
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--  1) kfz_boerse_aufruf  Aufrufe je Fahrzeug und Tag in der eigenen
--                        Fahrzeugbörse (Paket 272). Nur eine Tageszahl —
--                        keine IP, kein Cookie, kein Besucher, nichts
--                        Personenbezogenes.
--  2) p275_aufruf_zaehlen  zählt +1; darf NUR die Server-Rolle (die
--                        Börsen-Seite) aufrufen. Zählt nur, wenn das Fahrzeug
--                        wirklich diesem Betrieb gehört und inseriert ist.
-- Rechte: Chef liest alles, Mitarbeiter lesen mit Modul „kfz". Schreiben
-- kann niemand direkt (keine insert/update/delete-Regel) — nur die Funktion.
-- Preis-Regeln liegen in modul_einstellung (Modul „kfz-preis", Paket 259:
-- nur der Chef schreibt).
-- ============================================================

create table if not exists public.kfz_boerse_aufruf (
  bestand_id    uuid not null references public.kfz_bestand(id) on delete cascade,
  tag           date not null,
  owner_user_id uuid not null,
  anzahl        integer not null default 0 check (anzahl >= 0),
  primary key (bestand_id, tag)
);
create index if not exists kfz_boerse_aufruf_owner_idx on public.kfz_boerse_aufruf (owner_user_id, tag);

alter table public.kfz_boerse_aufruf enable row level security;

drop policy if exists kfzba_owner_select on public.kfz_boerse_aufruf;
create policy kfzba_owner_select on public.kfz_boerse_aufruf for select to authenticated
  using (auth.uid() = owner_user_id);
drop policy if exists kfzba_ma_select on public.kfz_boerse_aufruf;
create policy kfzba_ma_select on public.kfz_boerse_aufruf for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));

create or replace function public.p275_aufruf_zaehlen(p_owner uuid, p_bestand uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  insert into public.kfz_boerse_aufruf (bestand_id, tag, owner_user_id, anzahl)
  select b.id, (now() at time zone 'Europe/Berlin')::date, b.owner_user_id, 1
  from public.kfz_bestand b
  where b.id = p_bestand and b.owner_user_id = p_owner and b.inseriert
  on conflict (bestand_id, tag) do update set anzahl = public.kfz_boerse_aufruf.anzahl + 1;
end $$;

revoke all on function public.p275_aufruf_zaehlen(uuid, uuid) from public;
revoke all on function public.p275_aufruf_zaehlen(uuid, uuid) from anon;
revoke all on function public.p275_aufruf_zaehlen(uuid, uuid) from authenticated;
grant execute on function public.p275_aufruf_zaehlen(uuid, uuid) to service_role;

-- KONTROLLE — Erwartung: tabelle = 1, regeln = 2, rls_an = 1, funktion = 1, anon_darf = false
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'kfz_boerse_aufruf') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_boerse_aufruf') as regeln,
  (select count(*) from pg_class where relname = 'kfz_boerse_aufruf' and relrowsecurity) as rls_an,
  (select count(*) from pg_proc where proname = 'p275_aufruf_zaehlen') as funktion,
  has_function_privilege('anon', 'public.p275_aufruf_zaehlen(uuid, uuid)', 'execute') as anon_darf;
