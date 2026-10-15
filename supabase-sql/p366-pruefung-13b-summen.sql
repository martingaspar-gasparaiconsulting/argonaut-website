-- ============================================================================
-- P366 / HW-5 · NUR LESEN: Rechnungen mit § 13b, deren gespeichertes Brutto
-- Umsatzsteuer enthaelt (Fehler vor HW-5). Aendert NICHTS.
-- Ergebnis 0 Zeilen = nichts betroffen.
-- ============================================================================
select r.id,
       r.rechnungsnummer,
       r.rechnungsdatum,
       r.netto_summe,
       r.mwst_summe,
       r.brutto_summe,
       r.bezahlter_betrag,
       r.zahlungsstatus,
       r.owner_user_id
from public.rechnungen r
where coalesce(r.reverse_charge, false) = true
  and coalesce(r.kleinunternehmer, false) = false
  and (coalesce(r.mwst_summe, 0) <> 0
       or coalesce(r.brutto_summe, 0) <> coalesce(r.netto_summe, 0))
order by r.rechnungsdatum desc nulls last;
