-- ============================================================================
-- ARGONAUT OS · Paket 316 (11.10.2026) · S3a Geschäftskunden-Shop
--
--   shop_preisliste   Preisliste je Betrieb (Name, optional Pauschal-Rabatt)
--   shop_preis        fester NETTO-Preis in Cent je Artikel und Staffel
--                     („ab 1", „ab 10", „ab 100")
--   shop_kunde        Geschäftskunde = ein Kontakt mit Preisliste, Kauf auf
--                     Rechnung ja/nein, Zahlungsziel, Kreditrahmen und
--                     Kundenkonto per Link (nur die Prüfsumme des Links)
--   artikel           + shop_gebinde, shop_mindestmenge
--   shop_bestellungen + shop_kunde_id, kontakt_id, zahlart, netto_summe
--
-- Wächter in der Datenbank:
--   · Preisliste, Artikel und Kontakt müssen zum Betrieb gehören
--   · Betrieb und Kontakt eines Geschäftskunden sind danach fest
--   · eine Bestellung kann nur einem Geschäftskunden des eigenen Betriebs
--     zugeordnet werden
--
-- Rechte: Preise, Kauf auf Rechnung und Kreditrahmen pflegt nur die
-- Geschäftsleitung. Mitarbeiter mit Recht „Shop" sehen sie.
-- Das Schaufenster liest nur über den Server (Prüfsumme des Links).
-- Der Shop bleibt bis zur Freigabe (lib/startSperre.ts) geschlossen.
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — nur neue Tabellen und neue Spalten mit Standardwert.
-- RÜCKWEG (nur im Notfall): drop table public.shop_kunde, public.shop_preis,
--   public.shop_preisliste; die neuen Spalten können bleiben.
-- ============================================================================

begin;

-- --------------------------------------------------------- Artikel-Mengen ---
alter table public.artikel add column if not exists shop_gebinde integer not null default 1;
alter table public.artikel add column if not exists shop_mindestmenge integer not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p316_artikel_menge_check' and conrelid = 'public.artikel'::regclass) then
    alter table public.artikel add constraint p316_artikel_menge_check check (
      shop_gebinde between 1 and 100000
      and shop_mindestmenge between 1 and 100000
      and shop_mindestmenge % shop_gebinde = 0
    );
  end if;
end $$;

comment on column public.artikel.shop_gebinde is 'Paket 316: Shop nur in Vielfachen dieser Menge (Gebinde).';
comment on column public.artikel.shop_mindestmenge is 'Paket 316: Mindestmenge im Shop (Vielfaches des Gebindes).';

-- ------------------------------------------------------------- Preislisten ---
create table if not exists public.shop_preisliste (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  name           text not null,
  rabatt_prozent numeric(5,2) not null default 0,
  notiz          text,
  angelegt_am    timestamptz not null default now(),
  geaendert_am   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p316_liste_check' and conrelid = 'public.shop_preisliste'::regclass) then
    alter table public.shop_preisliste add constraint p316_liste_check check (
      char_length(btrim(name)) between 1 and 80
      and rabatt_prozent >= 0 and rabatt_prozent <= 90
      and (notiz is null or char_length(notiz) <= 500)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p316_liste_name_eindeutig' and conrelid = 'public.shop_preisliste'::regclass) then
    alter table public.shop_preisliste add constraint p316_liste_name_eindeutig unique (owner_user_id, name);
  end if;
end $$;

create table if not exists public.shop_preis (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  preisliste_id uuid not null references public.shop_preisliste(id) on delete cascade,
  artikel_id    uuid not null references public.artikel(id) on delete cascade,
  ab_menge      integer not null default 1,
  netto_cent    integer not null,
  geaendert_am  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p316_preis_check' and conrelid = 'public.shop_preis'::regclass) then
    alter table public.shop_preis add constraint p316_preis_check check (
      ab_menge between 1 and 100000 and netto_cent > 0 and netto_cent <= 100000000
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p316_preis_eindeutig' and conrelid = 'public.shop_preis'::regclass) then
    alter table public.shop_preis add constraint p316_preis_eindeutig unique (preisliste_id, artikel_id, ab_menge);
  end if;
end $$;

create index if not exists shop_preis_liste_idx on public.shop_preis (preisliste_id);
create index if not exists shop_preis_artikel_idx on public.shop_preis (artikel_id);

-- -------------------------------------------------------- Geschäftskunden ---
create table if not exists public.shop_kunde (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  kontakt_id        uuid not null references public.kontakte(id) on delete cascade,
  preisliste_id     uuid references public.shop_preisliste(id) on delete set null,
  auf_rechnung      boolean not null default false,
  zahlungsziel_tage integer not null default 14,
  kreditrahmen_cent bigint,
  aktiv             boolean not null default true,
  token_hash        text,
  link_erstellt_am  timestamptz,
  zuletzt_da_am     timestamptz,
  notiz             text,
  angelegt_am       timestamptz not null default now(),
  geaendert_am      timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p316_kunde_check' and conrelid = 'public.shop_kunde'::regclass) then
    alter table public.shop_kunde add constraint p316_kunde_check check (
      zahlungsziel_tage between 0 and 90
      and (kreditrahmen_cent is null or (kreditrahmen_cent > 0 and kreditrahmen_cent <= 2000000000))
      and (token_hash is null or token_hash ~ '^[0-9a-f]{64}$')
      and (notiz is null or char_length(notiz) <= 500)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p316_kunde_kontakt_eindeutig' and conrelid = 'public.shop_kunde'::regclass) then
    alter table public.shop_kunde add constraint p316_kunde_kontakt_eindeutig unique (owner_user_id, kontakt_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p316_kunde_token_eindeutig' and conrelid = 'public.shop_kunde'::regclass) then
    alter table public.shop_kunde add constraint p316_kunde_token_eindeutig unique (token_hash);
  end if;
end $$;

create index if not exists shop_kunde_owner_idx on public.shop_kunde (owner_user_id);

-- ------------------------------------------------------- Bestellungen ---
alter table public.shop_bestellungen add column if not exists kontakt_id uuid;
alter table public.shop_bestellungen add column if not exists shop_kunde_id uuid references public.shop_kunde(id) on delete set null;
alter table public.shop_bestellungen add column if not exists zahlart text;
alter table public.shop_bestellungen add column if not exists netto_summe numeric(12,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p316_bestellung_zahlart_check' and conrelid = 'public.shop_bestellungen'::regclass) then
    alter table public.shop_bestellungen add constraint p316_bestellung_zahlart_check
      check (zahlart is null or zahlart in ('rechnung', 'vorkasse'));
  end if;
end $$;

create index if not exists shop_bestellungen_kunde_idx on public.shop_bestellungen (shop_kunde_id) where shop_kunde_id is not null;

comment on table public.shop_preisliste is 'Paket 316: Preislisten fuer Geschaeftskunden im Shop (netto).';
comment on table public.shop_preis is 'Paket 316: Netto-Preis in Cent je Artikel und Staffel (ab Menge).';
comment on table public.shop_kunde is 'Paket 316: Geschaeftskunden im Shop — Preisliste, Kauf auf Rechnung, Kundenkonto per Link (nur Pruefsumme).';

-- ---------------------------------------------------------------- Wächter ---
create or replace function public.p316_waechter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if tg_op = 'UPDATE' and new.owner_user_id <> old.owner_user_id then
    raise exception 'Der Betrieb eines Eintrags ist fest.' using errcode = '42501';
  end if;

  if tg_table_name = 'shop_preis' then
    select owner_user_id into v_owner from public.shop_preisliste where id = new.preisliste_id;
    if v_owner is null or v_owner <> new.owner_user_id then
      raise exception 'Die Preisliste gehoert nicht zu diesem Betrieb.' using errcode = '42501';
    end if;
    select owner_user_id into v_owner from public.artikel where id = new.artikel_id;
    if v_owner is null or v_owner <> new.owner_user_id then
      raise exception 'Der Artikel gehoert nicht zu diesem Betrieb.' using errcode = '42501';
    end if;
  elsif tg_table_name = 'shop_kunde' then
    if tg_op = 'UPDATE' and new.kontakt_id <> old.kontakt_id then
      raise exception 'Der Kontakt eines Geschaeftskunden ist fest.' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' then
      select owner_user_id into v_owner from public.kontakte where id = new.kontakt_id;
      if v_owner is null or v_owner <> new.owner_user_id then
        raise exception 'Der Kontakt gehoert nicht zu diesem Betrieb.' using errcode = '42501';
      end if;
      new.angelegt_am := now();
    end if;
    if new.preisliste_id is not null then
      select owner_user_id into v_owner from public.shop_preisliste where id = new.preisliste_id;
      if v_owner is null or v_owner <> new.owner_user_id then
        raise exception 'Die Preisliste gehoert nicht zu diesem Betrieb.' using errcode = '42501';
      end if;
    end if;
    if new.token_hash is distinct from (case when tg_op = 'UPDATE' then old.token_hash else null end) then
      new.link_erstellt_am := case when new.token_hash is null then null else now() end;
    end if;
  elsif tg_table_name = 'shop_bestellungen' then
    if new.shop_kunde_id is not null
       and (tg_op = 'INSERT' or new.shop_kunde_id is distinct from old.shop_kunde_id) then
      select owner_user_id into v_owner from public.shop_kunde where id = new.shop_kunde_id;
      if v_owner is null or v_owner <> new.owner_user_id then
        raise exception 'Der Geschaeftskunde gehoert nicht zu diesem Betrieb.' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  new.geaendert_am := now();
  return new;
end $$;

drop trigger if exists p316_preisliste_trg on public.shop_preisliste;
create trigger p316_preisliste_trg before insert or update on public.shop_preisliste
  for each row execute function public.p316_waechter();
drop trigger if exists p316_preis_trg on public.shop_preis;
create trigger p316_preis_trg before insert or update on public.shop_preis
  for each row execute function public.p316_waechter();
drop trigger if exists p316_kunde_trg on public.shop_kunde;
create trigger p316_kunde_trg before insert or update on public.shop_kunde
  for each row execute function public.p316_waechter();
drop trigger if exists p316_bestellung_trg on public.shop_bestellungen;
create trigger p316_bestellung_trg before insert or update of shop_kunde_id on public.shop_bestellungen
  for each row execute function public.p316_waechter();

-- ---------------------------------------------------------------- Regeln ---
alter table public.shop_preisliste enable row level security;
alter table public.shop_preis enable row level security;
alter table public.shop_kunde enable row level security;

drop policy if exists p316_liste_chef on public.shop_preisliste;
create policy p316_liste_chef on public.shop_preisliste for all to authenticated
  using (owner_user_id = auth.uid() and public.mein_chef_id() is null)
  with check (owner_user_id = auth.uid() and public.mein_chef_id() is null);
drop policy if exists p316_liste_ma on public.shop_preisliste;
create policy p316_liste_ma on public.shop_preisliste for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('shop') or public.darf_ich_modul_aendern('shop')));

drop policy if exists p316_preis_chef on public.shop_preis;
create policy p316_preis_chef on public.shop_preis for all to authenticated
  using (owner_user_id = auth.uid() and public.mein_chef_id() is null)
  with check (owner_user_id = auth.uid() and public.mein_chef_id() is null);
drop policy if exists p316_preis_ma on public.shop_preis;
create policy p316_preis_ma on public.shop_preis for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('shop') or public.darf_ich_modul_aendern('shop')));

drop policy if exists p316_kunde_chef on public.shop_kunde;
create policy p316_kunde_chef on public.shop_kunde for all to authenticated
  using (owner_user_id = auth.uid() and public.mein_chef_id() is null)
  with check (owner_user_id = auth.uid() and public.mein_chef_id() is null);
drop policy if exists p316_kunde_ma on public.shop_kunde;
create policy p316_kunde_ma on public.shop_kunde for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('shop') or public.darf_ich_modul_aendern('shop')));

commit;

-- KONTROLLE (nur lesen) — Erwartung: 3 | 6 | 4 | 2 | 4
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('shop_preisliste', 'shop_preis', 'shop_kunde')) as tabellen,
       (select count(*) from pg_policies where schemaname = 'public' and policyname like 'p316_%') as regeln,
       (select count(*) from pg_trigger where tgname in ('p316_preisliste_trg', 'p316_preis_trg', 'p316_kunde_trg', 'p316_bestellung_trg')) as waechter,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'artikel' and column_name in ('shop_gebinde', 'shop_mindestmenge')) as artikel_spalten,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'shop_bestellungen' and column_name in ('kontakt_id', 'shop_kunde_id', 'zahlart', 'netto_summe')) as bestell_spalten;
