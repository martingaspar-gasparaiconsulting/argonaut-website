-- ============================================================
-- ARGONAUT OS · Paket 127 (27.09.2026) · Import Schritt 3, Teil 3
--
-- 1) Der Feldkatalog des Import-Motors (import_feldkatalog) darf jetzt auch
--    die Spalten von drei weiteren Tabellen nennen:
--      mitarbeiter_qualifikation   (Qualifikationen je Mitarbeiter)
--      bestellungen                (Bestellkopf im ERP-Bestellwesen)
--      bestellpositionen           (Positionen dazu)
--    Er liest nur die Spaltenbeschreibung, KEINE Daten. Gleiche Unterschrift,
--    gleiche Rechte wie in Paket 124-126.
--
-- 2) Wartungs-Protokolle gehoeren dem Betrieb (Claude-Befund aus Paket 125):
--    Bisher durfte ein Mitarbeiter ein Pruefprotokoll nur mit SEINER Kennung
--    anlegen — der Chef sah es dann nicht. Neue Regel whist_insert_ma: der
--    Mitarbeiter darf ein Protokoll fuer seinen Betrieb anlegen (nur mit sich
--    selbst als erstellt_von). Loeschen/Aendern bleibt beim Chef.
--    Bestehende Protokolle, die ein Mitarbeiter zu einem Vertrag des Chefs
--    geschrieben hat, bekommen den Besitzer des Vertrags. Der Mitarbeiter
--    sieht sie danach weiter (Regel whist_select_mitarbeiter), der Chef
--    sieht sie jetzt auch. Es wird nichts geloescht.
--
-- Additiv, mehrfach ausfuehrbar. Sperrt niemanden aus: Die bestehenden
-- Regeln bleiben unveraendert, es kommt nur eine dazu.
-- ============================================================

create or replace function public.import_feldkatalog(p_tabellen text[])
returns table (tabelle text, spalte text, datentyp text, pflicht boolean, generiert boolean)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select c.table_name::text,
         c.column_name::text,
         c.data_type::text,
         (c.is_nullable = 'NO' and c.column_default is null and c.is_identity = 'NO' and c.is_generated = 'NEVER'),
         (c.is_generated <> 'NEVER' or c.is_identity = 'YES')
    from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = any (p_tabellen)
     and c.table_name = any (array['kontakte', 'lieferanten', 'artikel', 'rechnungen',
                                   'leistungskatalog', 'wartungsvertraege', 'verkaufschancen',
                                   'kontakt_aktivitaeten', 'leads',
                                   'mitarbeiter', 'auftraege', 'projekte', 'vertraege',
                                   'anlagegueter', 'fahrzeuge', 'eingangsbelege',
                                   'mitarbeiter_qualifikation', 'bestellungen', 'bestellpositionen'])
   order by c.table_name, c.ordinal_position;
$$;

revoke all on function public.import_feldkatalog(text[]) from public;
revoke all on function public.import_feldkatalog(text[]) from anon;
grant execute on function public.import_feldkatalog(text[]) to authenticated;

-- ---------- 2) Wartungs-Protokolle gehoeren dem Betrieb ----------
do $$
begin
  if to_regclass('public.wartungshistorie') is not null
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'wartungshistorie' and policyname = 'whist_insert_ma') then
    create policy whist_insert_ma on public.wartungshistorie
      as permissive for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erstellt_von = auth.uid());
  end if;
end $$;

do $$
begin
  if to_regclass('public.wartungshistorie') is not null and to_regclass('public.wartungsvertraege') is not null then
    update public.wartungshistorie h
       set owner_user_id = v.owner_user_id
      from public.wartungsvertraege v
     where h.wartungsvertrag_id = v.id
       and h.owner_user_id is distinct from v.owner_user_id
       and v.owner_user_id is not null;
  end if;
end $$;

-- ---------- Kontrolle (EINE Abfrage) ----------
-- Erwartet: 19 Katalog-Zeilen mit Spaltenzahl > 0, dazu
--   „Regel whist_insert_ma" = 1 und „Protokolle mit falschem Besitzer" = 0.
select 'Katalog ' || t as was, count(c.column_name)::text as wert
  from unnest(array['kontakte','lieferanten','artikel','rechnungen','leistungskatalog',
                    'wartungsvertraege','verkaufschancen','kontakt_aktivitaeten','leads',
                    'mitarbeiter','auftraege','projekte','vertraege','anlagegueter',
                    'fahrzeuge','eingangsbelege','mitarbeiter_qualifikation','bestellungen',
                    'bestellpositionen']) as t
  left join information_schema.columns c on c.table_schema = 'public' and c.table_name = t
 group by t
union all
select 'Regel whist_insert_ma', count(*)::text
  from pg_policies where schemaname = 'public' and tablename = 'wartungshistorie' and policyname = 'whist_insert_ma'
union all
select 'Protokolle mit falschem Besitzer', count(*)::text
  from public.wartungshistorie h join public.wartungsvertraege v on v.id = h.wartungsvertrag_id
 where h.owner_user_id is distinct from v.owner_user_id and v.owner_user_id is not null
 order by 1;
