-- ============================================================
-- ARGONAUT OS · Paket 354 (13.10.2026) · A4b Fachpaket Bewachung, Teil 2
-- Dienstplan je Objekt und Nachweis-Vorgaben je Objekt.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- wach_objekt_vorgabe:  welche Nachweise ein Objekt verlangt (z. B. die
--                       Sachkundeprüfung nach § 34a GewO statt nur der
--                       Unterrichtung). Eine Zeile je Objekt.
-- wach_dienst:          ein geplanter Dienst (Objekt, Wachperson, von–bis,
--                       Aufgabe). Eine Wachperson kann nicht zur selben
--                       Zeit zweimal eingeplant sein (die Datenbank prüft
--                       das, auch wenn zwei gleichzeitig planen). Wer trotz
--                       fehlender Nachweise einplant, bestätigt das — der
--                       Vermerk bleibt am Dienst.
--
-- Die Nachweise der Wachpersonen (Unterrichtung, Sachkunde, Bewacher-ID)
-- stehen in der bestehenden Tabelle mitarbeiter_qualifikation (Paket PO);
-- Erlaubnis- und Bewacherregister-Nummer des Betriebs in modul_einstellung
-- (Modul „bewachung") — beides ohne neue Tabelle.
--
-- Rechte wie Paket 352: Besitzer = Betrieb, Mitarbeiter lesen mit Modul
-- „bewachung", planen mit Schreibrecht, löschen nur die Geschäftsleitung.
-- ============================================================

-- TEIL 1 von 5: Tabellen
create extension if not exists btree_gist with schema extensions;

create table if not exists public.wach_objekt_vorgabe (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  objekt_id       uuid not null,
  anforderungen   text[] not null default '{}' check (anforderungen <@ array['unterrichtung_34a', 'sachkunde_34a', 'bewacherregister', 'erste_hilfe', 'brandschutzhelfer']::text[]),
  notiz           text check (notiz is null or char_length(notiz) <= 300),
  aktualisiert_am timestamptz not null default now(),
  constraint wach_objekt_vorgabe_je_objekt unique (owner_user_id, objekt_id)
);

create table if not exists public.wach_dienst (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  objekt_id        uuid not null,
  mitarbeiter_id   uuid not null,
  mitarbeiter_name text,
  beginn           timestamptz not null,
  ende             timestamptz not null,
  zeitraum         tstzrange generated always as (tstzrange(beginn, ende, '[)')) stored,
  aufgabe          text check (aufgabe is null or char_length(aufgabe) <= 120),
  notiz            text check (notiz is null or char_length(notiz) <= 300),
  status           text not null default 'geplant' check (status in ('geplant', 'abgesagt')),
  trotz_warnung    boolean not null default false,
  warnung_text     text check (warnung_text is null or char_length(warnung_text) <= 500),
  erstellt_von     uuid default auth.uid(),
  erstellt_am      timestamptz not null default now(),
  aktualisiert_am  timestamptz not null default now(),
  constraint wach_dienst_dauer check (ende > beginn and ende - beginn <= interval '24 hours')
);
create index if not exists wach_dienst_idx on public.wach_dienst (owner_user_id, objekt_id, beginn);
create index if not exists wach_dienst_ma_idx on public.wach_dienst (owner_user_id, mitarbeiter_id, beginn);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wach_dienst_keine_ueberschneidung') then
    alter table public.wach_dienst add constraint wach_dienst_keine_ueberschneidung
      exclude using gist (mitarbeiter_id with =, zeitraum with &&) where (status = 'geplant');
  end if;
end $$;

-- TEIL 2 von 5: Wächter Vorgabe (Objekt im Betrieb)
create or replace function public.p354_vorgabe_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' then
    if new.owner_user_id is distinct from old.owner_user_id then raise exception 'Der Betrieb einer Vorgabe kann nicht geändert werden.'; end if;
    new.objekt_id := old.objekt_id;
  elsif not exists (select 1 from public.objekte o where o.id = new.objekt_id and o.owner_user_id = new.owner_user_id) then
    raise exception 'Das Objekt gehört nicht zu Ihrem Betrieb.';
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$$;

-- TEIL 3 von 5: Wächter Dienst (Objekt und Wachperson im Betrieb, Name, abgesagt bleibt abgesagt)
create or replace function public.p354_dienst_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_name text;
begin
  if tg_op = 'UPDATE' then
    if new.owner_user_id is distinct from old.owner_user_id then raise exception 'Der Betrieb eines Dienstes kann nicht geändert werden.'; end if;
    if old.status = 'abgesagt' then raise exception 'Ein abgesagter Dienst bleibt abgesagt — bitte neu planen.'; end if;
    new.erstellt_von := old.erstellt_von;
    new.erstellt_am := old.erstellt_am;
  else
    new.erstellt_von := auth.uid();
    new.erstellt_am := now();
  end if;
  if tg_op = 'INSERT' or new.objekt_id is distinct from old.objekt_id then
    if not exists (select 1 from public.objekte o where o.id = new.objekt_id and o.owner_user_id = new.owner_user_id) then
      raise exception 'Das Objekt gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  if tg_op = 'INSERT' or new.mitarbeiter_id is distinct from old.mitarbeiter_id then
    select nullif(trim(coalesce(m.vorname, '') || ' ' || coalesce(m.nachname, '')), '') into v_name
      from public.mitarbeiter m where m.id = new.mitarbeiter_id and m.owner_user_id = new.owner_user_id;
    if not found then raise exception 'Die Wachperson gehört nicht zu Ihrem Betrieb.'; end if;
    new.mitarbeiter_name := coalesce(v_name, 'ohne Namen');
  else
    new.mitarbeiter_name := old.mitarbeiter_name;
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$$;

-- TEIL 4 von 5: Auslöser und Rechte (Modul „bewachung")
do $$
declare
  t text;
begin
  foreach t in array array['wach_objekt_vorgabe', 'wach_dienst'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop trigger if exists p181_besitzer on public.%I', t);
    execute format('create trigger p181_besitzer before insert or update on public.%I for each row execute function public.p181_besitzer()', t);
    execute format('drop trigger if exists p354_waechter on public.%I', t);
    execute format('create trigger p354_waechter before insert or update on public.%I for each row execute function public.%I()', t,
      case when t = 'wach_dienst' then 'p354_dienst_waechter' else 'p354_vorgabe_waechter' end);
    execute format('drop policy if exists p354_owner_all on public.%I', t);
    execute format('create policy p354_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p354_ma_select on public.%I', t);
    execute format('create policy p354_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''bewachung'') or public.darf_ich_modul_aendern(''bewachung'')))', t);
    execute format('drop policy if exists p354_ma_insert on public.%I', t);
    execute format('create policy p354_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''bewachung''))', t);
    execute format('drop policy if exists p354_ma_update on public.%I', t);
    execute format('create policy p354_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''bewachung'')) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''bewachung''))', t);
  end loop;
end $$;

-- TEIL 5 von 5: KONTROLLE — Erwartung: tabellen = 2 | regeln = 8 | ausloeser = 4 | rls_an = 2 | sperre = 1
-- (regeln = 10 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel, die
--  Paket 164 an jede neue Tabelle hängt — je Tabelle eine mehr, harmlos)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('wach_objekt_vorgabe', 'wach_dienst')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('wach_objekt_vorgabe', 'wach_dienst')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.wach_objekt_vorgabe'::regclass, 'public.wach_dienst'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('wach_objekt_vorgabe', 'wach_dienst') and relrowsecurity) as rls_an,
  (select count(*) from pg_constraint where conname = 'wach_dienst_keine_ueberschneidung') as sperre;
