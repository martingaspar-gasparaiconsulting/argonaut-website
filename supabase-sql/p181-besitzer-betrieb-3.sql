-- ============================================================
-- ARGONAUT OS · Paket 181 (30.09.2026) · Besitzer = Betrieb, Teil 3
-- Geld- und Personal-Seiten
--
-- Befund: Auf diesen Seiten speicherte ein Mitarbeiter unter SEINER Kennung
-- (Abo-Rechnungen, Eingangsbelege, Ausgaben, Reisekosten, Mitglieder,
-- Bundesland/Arbeitsvertraege, Partner/Provisionen, Nachkalkulation,
-- Ernte-Marktverkaeufe, Portal-Zugaenge, Vertraege, Foerdervorhaben,
-- Rueckhol-Strecke). Der Chef sah diese Eintraege nicht.
--
-- WAS HIER PASSIERT (alles additiv, nichts wird geloescht, keine bestehende
-- Regel wird geaendert, bestehende Zeilen bleiben unveraendert):
--  1. Trigger p181_besitzer (vor Anlegen/Aendern):
--       Anlegen durch einen Mitarbeiter -> Besitzer = sein Betrieb.
--       Beim Chef bleibt alles, wie es war.
--       Aendern -> der Besitzer bleibt, wer er war.
--  2. Mitarbeiter-Regeln je Tabelle: LESEN nur mit Sicht- oder Schreibrecht
--     fuer das Modul (sensible Daten wie IBAN, Vertraege), ANLEGEN und
--     AENDERN nur mit Schreibrecht (Seite /rechte). LOESCHEN bleibt beim Chef.
--  3. Zugriffsschutz (RLS) wird NICHT neu eingeschaltet — die Kontrolle
--     zeigt nur an, ob er an ist.
--
-- ACHTUNG (darum getrennt geliefert): Ein Mitarbeiter OHNE Schreibrecht
-- fuer das Modul kann dort danach nichts mehr anlegen (bisher landete es
-- unsichtbar unter seiner Kennung). Chef und Mitarbeiter MIT Schreibrecht
-- merken nichts. Zahlungen und Artikel sind nicht dabei — die regeln schon
-- „Darf abrechnen" bzw. der Lager-Trigger.
-- Mehrfach ausfuehrbar.
-- ============================================================

create or replace function public.p181_besitzer()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_chef uuid;
begin
  begin
    if tg_op = 'UPDATE' then
      -- nur fuer angemeldete Nutzer; Korrekturen im SQL-Editor bleiben moeglich
      if auth.uid() is not null then
        new.owner_user_id := old.owner_user_id;
      end if;
      return new;
    end if;
    v_chef := public.mein_chef_id();
    if v_chef is not null then
      new.owner_user_id := v_chef;
    end if;
  exception when others then
    null;
  end;
  return new;
end;
$$;

do $$
declare
  paar text[];
  t text;
  m text;
  paare text[][] := array[
    array['abo_rechnungen', 'rechnungen'],
    array['eingangsbelege', 'rechnungen'],
    array['ausgaben', 'finanzen'],
    array['reisekosten', 'reisekosten'],
    array['mitglieder', 'mitglieder'],
    array['hr_einstellungen', 'personal'],
    array['personal_vertrag', 'personal'],
    array['provision_partner', 'provisionen'],
    array['provision_zuordnung', 'provisionen'],
    array['projekt_kosten', 'controlling'],
    array['markt_verkauf', 'ernte'],
    array['portal_zugaenge', 'kundenportal'],
    array['vertraege', 'vertraege'],
    array['foerder_vorhaben', 'foerdermittel'],
    array['rueckhol_strecke', 'marketing'],
    array['rueckhol_schritt', 'marketing']
  ];
begin
  foreach paar slice 1 in array paare loop
    t := paar[1];
    m := paar[2];
    if to_regclass('public.' || t) is null then
      raise notice '%: Tabelle nicht gefunden, uebersprungen', t;
      continue;
    end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = t and column_name = 'owner_user_id') then
      raise notice '%: keine Spalte owner_user_id, uebersprungen', t;
      continue;
    end if;
    execute format('drop trigger if exists p181_besitzer on public.%I', t);
    execute format('create trigger p181_besitzer before insert or update on public.%I for each row execute function public.p181_besitzer()', t);
    execute format('drop policy if exists p181_ma_select on public.%I', t);
    execute format('create policy p181_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(%L) or public.darf_ich_modul_aendern(%L)))', t, m, m);
    execute format('drop policy if exists p181_ma_insert on public.%I', t);
    execute format('create policy p181_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(%L))', t, m);
    execute format('drop policy if exists p181_ma_update on public.%I', t);
    execute format('create policy p181_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(%L)) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(%L))', t, m, m);
  end loop;
end $$;

-- KONTROLLE — Erwartung je Tabelle: regeln = 3, trigger = 1, loeschrechte = 0, rls_an = true.
-- alt_bei_mitarbeitern = Zeilen, die frueher unter einer Mitarbeiter-Kennung
-- gespeichert wurden (nur zur Info, nichts wird veraendert).
select c.relname as tabelle,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname like 'p181_ma_%') as regeln,
       (select count(*) from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'p181_besitzer') as trigger,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname like 'p181_ma_%' and p.cmd = 'DELETE') as loeschrechte,
       c.relrowsecurity as rls_an,
       (xpath('/row/n/text()', query_to_xml(format(
          'select count(*) as n from public.%I where owner_user_id in (select auth_user_id from public.mitarbeiter where auth_user_id is not null)',
          c.relname), false, true, '')))[1]::text::int as alt_bei_mitarbeitern
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname in ('abo_rechnungen','eingangsbelege','ausgaben','reisekosten','mitglieder','hr_einstellungen','personal_vertrag',
                    'provision_partner','provision_zuordnung','projekt_kosten','markt_verkauf','portal_zugaenge','vertraege',
                    'foerder_vorhaben','rueckhol_strecke','rueckhol_schritt')
  and c.relkind = 'r'
order by c.relname;
