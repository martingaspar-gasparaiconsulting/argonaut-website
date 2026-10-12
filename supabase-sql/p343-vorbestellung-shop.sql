-- ============================================================
-- ARGONAUT OS · Paket 343 (12.10.2026) · BV3b Feinkost Teil 2
-- Vorbestellung und Vormerkliste im Shop-Schaufenster
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- vorbestell_aktion.im_shop: die Aktion im Shop zeigen (Standard: aus).
-- Im Shop erscheint sie erst, wenn zusätzlich die Start-Schalter „shop“
-- und „vorbestellShop“ freigegeben sind (Anwalt R52/R53) und Artikel,
-- Preis, Einheit und LMIV-Pflichtangaben stimmen (lib/vorbestellShop.ts).
-- Rechte bleiben wie in Paket 342 (Wächter p342 schützt die Mengen).
-- ============================================================

alter table public.vorbestell_aktion add column if not exists im_shop boolean not null default false;

create index if not exists vorbestell_aktion_shop_idx
  on public.vorbestell_aktion (owner_user_id, im_shop, status);

-- KONTROLLE — Erwartung: spalte = 1 | index = 1 | im_shop_an = 0 (neu immer aus)
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'vorbestell_aktion' and column_name = 'im_shop') as spalte,
  (select count(*) from pg_indexes
     where schemaname = 'public' and indexname = 'vorbestell_aktion_shop_idx') as index,
  (select count(*) from public.vorbestell_aktion where im_shop) as im_shop_an;
