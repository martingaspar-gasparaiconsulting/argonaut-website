-- ============================================================
-- ARGONAUT OS · Bündel 1 · Schritt 1 — GPS-Erfassung für Einsätze
-- Fügt je Phase (Losfahren / Vor Ort / Erledigt) Standort-Spalten hinzu und
-- erweitert einsatz_status_setzen um OPTIONALE Koordinaten.
-- Nicht-brechend (ohne Koordinaten wie bisher) · idempotent (mehrfach ausführbar).
-- Ausgeführt am: 18.07.2026 (Supabase SQL Editor).
-- ============================================================

-- 1) Standort-Spalten (nur anlegen, wenn noch nicht vorhanden)
alter table public.einsaetze add column if not exists unterwegs_lat double precision;
alter table public.einsaetze add column if not exists unterwegs_lon double precision;
alter table public.einsaetze add column if not exists vor_ort_lat  double precision;
alter table public.einsaetze add column if not exists vor_ort_lon  double precision;
alter table public.einsaetze add column if not exists erledigt_lat double precision;
alter table public.einsaetze add column if not exists erledigt_lon double precision;

-- 2) Alte 2-Argument-Version entfernen, damit keine mehrdeutige Überladung entsteht
drop function if exists public.einsatz_status_setzen(uuid, text);

-- 3) Neue Version mit optionalen Koordinaten (Default null = exakt wie bisher)
create or replace function public.einsatz_status_setzen(
  p_einsatz_id uuid,
  p_status text,
  p_lat double precision default null,
  p_lon double precision default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_mid   uuid;
begin
  if p_status not in ('geplant','unterwegs','vor_ort','erledigt','abgesagt') then
    raise exception 'Ungueltiger Status: %', p_status;
  end if;

  select owner_user_id, mitarbeiter_id into v_owner, v_mid
  from einsaetze where id = p_einsatz_id;
  if not found then
    raise exception 'Einsatz nicht gefunden';
  end if;

  -- Erlaubt: Eigentuemer ODER der zugewiesene Monteur
  if not (
    v_owner = v_uid
    or exists (select 1 from mitarbeiter m where m.id = v_mid and m.auth_user_id = v_uid)
  ) then
    raise exception 'Keine Berechtigung fuer diesen Einsatz';
  end if;

  update einsaetze set
    status        = p_status,
    unterwegs_am  = case when p_status = 'unterwegs' and unterwegs_am is null then now()  else unterwegs_am  end,
    unterwegs_lat = case when p_status = 'unterwegs' and unterwegs_am is null then p_lat  else unterwegs_lat end,
    unterwegs_lon = case when p_status = 'unterwegs' and unterwegs_am is null then p_lon  else unterwegs_lon end,
    vor_ort_am    = case when p_status = 'vor_ort'   and vor_ort_am   is null then now()  else vor_ort_am    end,
    vor_ort_lat   = case when p_status = 'vor_ort'   and vor_ort_am   is null then p_lat  else vor_ort_lat   end,
    vor_ort_lon   = case when p_status = 'vor_ort'   and vor_ort_am   is null then p_lon  else vor_ort_lon   end,
    erledigt_am   = case when p_status = 'erledigt'  and erledigt_am  is null then now()  else erledigt_am   end,
    erledigt_lat  = case when p_status = 'erledigt'  and erledigt_am  is null then p_lat  else erledigt_lat  end,
    erledigt_lon  = case when p_status = 'erledigt'  and erledigt_am  is null then p_lon  else erledigt_lon  end
  where id = p_einsatz_id;
end;
$function$;

-- 4) Ausführrecht wieder setzen (geht beim DROP verloren) — nur eingeloggte Nutzer
grant execute on function public.einsatz_status_setzen(uuid, text, double precision, double precision) to authenticated;
