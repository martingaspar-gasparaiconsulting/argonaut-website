-- ============================================================
-- ARGONAUT OS · Paket G, Punkte G10, G12, G14 (26.09.2026)
-- Additiv · idempotent · nichts wird gelöscht, keine Regel geändert.
-- (G9, G11 und G13 brauchen kein SQL.)
-- ============================================================

-- G10 · Anlagen: Tag des Verkaufs bzw. der Ausmusterung.
-- Die AfA läuft nur bis zum Abgangsmonat, danach zählt der Restbuchwert.
alter table public.anlagegueter
  add column if not exists abgang_am date;

-- G14 · Förder-Angebot: eigene Leistungsbeschreibung des Betriebs
-- (ersetzt den fest eingebauten ARGONAUT-Text im PDF).
alter table public.foerder_angebote
  add column if not exists leistungsbeschreibung text;

-- G12 · Bau & LV: Positionen eines abgerechneten LV sind gesperrt.
-- Gesperrt ist ein LV, solange seine Rechnung existiert und nicht storniert
-- ist. Die Funktion läuft mit den Rechten des Eigentümers (security definer),
-- damit auch Mitarbeiter-Sitzungen, die keine Rechnungen lesen dürfen,
-- zuverlässig geprüft werden.
create or replace function public.bau_lv_positionen_sperre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lv uuid;
  v_gesperrt boolean;
begin
  if tg_op = 'DELETE' then
    v_lv := old.lv_id;
  else
    v_lv := new.lv_id;
  end if;

  select exists (
    select 1
    from public.bau_lv l
    join public.rechnungen r on r.id = l.rechnung_id
    where l.id = v_lv
      and coalesce(r.zahlungsstatus, '') <> 'storniert'
  ) into v_gesperrt;

  -- Beim Ändern auch das bisherige LV prüfen (Position umhängen).
  if not v_gesperrt and tg_op = 'UPDATE' and old.lv_id is distinct from new.lv_id then
    select exists (
      select 1
      from public.bau_lv l
      join public.rechnungen r on r.id = l.rechnung_id
      where l.id = old.lv_id
        and coalesce(r.zahlungsstatus, '') <> 'storniert'
    ) into v_gesperrt;
  end if;

  if v_gesperrt then
    raise exception 'Dieses LV ist bereits abgerechnet - Positionen sind gesperrt. Mehraufwand bitte als Nachtrag mit eigener Rechnung.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'bau_lv_positionen_sperre_trg'
      and tgrelid = 'public.bau_lv_positionen'::regclass
  ) then
    create trigger bau_lv_positionen_sperre_trg
      before insert or update or delete on public.bau_lv_positionen
      for each row execute function public.bau_lv_positionen_sperre();
  end if;
end $$;

-- Kontrolle: 2 Spalten + 1 Trigger
select 'spalte' as art, table_name || '.' || column_name as name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'anlagegueter' and column_name = 'abgang_am')
    or (table_name = 'foerder_angebote' and column_name = 'leistungsbeschreibung'))
union all
select 'trigger', tgname::text
from pg_trigger
where tgname = 'bau_lv_positionen_sperre_trg';
