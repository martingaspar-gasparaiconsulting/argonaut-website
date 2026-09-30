-- ============================================================
-- ARGONAUT OS · Paket 185a (30.09.2026) · Buchungen loeschen nur Chef,
-- Abo-Rechnungen nur mit „Darf abrechnen"
--
-- Befund (Live-Stand 30.09.): Mitarbeiter durften Lagerbewegungen,
-- Umlagerungen, BDE-Buchungen, Marktverkaeufe, Chargen-Verwendungen und
-- Inventur-Zaehlungen LOESCHEN (GoBD: gebuchte Vorgaenge gehoeren nicht
-- still geloescht). Wiederkehrende Rechnungen (abo_rechnungen) konnte jeder
-- Mitarbeiter anlegen und aendern — ohne das Recht „Darf abrechnen".
--
-- WAS HIER PASSIERT (nur zusaetzliche Schranken, nichts wird geloescht,
-- keine bestehende Regel wird geaendert):
--  RESTRICTIVE-Regeln. Sie gelten ZUSAETZLICH zu allen bestehenden Regeln
--  (Und-Verknuepfung). Fuer die Geschaeftsleitung (mein_chef_id() ist leer)
--  sind sie immer erfuellt — der Chef merkt nichts.
--   1. Loeschen auf 6 Buchungs-Tabellen: nur Geschaeftsleitung.
--   2. abo_rechnungen anlegen/aendern/loeschen: Geschaeftsleitung oder
--      Mitarbeiter mit „Darf abrechnen" (darf_ich_abrechnen()).
--  Server-Ablaeufe (Dienstschluessel) sind von RLS nicht betroffen.
--
-- ACHTUNG (darum getrennt): Mitarbeiter ohne „Darf abrechnen" koennen danach
-- keine Abo-Vorlagen mehr anlegen/aendern; kein Mitarbeiter kann danach
-- Buchungen in diesen 6 Tabellen loeschen.
-- Mehrfach ausfuehrbar.
-- ============================================================

do $$
declare
  t text;
  loesch_tabellen text[] := array['lager_bewegung', 'lager_umlagerung', 'lagerbewegungen',
                                  'bde_buchung', 'markt_verkauf', 'charge_verwendung', 'inventur_zaehlung'];
begin
  foreach t in array loesch_tabellen loop
    if to_regclass('public.' || t) is null then
      raise notice '%: Tabelle nicht gefunden, uebersprungen', t;
      continue;
    end if;
    execute format('drop policy if exists p185a_loeschen_nur_chef on public.%I', t);
    execute format('create policy p185a_loeschen_nur_chef on public.%I as restrictive for delete to authenticated using (public.mein_chef_id() is null)', t);
  end loop;

  if to_regclass('public.abo_rechnungen') is not null then
    drop policy if exists p185a_abo_insert on public.abo_rechnungen;
    create policy p185a_abo_insert on public.abo_rechnungen as restrictive for insert to authenticated
      with check (public.mein_chef_id() is null or public.darf_ich_abrechnen());
    drop policy if exists p185a_abo_update on public.abo_rechnungen;
    create policy p185a_abo_update on public.abo_rechnungen as restrictive for update to authenticated
      using (public.mein_chef_id() is null or public.darf_ich_abrechnen())
      with check (public.mein_chef_id() is null or public.darf_ich_abrechnen());
    drop policy if exists p185a_abo_delete on public.abo_rechnungen;
    create policy p185a_abo_delete on public.abo_rechnungen as restrictive for delete to authenticated
      using (public.mein_chef_id() is null or public.darf_ich_abrechnen());
  end if;
end $$;

-- KONTROLLE — Erwartung: je Buchungs-Tabelle 1 Schranke, abo_rechnungen 3;
-- mitarbeiter_mit_abrechnen = wer danach noch Abo-Vorlagen schreiben darf (Info).
select p.tablename as tabelle, count(*) as schranken,
       (select count(*) from public.mitarbeiter m where m.darf_abrechnen) as mitarbeiter_mit_abrechnen
from pg_policies p
where p.schemaname = 'public' and p.policyname like 'p185a_%' and p.permissive = 'RESTRICTIVE'
group by p.tablename
order by p.tablename;
