-- ============================================================
-- ARGONAUT OS · Paket 358 (13.10.2026) · VK1 Verkaufsteam, Teil 1
-- Zuständige an Leads (Setter und Closer getrennt), Funktion je Person im
-- Verkauf (Setter / Closer / Teamleitung) und „freie Setter", die nur ihre
-- eigenen Leads sehen und keine Deals (Geldzahlen).
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- vk_funktion:  je Person (Anmelde-Kennung) im Betrieb eine Zeile: Funktion,
--               „frei" (nur eigene Leads, keine Deals), aktiv. Nur die
--               Geschäftsleitung schreibt; das Team liest (für die Namen).
-- leads:        neue Spalten setter_user_id, closer_user_id, zugewiesen_am.
-- crm_deal:     neue Spalten setter_user_id, closer_user_id (für Paket 359).
--
-- Wächter: Zuständige müssen zum Betrieb gehören (Geschäftsleitung oder
-- Mitarbeiter mit Anmeldung). Ein freier Setter wird beim Anlegen selbst
-- Setter und kann Zuständige nicht ändern.
--
-- ACHTUNG — Teil 5 ändert die Lese-Regeln von leads und crm_deal:
-- zusätzliche EINSCHRÄNKENDE Regeln, die NUR für Personen mit „frei" gelten.
-- Für die Geschäftsleitung und alle anderen Mitarbeiter ändert sich nichts.
-- Kontrolle danach: Teil 6.
-- Voraussetzung: leads, crm_deal, mitarbeiter, mein_chef_id().
-- ============================================================

-- TEIL 1 von 6: Funktion je Person
create table if not exists public.vk_funktion (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  user_id         uuid not null,
  funktion        text check (funktion is null or funktion in ('setter', 'closer', 'teamleitung')),
  frei            boolean not null default false,
  aktiv           boolean not null default true,
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  constraint vk_funktion_eindeutig unique (owner_user_id, user_id)
);
create index if not exists vk_funktion_user_idx on public.vk_funktion (user_id);

-- TEIL 2 von 6: Zuständige an Leads und Deals
alter table public.leads add column if not exists setter_user_id uuid;
alter table public.leads add column if not exists closer_user_id uuid;
alter table public.leads add column if not exists zugewiesen_am timestamptz;
create index if not exists leads_setter_idx on public.leads (owner_user_id, setter_user_id);
create index if not exists leads_closer_idx on public.leads (owner_user_id, closer_user_id);
alter table public.crm_deal add column if not exists setter_user_id uuid;
alter table public.crm_deal add column if not exists closer_user_id uuid;

-- TEIL 3 von 6: Hilfsfunktionen
-- Bin ich ein freier Setter? (Geschäftsleitung nie.) Fehler = nein, damit
-- niemand durch einen Fehler ausgesperrt wird.
create or replace function public.p358_frei()
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare v boolean;
begin
  if auth.uid() is null then return false; end if;
  begin
    select true into v from public.vk_funktion f
      where f.user_id = auth.uid() and f.frei and f.aktiv and f.owner_user_id = public.mein_chef_id() limit 1;
  exception when others then v := false;
  end;
  return coalesce(v, false);
end;
$$;
revoke all on function public.p358_frei() from public, anon;
grant execute on function public.p358_frei() to authenticated, service_role;

-- Gehört die Kennung zum Betrieb? (Geschäftsleitung oder Mitarbeiter mit Anmeldung)
create or replace function public.p358_im_team(p_betrieb uuid, p_user uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select p_user = p_betrieb or exists (select 1 from public.mitarbeiter m where m.owner_user_id = p_betrieb and m.auth_user_id = p_user);
$$;
revoke all on function public.p358_im_team(uuid, uuid) from public, anon;
grant execute on function public.p358_im_team(uuid, uuid) to authenticated, service_role;

-- TEIL 4 von 6: Wächter
create or replace function public.p358_funktion_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' then
    new.owner_user_id := old.owner_user_id; new.user_id := old.user_id; new.erstellt_am := old.erstellt_am;
  end if;
  if not public.p358_im_team(new.owner_user_id, new.user_id) then raise exception 'Die Person gehört nicht zu Ihrem Betrieb.'; end if;
  if new.user_id = new.owner_user_id and new.frei then raise exception 'Die Geschäftsleitung kann nicht „frei" sein.'; end if;
  new.aktualisiert_am := now();
  return new;
end;
$$;

create or replace function public.p358_zustaendig_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_frei boolean := public.p358_frei();
begin
  if tg_op = 'INSERT' then
    if v_frei then new.setter_user_id := auth.uid(); new.closer_user_id := null; end if;
  else
    if v_frei and (new.setter_user_id is distinct from old.setter_user_id or new.closer_user_id is distinct from old.closer_user_id) then
      raise exception 'Zuständige ändert die Geschäftsleitung oder die Teamleitung.';
    end if;
  end if;
  if new.setter_user_id is not null and not public.p358_im_team(new.owner_user_id, new.setter_user_id) then raise exception 'Der Setter gehört nicht zu Ihrem Betrieb.'; end if;
  if new.closer_user_id is not null and not public.p358_im_team(new.owner_user_id, new.closer_user_id) then raise exception 'Der Closer gehört nicht zu Ihrem Betrieb.'; end if;
  if tg_table_name = 'leads' and (tg_op = 'INSERT' or new.setter_user_id is distinct from old.setter_user_id or new.closer_user_id is distinct from old.closer_user_id) then
    new.zugewiesen_am := case when new.setter_user_id is null and new.closer_user_id is null then null else now() end;
  end if;
  return new;
end;
$$;

do $$
begin
  drop trigger if exists p358_waechter on public.vk_funktion;
  create trigger p358_waechter before insert or update on public.vk_funktion for each row execute function public.p358_funktion_waechter();
  drop trigger if exists p358_zustaendig on public.leads;
  create trigger p358_zustaendig before insert or update on public.leads for each row execute function public.p358_zustaendig_waechter();
  drop trigger if exists p358_zustaendig on public.crm_deal;
  create trigger p358_zustaendig before insert or update on public.crm_deal for each row execute function public.p358_zustaendig_waechter();
end $$;

-- TEIL 5 von 6: Regeln. vk_funktion: Geschäftsleitung schreibt, Team liest.
-- leads/crm_deal: EINSCHRÄNKENDE Regeln nur für freie Setter.
alter table public.vk_funktion enable row level security;
revoke all on public.vk_funktion from anon;
drop policy if exists p358_owner_all on public.vk_funktion;
create policy p358_owner_all on public.vk_funktion for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p358_ma_select on public.vk_funktion;
create policy p358_ma_select on public.vk_funktion for select to authenticated using (owner_user_id = public.mein_chef_id());

drop policy if exists p358_frei_select on public.leads;
create policy p358_frei_select on public.leads as restrictive for select to authenticated
  using (not public.p358_frei() or setter_user_id = auth.uid() or closer_user_id = auth.uid());
drop policy if exists p358_frei_update on public.leads;
create policy p358_frei_update on public.leads as restrictive for update to authenticated
  using (not public.p358_frei() or setter_user_id = auth.uid() or closer_user_id = auth.uid())
  with check (not public.p358_frei() or setter_user_id = auth.uid() or closer_user_id = auth.uid());
drop policy if exists p358_frei_deal on public.crm_deal;
create policy p358_frei_deal on public.crm_deal as restrictive for all to authenticated
  using (not public.p358_frei()) with check (not public.p358_frei());

-- TEIL 6 von 6: KONTROLLE — Erwartung: tabelle = 1 | spalten = 5 | regeln_vk = 2 | regeln_frei = 3 | ausloeser = 3 | ich_frei = false
-- (regeln_vk = 3 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel aus Paket 164)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'vk_funktion') as tabelle,
  (select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'leads' and column_name in ('setter_user_id', 'closer_user_id', 'zugewiesen_am')) or (table_name = 'crm_deal' and column_name in ('setter_user_id', 'closer_user_id')))) as spalten,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'vk_funktion') as regeln_vk,
  (select count(*) from pg_policies where schemaname = 'public' and policyname in ('p358_frei_select', 'p358_frei_update', 'p358_frei_deal')) as regeln_frei,
  (select count(*) from pg_trigger where tgname in ('p358_waechter', 'p358_zustaendig') and not tgisinternal) as ausloeser,
  public.p358_frei() as ich_frei;
