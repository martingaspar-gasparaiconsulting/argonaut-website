-- ============================================================================
-- ARGONAUT OS · Paket 329 (12.10.2026) · G2b Betriebsanweisungs-Entwurf
--
--   betriebsanweisung   je Gefahrstoff ein Entwurf nach TRGS 555 (Kopf und
--                       fünf Abschnitte als Text), Piktogramme, Signalwort,
--                       Status entwurf/freigegeben, Version, wer und wann.
--
-- Wächter: Gefahrstoff gehört zum Betrieb, Betrieb und Stoff sind fest;
-- freigeben nur die Geschäftsleitung; jede Änderung nach der Freigabe macht
-- daraus wieder einen Entwurf (neue Freigabe = Version + 1); bei Freigabe
-- trägt die Datenbank „Betriebsanweisung erstellt am" im Gefahrstoff ein.
-- Lesen dürfen alle im Betrieb (GefStoffV § 14: Beschäftigte haben Zugang).
-- Freigeben geht erst nach der Abnahme durch den Anwalt (lib/startSperre
-- „betriebsanweisung", R49) — bis dahin druckt die Seite „ENTWURF".
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — nur eine neue Tabelle.
-- RÜCKWEG (nur im Notfall): drop table public.betriebsanweisung;
-- ============================================================================

begin;

create table if not exists public.betriebsanweisung (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  gefahrstoff_id  uuid not null references public.gefahrstoff(id) on delete cascade,
  inhalt          jsonb not null default '{}'::jsonb,
  piktogramme     text[] not null default '{}',
  signalwort      text,
  status          text not null default 'entwurf',
  version         integer not null default 0,
  freigegeben_von uuid,
  freigegeben_am  timestamptz,
  angelegt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p329_ba_check' and conrelid = 'public.betriebsanweisung'::regclass) then
    alter table public.betriebsanweisung add constraint p329_ba_check check (
      jsonb_typeof(inhalt) = 'object' and pg_column_size(inhalt) <= 40000
      and piktogramme <@ array['GHS01','GHS02','GHS03','GHS04','GHS05','GHS06','GHS07','GHS08','GHS09']::text[]
      and (signalwort is null or signalwort in ('Gefahr', 'Achtung'))
      and status in ('entwurf', 'freigegeben')
      and version between 0 and 10000
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p329_ba_stoff_eindeutig' and conrelid = 'public.betriebsanweisung'::regclass) then
    alter table public.betriebsanweisung add constraint p329_ba_stoff_eindeutig unique (gefahrstoff_id);
  end if;
end $$;

comment on table public.betriebsanweisung is 'Paket 329: Betriebsanweisung je Gefahrstoff (TRGS 555), Entwurf -> Freigabe durch die Geschaeftsleitung.';

create or replace function public.p329_ba_waechter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_neu   boolean;
begin
  if tg_op = 'UPDATE' and (new.owner_user_id <> old.owner_user_id or new.gefahrstoff_id <> old.gefahrstoff_id) then
    raise exception 'Betrieb und Gefahrstoff einer Betriebsanweisung sind fest.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    select owner_user_id into v_owner from public.gefahrstoff where id = new.gefahrstoff_id;
    if v_owner is null or v_owner <> new.owner_user_id then
      raise exception 'Der Gefahrstoff gehoert nicht zu diesem Betrieb.' using errcode = '42501';
    end if;
  end if;

  v_neu := tg_op = 'INSERT'
    or new.inhalt is distinct from old.inhalt
    or new.piktogramme is distinct from old.piktogramme
    or new.signalwort is distinct from old.signalwort;

  -- Inhalt einer freigegebenen Anweisung geändert -> wieder Entwurf (neu freigeben = neue Version).
  if tg_op = 'UPDATE' and v_neu and old.status = 'freigegeben' then
    new.status := 'entwurf';
  end if;

  if new.status = 'freigegeben' and (v_neu or old.status is distinct from 'freigegeben') then
    if public.mein_chef_id() is not null then
      raise exception 'Freigeben darf nur die Geschaeftsleitung.' using errcode = '42501';
    end if;
    new.freigegeben_von := auth.uid();
    new.freigegeben_am := now();
    new.version := coalesce(case when tg_op = 'UPDATE' then old.version end, 0) + 1;
    update public.gefahrstoff set betriebsanweisung_am = (now() at time zone 'Europe/Berlin')::date
      where id = new.gefahrstoff_id and owner_user_id = new.owner_user_id;
  elsif new.status = 'entwurf' then
    new.freigegeben_von := null;
    new.freigegeben_am := null;
    if tg_op = 'UPDATE' then new.version := old.version; end if;
  else
    new.freigegeben_von := old.freigegeben_von;
    new.freigegeben_am := old.freigegeben_am;
    new.version := old.version;
  end if;

  if tg_op = 'INSERT' then new.angelegt_am := now(); end if;
  new.geaendert_am := now();
  return new;
end $$;

drop trigger if exists p329_ba_trg on public.betriebsanweisung;
create trigger p329_ba_trg before insert or update on public.betriebsanweisung
  for each row execute function public.p329_ba_waechter();

alter table public.betriebsanweisung enable row level security;

drop policy if exists p329_ba_chef on public.betriebsanweisung;
create policy p329_ba_chef on public.betriebsanweisung for all to authenticated
  using (owner_user_id = auth.uid() and public.mein_chef_id() is null)
  with check (owner_user_id = auth.uid() and public.mein_chef_id() is null);
drop policy if exists p329_ba_ma_lesen on public.betriebsanweisung;
create policy p329_ba_ma_lesen on public.betriebsanweisung for select to authenticated
  using (owner_user_id = public.mein_chef_id());

commit;

-- KONTROLLE (nur lesen) — Erwartung: 1 | 2 | 1
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'betriebsanweisung') as tabelle,
       (select count(*) from pg_policies where schemaname = 'public' and policyname like 'p329_%') as regeln,
       (select count(*) from pg_trigger where tgname = 'p329_ba_trg') as waechter;
