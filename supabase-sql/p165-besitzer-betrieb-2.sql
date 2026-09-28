-- ============================================================
-- ARGONAUT OS · Paket 165 (28.09.2026) · Besitzer = Betrieb, Teil 2
--
-- Befund: Auf diesen Seiten legte ein Mitarbeiter Datensaetze mit SEINER
-- Kennung als Besitzer an (Chef sah sie nicht) — oder durfte gar nichts
-- anlegen, weil keine Mitarbeiter-Regel existierte.
--
-- WAS HIER PASSIERT (alles additiv, nichts wird geloescht, keine bestehende
-- Regel wird geaendert, bestehende Zeilen bleiben unveraendert):
--  1. Trigger p165_besitzer (vor Anlegen/Aendern):
--       Anlegen durch einen Mitarbeiter -> Besitzer = sein Betrieb (mein_chef_id()).
--       Beim Chef bleibt alles, wie es war.
--       Aendern -> der Besitzer bleibt, wer er war (niemand „nimmt" Datensaetze mit;
--       Korrekturen im SQL-Editor ohne Anmeldung bleiben moeglich).
--  2. Mitarbeiter-Regeln je Tabelle: LESEN im eigenen Betrieb; ANLEGEN und
--     AENDERN nur mit Schreibrecht fuer das Modul (Seite /rechte,
--     darf_ich_modul_aendern). LOESCHEN bleibt beim Chef.
--
-- Module: bewertungen, buchungen, ernte, forst, holz, marketing, shop.
-- Mehrfach ausfuehrbar. Sperrt niemanden aus: Chef unveraendert, Mitarbeiter
-- bekommen nur Rechte dazu.
-- ============================================================

create or replace function public.p165_besitzer()
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
    array['bewertungsanfragen', 'bewertungen'],
    array['buchungen', 'buchungen'],
    array['ernte_ernte', 'ernte'],
    array['markt_produkt', 'ernte'],
    array['forst_einsatzmittel', 'forst'],
    array['forst_nachweis', 'forst'],
    array['holz_sortiment', 'holz'],
    array['holz_preise', 'holz'],
    array['holz_mengenrabatt', 'holz'],
    array['holz_auftraege', 'holz'],
    array['holz_auftrag_positionen', 'holz'],
    array['pakete', 'holz'],
    array['paket_positionen', 'holz'],
    array['marketing_segment', 'marketing'],
    array['webinare', 'marketing'],
    array['webinar_termin', 'marketing'],
    array['shop_bestellungen', 'shop']
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
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists p165_besitzer on public.%I', t);
    execute format('create trigger p165_besitzer before insert or update on public.%I for each row execute function public.p165_besitzer()', t);
    execute format('drop policy if exists p165_ma_select on public.%I', t);
    execute format('create policy p165_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id())', t);
    execute format('drop policy if exists p165_ma_insert on public.%I', t);
    execute format('create policy p165_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(%L))', t, m);
    execute format('drop policy if exists p165_ma_update on public.%I', t);
    execute format('create policy p165_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(%L)) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(%L))', t, m, m);
  end loop;
end $$;

-- Kontrolle: je Tabelle regeln = 3, trigger = 1, loeschrechte = 0
select c.relname as tabelle,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname like 'p165_ma_%') as regeln,
       (select count(*) from pg_trigger g where g.tgrelid = c.oid and g.tgname = 'p165_besitzer') as trigger,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname and p.policyname like 'p165_ma_%' and p.cmd = 'DELETE') as loeschrechte
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname in ('bewertungsanfragen','buchungen','ernte_ernte','markt_produkt','forst_einsatzmittel','forst_nachweis',
                    'holz_sortiment','holz_preise','holz_mengenrabatt','holz_auftraege','holz_auftrag_positionen',
                    'pakete','paket_positionen','marketing_segment','webinare','webinar_termin','shop_bestellungen')
  and c.relkind = 'r'
order by c.relname;
