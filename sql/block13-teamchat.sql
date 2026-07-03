-- ============================================================================
-- ARGONAUT OS · BLOCK 13 · TC1 — Team-Chat Datenmodell
-- Idempotent (IF NOT EXISTS / OR REPLACE / DROP+CREATE fuer Policies).
-- Mitgliedschaftsbasierte RLS, rekursionssicher via SECURITY DEFINER Helfer.
-- firma_id = PLATZHALTER, NICHT verbunden (erst im Finale).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) TABELLEN
-- ----------------------------------------------------------------------------

-- Kanaele (Gruppen-Kanaele und Direktnachrichten)
create table if not exists public.chat_kanaele (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  beschreibung text,
  typ          text not null default 'kanal',            -- 'kanal' | 'direkt'
  erstellt_von uuid not null default auth.uid()
                 references auth.users(id) on delete cascade,
  firma_id     uuid,                                     -- PLATZHALTER, nicht verbunden
  created_at   timestamptz not null default now()
);

-- Mitglieder eines Kanals (wer darf lesen/schreiben)
create table if not exists public.chat_mitglieder (
  id            uuid primary key default gen_random_uuid(),
  kanal_id      uuid not null references public.chat_kanaele(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  anzeigename   text,
  beigetreten_am timestamptz not null default now(),
  unique (kanal_id, user_id)
);

-- Nachrichten
create table if not exists public.chat_nachrichten (
  id            uuid primary key default gen_random_uuid(),
  kanal_id      uuid not null references public.chat_kanaele(id) on delete cascade,
  absender_id   uuid references auth.users(id) on delete set null,  -- NULL bei KI
  absender_name text not null,                                      -- 'ARGONAUT' bei KI
  ist_ki        boolean not null default false,
  text          text not null,
  firma_id      uuid,                                               -- PLATZHALTER
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2) INDIZES
-- ----------------------------------------------------------------------------
create index if not exists idx_chat_nachrichten_kanal
  on public.chat_nachrichten (kanal_id, created_at);
create index if not exists idx_chat_mitglieder_user
  on public.chat_mitglieder (user_id);
create index if not exists idx_chat_mitglieder_kanal
  on public.chat_mitglieder (kanal_id);

-- ----------------------------------------------------------------------------
-- 3) HILFSFUNKTION (SECURITY DEFINER) — verhindert RLS-Rekursion
--    Prueft Mitgliedschaft ohne RLS auf chat_mitglieder auszuloesen.
-- ----------------------------------------------------------------------------
create or replace function public.ist_chat_mitglied(p_kanal uuid, p_user uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.chat_mitglieder
    where kanal_id = p_kanal and user_id = p_user
  );
$$;

-- ----------------------------------------------------------------------------
-- 4) TRIGGER — Ersteller automatisch als Mitglied eintragen
-- ----------------------------------------------------------------------------
create or replace function public.chat_kanal_ersteller_als_mitglied()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.chat_mitglieder (kanal_id, user_id)
  values (new.id, new.erstellt_von)
  on conflict (kanal_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_chat_kanal_ersteller on public.chat_kanaele;
create trigger trg_chat_kanal_ersteller
  after insert on public.chat_kanaele
  for each row execute function public.chat_kanal_ersteller_als_mitglied();

-- ----------------------------------------------------------------------------
-- 5) RLS AKTIVIEREN
-- ----------------------------------------------------------------------------
alter table public.chat_kanaele     enable row level security;
alter table public.chat_mitglieder  enable row level security;
alter table public.chat_nachrichten enable row level security;

-- ----------------------------------------------------------------------------
-- 6) POLICIES — chat_kanaele
-- ----------------------------------------------------------------------------
drop policy if exists kanaele_select on public.chat_kanaele;
create policy kanaele_select on public.chat_kanaele
  for select using (
    erstellt_von = auth.uid()
    or public.ist_chat_mitglied(id, auth.uid())
  );

drop policy if exists kanaele_insert on public.chat_kanaele;
create policy kanaele_insert on public.chat_kanaele
  for insert with check (erstellt_von = auth.uid());

drop policy if exists kanaele_update on public.chat_kanaele;
create policy kanaele_update on public.chat_kanaele
  for update using (erstellt_von = auth.uid())
             with check (erstellt_von = auth.uid());

drop policy if exists kanaele_delete on public.chat_kanaele;
create policy kanaele_delete on public.chat_kanaele
  for delete using (erstellt_von = auth.uid());

-- ----------------------------------------------------------------------------
-- 7) POLICIES — chat_mitglieder
-- ----------------------------------------------------------------------------
drop policy if exists mitglieder_select on public.chat_mitglieder;
create policy mitglieder_select on public.chat_mitglieder
  for select using (
    user_id = auth.uid()
    or public.ist_chat_mitglied(kanal_id, auth.uid())
  );

drop policy if exists mitglieder_insert on public.chat_mitglieder;
create policy mitglieder_insert on public.chat_mitglieder
  for insert with check (
    user_id = auth.uid()                                  -- selbst beitreten
    or exists (                                           -- oder Ersteller laedt ein
      select 1 from public.chat_kanaele k
      where k.id = kanal_id and k.erstellt_von = auth.uid()
    )
  );

drop policy if exists mitglieder_delete on public.chat_mitglieder;
create policy mitglieder_delete on public.chat_mitglieder
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.chat_kanaele k
      where k.id = kanal_id and k.erstellt_von = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 8) POLICIES — chat_nachrichten
-- ----------------------------------------------------------------------------
drop policy if exists nachrichten_select on public.chat_nachrichten;
create policy nachrichten_select on public.chat_nachrichten
  for select using (public.ist_chat_mitglied(kanal_id, auth.uid()));

drop policy if exists nachrichten_insert on public.chat_nachrichten;
create policy nachrichten_insert on public.chat_nachrichten
  for insert with check (
    public.ist_chat_mitglied(kanal_id, auth.uid())
    and (absender_id = auth.uid() or ist_ki = true)       -- eigene Msg oder KI-Antwort
  );

drop policy if exists nachrichten_delete on public.chat_nachrichten;
create policy nachrichten_delete on public.chat_nachrichten
  for delete using (absender_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 9) REALTIME — chat_nachrichten zur Publication hinzufuegen (idempotent)
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_nachrichten'
  ) then
    alter publication supabase_realtime add table public.chat_nachrichten;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 10) TC2 — RPC: Kollege per E-Mail zum Kanal hinzufuegen
--     SECURITY DEFINER (darf auth.users lesen), nur der Kanal-Ersteller darf.
--     Rueckgabe: 'ok' | Klartext-Fehlermeldung.
-- ----------------------------------------------------------------------------
create or replace function public.chat_mitglied_per_email(p_kanal uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid;
  v_ersteller uuid;
begin
  select erstellt_von into v_ersteller
  from public.chat_kanaele where id = p_kanal;

  if v_ersteller is null then
    return 'Kanal nicht gefunden.';
  end if;

  if v_ersteller <> auth.uid() then
    return 'Nur der Ersteller des Kanals darf Kollegen einladen.';
  end if;

  select id into v_user
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_user is null then
    return 'Kein Nutzer mit dieser E-Mail gefunden.';
  end if;

  insert into public.chat_mitglieder (kanal_id, user_id)
  values (p_kanal, v_user)
  on conflict (kanal_id, user_id) do nothing;

  return 'ok';
end;
$$;

-- ----------------------------------------------------------------------------
-- 11) TC2b — Namens-basiertes Einladen + Mitglieder-/Moderator-Anzeige
-- ----------------------------------------------------------------------------

-- 11a) Anzeigename des aktuellen Nutzers (mitarbeiter -> profiles -> E-Mail)
create or replace function public.chat_mein_name()
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_name text;
begin
  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into v_name from public.mitarbeiter where auth_user_id = auth.uid() limit 1;
  if v_name is not null and v_name <> '' then return v_name; end if;

  select full_name into v_name from public.profiles where id = auth.uid() limit 1;
  if v_name is not null and v_name <> '' then return v_name; end if;

  select split_part(email, '@', 1) into v_name from auth.users where id = auth.uid() limit 1;
  return coalesce(v_name, 'Ich');
end;
$$;

-- 11b) Kollegen des eigenen Teams (nur mit Login), inkl. "schon im Kanal?"
--      Rueckgabe-Spalten mit k_-Prefix -> keine Ambiguitaet mit Tabellenspalten.
drop function if exists public.chat_team_kollegen(uuid);
create function public.chat_team_kollegen(p_kanal uuid)
returns table (k_auth_user_id uuid, k_anzeige text, k_email text, k_ist_mitglied boolean)
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_owner uuid;
begin
  -- Team-Owner bestimmen: ist der User ein Mitarbeiter -> dessen owner_user_id,
  -- sonst (Chef) -> die eigene ID.
  select m.owner_user_id into v_owner
    from public.mitarbeiter m where m.auth_user_id = auth.uid() limit 1;
  if v_owner is null then v_owner := auth.uid(); end if;

  return query
  select
    m.auth_user_id,
    coalesce(
      nullif(trim(coalesce(m.vorname,'') || ' ' || coalesce(m.nachname,'')), ''),
      split_part(m.email, '@', 1)
    ),
    m.email,
    exists (
      select 1 from public.chat_mitglieder cm
      where cm.kanal_id = p_kanal and cm.user_id = m.auth_user_id
    )
  from public.mitarbeiter m
  where m.owner_user_id = v_owner
    and m.auth_user_id is not null
    and m.auth_user_id <> auth.uid()
  order by 2;
end;
$$;

-- 11c) Kollege zum Kanal hinzufuegen (nur Moderator/Ersteller), Name mitspeichern
create or replace function public.chat_mitglied_hinzufuegen(p_kanal uuid, p_user uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_ersteller uuid; v_anzeige text;
begin
  select erstellt_von into v_ersteller from public.chat_kanaele where id = p_kanal;
  if v_ersteller is null then return 'Kanal nicht gefunden.'; end if;
  if v_ersteller <> auth.uid() then
    return 'Nur der Moderator des Kanals darf Kollegen einladen.';
  end if;

  select trim(coalesce(vorname,'') || ' ' || coalesce(nachname,''))
    into v_anzeige from public.mitarbeiter where auth_user_id = p_user limit 1;

  insert into public.chat_mitglieder (kanal_id, user_id, anzeigename)
  values (p_kanal, p_user, nullif(v_anzeige, ''))
  on conflict (kanal_id, user_id) do nothing;

  return 'ok';
end;
$$;

-- 11d) Mitglieder eines Kanals mit aufgeloestem Namen + Moderator-Flag
--      Rueckgabe-Spalten mit m_-Prefix + qualifizierter Guard -> keine Ambiguitaet.
drop function if exists public.chat_kanal_mitglieder(uuid);
create function public.chat_kanal_mitglieder(p_kanal uuid)
returns table (m_user_id uuid, m_anzeige text, m_ist_moderator boolean)
language plpgsql
security definer
set search_path = public
stable
as $$
declare v_ersteller uuid;
begin
  -- Nur Mitglieder duerfen die Mitgliederliste sehen
  if not exists (
    select 1 from public.chat_mitglieder cm
    where cm.kanal_id = p_kanal and cm.user_id = auth.uid()
  ) then
    return;
  end if;

  select k.erstellt_von into v_ersteller from public.chat_kanaele k where k.id = p_kanal;

  return query
  select
    cm.user_id,
    coalesce(
      nullif(cm.anzeigename, ''),
      nullif((select trim(coalesce(mi.vorname,'') || ' ' || coalesce(mi.nachname,''))
                from public.mitarbeiter mi where mi.auth_user_id = cm.user_id limit 1), ''),
      nullif((select p.full_name from public.profiles p where p.id = cm.user_id limit 1), ''),
      (select split_part(u.email, '@', 1) from auth.users u where u.id = cm.user_id limit 1),
      'Unbekannt'
    ),
    (cm.user_id = v_ersteller)
  from public.chat_mitglieder cm
  where cm.kanal_id = p_kanal
  order by 3 desc, 2;
end;
$$;

-- FERTIG — TC1 + TC2-RPC + TC2b (Namens-Einladen, Fix Ambiguitaet)
