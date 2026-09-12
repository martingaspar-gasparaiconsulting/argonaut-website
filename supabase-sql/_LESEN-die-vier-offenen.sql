-- ============================================================
-- ARGONAUT OS · Was steht in den vier offenen Tabellen?
-- Stand: 12.09.2026 · gehoert zu Punkt 2.6
--
-- WOZU
-- Vier Regeln lauten `using (true)` fuer die Rolle `public`:
--   academy_kurse    · academy_read_all
--   agents           · agents_read_all
--   automatisierungen· "Alle lesen"
--   betreiber_flags  · betreiber_flags_select
--
-- `public` schliesst `anon` ein. Der anon-Schluessel steht in jedem
-- Browser-Bundle und ist damit oeffentlich bekannt. Diese vier Tabellen
-- kann also jeder auslesen, der die Projekt-URL kennt — ohne Anmeldung.
--
-- Ob das schlimm ist, entscheidet genau eine Frage: Stehen dort Daten,
-- die zu einem bestimmten Betrieb oder einer bestimmten Person gehoeren?
-- Ein Kurs-Katalog, der fuer alle Kunden derselbe ist, darf offen sein.
-- Eine Tabelle mit `owner_user_id` darf es nicht.
--
-- Die Spalte `mandantenspalte` beantwortet genau das. Steht dort ein
-- Spaltenname, ist die Tabelle mandantenbezogen und die Regel ist falsch.
--
-- DIESE ABFRAGE LIEST NUR. Sie aendert, legt an und loescht nichts.
-- ============================================================

with ziel(tabelle) as (
  values ('academy_kurse'), ('agents'), ('automatisierungen'), ('betreiber_flags')
)
select
  z.tabelle,
  case z.tabelle
    when 'academy_kurse'     then (select count(*) from academy_kurse)
    when 'agents'            then (select count(*) from agents)
    when 'automatisierungen' then (select count(*) from automatisierungen)
    when 'betreiber_flags'   then (select count(*) from betreiber_flags)
  end                                                as zeilen,
  coalesce((
    select string_agg(k.column_name, ', ' order by k.column_name)
    from information_schema.columns k
    where k.table_schema = 'public'
      and k.table_name = z.tabelle
      and k.column_name in (
        'owner_user_id','user_id','chef_id','betrieb_id','tenant_id',
        'firma_id','mandant_id','erstellt_von','angelegt_von','email'
      )
  ), '— keine')                                      as mandantenspalte,
  (
    select string_agg(k.column_name || ' ' || k.data_type, ' · '
                      order by k.ordinal_position)
    from information_schema.columns k
    where k.table_schema = 'public' and k.table_name = z.tabelle
  )                                                  as alle_spalten
from ziel z
order by z.tabelle;
