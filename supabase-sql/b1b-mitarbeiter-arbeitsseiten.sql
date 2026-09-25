-- ============================================================================
-- ARGONAUT OS · B1b (25.09.2026) — Mitarbeiter arbeiten fuer den Betrieb
--
-- WARUM: Auf diesen Arbeitsseiten durften Mitarbeiter bisher nur mit ihrer
-- EIGENEN Kennung anlegen -> der Chef sah ihre Eintraege nie. Jetzt legt der
-- Code mit der Kennung des Betriebs an (mein_chef_id()). Damit das klappt,
-- braucht jede Tabelle diese drei Regeln: Mitarbeiter duerfen die Daten ihres
-- Betriebs LESEN, ANLEGEN und AENDERN. LOESCHEN bleibt beim Chef.
--
-- Rein ADDITIV: Es wird keine bestehende Regel geaendert oder entfernt.
-- Idempotent: mehrfaches Ausfuehren schadet nicht (drop if exists + create).
-- Der Chef ist nicht betroffen (seine Regeln *_owner_all bleiben).
-- ============================================================================
do $$
declare
  t text;
  tabellen text[] := array[
    'aufmasse', 'aufmass_positionen', 'nachweis', 'objekt_zeiten', 'ticket_verlauf',
    'hotel_zimmer', 'immo_einheiten', 'immo_mietvertraege', 'wartungsvertraege'
  ];
begin
  foreach t in array tabellen loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabelle % fehlt - uebersprungen', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists b1_ma_select on public.%I', t);
    execute format('create policy b1_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id())', t);
    execute format('drop policy if exists b1_ma_insert on public.%I', t);
    execute format('create policy b1_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id())', t);
    execute format('drop policy if exists b1_ma_update on public.%I', t);
    execute format('create policy b1_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id()) with check (owner_user_id = public.mein_chef_id())', t);
  end loop;
end $$;

-- KONTROLLE (eine Abfrage). Erwartet: 9 Tabellen, je 3 Regeln, 0 Loeschrechte fuer Mitarbeiter.
select tablename as tabelle,
       count(*) filter (where policyname like 'b1_ma_%') as neue_regeln,
       count(*) filter (where policyname like 'b1_ma_%' and cmd = 'DELETE') as loeschrechte
from pg_policies
where schemaname = 'public'
  and tablename in ('aufmasse','aufmass_positionen','nachweis','objekt_zeiten','ticket_verlauf',
                    'hotel_zimmer','immo_einheiten','immo_mietvertraege','wartungsvertraege')
group by tablename
order by tablename;
