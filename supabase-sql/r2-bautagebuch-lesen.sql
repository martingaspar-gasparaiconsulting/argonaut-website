-- ============================================================
-- ARGONAUT OS · R2 Bautagebuch-Reparatur, Schritt 1: NUR LESEN — 24.09.2026
-- Aendert nichts. Zeigt, wie mein_chef_id() den Chef findet und wie viele
-- Bautagebuch-Eintraege, Fotos und Maengel heute unter der ID eines
-- MITARBEITERS liegen (die sieht der Chef nicht).
-- ============================================================
select '1 funktion' as art, 'mein_chef_id' as name, pg_get_functiondef(p.oid) as wert
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'mein_chef_id'
union all
select '2 spalte mitarbeiter', column_name, data_type
  from information_schema.columns where table_schema = 'public' and table_name = 'mitarbeiter'
union all
select '3 bautagebuch je besitzer', owner_user_id::text, count(*)::text from public.bautagebuch group by owner_user_id
union all
select '4 fotos je besitzer', owner_user_id::text, count(*)::text from public.baustellen_fotos group by owner_user_id
union all
select '5 maengel je besitzer', owner_user_id::text, count(*)::text from public.maengel group by owner_user_id
union all
select '6 regel', tablename || ' / ' || policyname, cmd || ' · ' || coalesce(qual, with_check, '')
  from pg_policies where schemaname = 'public' and tablename in ('bautagebuch', 'baustellen_fotos', 'maengel')
order by 1, 2;
