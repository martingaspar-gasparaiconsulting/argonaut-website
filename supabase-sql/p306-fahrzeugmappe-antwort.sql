-- ============================================================
-- ARGONAUT OS · Paket 306 (10.10.2026) · FM2 Fahrzeugmappe: Händler antwortet
--
-- Additiv und mehrfach ausführbar. Es wird nichts gelöscht oder umgebaut.
--  1) kfz_mappe: + token_verschluesselt (Link-Schlüssel AES-verschlüsselt mit
--     dem Server-Schlüssel, damit jede Mail einen Knopf „Mappe öffnen" hat;
--     ohne Server-Schlüssel nutzlos), + nachreichen_bis (Rückfrage offen bis)
--  2) kfz_mappe_nachricht: Verlauf zwischen Händler und Verkäufer
--     Händler: angebot (Betrag, gültig bis, Vorbehalt fest) | rueckfrage |
--              einladung (Termin) | absage
--     Verkäufer: antwort | termin_ok | nachgereicht
--     Nicht änderbar. Ein Eintrag zieht mit (in der Datenbank, nicht im Browser):
--       angebot   -> Ankauf „Angebot abgegeben" + Angebotsbetrag
--       absage    -> Ankauf „Nicht angekauft"
--       rueckfrage-> Verkäufer darf 14 Tage Dateien nachreichen
--  3) Dateien: an eine eingereichte Mappe nur, solange eine Rückfrage offen ist
--     (Wächter p305_datei_waechter wird mit gleichem Namen erweitert)
--  4) kfz_ankauf: Fahrzeughistorie (carVertical o. a.) wie am Bestandsfahrzeug:
--     historie_url, historie_anbieter, historie_am, historie_befund
-- Rechte: Händler-Einträge Chef und Mitarbeiter mit Schreibrecht „KFZ";
-- Verkäufer-Einträge nur der Server. Lesen Chef und Mitarbeiter mit „KFZ".
-- Aussperr-Risiko: keins.
-- ============================================================

-- 1) Mappe ------------------------------------------------------------------------------
alter table public.kfz_mappe add column if not exists token_verschluesselt text;
alter table public.kfz_mappe add column if not exists nachreichen_bis timestamptz;

-- 2) Verlauf ---------------------------------------------------------------------------------
create table if not exists public.kfz_mappe_nachricht (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  mappe_id      uuid not null references public.kfz_mappe(id) on delete cascade,
  von           text not null check (von in ('haendler', 'kunde')),
  art           text not null check (art in ('angebot', 'rueckfrage', 'einladung', 'absage', 'antwort', 'termin_ok', 'nachgereicht')),
  text          text check (text is null or char_length(text) <= 1500),
  betrag        numeric(12,2) check (betrag is null or (betrag > 0 and betrag < 10000000)),
  gueltig_bis   date,
  termin        timestamptz,
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now(),
  constraint kfz_mappe_nachricht_von_art check (
    (von = 'haendler' and art in ('angebot', 'rueckfrage', 'einladung', 'absage'))
    or (von = 'kunde' and art in ('antwort', 'termin_ok', 'nachgereicht'))),
  constraint kfz_mappe_nachricht_angebot check (art <> 'angebot' or (betrag is not null and gueltig_bis is not null)),
  constraint kfz_mappe_nachricht_einladung check (art <> 'einladung' or termin is not null),
  constraint kfz_mappe_nachricht_rueckfrage check (art <> 'rueckfrage' or char_length(coalesce(text, '')) >= 5)
);
create index if not exists kfz_mappe_nachricht_idx on public.kfz_mappe_nachricht (mappe_id, erstellt_am);
alter table public.kfz_mappe_nachricht enable row level security;

create or replace function public.p306_nachricht_waechter() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if tg_op = 'UPDATE' then raise exception 'p306: Einträge im Verlauf sind nicht änderbar.'; end if;
  select id, owner_user_id, status, ankauf_id into m from public.kfz_mappe where id = new.mappe_id for update;
  if not found then raise exception 'p306: Mappe gibt es nicht.'; end if;
  if m.status <> 'eingereicht' then raise exception 'p306: Antworten gibt es nur zu eingereichten Mappen.'; end if;
  if new.owner_user_id is distinct from m.owner_user_id then raise exception 'p306: Eintrag gehört zu einem anderen Betrieb.'; end if;
  if new.art = 'angebot' and new.gueltig_bis < current_date then raise exception 'p306: Das Angebot ist schon abgelaufen.'; end if;
  if new.art = 'einladung' and new.termin < now() then raise exception 'p306: Der Termin liegt in der Vergangenheit.'; end if;
  if new.von = 'kunde' then new.erstellt_von := null; end if;
  return new;
end $$;
drop trigger if exists p306_nachricht_waechter on public.kfz_mappe_nachricht;
create trigger p306_nachricht_waechter before insert or update on public.kfz_mappe_nachricht
  for each row execute function public.p306_nachricht_waechter();

-- Nachziehen: Ankauf-Status, Angebot, Nachreichen (läuft mit Rechten der Datenbank,
-- damit Mitarbeiter ohne Rechte an kfz_mappe die Rückfrage öffnen können).
create or replace function public.p306_nachricht_folgen() returns trigger
language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select ankauf_id into a from public.kfz_mappe where id = new.mappe_id;
  if new.art = 'rueckfrage' then
    update public.kfz_mappe set nachreichen_bis = now() + interval '14 days' where id = new.mappe_id;
  elsif new.art in ('angebot', 'absage', 'einladung') then
    update public.kfz_mappe set nachreichen_bis = null where id = new.mappe_id;
  end if;
  if a is not null and new.art = 'angebot' then
    update public.kfz_ankauf set status = 'angeboten', angebot = new.betrag, aktualisiert_am = now()
      where id = a and status in ('offen', 'angeboten');
  elsif a is not null and new.art = 'absage' then
    update public.kfz_ankauf set status = 'abgelehnt', aktualisiert_am = now()
      where id = a and status in ('offen', 'angeboten');
  end if;
  return null;
end $$;
drop trigger if exists p306_nachricht_folgen on public.kfz_mappe_nachricht;
create trigger p306_nachricht_folgen after insert on public.kfz_mappe_nachricht
  for each row execute function public.p306_nachricht_folgen();
revoke all on function public.p306_nachricht_waechter() from public, anon, authenticated;
revoke all on function public.p306_nachricht_folgen() from public, anon, authenticated;

drop policy if exists p306_chef_select on public.kfz_mappe_nachricht;
create policy p306_chef_select on public.kfz_mappe_nachricht for select to authenticated
  using (auth.uid() = owner_user_id);
drop policy if exists p306_ma_select on public.kfz_mappe_nachricht;
create policy p306_ma_select on public.kfz_mappe_nachricht for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p306_chef_insert on public.kfz_mappe_nachricht;
create policy p306_chef_insert on public.kfz_mappe_nachricht for insert to authenticated
  with check (auth.uid() = owner_user_id and von = 'haendler');
drop policy if exists p306_ma_insert on public.kfz_mappe_nachricht;
create policy p306_ma_insert on public.kfz_mappe_nachricht for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz') and von = 'haendler');

-- 3) Dateien nachreichen (Wächter aus Paket 305, gleicher Name, erweitert) -------------------
create or replace function public.p305_datei_waechter() returns trigger
language plpgsql set search_path = public as $$
declare m record; n integer;
begin
  if tg_op = 'UPDATE' then
    if new.mappe_id is distinct from old.mappe_id or new.pfad is distinct from old.pfad
       or new.owner_user_id is distinct from old.owner_user_id or new.fach is distinct from old.fach then
      raise exception 'p305: Mappe, Fach, Pfad und Betrieb einer Datei sind fest.';
    end if;
    if old.status = 'fertig' and new.status <> 'fertig' then raise exception 'p305: Eine fertige Datei bleibt fertig.'; end if;
    return new;
  end if;
  select owner_user_id, status, nachreichen_bis into m from public.kfz_mappe where id = new.mappe_id for update;
  if not found then raise exception 'p305: Mappe gibt es nicht.'; end if;
  if not (m.status = 'entwurf' or (m.status = 'eingereicht' and m.nachreichen_bis is not null and m.nachreichen_bis > now())) then
    raise exception 'p305: An eine eingereichte Mappe kommen nur nach einer Rückfrage Dateien.';
  end if;
  if new.owner_user_id is distinct from m.owner_user_id then raise exception 'p305: Datei gehört zu einem anderen Betrieb.'; end if;
  select count(*) into n from public.kfz_mappe_datei where mappe_id = new.mappe_id;
  if n >= 70 then raise exception 'p305: Höchstens 70 Dateien je Mappe.'; end if;
  return new;
end $$;

-- 4) Fahrzeughistorie am Ankauf ---------------------------------------------------------------
alter table public.kfz_ankauf add column if not exists historie_url text;
alter table public.kfz_ankauf add column if not exists historie_anbieter text;
alter table public.kfz_ankauf add column if not exists historie_am date;
alter table public.kfz_ankauf add column if not exists historie_befund jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kfz_ankauf_historie_url_chk') then
    alter table public.kfz_ankauf add constraint kfz_ankauf_historie_url_chk
      check (historie_url is null or (char_length(historie_url) <= 500 and historie_url ~ '^https://'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kfz_ankauf_historie_anbieter_chk') then
    alter table public.kfz_ankauf add constraint kfz_ankauf_historie_anbieter_chk
      check (historie_anbieter is null or historie_anbieter in ('carvertical', 'sonstige'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kfz_ankauf_historie_befund_chk') then
    alter table public.kfz_ankauf add constraint kfz_ankauf_historie_befund_chk
      check (jsonb_typeof(historie_befund) = 'object');
  end if;
end $$;

-- KONTROLLE — Erwartung: neue_spalten = 6 | tabelle = 1 | regeln = 4 | ausloeser = 2 | rls_an = true | pruefregeln = 3
select
  (select count(*) from information_schema.columns where table_schema = 'public'
     and ((table_name = 'kfz_mappe' and column_name in ('token_verschluesselt', 'nachreichen_bis'))
       or (table_name = 'kfz_ankauf' and column_name in ('historie_url', 'historie_anbieter', 'historie_am', 'historie_befund')))) as neue_spalten,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'kfz_mappe_nachricht') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_mappe_nachricht') as regeln,
  (select count(*) from pg_trigger where tgname in ('p306_nachricht_waechter', 'p306_nachricht_folgen') and not tgisinternal) as ausloeser,
  (select relrowsecurity from pg_class where relname = 'kfz_mappe_nachricht') as rls_an,
  (select count(*) from pg_constraint where conname like 'kfz_ankauf_historie_%_chk') as pruefregeln;
