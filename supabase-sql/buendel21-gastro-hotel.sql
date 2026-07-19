-- ============================================================
-- ARGONAUT OS · Bündel 21 · Gastro & Hotel
-- Tisch-Reservierungen (Gastro) + Zimmer & Belegungen (Hotel-PMS-Kern).
-- Buchungskanäle/OTA sind als Brücke vorgesehen. Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.gastro_reservierungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  datum         date not null default current_date,
  uhrzeit       text,
  personen      integer not null default 2,
  gast_name     text,
  telefon       text,
  tisch         text,
  status        text not null default 'reserviert',   -- reserviert | eingetroffen | storniert | no_show
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists gastro_res_idx on public.gastro_reservierungen (owner_user_id, datum);

create table if not exists public.hotel_zimmer (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  nummer        text not null,
  typ           text,                                  -- Einzel/Doppel/Suite ...
  max_personen  integer not null default 2,
  preis_nacht   numeric(12,2) not null default 0,
  aktiv         boolean not null default true,
  erstellt_am   timestamptz not null default now()
);
create index if not exists hotel_zimmer_idx on public.hotel_zimmer (owner_user_id, aktiv);

create table if not exists public.hotel_belegungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  zimmer_id     uuid references public.hotel_zimmer(id) on delete set null,
  gast_name     text,
  personen      integer not null default 1,
  anreise       date not null,
  abreise       date not null,
  status        text not null default 'gebucht',       -- gebucht | eingecheckt | ausgecheckt | storniert
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists hotel_beleg_idx on public.hotel_belegungen (owner_user_id, anreise);

alter table public.gastro_reservierungen enable row level security;
alter table public.hotel_zimmer enable row level security;
alter table public.hotel_belegungen enable row level security;

-- gastro_reservierungen
drop policy if exists gr_owner_all on public.gastro_reservierungen;
create policy gr_owner_all on public.gastro_reservierungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists gr_select_ma on public.gastro_reservierungen;
create policy gr_select_ma on public.gastro_reservierungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists gr_insert_ma on public.gastro_reservierungen;
create policy gr_insert_ma on public.gastro_reservierungen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists gr_update_ma on public.gastro_reservierungen;
create policy gr_update_ma on public.gastro_reservierungen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));

-- hotel_zimmer
drop policy if exists hz_owner_all on public.hotel_zimmer;
create policy hz_owner_all on public.hotel_zimmer for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists hz_select_ma on public.hotel_zimmer;
create policy hz_select_ma on public.hotel_zimmer for select to public using ((owner_user_id = mein_chef_id()));

-- hotel_belegungen
drop policy if exists hb_owner_all on public.hotel_belegungen;
create policy hb_owner_all on public.hotel_belegungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists hb_select_ma on public.hotel_belegungen;
create policy hb_select_ma on public.hotel_belegungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists hb_insert_ma on public.hotel_belegungen;
create policy hb_insert_ma on public.hotel_belegungen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists hb_update_ma on public.hotel_belegungen;
create policy hb_update_ma on public.hotel_belegungen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));
