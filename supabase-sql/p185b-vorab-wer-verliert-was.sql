-- ARGONAUT OS · Paket 185b · VORAB-ABFRAGE (nur lesen, aendert nichts)
-- Wer verliert nach 185b wo das Schreiben? = Modul SICHTBAR, aber ohne Schreibrecht.
-- Leere Liste = niemand verliert etwas.
with betroffene_module(modul) as (
  select unnest(array['agentur-kreativ', 'anlagen', 'aufmass', 'auftraege', 'bau-lv', 'bautagebuch', 'bde', 'belegung', 'betriebskosten', 'bildung', 'buchungen', 'chargen', 'compliance', 'crm', 'dsgvo', 'einkauf', 'energie', 'ernte', 'erp', 'ertraege', 'etiketten', 'expose', 'fahrzeugakte', 'fertigung', 'foerder-angebot', 'foerdermittel', 'forst', 'freigaben', 'fristen', 'gastro', 'gutachten', 'gutscheine', 'hilfsmittel', 'housekeeping', 'immobilien', 'import', 'it-msp', 'itassets', 'kalkulator', 'kanzlei', 'kfz', 'korrespondenz', 'kundenportal', 'lager-scanner', 'landwirtschaft', 'lebensmittel', 'leistungskatalog', 'logistik', 'marketing', 'mitglieder', 'nachweise', 'objekte', 'objektzeiten', 'pipeline', 'projekte', 'provisionen', 'pruefprotokolle', 'raeume', 'rechnungen', 'reisekosten', 'reservierung', 'rezeptur', 'schlagkartei', 'service', 'shop', 'spenden', 'tier', 'tierbestand', 'tour', 'varianten', 'veranstaltungen', 'verein', 'verleih', 'wartung', 'wellness', 'werkstatt', 'zuschnitt'])
)
select trim(coalesce(m.vorname, '') || ' ' || coalesce(m.nachname, '')) as mitarbeiter,
       string_agg(b.modul, ', ' order by b.modul) as verliert_schreiben_in
from public.mitarbeiter m
join public.mitarbeiter_rechte r on r.mitarbeiter_id = m.id
join betroffene_module b on b.modul = any(coalesce(r.module, '{}'::text[]))
                        and not (b.modul = any(coalesce(r.schreib_module, '{}'::text[])))
where m.auth_user_id is not null
group by 1
order by 1;
