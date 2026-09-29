-- ============================================================
-- ARGONAUT OS · Paket 166 (28.09.2026) · Abläufe: Auslöser „Ereignis"
--
-- Wenn in einem Modul etwas passiert (Rechnung angelegt, Rechnung bezahlt,
-- Angebot angelegt/angenommen, Kunde angelegt, Anfrage eingegangen, Auftrag
-- angelegt, Termin angelegt, Aufgabe erledigt), merkt sich die Datenbank das
-- in der Warteschlange ablauf_ereignisse. Der Motor (/api/cron/ablaeufe,
-- stündlich) startet daraus die passenden Abläufe.
--
-- SCHUTZ (Kern-Tabellen wie rechnungen und angebote sind betroffen):
--   · Die Trigger laufen NACH dem Speichern und schreiben NUR in die
--     Warteschlange — sie ändern nie den Datensatz selbst.
--   · Exception-sicher: ein Fehler in der Warteschlange verhindert NIE das
--     Speichern einer Rechnung, eines Angebots oder Kunden.
--   · Eingetragen wird nur, wenn der Betrieb einen EINGESCHALTETEN Ablauf mit
--     genau diesem Ereignis hat — sonst passiert gar nichts.
--   · Archiv-Angebote (Umzug) lösen nichts aus.
-- Nur additiv. Mehrfach ausführbar. Sperrt niemanden aus.
-- ============================================================

create table if not exists public.ablauf_ereignisse (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  ereignis       text not null,
  tabelle        text not null,
  ziel_id        uuid not null,
  erstellt_am    timestamptz not null default now(),
  verarbeitet_am timestamptz,
  ergebnis       text
);
create index if not exists ablauf_ereignisse_offen_idx on public.ablauf_ereignisse (erstellt_am) where verarbeitet_am is null;
create index if not exists ablauf_ereignisse_owner_idx on public.ablauf_ereignisse (owner_user_id, erstellt_am desc);
alter table public.ablauf_ereignisse enable row level security;
drop policy if exists abe_chef_select on public.ablauf_ereignisse;
create policy abe_chef_select on public.ablauf_ereignisse for select to authenticated using (owner_user_id = auth.uid());
-- Schreiben nur die Trigger (security definer) und der Motor (Service-Rolle).

create or replace function public.ablauf_ereignis_melden()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_neu    jsonb;
  v_alt    jsonb;
  v_key    text := null;
  v_owner  uuid;
  v_id     uuid;
begin
  begin
    v_neu := to_jsonb(new);
    v_alt := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;

    if tg_table_name = 'rechnungen' then
      if tg_op = 'INSERT' then
        v_key := 'rechnung_angelegt';
      elsif coalesce(v_neu ->> 'zahlungsstatus', '') = 'bezahlt'
            and coalesce(v_alt ->> 'zahlungsstatus', '') <> 'bezahlt' then
        v_key := 'rechnung_bezahlt';
      end if;
    elsif tg_table_name = 'angebote' then
      if tg_op = 'INSERT' and coalesce(v_neu ->> 'status', '') <> 'archiv' then
        v_key := 'angebot_angelegt';
      elsif tg_op = 'UPDATE' and coalesce(v_neu ->> 'status', '') = 'angenommen'
            and coalesce(v_alt ->> 'status', '') <> 'angenommen' then
        v_key := 'angebot_angenommen';
      end if;
    elsif tg_table_name = 'kontakte' and tg_op = 'INSERT' then
      v_key := 'kontakt_angelegt';
    elsif tg_table_name = 'leads' and tg_op = 'INSERT' then
      v_key := 'lead_eingegangen';
    elsif tg_table_name = 'auftraege' and tg_op = 'INSERT' then
      v_key := 'auftrag_angelegt';
    elsif tg_table_name = 'termine' and tg_op = 'INSERT' then
      v_key := 'termin_angelegt';
    elsif tg_table_name = 'aufgaben' and tg_op = 'UPDATE'
          and coalesce(v_neu ->> 'status', '') = 'fertig'
          and coalesce(v_alt ->> 'status', '') <> 'fertig' then
      v_key := 'aufgabe_erledigt';
    end if;

    if v_key is null then
      return null;
    end if;

    v_owner := nullif(v_neu ->> 'owner_user_id', '')::uuid;
    v_id := nullif(v_neu ->> 'id', '')::uuid;
    if v_owner is null or v_id is null then
      return null;
    end if;

    -- Nur wenn der Betrieb einen eingeschalteten Ablauf mit genau diesem Ereignis hat.
    if not exists (
      select 1 from public.ablaeufe a
       where a.owner_user_id = v_owner and a.aktiv = true
         and a.ausloeser ->> 'art' = 'ereignis' and a.ausloeser ->> 'ereignis' = v_key
    ) then
      return null;
    end if;

    insert into public.ablauf_ereignisse (owner_user_id, ereignis, tabelle, ziel_id)
    values (v_owner, v_key, tg_table_name, v_id);
  exception when others then
    -- Die Warteschlange darf NIE das eigentliche Speichern verhindern.
    null;
  end;
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['rechnungen', 'angebote', 'kontakte', 'leads', 'auftraege', 'termine', 'aufgaben'] loop
    if to_regclass('public.' || t) is null then
      raise notice '%: Tabelle nicht gefunden, uebersprungen', t;
      continue;
    end if;
    execute format('drop trigger if exists p166_ablauf_ereignis on public.%I', t);
    if t = 'aufgaben' then
      execute format('create trigger p166_ablauf_ereignis after update on public.%I for each row execute function public.ablauf_ereignis_melden()', t);
    elsif t in ('rechnungen', 'angebote') then
      execute format('create trigger p166_ablauf_ereignis after insert or update on public.%I for each row execute function public.ablauf_ereignis_melden()', t);
    else
      execute format('create trigger p166_ablauf_ereignis after insert on public.%I for each row execute function public.ablauf_ereignis_melden()', t);
    end if;
  end loop;
end $$;

-- Kontrolle: soll 1 Zeile zeigen — tabelle_spalten = 8, trigger = 7
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ablauf_ereignisse') as tabelle_spalten,
  (select count(*) from pg_trigger where tgname = 'p166_ablauf_ereignis') as trigger;
