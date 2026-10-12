-- ============================================================================
-- ARGONAUT OS · Paket 323 (11.10.2026) · S4 Shop mehrsprachig — Teil 1
--
--   shop_sprache        je Betrieb und Sprache: im Shop anbieten ja/nein,
--                       Oberflächen-Texte (Vorschlag oder freigegeben)
--   shop_uebersetzung   je Artikel und Sprache: Name, Beschreibung, wörtliche
--                       Rückübersetzung, Prüfsumme des deutschen Textes,
--                       Vorschlag oder freigegeben (wer, wann)
--   shop_bestellungen   + sprache (in welcher Sprache der Kunde bestellt hat)
--
-- Wächter in der Datenbank:
--   · Artikel gehört zum Betrieb, der Betrieb eines Eintrags ist fest
--   · Freigeben darf nur die Geschäftsleitung (auch über die Schnittstelle)
--   · eine Sprache außer Englisch kann erst angeboten werden, wenn ihre
--     Oberflächen-Texte freigegeben sind; neue Texte nehmen sie wieder heraus
--
-- Rechte: Geschäftsleitung alles. Mitarbeiter mit „Shop ändern" dürfen
-- Vorschläge anlegen und bearbeiten (nicht löschen, nicht freigeben),
-- Mitarbeiter mit „Shop sehen" lesen. Das Schaufenster liest nur über den
-- Server und nur freigegebene Texte.
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — nur neue Tabellen und eine neue, leere Spalte.
-- RÜCKWEG (nur im Notfall): drop table public.shop_uebersetzung, public.shop_sprache;
--   die Spalte shop_bestellungen.sprache kann bleiben.
-- ============================================================================

begin;

-- ------------------------------------------------------- Bestellungen ---
alter table public.shop_bestellungen add column if not exists sprache text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p323_bestellung_sprache_check' and conrelid = 'public.shop_bestellungen'::regclass) then
    alter table public.shop_bestellungen add constraint p323_bestellung_sprache_check
      check (sprache is null or sprache ~ '^[a-z]{2}$');
  end if;
end $$;

comment on column public.shop_bestellungen.sprache is 'Paket 323: Sprache, in der der Kunde im Shop bestellt hat (de, en, ...).';

-- ------------------------------------------------------------ Sprachen ---
create table if not exists public.shop_sprache (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  sprache         text not null,
  aktiv           boolean not null default false,
  texte           jsonb not null default '{}'::jsonb,
  status          text not null default 'vorschlag',
  freigegeben_von uuid,
  freigegeben_am  timestamptz,
  angelegt_am     timestamptz not null default now(),
  geaendert_am    timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p323_sprache_check' and conrelid = 'public.shop_sprache'::regclass) then
    alter table public.shop_sprache add constraint p323_sprache_check check (
      sprache in ('en','pl','ro','tr','hr','sr','bs','bg','uk','ru','cs','sk','hu','sq','lt','it','pt','es','fr','el','vi','ar','fa')
      and status in ('vorschlag', 'freigegeben')
      and jsonb_typeof(texte) = 'object'
      and pg_column_size(texte) <= 60000
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p323_sprache_eindeutig' and conrelid = 'public.shop_sprache'::regclass) then
    alter table public.shop_sprache add constraint p323_sprache_eindeutig unique (owner_user_id, sprache);
  end if;
end $$;

-- -------------------------------------------------------- Übersetzungen ---
create table if not exists public.shop_uebersetzung (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  artikel_id         uuid not null references public.artikel(id) on delete cascade,
  sprache            text not null,
  name               text not null,
  beschreibung       text,
  rueck_name         text,
  rueck_beschreibung text,
  quelle_hash        text not null,
  status             text not null default 'vorschlag',
  freigegeben_von    uuid,
  freigegeben_am     timestamptz,
  angelegt_am        timestamptz not null default now(),
  geaendert_am       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p323_uebersetzung_check' and conrelid = 'public.shop_uebersetzung'::regclass) then
    alter table public.shop_uebersetzung add constraint p323_uebersetzung_check check (
      sprache in ('en','pl','ro','tr','hr','sr','bs','bg','uk','ru','cs','sk','hu','sq','lt','it','pt','es','fr','el','vi','ar','fa')
      and status in ('vorschlag', 'freigegeben')
      and char_length(btrim(name)) between 1 and 200
      and (beschreibung is null or char_length(beschreibung) <= 1500)
      and (rueck_name is null or char_length(rueck_name) <= 3000)
      and (rueck_beschreibung is null or char_length(rueck_beschreibung) <= 3000)
      and quelle_hash ~ '^[0-9a-f]{8}$'
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p323_uebersetzung_eindeutig' and conrelid = 'public.shop_uebersetzung'::regclass) then
    alter table public.shop_uebersetzung add constraint p323_uebersetzung_eindeutig unique (artikel_id, sprache);
  end if;
end $$;

create index if not exists shop_uebersetzung_owner_idx on public.shop_uebersetzung (owner_user_id, sprache);

comment on table public.shop_sprache is 'Paket 323: Shop-Sprachen je Betrieb — anbieten ja/nein, Oberflaechen-Texte (Vorschlag/freigegeben).';
comment on table public.shop_uebersetzung is 'Paket 323: Uebersetzung von Name und Beschreibung je Artikel und Sprache; der Shop zeigt nur freigegebene mit passender Pruefsumme.';

-- ---------------------------------------------------------------- Wächter ---
create or replace function public.p323_waechter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_chef  uuid := public.mein_chef_id();
  v_neu   boolean;
begin
  if tg_op = 'UPDATE' and new.owner_user_id <> old.owner_user_id then
    raise exception 'Der Betrieb eines Eintrags ist fest.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.sprache <> old.sprache then
    raise exception 'Die Sprache eines Eintrags ist fest.' using errcode = '42501';
  end if;

  if tg_table_name = 'shop_uebersetzung' then
    if tg_op = 'INSERT' or new.artikel_id <> old.artikel_id then
      select owner_user_id into v_owner from public.artikel where id = new.artikel_id;
      if v_owner is null or v_owner <> new.owner_user_id then
        raise exception 'Der Artikel gehoert nicht zu diesem Betrieb.' using errcode = '42501';
      end if;
    end if;
    v_neu := tg_op = 'INSERT'
      or new.name is distinct from old.name
      or new.beschreibung is distinct from old.beschreibung
      or new.quelle_hash is distinct from old.quelle_hash
      or new.artikel_id is distinct from old.artikel_id;
  else
    v_neu := tg_op = 'INSERT' or new.texte is distinct from old.texte;
    if v_chef is not null and (tg_op = 'INSERT' or new.aktiv is distinct from old.aktiv) and new.aktiv then
      raise exception 'Eine Sprache im Shop anbieten darf nur die Geschaeftsleitung.' using errcode = '42501';
    end if;
  end if;

  -- Freigeben nur durch die Geschaeftsleitung (neu freigegeben oder Inhalt geaendert und freigegeben).
  if new.status = 'freigegeben' and v_chef is not null
     and (v_neu or old.status is distinct from 'freigegeben') then
    raise exception 'Freigeben darf nur die Geschaeftsleitung. Bitte als Vorschlag speichern.' using errcode = '42501';
  end if;

  if new.status = 'freigegeben' and (v_neu or old.status is distinct from 'freigegeben') then
    new.freigegeben_von := auth.uid();
    new.freigegeben_am := now();
  elsif new.status = 'vorschlag' then
    new.freigegeben_von := null;
    new.freigegeben_am := null;
  elsif tg_op = 'UPDATE' then
    new.freigegeben_von := old.freigegeben_von;
    new.freigegeben_am := old.freigegeben_am;
  end if;

  if tg_table_name = 'shop_sprache' then
    -- Ausser Englisch (fest eingebaut) nur mit freigegebenen Texten anbieten.
    if new.sprache <> 'en' and new.status <> 'freigegeben' then
      new.aktiv := false;
    end if;
  end if;

  if tg_op = 'INSERT' then new.angelegt_am := now(); end if;
  new.geaendert_am := now();
  return new;
end $$;

drop trigger if exists p323_sprache_trg on public.shop_sprache;
create trigger p323_sprache_trg before insert or update on public.shop_sprache
  for each row execute function public.p323_waechter();
drop trigger if exists p323_uebersetzung_trg on public.shop_uebersetzung;
create trigger p323_uebersetzung_trg before insert or update on public.shop_uebersetzung
  for each row execute function public.p323_waechter();

-- ---------------------------------------------------------------- Regeln ---
alter table public.shop_sprache enable row level security;
alter table public.shop_uebersetzung enable row level security;

drop policy if exists p323_sprache_chef on public.shop_sprache;
create policy p323_sprache_chef on public.shop_sprache for all to authenticated
  using (owner_user_id = auth.uid() and public.mein_chef_id() is null)
  with check (owner_user_id = auth.uid() and public.mein_chef_id() is null);
drop policy if exists p323_sprache_ma_lesen on public.shop_sprache;
create policy p323_sprache_ma_lesen on public.shop_sprache for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('shop') or public.darf_ich_modul_aendern('shop')));
drop policy if exists p323_sprache_ma_neu on public.shop_sprache;
create policy p323_sprache_ma_neu on public.shop_sprache for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'));
drop policy if exists p323_sprache_ma_aendern on public.shop_sprache;
create policy p323_sprache_ma_aendern on public.shop_sprache for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'));

drop policy if exists p323_ue_chef on public.shop_uebersetzung;
create policy p323_ue_chef on public.shop_uebersetzung for all to authenticated
  using (owner_user_id = auth.uid() and public.mein_chef_id() is null)
  with check (owner_user_id = auth.uid() and public.mein_chef_id() is null);
drop policy if exists p323_ue_ma_lesen on public.shop_uebersetzung;
create policy p323_ue_ma_lesen on public.shop_uebersetzung for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('shop') or public.darf_ich_modul_aendern('shop')));
drop policy if exists p323_ue_ma_neu on public.shop_uebersetzung;
create policy p323_ue_ma_neu on public.shop_uebersetzung for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'));
drop policy if exists p323_ue_ma_aendern on public.shop_uebersetzung;
create policy p323_ue_ma_aendern on public.shop_uebersetzung for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('shop'));

commit;

-- KONTROLLE (nur lesen) — Erwartung: 2 | 8 | 2 | 1
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('shop_sprache', 'shop_uebersetzung')) as tabellen,
       (select count(*) from pg_policies where schemaname = 'public' and policyname like 'p323_%') as regeln,
       (select count(*) from pg_trigger where tgname in ('p323_sprache_trg', 'p323_uebersetzung_trg')) as waechter,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'shop_bestellungen' and column_name = 'sprache') as bestell_spalte;
