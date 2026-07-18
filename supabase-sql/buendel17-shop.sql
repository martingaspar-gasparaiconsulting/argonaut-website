-- ============================================================
-- ARGONAUT OS · Bündel 17 · Shop-/Marktplatz-Anbindung
-- Bestellungen aus Online-Shops/Marktplätzen sammeln (per CSV-Import im
-- Manuell-Modus oder später per API über den Shop-Konnektor, Bündel 15).
-- Bestand kann aus dem ERP je Shop-Artikel bereitgestellt werden.
-- Nicht-brechend · idempotent · RLS.
-- ============================================================

create table if not exists public.shop_bestellungen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  quelle         text not null default 'manuell',   -- manuell | shopware | shopify | woocommerce
  extern_id      text,                                -- Bestell-Nr im Shop
  besteller      text,
  email          text,
  status         text not null default 'neu',         -- neu | in_bearbeitung | versendet | storniert
  brutto_summe   numeric(12,2) not null default 0,
  positionen     jsonb not null default '[]'::jsonb,  -- [{bezeichnung, menge, einzelpreis}]
  bestell_am     timestamptz,
  rechnung_id    uuid,
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists shop_bestellungen_idx on public.shop_bestellungen (owner_user_id, status, erstellt_am desc);
-- Doppel-Import verhindern: gleiche Quelle + externe ID nur einmal.
create unique index if not exists shop_bestellungen_extern_uidx
  on public.shop_bestellungen (owner_user_id, quelle, extern_id) where extern_id is not null;

alter table public.shop_bestellungen enable row level security;

drop policy if exists sb_owner_all on public.shop_bestellungen;
create policy sb_owner_all on public.shop_bestellungen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists sb_select_ma on public.shop_bestellungen;
create policy sb_select_ma on public.shop_bestellungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists sb_update_ma on public.shop_bestellungen;
create policy sb_update_ma on public.shop_bestellungen for update to public using ((owner_user_id = mein_chef_id())) with check ((owner_user_id = mein_chef_id()));
