-- ============================================================
-- ARGONAUT OS · Der blinde Fleck: Regeln, die nichts filtern
-- Stand: 12.09.2026 · gehoert zu Punkt 2.6
--
-- WOZU
-- Die erste Abfrage (_LESEN-mandantentrennung.sql) hat gefragt:
-- "Welche Tabelle hat gar keine Regel?" Antwort: keine einzige ohne RLS.
--
-- Das ist aber nur die halbe Frage. Eine Tabelle kann RLS anhaben UND
-- Regeln besitzen — und trotzdem offen sein, naemlich wenn die Regel
-- `using (true)` lautet. Die sagt: "jede Zeile ist sichtbar". Das ist
-- exakt so offen wie gar kein RLS, taucht aber in keiner Liste der
-- ersten Abfrage auf.
--
-- RANG
--   1  Bedingung ist `true` — filtert nichts. Hier zuerst hinsehen.
--   2  gar keine Lesebedingung bei einer lesenden/aendernden Regel.
--   3  Bedingung vorhanden, bindet aber an nichts Erkennbares.
--   9  bindet an auth.uid(), firma_id, chef_id o.ae. — sieht richtig aus.
--      Rang 9 wird bewusst NICHT ausgegeben, nur gezaehlt.
--
-- Die erste Ergebniszeile ist die Zusammenfassung. Kommt danach keine
-- weitere Zeile, ist das das bestmoegliche Ergebnis.
--
-- DIESE ABFRAGE LIEST NUR. Sie aendert, legt an und loescht nichts.
-- ============================================================

with bewertet as (
  select
    p.tablename                       as tabelle,
    p.policyname                      as regel,
    p.cmd                             as fuer,
    array_to_string(p.roles, ',')     as rollen,
    coalesce(p.qual, '')              as q,
    coalesce(p.with_check, '')        as w
  from pg_policies p
  where p.schemaname = 'public'
),
mit_rang as (
  select
    b.*,
    case
      when btrim(b.q) = 'true' or btrim(b.w) = 'true'            then 1
      when b.q = '' and b.fuer in ('SELECT','ALL','UPDATE','DELETE') then 2
      when b.q ~ 'auth\.uid|auth\.jwt|mein_chef_id|chef_id|firma_id|betrieb_id|tenant_id|user_id|owner_id|standort_id'
                                                                  then 9
      else 3
    end as rang
  from bewertet b
)
select
  0                                   as rang,
  'ZUSAMMENFASSUNG'                   as tabelle,
      (select count(*) from mit_rang)::text            || ' Regeln gesamt · '
   || (select count(*) from mit_rang where rang = 1)::text || ' offen (true) · '
   || (select count(*) from mit_rang where rang = 2)::text || ' ohne Lesebedingung · '
   || (select count(*) from mit_rang where rang = 3)::text || ' anzusehen · '
   || (select count(*) from mit_rang where rang = 9)::text || ' sauber gebunden'
                                      as regel,
  ''                                  as fuer,
  ''                                  as rollen,
  ''                                  as lesebedingung,
  ''                                  as schreibbedingung

union all

select
  rang,
  tabelle,
  regel,
  fuer,
  rollen,
  left(q, 160),
  left(w, 160)
from mit_rang
where rang < 9

order by 1, 2, 3;
