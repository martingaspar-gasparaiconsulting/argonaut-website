-- ============================================================
-- ARGONAUT OS · Paket 359 (13.10.2026) · VK1 Verkaufsteam, Teil 2
-- Eigene Pipelines mit eigenen Stufen (z. B. Neukunden, Bestandskunden,
-- je Auftraggeber). Die bisherige Pipeline mit den 6 festen Stufen bleibt
-- als „Standard" bestehen: Deals ohne pipeline_id stehen dort wie bisher.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- crm_pipeline:        je Betrieb beliebig viele; eine darf „Start-Ansicht" sein.
-- crm_pipeline_stufe:  Stufen je Pipeline. „Gewonnen" und „Verloren" legt die
--                      Datenbank bei jeder neuen Pipeline selbst an; sie tragen
--                      IMMER die Schlüssel gewonnen / verloren (der Name ist
--                      frei, z. B. „Auftrag erteilt"). So erkennen Provisionen,
--                      Aufträge, Partner-Provisionen und Berichte gewonnene
--                      Deals in jeder Pipeline ohne Umbau.
-- crm_deal:            neue Spalte pipeline_id (leer = Standard-Pipeline).
--
-- Wächter: Stufe muss zur Pipeline passen; Pipeline mit Deals ist nicht
-- löschbar; Stufe mit Deals ist nicht löschbar; Gewonnen/Verloren sind
-- nicht löschbar; Schlüssel und Art einer Stufe bleiben fest.
-- Regeln: Geschäftsleitung schreibt Pipelines und Stufen, Mitarbeiter mit
-- Modul „Deal-Pipeline" lesen.
-- Kein Aussperr-Risiko: an den bestehenden Regeln von crm_deal ändert sich nichts.
-- Voraussetzung: crm_deal, mein_chef_id(), darf_ich_modul_sehen/-aendern().
-- ============================================================

-- TEIL 1 von 5: Tabellen
create table if not exists public.crm_pipeline (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  beschreibung    text check (beschreibung is null or char_length(beschreibung) <= 500),
  standard        boolean not null default false,
  position        integer not null default 0,
  aktiv           boolean not null default true,
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create unique index if not exists crm_pipeline_name_uidx on public.crm_pipeline (owner_user_id, lower(btrim(name)));
create unique index if not exists crm_pipeline_standard_uidx on public.crm_pipeline (owner_user_id) where standard;

create table if not exists public.crm_pipeline_stufe (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  pipeline_id       uuid not null references public.crm_pipeline(id) on delete cascade,
  schluessel        text not null check (schluessel ~ '^[a-z0-9_]{1,40}$'),
  name              text not null check (char_length(btrim(name)) between 1 and 60),
  wahrscheinlichkeit integer not null default 10 check (wahrscheinlichkeit between 0 and 100),
  art               text not null default 'offen' check (art in ('offen', 'gewonnen', 'verloren')),
  position          integer not null default 0,
  farbe             text check (farbe is null or farbe ~ '^#[0-9A-Fa-f]{6}$'),
  erstellt_am       timestamptz not null default now(),
  constraint crm_pipeline_stufe_eindeutig unique (pipeline_id, schluessel),
  constraint crm_pipeline_stufe_art check (
    (art = 'gewonnen') = (schluessel = 'gewonnen') and (art = 'verloren') = (schluessel = 'verloren')
    and (art <> 'gewonnen' or wahrscheinlichkeit = 100) and (art <> 'verloren' or wahrscheinlichkeit = 0)
  )
);
create index if not exists crm_pipeline_stufe_pipeline_idx on public.crm_pipeline_stufe (pipeline_id, position);

-- TEIL 2 von 5: Spalte am Deal (leer = Standard-Pipeline wie bisher)
alter table public.crm_deal add column if not exists pipeline_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'crm_deal_pipeline_fk') then
    alter table public.crm_deal add constraint crm_deal_pipeline_fk foreign key (pipeline_id) references public.crm_pipeline(id) on delete restrict;
  end if;
end $$;
create index if not exists crm_deal_pipeline_idx on public.crm_deal (pipeline_id) where pipeline_id is not null;

-- TEIL 3 von 5: Wächter
create or replace function public.p359_pipeline_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.crm_deal d where d.pipeline_id = old.id) then
      raise exception 'Diese Pipeline hat noch Deals. Bitte die Deals zuerst in eine andere Pipeline verschieben oder die Pipeline auf „inaktiv" setzen.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    new.owner_user_id := old.owner_user_id; new.erstellt_am := old.erstellt_am;
  end if;
  new.name := btrim(new.name);
  if new.standard and not new.aktiv then raise exception 'Eine inaktive Pipeline kann nicht die Start-Ansicht sein.'; end if;
  new.aktualisiert_am := now();
  return new;
end;
$$;

-- Jede neue Pipeline bekommt sofort ihre Stufen „Gewonnen" und „Verloren".
create or replace function public.p359_pipeline_ende_anlegen()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.crm_pipeline_stufe (owner_user_id, pipeline_id, schluessel, name, wahrscheinlichkeit, art, position)
    values (new.owner_user_id, new.id, 'gewonnen', 'Gewonnen', 100, 'gewonnen', 1000),
           (new.owner_user_id, new.id, 'verloren', 'Verloren', 0, 'verloren', 1001)
    on conflict (pipeline_id, schluessel) do nothing;
  return new;
end;
$$;

create or replace function public.p359_stufe_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid;
begin
  if tg_op = 'DELETE' then
    -- Wird die ganze Pipeline gelöscht, ist sie hier schon weg: dann dürfen alle Stufen mit.
    if exists (select 1 from public.crm_pipeline p where p.id = old.pipeline_id) then
      if old.art <> 'offen' then raise exception '„Gewonnen" und „Verloren" gehören zu jeder Pipeline und lassen sich nicht löschen — nur umbenennen.'; end if;
      if exists (select 1 from public.crm_deal d where d.pipeline_id = old.pipeline_id and d.stufe = old.schluessel) then
        raise exception 'In dieser Stufe stehen noch Deals. Bitte die Deals zuerst in eine andere Stufe setzen.';
      end if;
    end if;
    return old;
  end if;
  select p.owner_user_id into v_owner from public.crm_pipeline p where p.id = new.pipeline_id;
  if v_owner is null then raise exception 'Die Pipeline gibt es nicht.'; end if;
  if tg_op = 'UPDATE' then
    if new.pipeline_id is distinct from old.pipeline_id or new.schluessel is distinct from old.schluessel or new.art is distinct from old.art then
      raise exception 'Schlüssel, Art und Pipeline einer Stufe bleiben fest — bitte nur Name, Wahrscheinlichkeit, Farbe oder Reihenfolge ändern.';
    end if;
    new.erstellt_am := old.erstellt_am;
  end if;
  new.owner_user_id := v_owner;
  new.name := btrim(new.name);
  return new;
end;
$$;

-- Deal: Stufe muss zur Pipeline passen. Ohne Pipeline bleibt alles wie bisher;
-- nur wer einen Deal AUS einer eigenen Pipeline zurück in die Standard-Pipeline
-- schiebt, braucht eine der 6 Standard-Stufen.
create or replace function public.p359_deal_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid; v_aktiv boolean; v_erste text;
begin
  if new.pipeline_id is not null then
    if tg_op = 'UPDATE' and new.pipeline_id is not distinct from old.pipeline_id and new.stufe is not distinct from old.stufe then
      return new;
    end if;
    select p.owner_user_id, p.aktiv into v_owner, v_aktiv from public.crm_pipeline p where p.id = new.pipeline_id;
    if v_owner is null or v_owner <> new.owner_user_id then raise exception 'Die Pipeline gehört nicht zu Ihrem Betrieb.'; end if;
    if not v_aktiv and (tg_op = 'INSERT' or new.pipeline_id is distinct from old.pipeline_id) then
      raise exception 'Die Pipeline ist inaktiv — neue Deals bitte in eine aktive Pipeline.';
    end if;
    if new.stufe is null or new.stufe = '' then
      select s.schluessel into v_erste from public.crm_pipeline_stufe s
        where s.pipeline_id = new.pipeline_id and s.art = 'offen' order by s.position, s.erstellt_am limit 1;
      if v_erste is null then raise exception 'Die Pipeline hat noch keine offene Stufe.'; end if;
      new.stufe := v_erste;
    elsif not exists (select 1 from public.crm_pipeline_stufe s where s.pipeline_id = new.pipeline_id and s.schluessel = new.stufe) then
      raise exception 'Die Stufe „%" gibt es in dieser Pipeline nicht.', new.stufe;
    end if;
  elsif tg_op = 'UPDATE' and old.pipeline_id is not null
        and coalesce(new.stufe, '') not in ('lead', 'qualifiziert', 'angebot', 'verhandlung', 'gewonnen', 'verloren') then
    raise exception 'In der Standard-Pipeline gibt es die Stufe „%" nicht.', new.stufe;
  end if;
  return new;
end;
$$;

do $$
begin
  drop trigger if exists p359_waechter on public.crm_pipeline;
  create trigger p359_waechter before insert or update or delete on public.crm_pipeline for each row execute function public.p359_pipeline_waechter();
  drop trigger if exists p359_ende on public.crm_pipeline;
  create trigger p359_ende after insert on public.crm_pipeline for each row execute function public.p359_pipeline_ende_anlegen();
  drop trigger if exists p359_waechter on public.crm_pipeline_stufe;
  create trigger p359_waechter before insert or update or delete on public.crm_pipeline_stufe for each row execute function public.p359_stufe_waechter();
  drop trigger if exists p359_pipeline on public.crm_deal;
  create trigger p359_pipeline before insert or update on public.crm_deal for each row execute function public.p359_deal_waechter();
end $$;

-- TEIL 4 von 5: Regeln. Geschäftsleitung schreibt, Mitarbeiter mit Modul „pipeline" lesen.
do $$
declare t text;
begin
  foreach t in array array['crm_pipeline', 'crm_pipeline_stufe'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists p359_owner_all on public.%I', t);
    execute format('create policy p359_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p359_ma_select on public.%I', t);
    execute format('create policy p359_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''pipeline'') or public.darf_ich_modul_aendern(''pipeline'')))', t);
  end loop;
end $$;

-- TEIL 5 von 5: KONTROLLE — Erwartung: tabellen = 2 | spalte = 1 | regeln = 4 | ausloeser = 4 | fk = 1
-- (regeln = 6 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel aus Paket 164, je Tabelle)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('crm_pipeline', 'crm_pipeline_stufe')) as tabellen,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'crm_deal' and column_name = 'pipeline_id') as spalte,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('crm_pipeline', 'crm_pipeline_stufe')) as regeln,
  (select count(*) from pg_trigger where tgname in ('p359_waechter', 'p359_ende', 'p359_pipeline') and not tgisinternal) as ausloeser,
  (select count(*) from pg_constraint where conname = 'crm_deal_pipeline_fk') as fk;
