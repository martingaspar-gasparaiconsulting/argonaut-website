-- ============================================================
-- ARGONAUT OS · Paket 204 (04.10.2026) · Stufe 3 B4 „Shop aus Inventar"
--
-- Befund: Shop-Bestellungen rechneten pauschal mit 19 % MwSt — falsch für
-- Lebensmittel, Bücher u. a. (7 %). Neu: MwSt-Satz je Artikel für den Shop.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder geändert:
-- bestehende Artikel bekommen 19 % (= wie bisher).
-- AUSSPERR-RISIKO: keines (nur eine neue Spalte mit Standardwert).
-- Die Shop-Spalten aus dem Webshop-Paket werden zur Sicherheit mit
-- „if not exists" nachgezogen (live vorhanden -> keine Änderung).
--
-- RÜCKWEG (nur im Notfall): alter table public.artikel drop column shop_mwst;
--   (der Code liest dann automatisch ohne die Spalte und rechnet 19 %).
-- ============================================================

alter table public.artikel add column if not exists im_shop boolean not null default false;
alter table public.artikel add column if not exists shop_beschreibung text;
alter table public.artikel add column if not exists shop_bild_url text;
alter table public.artikel add column if not exists shop_sortierung integer;
alter table public.artikel add column if not exists shop_mwst smallint not null default 19;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'p204_artikel_shop_mwst_check' and conrelid = 'public.artikel'::regclass
  ) then
    alter table public.artikel
      add constraint p204_artikel_shop_mwst_check check (shop_mwst in (0, 7, 19));
  end if;
end $$;

comment on column public.artikel.shop_mwst is
  'Paket 204: MwSt-Satz im Onlineshop (19 Regelsatz, 7 ermaessigt, 0 steuerfrei).';

-- Kontrolle: spalte = 1 · regel = 1 · ungueltig = 0
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'artikel' and column_name = 'shop_mwst') as spalte,
  (select count(*) from pg_constraint
     where conname = 'p204_artikel_shop_mwst_check' and conrelid = 'public.artikel'::regclass) as regel,
  (select count(*) from public.artikel where shop_mwst not in (0, 7, 19)) as ungueltig;
