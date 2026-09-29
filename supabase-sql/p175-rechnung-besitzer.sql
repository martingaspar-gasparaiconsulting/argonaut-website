-- ============================================================================
-- ARGONAUT OS · SQL p175 · „Rechnung neu berechnen" nur fuer den eigenen Betrieb
-- (29.09.2026, Paket 175 Geld-Routen)
--
-- Befund: rechnung_zahlbetrag_neu_berechnen(p_rechnung_id) laeuft mit
-- SECURITY DEFINER (umgeht RLS) und prueft nicht, wem die Rechnung gehoert.
-- Jeder Angemeldete konnte so eine FREMDE Rechnung neu berechnen lassen — z. B.
-- eine von Hand auf „bezahlt" gesetzte Rechnung ohne Zahlungseintrag zurueck
-- auf „offen".
--
-- Loesung: Der LIVE-Funktionskoerper bleibt erhalten; direkt nach „begin" wird
-- eine Besitzer-Pruefung eingefuegt. Angemeldete (auth.uid() gesetzt) duerfen
-- nur Rechnungen des eigenen Betriebs berechnen — sonst passiert still nichts.
-- Der Server und die Zahlungs-Trigger ohne Anmeldung (Import, Crons) sind nicht
-- betroffen. Zweimal ausfuehren schadet nicht (Marke p175_besitzer).
--
-- Kein Aussperr-Risiko. Nichts wird geloescht, keine Daten geaendert.
-- ============================================================================

do $$
declare
  v_def   text;
  v_neu   text;
  v_waechter text := E'begin\n'
    || E'  -- p175_besitzer: Angemeldete nur fuer Rechnungen des eigenen Betriebs\n'
    || E'  if auth.uid() is not null and not exists (\n'
    || E'    select 1 from public.rechnungen r_p175\n'
    || E'     where r_p175.id = p_rechnung_id\n'
    || E'       and r_p175.owner_user_id in (auth.uid(), public.mein_chef_id())) then\n'
    || E'    return;\n'
    || E'  end if;\n';
begin
  if to_regprocedure('public.rechnung_zahlbetrag_neu_berechnen(uuid)') is null then
    raise notice 'p175: Funktion rechnung_zahlbetrag_neu_berechnen(uuid) fehlt — nichts zu tun';
    return;
  end if;

  select pg_get_functiondef('public.rechnung_zahlbetrag_neu_berechnen(uuid)'::regprocedure) into v_def;

  if position('p175_besitzer' in v_def) > 0 then
    raise notice 'p175: Besitzer-Pruefung ist schon eingebaut';
    return;
  end if;
  if v_def !~* 'returns void' or v_def !~* 'language plpgsql' then
    raise exception 'p175: Funktion hat eine unerwartete Form — bitte Claude den Funktionskoerper zeigen, NICHTS wurde geaendert';
  end if;

  -- Erstes „begin" am Zeilenanfang (Beginn des Funktionsrumpfs) ersetzen.
  v_neu := regexp_replace(v_def, E'(^|\\n)begin\\s*\\n', E'\\1' || v_waechter, 'i');
  if v_neu = v_def then
    raise exception 'p175: Rumpfbeginn nicht gefunden — NICHTS wurde geaendert';
  end if;

  execute v_neu;
  raise notice 'p175: Besitzer-Pruefung eingebaut';
end $$;

-- ============================================================================
-- KONTROLLE (nur lesen) — Erwartung: eine Zeile, besitzer_pruefung = true
-- ============================================================================
select p.proname,
       position('p175_besitzer' in pg_get_functiondef(p.oid)) > 0 as besitzer_pruefung,
       p.prosecdef as security_definer
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'rechnung_zahlbetrag_neu_berechnen';
