-- ============================================================================
-- ARGONAUT OS · Paket 131 (27.09.2026) — Etiketten, Speisekarte, Zimmer,
-- Raeume und Raum-Belegungen gehoeren dem Betrieb
--
-- Claude-Befund: Diese 5 Seiten schrieben beim Anlegen die Kennung der
-- angemeldeten Person als Besitzer. Legte ein Mitarbeiter etwas an, sah der
-- Chef es nicht. Ab Paket 131 schreibt die Seite den Betrieb (beim Mitarbeiter
-- die Kennung des Chefs). Damit das Anlegen fuer den Betrieb erlaubt ist,
-- bekommt jede Tabelle drei Mitarbeiter-Regeln: LESEN, ANLEGEN, AENDERN fuer
-- Daten des eigenen Betriebs. LOESCHEN bleibt beim Chef.
--
-- Rein additiv: keine Regel wird geaendert oder entfernt, keine Zeile
-- veraendert. Idempotent: mehrfaches Ausfuehren schadet nicht.
-- Sperrt niemanden aus: Die Seite faellt ohne diese Regeln auf die alte
-- Schreibweise zurueck.
-- ============================================================================
do $$
declare
  t text;
  tabellen text[] := array['etikett_produkt', 'hk_zimmer', 'menu_gericht', 'raum_ressource', 'raum_belegung'];
begin
  foreach t in array tabellen loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabelle % fehlt - uebersprungen', t;
      continue;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'owner_user_id') then
      raise notice 'Tabelle % ohne owner_user_id - uebersprungen', t;
      continue;
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'p131_ma_select') then
      execute format('create policy p131_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id())', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'p131_ma_insert') then
      execute format('create policy p131_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id())', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'p131_ma_update') then
      execute format('create policy p131_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id()) with check (owner_user_id = public.mein_chef_id())', t);
    end if;
  end loop;
end $$;

-- KONTROLLE (eine Abfrage). Erwartet: 5 Zeilen, je 3 neue Regeln, 0 Loeschrechte.
select t.tabelle,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tabelle and p.policyname like 'p131_ma_%') as neue_regeln,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tabelle and p.policyname like 'p131_ma_%' and p.cmd = 'DELETE') as loeschrechte
  from unnest(array['etikett_produkt', 'hk_zimmer', 'menu_gericht', 'raum_ressource', 'raum_belegung']) as t(tabelle)
 order by t.tabelle;
