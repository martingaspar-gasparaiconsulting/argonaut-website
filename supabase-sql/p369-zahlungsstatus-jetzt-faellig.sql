-- ============================================================================
-- ARGONAUT OS · SQL p369 · HW-18 Zahlungsstatus rechnet „jetzt faellig"
-- (15.10.2026)
--
-- Befund: rechnung_zahlbetrag_neu_berechnen setzt „bezahlt" erst, wenn die
-- Zahlungen den GESAMTEN Bruttobetrag erreichen. Bei einer Schlussrechnung
-- steht im Brutto die ganze Leistung; die Abschlaege wurden aber schon mit
-- eigenen Abschlagsrechnungen bezahlt. Zahlt der Kunde den Rest komplett,
-- blieb die Schlussrechnung fuer immer „teilbezahlt".
--
-- Loesung: Ziel = Brutto minus abgesetzte Abschlaege (netto + Steuer; bei
-- § 13b ohne Steuer) — dieselbe Regel wie lib/zahlbarJetzt.ts und das PDF.
-- Der Sicherheitseinbehalt bleibt bewusst im Ziel: solange er offen ist, ist
-- die Rechnung „teilbezahlt" (das Geld steht dem Betrieb noch zu); die
-- Mahnung fordert ihn trotzdem nicht an (HW-6).
--
-- Unveraendert: Besitzer-Pruefung aus p175, Sonderstatus (storniert usw.)
-- bleiben in Ruhe, bezahlter_betrag = Summe der Zahlungen.
-- Danach werden alle Schlussrechnungen einmal neu berechnet.
--
-- Kein Aussperr-Risiko. Nichts wird geloescht. Zweimal ausfuehren schadet nicht.
-- ============================================================================

-- ── TEIL 1: Funktion ersetzen (Koerper = Live-Stand 15.10. + Ziel-Rechnung) ──
create or replace function public.rechnung_zahlbetrag_neu_berechnen(p_rechnung_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_summe          numeric;
  v_letztes_datum  date;
  v_brutto         numeric;
  v_netto          numeric;
  v_status         text;
  v_art            text;
  v_rc             boolean;
  v_abgesetzt      numeric := 0;
  v_ziel           numeric;
begin
  -- p175_besitzer: Angemeldete nur fuer Rechnungen des eigenen Betriebs
  if auth.uid() is not null and not exists (
    select 1 from public.rechnungen r_p175
     where r_p175.id = p_rechnung_id
       and r_p175.owner_user_id in (auth.uid(), public.mein_chef_id())) then
    return;
  end if;
  select coalesce(sum(betrag), 0), max(zahlungsdatum)
    into v_summe, v_letztes_datum
    from public.zahlungen
    where rechnung_id = p_rechnung_id;

  select brutto_summe, netto_summe, zahlungsstatus, rechnungsart,
         coalesce(reverse_charge, false) and not coalesce(kleinunternehmer, false)
    into v_brutto, v_netto, v_status, v_art, v_rc
    from public.rechnungen
    where id = p_rechnung_id;

  -- Nur Standard-Status automatisch pflegen; Sonderstatus in Ruhe lassen
  if v_status not in ('offen', 'teilbezahlt', 'bezahlt') then
    update public.rechnungen
      set bezahlter_betrag = v_summe, updated_at = now()
      where id = p_rechnung_id;
    return;
  end if;

  -- p369_ziel: § 13b -> Brutto = Netto; Schlussrechnung -> minus Abschlaege
  if v_rc then
    v_brutto := coalesce(v_netto, v_brutto);
  end if;
  if v_art = 'schluss' then
    select coalesce(sum(coalesce(netto, 0) + case when v_rc then 0 else coalesce(steuer, 0) end), 0)
      into v_abgesetzt
      from public.rechnung_abschlaege
      where schlussrechnung_id = p_rechnung_id;
  end if;
  v_ziel := round(coalesce(v_brutto, 0) - v_abgesetzt, 2);

  update public.rechnungen
    set bezahlter_betrag = v_summe,
        bezahlt_am = case
            when v_brutto > 0 and v_ziel > 0 and v_summe >= v_ziel then v_letztes_datum
            when v_brutto > 0 and v_ziel <= 0 then coalesce(v_letztes_datum, bezahlt_am, current_date)
            else null
          end,
        zahlungsstatus = case
            when v_brutto > 0 and v_ziel > 0 and v_summe >= v_ziel then 'bezahlt'
            when v_brutto > 0 and v_ziel <= 0 then 'bezahlt'
            when v_summe > 0 then 'teilbezahlt'
            else 'offen'
          end,
        updated_at = now()
    where id = p_rechnung_id;
end;
$function$;

-- ── TEIL 2: alle Schlussrechnungen einmal neu berechnen ──
select public.rechnung_zahlbetrag_neu_berechnen(r.id)
  from public.rechnungen r
 where r.rechnungsart = 'schluss'
   and r.zahlungsstatus in ('offen', 'teilbezahlt', 'bezahlt');

-- ── KONTROLLE (nur lesen) ──
-- Erwartung: p369 = true, p175 = true
select position('p369_ziel' in pg_get_functiondef(p.oid)) > 0 as p369,
       position('p175_besitzer' in pg_get_functiondef(p.oid)) > 0 as p175
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname = 'rechnung_zahlbetrag_neu_berechnen';
