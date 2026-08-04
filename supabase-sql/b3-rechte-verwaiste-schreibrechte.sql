-- ============================================================================
-- B3 · Verwaiste Schreibrechte aufräumen (mitarbeiter_rechte)
--
-- „Verwaiste Schreibberechtigung" = ein Key in schreib_module (Ändern), der
-- NICHT in module (Sicht) steht -> Schreibrecht ohne Sicht = wirkungslos.
-- Die Rechte-Seite filtert das beim Speichern bereits (schreibSauber), neue
-- entstehen also nicht mehr über die Oberfläche. Hier: Alt-Zeilen bereinigen
-- + DB-Geländer, damit es auf KEINEM Weg wieder entstehen kann.
--
-- Idempotent, nicht destruktiv: es werden ausschließlich wirkungslose
-- Schreibrechte entfernt, niemals gültige Sicht- oder Schreibrechte.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SCHRITT 1 · VORSCHAU (nur ansehen — ändert nichts)
-- Zeigt alle Zeilen mit verwaisten Schreibrechten und welche Keys betroffen sind.
-- ---------------------------------------------------------------------------
select
  mitarbeiter_id,
  module,
  schreib_module,
  array(
    select k
    from unnest(schreib_module) as k
    where not (k = any(coalesce(module, '{}'::text[])))
  ) as verwaiste_schreibrechte
from public.mitarbeiter_rechte
where exists (
  select 1 from unnest(schreib_module) as k
  where not (k = any(coalesce(module, '{}'::text[])))
);

-- ---------------------------------------------------------------------------
-- SCHRITT 2 · AUFRÄUMEN + PRÜFUNG (idempotent)
-- ---------------------------------------------------------------------------

-- 2a) Bestehende Zeilen bereinigen: schreib_module ⊆ module.
update public.mitarbeiter_rechte
set schreib_module = coalesce((
      select array_agg(k order by k)
      from unnest(schreib_module) as k
      where k = any(coalesce(module, '{}'::text[]))
    ), '{}'::text[]),
    updated_at = now()
where exists (
  select 1 from unnest(schreib_module) as k
  where not (k = any(coalesce(module, '{}'::text[])))
);

-- 2b) DB-Geländer: kein Schreibrecht ohne passende Sicht kann je gespeichert
--     werden. Der Trigger schneidet schreib_module bei jedem INSERT/UPDATE auf
--     die in module vorhandenen Keys zusammen — belt & suspenders zur UI.
create or replace function public.fn_rechte_schreib_konsistent()
returns trigger
language plpgsql
as $$
begin
  new.schreib_module := coalesce((
    select array_agg(k order by k)
    from unnest(coalesce(new.schreib_module, '{}'::text[])) as k
    where k = any(coalesce(new.module, '{}'::text[]))
  ), '{}'::text[]);
  return new;
end;
$$;

drop trigger if exists trg_rechte_schreib_konsistent on public.mitarbeiter_rechte;
create trigger trg_rechte_schreib_konsistent
  before insert or update on public.mitarbeiter_rechte
  for each row
  execute function public.fn_rechte_schreib_konsistent();
