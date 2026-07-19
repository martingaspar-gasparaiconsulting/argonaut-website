-- ============================================================
-- ARGONAUT OS · Bündel 30 · Lebensmittel-Fachpaket
-- Chargen mit MHD-Verwaltung + HACCP-Kontrollpunkte (Eigenkontrolle).
-- Unterstützt die Dokumentation — ersetzt KEINE amtliche HACCP-Beratung.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.lm_chargen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  bezeichnung   text not null default 'Charge',
  charge_nr     text,
  mhd           date,
  menge         numeric(12,2),
  einheit       text not null default 'kg',
  lieferant     text,
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists lm_chargen_idx on public.lm_chargen (owner_user_id, mhd);

create table if not exists public.lm_haccp (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  datum         date not null default current_date,
  kontrollpunkt text not null default '',              -- z.B. Kühlhaus, Fritteuse
  messwert      text,                                   -- z.B. 4 °C
  in_ordnung    boolean not null default true,
  massnahme     text,                                   -- bei Abweichung
  pruefer       text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists lm_haccp_idx on public.lm_haccp (owner_user_id, datum desc);

alter table public.lm_chargen enable row level security;
alter table public.lm_haccp enable row level security;

drop policy if exists lmc_owner_all on public.lm_chargen;
create policy lmc_owner_all on public.lm_chargen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists lmc_select_ma on public.lm_chargen;
create policy lmc_select_ma on public.lm_chargen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists lmc_insert_ma on public.lm_chargen;
create policy lmc_insert_ma on public.lm_chargen for insert to public with check ((owner_user_id = mein_chef_id()));

drop policy if exists lmh_owner_all on public.lm_haccp;
create policy lmh_owner_all on public.lm_haccp for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists lmh_select_ma on public.lm_haccp;
create policy lmh_select_ma on public.lm_haccp for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists lmh_insert_ma on public.lm_haccp;
create policy lmh_insert_ma on public.lm_haccp for insert to public with check ((owner_user_id = mein_chef_id()));
