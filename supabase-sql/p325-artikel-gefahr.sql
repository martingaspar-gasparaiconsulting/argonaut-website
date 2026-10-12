-- ============================================================================
-- ARGONAUT OS · Paket 325 (12.10.2026) · S2 Gefahr-Angaben am Shop-Produkt — Teil 1
--
--   artikel_gefahr   je Artikel die Kennzeichnung aus dem Sicherheitsdatenblatt:
--                    Piktogramme, Signalwort, Gefahrenhinweise (H/EUH) und
--                    Sicherheitshinweise (P) mit Wortlaut, UN-Nummer, UFI —
--                    oder „nicht kennzeichnungspflichtig".
--                    Vorschlag (KI liest das SDB, oder aus dem
--                    Gefahrstoffverzeichnis) -> ein Mensch bestätigt.
--
-- Wächter in der Datenbank:
--   · Artikel und SDB gehören zum Betrieb, das SDB zum selben Artikel
--   · Betrieb und Artikel eines Eintrags sind fest
--   · „bestätigt" nur mit Inhalt (Piktogramm oder H-Satz, Signalwort zum
--     Piktogramm) oder ausdrücklich „nicht kennzeichnungspflichtig";
--     wer und wann wird gesetzt
--
-- Rechte: Geschäftsleitung alles. Mitarbeiter mit „Shop ändern" legen an,
-- bearbeiten und bestätigen (wie Paket 307), löschen nicht. „Shop sehen" liest.
-- Im Shop erscheint davon nichts, bis der Anwalt (R49) freigibt.
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — nur eine neue Tabelle.
-- RÜCKWEG (nur im Notfall): drop table public.artikel_gefahr;
-- ============================================================================

begin;

create table if not exists public.artikel_gefahr (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  artikel_id          uuid not null references public.artikel(id) on delete cascade,
  piktogramme         text[] not null default '{}',
  signalwort          text,
  h_saetze            jsonb not null default '[]'::jsonb,
  p_saetze            jsonb not null default '[]'::jsonb,
  un_nummer           text,
  ufi                 text,
  keine_kennzeichnung boolean not null default false,
  quelle              text not null default 'hand',
  sdb_dokument_id     uuid references public.produkt_dokument(id) on delete set null,
  status              text not null default 'vorschlag',
  bestaetigt_von      uuid,
  bestaetigt_am       timestamptz,
  angelegt_am         timestamptz not null default now(),
  geaendert_am        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p325_gefahr_check' and conrelid = 'public.artikel_gefahr'::regclass) then
    alter table public.artikel_gefahr add constraint p325_gefahr_check check (
      piktogramme <@ array['GHS01','GHS02','GHS03','GHS04','GHS05','GHS06','GHS07','GHS08','GHS09']::text[]
      and (signalwort is null or signalwort in ('Gefahr', 'Achtung'))
      and jsonb_typeof(h_saetze) = 'array' and jsonb_array_length(h_saetze) <= 40
      and jsonb_typeof(p_saetze) = 'array' and jsonb_array_length(p_saetze) <= 40
      and pg_column_size(h_saetze) + pg_column_size(p_saetze) <= 60000
      and (un_nummer is null or un_nummer ~ '^UN [0-9]{4}$')
      and (ufi is null or ufi ~ '^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$')
      and quelle in ('sdb', 'verzeichnis', 'hand')
      and status in ('vorschlag', 'bestaetigt')
      and (not keine_kennzeichnung or (cardinality(piktogramme) = 0 and signalwort is null and jsonb_array_length(h_saetze) = 0 and jsonb_array_length(p_saetze) = 0 and ufi is null))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p325_gefahr_bestaetigt_check' and conrelid = 'public.artikel_gefahr'::regclass) then
    alter table public.artikel_gefahr add constraint p325_gefahr_bestaetigt_check check (
      status <> 'bestaetigt'
      or keine_kennzeichnung
      or ((cardinality(piktogramme) > 0 or jsonb_array_length(h_saetze) > 0)
          and (cardinality(piktogramme) = 0 or signalwort is not null))
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p325_gefahr_artikel_eindeutig' and conrelid = 'public.artikel_gefahr'::regclass) then
    alter table public.artikel_gefahr add constraint p325_gefahr_artikel_eindeutig unique (artikel_id);
  end if;
end $$;

create index if not exists artikel_gefahr_owner_idx on public.artikel_gefahr (owner_user_id, status);

comment on table public.artikel_gefahr is 'Paket 325: Kennzeichnung je Artikel aus dem SDB (Vorschlag -> bestaetigt). Shop-Anzeige erst nach Anwalt-Freigabe R49.';

-- ---------------------------------------------------------------- Wächter ---
create or replace function public.p325_gefahr_waechter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner   uuid;
  v_artikel uuid;
  v_neu     boolean;
begin
  if tg_op = 'UPDATE' and new.owner_user_id <> old.owner_user_id then
    raise exception 'Der Betrieb eines Eintrags ist fest.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.artikel_id <> old.artikel_id then
    raise exception 'Der Artikel eines Eintrags ist fest.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    select owner_user_id into v_owner from public.artikel where id = new.artikel_id;
    if v_owner is null or v_owner <> new.owner_user_id then
      raise exception 'Der Artikel gehoert nicht zu diesem Betrieb.' using errcode = '42501';
    end if;
  end if;
  if new.sdb_dokument_id is not null
     and (tg_op = 'INSERT' or new.sdb_dokument_id is distinct from old.sdb_dokument_id) then
    select owner_user_id, artikel_id into v_owner, v_artikel from public.produkt_dokument where id = new.sdb_dokument_id;
    if v_owner is null or v_owner <> new.owner_user_id or v_artikel <> new.artikel_id then
      raise exception 'Das Sicherheitsdatenblatt gehoert nicht zu diesem Artikel.' using errcode = '42501';
    end if;
  end if;

  v_neu := tg_op = 'INSERT'
    or new.piktogramme is distinct from old.piktogramme
    or new.signalwort is distinct from old.signalwort
    or new.h_saetze is distinct from old.h_saetze
    or new.p_saetze is distinct from old.p_saetze
    or new.un_nummer is distinct from old.un_nummer
    or new.ufi is distinct from old.ufi
    or new.keine_kennzeichnung is distinct from old.keine_kennzeichnung;

  if new.status = 'bestaetigt' and (v_neu or old.status is distinct from 'bestaetigt') then
    new.bestaetigt_von := auth.uid();
    new.bestaetigt_am := now();
  elsif new.status = 'vorschlag' then
    new.bestaetigt_von := null;
    new.bestaetigt_am := null;
  elsif tg_op = 'UPDATE' then
    new.bestaetigt_von := old.bestaetigt_von;
    new.bestaetigt_am := old.bestaetigt_am;
  end if;

  if tg_op = 'INSERT' then new.angelegt_am := now(); end if;
  new.geaendert_am := now();
  return new;
end $$;

drop trigger if exists p325_gefahr_trg on public.artikel_gefahr;
create trigger p325_gefahr_trg before insert or update on public.artikel_gefahr
  for each row execute function public.p325_gefahr_waechter();

-- ---------------------------------------------------------------- Regeln ---
alter table public.artikel_gefahr enable row level security;

drop policy if exists p325_gefahr_chef on public.artikel_gefahr;
create policy p325_gefahr_chef on public.artikel_gefahr for all to authenticated
  using (owner_user_id = auth.uid() and public.mein_chef_id() is null)
  with check (owner_user_id = auth.uid() and public.mein_chef_id() is null);
drop policy if exists p325_gefahr_ma_lesen on public.artikel_gefahr;
create policy p325_gefahr_ma_lesen on public.artikel_gefahr for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('shop') or public.darf_ich_modul_aendern('shop')));
drop policy if exists p325_gefahr_ma_neu on public.artikel_gefahr;
create policy p325_gefahr_ma_neu on public.artikel_gefahr for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'));
drop policy if exists p325_gefahr_ma_aendern on public.artikel_gefahr;
create policy p325_gefahr_ma_aendern on public.artikel_gefahr for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'));

commit;

-- KONTROLLE (nur lesen) — Erwartung: 1 | 4 | 1 | 3
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'artikel_gefahr') as tabelle,
       (select count(*) from pg_policies where schemaname = 'public' and policyname like 'p325_%') as regeln,
       (select count(*) from pg_trigger where tgname = 'p325_gefahr_trg') as waechter,
       (select count(*) from pg_constraint where conrelid = 'public.artikel_gefahr'::regclass and conname like 'p325_%') as pruefungen;
