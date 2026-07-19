-- ============================================================
-- ARGONAUT OS · Bündel 22 · Fertigung & PPS
-- Stücklisten (BOM) mit Komponenten + Fertigungsaufträge mit Status.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.fertigung_stuecklisten (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name          text not null default 'Stückliste',
  produkt       text,
  artikel_id    uuid references public.artikel(id) on delete set null,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists fert_sl_idx on public.fertigung_stuecklisten (owner_user_id, erstellt_am desc);

create table if not exists public.fertigung_stueckliste_positionen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  stueckliste_id uuid not null references public.fertigung_stuecklisten(id) on delete cascade,
  komponente    text not null default '',
  artikel_id    uuid references public.artikel(id) on delete set null,
  menge         numeric(12,3) not null default 1,
  einheit       text not null default 'Stk',
  position      integer not null default 1
);
create index if not exists fert_slp_idx on public.fertigung_stueckliste_positionen (stueckliste_id, position);

create table if not exists public.fertigung_auftraege (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  auftragsnr    text,
  produkt       text,
  stueckliste_id uuid references public.fertigung_stuecklisten(id) on delete set null,
  menge         numeric(12,2) not null default 1,
  status        text not null default 'geplant',   -- geplant | in_arbeit | fertig | storniert
  start_am      date,
  fertig_am     date,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists fert_auf_idx on public.fertigung_auftraege (owner_user_id, status, erstellt_am desc);

alter table public.fertigung_stuecklisten enable row level security;
alter table public.fertigung_stueckliste_positionen enable row level security;
alter table public.fertigung_auftraege enable row level security;

-- Stücklisten
drop policy if exists fsl_owner_all on public.fertigung_stuecklisten;
create policy fsl_owner_all on public.fertigung_stuecklisten for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists fsl_select_ma on public.fertigung_stuecklisten;
create policy fsl_select_ma on public.fertigung_stuecklisten for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists fsl_insert_ma on public.fertigung_stuecklisten;
create policy fsl_insert_ma on public.fertigung_stuecklisten for insert to public with check ((owner_user_id = mein_chef_id()));

-- Stücklisten-Positionen
drop policy if exists fslp_owner_all on public.fertigung_stueckliste_positionen;
create policy fslp_owner_all on public.fertigung_stueckliste_positionen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists fslp_select_ma on public.fertigung_stueckliste_positionen;
create policy fslp_select_ma on public.fertigung_stueckliste_positionen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists fslp_insert_ma on public.fertigung_stueckliste_positionen;
create policy fslp_insert_ma on public.fertigung_stueckliste_positionen for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists fslp_delete_ma on public.fertigung_stueckliste_positionen;
create policy fslp_delete_ma on public.fertigung_stueckliste_positionen for delete to public using ((owner_user_id = mein_chef_id()));

-- Fertigungsaufträge
drop policy if exists fauf_owner_all on public.fertigung_auftraege;
create policy fauf_owner_all on public.fertigung_auftraege for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists fauf_select_ma on public.fertigung_auftraege;
create policy fauf_select_ma on public.fertigung_auftraege for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists fauf_insert_ma on public.fertigung_auftraege;
create policy fauf_insert_ma on public.fertigung_auftraege for insert to public with check ((owner_user_id = mein_chef_id()));
drop policy if exists fauf_update_ma on public.fertigung_auftraege;
create policy fauf_update_ma on public.fertigung_auftraege for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));
