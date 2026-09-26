-- ============================================================
-- ARGONAUT OS · B1c (26.09.2026) · Eigene Felder gehören dem Betrieb
-- Ab _p119 speichert der Code Felder und Werte immer mit der Kennung
-- des Betriebs (beim Mitarbeiter: der Chef). Dieser Block hängt die
-- BISHER von Mitarbeitern gespeicherten Felder und Werte auf ihren
-- Betrieb um, damit der Chef sie sieht.
-- Nichts wird gelöscht, keine Regel geändert. Mehrfach ausführbar:
-- beim zweiten Lauf gibt es nichts mehr umzuhängen.
-- ============================================================

do $$
declare
  z record;
  n_felder int := 0;
  n_werte int := 0;
  n_uebersprungen int := 0;
begin
  -- Felddefinitionen einzeln umhängen (falls eine Eindeutigkeitsregel
  -- ein gleichnamiges Feld beim Chef kennt, bleibt diese Zeile stehen).
  for z in
    select f.id, m.owner_user_id as betrieb
    from public.eigenes_feld f
    join public.mitarbeiter m on m.auth_user_id = f.owner_user_id
    where m.owner_user_id is not null
      and m.owner_user_id <> f.owner_user_id
  loop
    begin
      update public.eigenes_feld set owner_user_id = z.betrieb where id = z.id;
      n_felder := n_felder + 1;
    exception when others then
      n_uebersprungen := n_uebersprungen + 1;
    end;
  end loop;

  -- Werte umhängen (eindeutig ist nur feld_id + datensatz_id, das bleibt gleich).
  update public.eigenes_feld_wert w
     set owner_user_id = m.owner_user_id
    from public.mitarbeiter m
   where m.auth_user_id = w.owner_user_id
     and m.owner_user_id is not null
     and m.owner_user_id <> w.owner_user_id;
  get diagnostics n_werte = row_count;

  raise notice 'B1c: % Felder und % Werte auf den Betrieb umgehaengt, % uebersprungen.', n_felder, n_werte, n_uebersprungen;
end $$;

-- Kontrolle 1: Wie viele Felder und Werte liegen noch bei einem Mitarbeiter? (erwartet 0 / 0)
select 'felder bei mitarbeitern' as was, count(*)::text as wert
from public.eigenes_feld f join public.mitarbeiter m on m.auth_user_id = f.owner_user_id
where m.owner_user_id is not null and m.owner_user_id <> f.owner_user_id
union all
select 'werte bei mitarbeitern', count(*)::text
from public.eigenes_feld_wert w join public.mitarbeiter m on m.auth_user_id = w.owner_user_id
where m.owner_user_id is not null and m.owner_user_id <> w.owner_user_id
union all
-- Kontrolle 2: Die Regel muss Mitarbeitern das Schreiben für den Chef erlauben (mein_chef_id kommt vor).
select 'regel ' || tablename || '.' || policyname,
       case when coalesce(qual, '') ilike '%mein_chef_id%' and coalesce(with_check, qual, '') ilike '%mein_chef_id%'
            then 'ok (mein_chef_id)' else 'PRUEFEN: ' || coalesce(with_check, qual, '-') end
from pg_policies
where schemaname = 'public' and tablename in ('eigenes_feld', 'eigenes_feld_wert');
