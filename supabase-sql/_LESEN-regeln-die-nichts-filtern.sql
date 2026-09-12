-- ============================================================
-- ARGONAUT OS · Der blinde Fleck: Regeln, die nichts filtern
-- Fassung 2 · 12.09.2026 · gehoert zu Punkt 2.6
--
-- WARUM FASSUNG 2
-- Fassung 1 hat 259 Regeln als "anzusehen" gemeldet, die alle sauber sind.
-- Der Fehler: Sie hat nur `qual` (die Lesebedingung) gegen das Muster
-- geprueft. Eine INSERT-Regel hat aber gar kein qual — dort steht die
-- Bedingung in `with_check`. Also fiel jede INSERT-Regel durch.
--
-- Fassung 2 prueft die WIRKSAME Bedingung:
--   SELECT, DELETE   -> qual
--   INSERT           -> with_check
--   UPDATE, ALL      -> beide (bei UPDATE kann eine offene Schreibbedingung
--                      erlauben, eine Zeile einem Fremden zuzuschreiben)
--
-- RANG
--   1  wirksame Bedingung ist `true` — filtert nichts. Hier zuerst hinsehen.
--   2  gar keine wirksame Bedingung.
--   3  Bedingung vorhanden, bindet aber an nichts Erkennbares.
--   9  bindet an auth.uid(), mein_chef_id(), owner_user_id o.ae. — sieht
--      richtig aus. Wird bewusst NICHT ausgegeben, nur gezaehlt.
--
-- AUF DIE SPALTE `rollen` ACHTEN
-- `public` heisst NICHT "oeffentliche Daten", sondern: die Regel gilt fuer
-- ALLE Rollen — auch fuer `anon`, also fuer jeden, der den anon-Schluessel
-- hat. Der steht in jedem Browser-Bundle und ist damit oeffentlich bekannt.
-- Rang 1 plus Rolle `public` heisst deshalb: weltweit lesbar.
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
      -- 1) Die wirksame Bedingung ist `true` — sie filtert nichts.
      when (b.fuer in ('SELECT','DELETE')  and btrim(b.q) = 'true')
        or (b.fuer =  'INSERT'             and btrim(b.w) = 'true')
        or (b.fuer in ('UPDATE','ALL')     and (btrim(b.q) = 'true' or btrim(b.w) = 'true'))
                                                                   then 1
      -- 2) Es gibt ueberhaupt keine wirksame Bedingung.
      when (b.fuer =  'INSERT'             and b.w = '')
        or (b.fuer in ('SELECT','DELETE','UPDATE','ALL') and b.q = '')
                                                                   then 2
      -- 9) Die wirksame Bedingung bindet an den Nutzer oder den Betrieb.
      when coalesce(nullif(b.q, ''), b.w) ~
           'auth\.uid|auth\.jwt|mein_chef_id|chef_id|firma_id|betrieb_id|tenant_id|user_id|owner_id|standort_id|mitarbeiter'
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
   || (select count(*) from mit_rang where rang = 2)::text || ' ohne Bedingung · '
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
