-- ============================================================================
-- ARGONAUT OS · B1b-2 (26.09.2026) — Angebote, Kalkulator, Projektabrechnung,
-- Förder-Angebot, Leistungskatalog, Anlagen und Kontakte gehören dem Betrieb
--
-- Martins Entscheidung 26.09.2026 („so"):
--   · Mitarbeiter dürfen diese Daten ihres Betriebs LESEN, ANLEGEN, ÄNDERN.
--     LÖSCHEN bleibt beim Chef. (Wie B1b Gruppe 3 und 4.)
--   · Rechnungen, Rechnungspositionen und Zahlungen bleiben NUR beim Chef —
--     hier wird an ihren Regeln nichts geändert.
--   · Was Mitarbeiter bisher unter eigener Kennung angelegt haben, wird auf
--     ihren Betrieb umgehängt, damit der Chef es sieht. Zeilen, die dabei an
--     einer Eindeutigkeitsregel scheitern, bleiben unverändert stehen.
--
-- Rein additiv: keine bestehende Regel wird geändert oder entfernt, nichts
-- gelöscht. Idempotent: mehrfaches Ausführen schadet nicht.
-- ============================================================================
do $$
declare
  t text;
  vorgabe text;
  z record;
  n int;
  n_fehler int;
  tabellen text[] := array[
    'angebote', 'angebot_positionen', 'kalkulationen', 'leistungskatalog',
    'projektleistungen', 'foerder_angebote', 'kontakte'
  ];
  umhaengen text[] := array[
    'angebote', 'angebot_positionen', 'kalkulationen', 'leistungskatalog',
    'projektleistungen', 'foerder_angebote', 'anlagegueter', 'kontakte'
  ];
begin
  -- 1) Regeln für Mitarbeiter (lesen, anlegen, ändern — kein Löschen)
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

    -- Vorgabe der Spalte auf „Betrieb" (beim Chef dieselbe Kennung wie vorher)
    select column_default into vorgabe
      from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name = 'owner_user_id';
    if vorgabe is not null and vorgabe ilike '%auth.uid()%' and vorgabe not ilike '%mein_chef_id%' then
      execute format('alter table public.%I alter column owner_user_id set default coalesce(public.mein_chef_id(), auth.uid())', t);
    end if;
  end loop;

  -- 2) Bisherige Mitarbeiter-Zeilen auf den Betrieb umhängen (Zeile für Zeile)
  foreach t in array umhaengen loop
    if to_regclass('public.' || t) is null then continue; end if;
    n := 0; n_fehler := 0;
    for z in execute format(
      'select x.id, m.owner_user_id as betrieb
         from public.%I x
         join public.mitarbeiter m on m.auth_user_id = x.owner_user_id
        where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id', t)
    loop
      begin
        execute format('update public.%I set owner_user_id = $1 where id = $2', t) using z.betrieb, z.id;
        n := n + 1;
      exception when others then
        n_fehler := n_fehler + 1;
      end;
    end loop;
    raise notice 'B1b-2 %: % umgehaengt, % uebersprungen', t, n, n_fehler;
  end loop;
end $$;

-- KONTROLLE (eine Abfrage)
--   regeln: je Tabelle 3 (b1_ma_*), loeschrechte 0
--   noch_bei_mitarbeitern: 0 (Rechnungen/Zahlungen nur zur Info — dort wird nichts umgehängt)
select t.tabelle,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tabelle and p.policyname like 'b1_ma_%') as regeln,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.tabelle and p.policyname like 'b1_ma_%' and p.cmd = 'DELETE') as loeschrechte,
       t.noch_bei_mitarbeitern
from (
  select 'angebote' as tabelle, (select count(*) from public.angebote x join public.mitarbeiter m on m.auth_user_id = x.owner_user_id where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id) as noch_bei_mitarbeitern
  union all select 'angebot_positionen', (select count(*) from public.angebot_positionen x join public.mitarbeiter m on m.auth_user_id = x.owner_user_id where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id)
  union all select 'kalkulationen', (select count(*) from public.kalkulationen x join public.mitarbeiter m on m.auth_user_id = x.owner_user_id where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id)
  union all select 'leistungskatalog', (select count(*) from public.leistungskatalog x join public.mitarbeiter m on m.auth_user_id = x.owner_user_id where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id)
  union all select 'projektleistungen', (select count(*) from public.projektleistungen x join public.mitarbeiter m on m.auth_user_id = x.owner_user_id where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id)
  union all select 'foerder_angebote', (select count(*) from public.foerder_angebote x join public.mitarbeiter m on m.auth_user_id = x.owner_user_id where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id)
  union all select 'anlagegueter', (select count(*) from public.anlagegueter x join public.mitarbeiter m on m.auth_user_id = x.owner_user_id where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id)
  union all select 'kontakte', (select count(*) from public.kontakte x join public.mitarbeiter m on m.auth_user_id = x.owner_user_id where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id)
  union all select 'rechnungen (nur Info)', (select count(*) from public.rechnungen x join public.mitarbeiter m on m.auth_user_id = x.owner_user_id where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id)
  union all select 'zahlungen (nur Info)', (select count(*) from public.zahlungen x join public.mitarbeiter m on m.auth_user_id = x.owner_user_id where m.owner_user_id is not null and m.owner_user_id <> x.owner_user_id)
) t
order by t.tabelle;
