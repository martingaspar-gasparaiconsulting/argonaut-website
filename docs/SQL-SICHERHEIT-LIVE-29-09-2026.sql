-- ARGONAUT OS · Live-Sicherheitspruefung Datenbank (29.09.2026) · NUR LESEN, aendert nichts
-- Ergebnis: EINE Tabelle (art, objekt, detail), sortiert nach Schwere. Leeres Ergebnis = alles sauber.
with
pol as (
  select p.schemaname, p.tablename, p.policyname, p.cmd, p.roles::text[] as roles,
         coalesce(p.qual, '') as qual, coalesce(p.with_check, '') as chk
  from pg_policies p
  where p.schemaname in ('public', 'storage')
),
sd as (
  select p.oid, n.nspname, p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         p.prorettype = 'trigger'::regtype as ist_trigger,
         exists (select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c like 'search_path=%') as hat_sp,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and n.nspname = 'public'
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
befund(art, objekt, detail) as (
  -- (a) Tabelle in public OHNE RLS
  select '1 KRITISCH a) Tabelle ohne RLS', c.relname::text,
         'anon SELECT=' || has_table_privilege('anon', c.oid, 'SELECT')
         || ' / anon INSERT=' || has_table_privilege('anon', c.oid, 'INSERT')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity

  union all
  -- (b1) Regel mit USING/CHECK = true
  select '1 KRITISCH b) Regel mit true',
         schemaname || '.' || tablename || ' · ' || policyname,
         cmd || ' fuer ' || array_to_string(roles, ',') || ' · using=' || left(qual, 80) || ' · check=' || left(chk, 80)
  from pol
  where qual ~* '^\(*\s*true\s*\)*$' or chk ~* '^\(*\s*true\s*\)*$'

  union all
  -- (b2) anon darf schreiben
  select '1 KRITISCH b) anon schreibt',
         schemaname || '.' || tablename || ' · ' || policyname,
         cmd || ' · using=' || left(qual, 80) || ' · check=' || left(chk, 80)
  from pol
  where 'anon' = any(roles) and cmd <> 'SELECT'

  union all
  -- (b3) public (=auch anon) darf schreiben, ohne dass die Regel die Anmeldung prueft
  select '2 HOCH b) public schreibt ohne Anmeldebezug',
         schemaname || '.' || tablename || ' · ' || policyname,
         cmd || ' · using=' || left(qual, 80) || ' · check=' || left(chk, 80)
  from pol
  where 'public' = any(roles) and cmd <> 'SELECT'
    and (qual || ' ' || chk) !~* '(auth\.uid|auth\.jwt|mein_chef_id|mein_mitarbeiter_id|darf_ich|ist_chat_mitglied)'
    and chk !~* '^\(*\s*false\s*\)*$'

  union all
  -- (b4) Regel prueft nur "angemeldet", nicht den Betrieb
  select '2 HOCH b) nur angemeldet, kein Betrieb',
         schemaname || '.' || tablename || ' · ' || policyname,
         cmd || ' · using=' || left(qual, 80) || ' · check=' || left(chk, 80)
  from pol
  where (qual || ' ' || chk) ~* '(auth\.uid\(\)\s+is\s+not\s+null|auth\.role\(\)\s*=\s*''authenticated'')'
    and (qual || ' ' || chk) !~* '(owner_user_id|user_id\s*=|auth_user_id|foldername)'

  union all
  -- (c1) SECURITY DEFINER ohne feste search_path
  select case when ist_trigger then '3 MITTEL c) Definer-Trigger ohne search_path'
              else '2 HOCH c) Definer ohne search_path' end,
         nspname || '.' || proname || '(' || args || ')',
         case when ist_trigger then 'Trigger-Funktion' else 'per rpc aufrufbar' end
         || ' · anon EXECUTE=' || anon_exec
  from sd
  where not hat_sp

  union all
  -- (c2) SECURITY DEFINER, die anon ausfuehren darf (Trigger-Funktionen sind per rpc nicht aufrufbar)
  select case when args ~* '(p_owner|ziel_owner|owner_key|p_user|p_uid|p_rechnung_id|p_monat)'
                or proname ~* '(verbrauch|speicher|benachrichtigung|vorlagen_anlegen|zahlbetrag)'
              then '1 KRITISCH c) Definer fuer anon, fremder Betrieb erreichbar'
              else '4 INFO c) Definer fuer anon ausfuehrbar (ok, wenn intern nur auth.uid())' end,
         nspname || '.' || proname || '(' || args || ')',
         'anon EXECUTE=true · authenticated EXECUTE=' || auth_exec
         || ' · Vorschlag: revoke execute ... from public, anon'
  from sd
  where anon_exec and not ist_trigger

  union all
  -- (d) View ohne security_invoker (umgeht RLS der Grundtabellen)
  select '2 HOCH d) View ohne security_invoker', c.relname::text,
         case c.relkind when 'm' then 'Materialized View (kennt gar keine RLS)' else 'View' end
         || ' · anon SELECT=' || has_table_privilege('anon', c.oid, 'SELECT')
         || ' · authenticated SELECT=' || has_table_privilege('authenticated', c.oid, 'SELECT')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')
    and not exists (select 1 from unnest(coalesce(c.reloptions, '{}'::text[])) o
                    where o ~* '^security_invoker=(true|on|1|yes)$')

  union all
  -- (e1) oeffentliche Buckets (jede Datei per URL ohne Anmeldung lesbar)
  select '3 MITTEL e) Bucket oeffentlich', b.id::text,
         'public=true · pruefen: keine personenbezogenen Dateien darin?'
  from storage.buckets b
  where b.public

  union all
  -- (e2) Storage-Regeln ohne Ordner-/Besitzer-Pruefung
  select '2 HOCH e) Storage-Regel ohne Ordnerpruefung',
         'storage.objects · ' || policyname,
         cmd || ' fuer ' || array_to_string(roles, ',') || ' · using=' || left(qual, 80) || ' · check=' || left(chk, 80)
  from pol
  where schemaname = 'storage' and tablename = 'objects'
    and (qual || ' ' || chk) !~* '(foldername|owner\s*=|owner_id|ist_chat_mitglied)'

  union all
  -- (f) INSERT/UPDATE/ALL ohne WITH CHECK
  select case when cmd = 'INSERT' then '2 HOCH f) INSERT ohne WITH CHECK'
              else '4 INFO f) UPDATE/ALL ohne WITH CHECK (USING gilt dann auch fuer die neue Zeile)' end,
         schemaname || '.' || tablename || ' · ' || policyname,
         cmd || ' · using=' || left(qual, 100)
  from pol
  where cmd in ('INSERT', 'UPDATE', 'ALL') and chk = ''

  union all
  -- (g) Nutzer darf eigene Sonderspalten aendern (Rolle, Tarif, Freischaltung)
  select '1 KRITISCH g) Nutzer aendert eigene Sonderspalte',
         col.table_name || '.' || col.column_name,
         'authenticated UPDATE auf Spalte erlaubt und UPDATE-Regel vorhanden · pruefen: schuetzt ein Trigger die Spalte?'
  from information_schema.columns col
  where col.table_schema = 'public'
    and (col.table_name, col.column_name) in (values
         ('profiles', 'role'), ('profiles', 'stufe'), ('profiles', 'plan'),
         ('profiles', 'demo'), ('profiles', 'zusatz_speicher_gb'))
    and has_column_privilege('authenticated', format('public.%I', col.table_name), col.column_name, 'UPDATE')
    and exists (select 1 from pol where pol.schemaname = 'public' and pol.tablename = col.table_name
                and pol.cmd in ('UPDATE', 'ALL') and pol.qual ~* '(auth\.uid|auth_user_id|mein_chef_id)')

  union all
  -- (h) Info: RLS an, aber keine einzige Regel (nur Service-Role; ok, wenn gewollt)
  select '4 INFO h) RLS an, keine Regel (nur Service-Role)', c.relname::text, 'bewusst? (z. B. *_zugang, zwei_faktor_*)'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
)
select art, objekt, detail
from befund
order by art, objekt;
