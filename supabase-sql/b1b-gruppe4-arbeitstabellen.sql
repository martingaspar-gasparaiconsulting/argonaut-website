-- ============================================================================
-- ARGONAUT OS · B1b Gruppe 4 (26.09.2026) — weitere Arbeitstabellen gehoeren dem Betrieb
--
-- Befund K5 (docs/k5-auswertung.md): Bei diesen Tabellen sah ein Mitarbeiter nur,
-- was er selbst angelegt hatte (z. B. Auftrag des Chefs ohne Positionen,
-- Projekt des Chefs „nicht gefunden"). Wie Gruppe 3:
--   1) Mitarbeiter duerfen die Daten ihres Betriebs LESEN, ANLEGEN, AENDERN.
--      LOESCHEN bleibt beim Chef.
--   2) Wo die Spalte owner_user_id bisher „auth.uid()" als Vorgabe hat, wird sie
--      auf „Betrieb" umgestellt: coalesce(mein_chef_id(), auth.uid()) — das
--      Muster, das alle neueren Tabellen schon haben. Beim Chef ergibt das
--      dieselbe Kennung wie vorher. Bestehende Zeilen werden NICHT veraendert.
--
-- Rein additiv: keine bestehende Regel wird geaendert oder entfernt.
-- Idempotent: mehrfaches Ausfuehren schadet nicht.
-- ============================================================================
do $$
declare
  t text;
  vorgabe text;
  tabellen text[] := array[
    'aufgaben', 'aufgaben_kommentare', 'auftrag_positionen',
    'kontakt_aktivitaeten', 'kontakt_tags', 'kontakt_tag_zuordnung',
    'projekt_beteiligte', 'projekt_teams', 'projekt_vorlagen', 'vorlagen_aufgaben',
    'verkaufschancen', 'objekte', 'ressourcen', 'korrespondenz', 'post_vorgang', 'text_werk'
  ];
begin
  foreach t in array tabellen loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabelle % fehlt - uebersprungen', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists b1_ma_select on public.%I', t);
    execute format('create policy b1_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id())', t);
    execute format('drop policy if exists b1_ma_insert on public.%I', t);
    execute format('create policy b1_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id())', t);
    execute format('drop policy if exists b1_ma_update on public.%I', t);
    execute format('create policy b1_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id()) with check (owner_user_id = public.mein_chef_id())', t);

    select column_default into vorgabe
      from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name = 'owner_user_id';
    if vorgabe is not null and vorgabe ilike '%auth.uid()%' and vorgabe not ilike '%mein_chef_id%' then
      execute format('alter table public.%I alter column owner_user_id set default coalesce(public.mein_chef_id(), auth.uid())', t);
    end if;
  end loop;
end $$;

-- KONTROLLE (eine Abfrage). Erwartet: je Tabelle 3 neue Regeln, 0 Loeschrechte,
-- Vorgabe mit mein_chef_id (oder leer, wenn der Code die Kennung selbst setzt).
select c.table_name as tabelle,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.table_name and p.policyname like 'b1_ma_%') as neue_regeln,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.table_name and p.policyname like 'b1_ma_%' and p.cmd = 'DELETE') as loeschrechte,
       c.column_default as vorgabe
from information_schema.columns c
where c.table_schema = 'public' and c.column_name = 'owner_user_id'
  and c.table_name in ('aufgaben','aufgaben_kommentare','auftrag_positionen','kontakt_aktivitaeten','kontakt_tags',
                       'kontakt_tag_zuordnung','projekt_beteiligte','projekt_teams','projekt_vorlagen','vorlagen_aufgaben',
                       'verkaufschancen','objekte','ressourcen','korrespondenz','post_vorgang','text_werk')
order by c.table_name;
