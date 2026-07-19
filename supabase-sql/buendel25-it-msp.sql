-- ============================================================
-- ARGONAUT OS · Bündel 25 · IT & MSP
-- IT-Assets (Kunden-Hardware/Lizenzen) + Managed-Service-Verträge mit
-- Wartungsintervall/nächster Wartung. Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.it_assets (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  kunde_name    text,
  bezeichnung   text not null default 'Asset',
  typ           text,                                  -- Server | Client | Netzwerk | Lizenz ...
  hersteller    text,
  seriennummer  text,
  standort      text,
  garantie_bis  date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists it_assets_idx on public.it_assets (owner_user_id, kunde_name);

create table if not exists public.it_vertraege (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  kontakt_id    uuid references public.kontakte(id) on delete set null,
  kunde_name    text,
  bezeichnung   text not null default 'Managed-Service',
  monatspauschale numeric(12,2) not null default 0,
  intervall_tage integer not null default 30,          -- Wartungsintervall
  naechste_wartung date,
  status        text not null default 'aktiv',          -- aktiv | pausiert | beendet
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists it_vertraege_idx on public.it_vertraege (owner_user_id, naechste_wartung);

alter table public.it_assets enable row level security;
alter table public.it_vertraege enable row level security;

drop policy if exists ita_owner_all on public.it_assets;
create policy ita_owner_all on public.it_assets for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists ita_select_ma on public.it_assets;
create policy ita_select_ma on public.it_assets for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists ita_insert_ma on public.it_assets;
create policy ita_insert_ma on public.it_assets for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists itv_owner_all on public.it_vertraege;
create policy itv_owner_all on public.it_vertraege for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists itv_select_ma on public.it_vertraege;
create policy itv_select_ma on public.it_vertraege for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists itv_insert_ma on public.it_vertraege;
create policy itv_insert_ma on public.it_vertraege for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists itv_update_ma on public.it_vertraege;
create policy itv_update_ma on public.it_vertraege for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));
