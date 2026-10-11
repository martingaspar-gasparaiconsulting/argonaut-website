-- ============================================================================
-- ARGONAUT OS · Paket 320 (11.10.2026) · Q1 Prüfzertifikat je Charge — Sperre
--
-- Chargen in „Quarantäne" oder „gesperrt" dürfen nicht verwendet werden:
--   · Ausgang (Auslieferung/Auftrag) an einer gesperrten Charge -> abgelehnt
--   · Eingang, dessen Referenz die Chargennummer einer gesperrten Charge
--     desselben Betriebs ist (Rohstoff geht in ein Produkt) -> abgelehnt
-- Bestehende Einträge bleiben unberührt; geprüft wird nur beim Anlegen und
-- wenn Charge, Richtung oder Referenz geändert werden.
--
-- Additiv, mehrfach ausführbar. Keine Spalten, keine Regeln geändert.
-- AUSSPERR-RISIKO: keines — niemand verliert Zugang. Es kann nur keine neue
--   Verwendung für eine gesperrte Charge mehr erfasst werden (gewollt).
-- RÜCKWEG (nur im Notfall):
--   drop trigger if exists p320_verwendung_sperre_trg on public.charge_verwendung;
-- ============================================================================

begin;

create or replace function public.p320_verwendung_sperre()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_owner  uuid;
  v_nr     text;
begin
  if tg_op = 'UPDATE'
     and new.los_id is not distinct from old.los_id
     and new.richtung is not distinct from old.richtung
     and new.referenz is not distinct from old.referenz then
    return new;
  end if;

  select status, owner_user_id, charge_nr into v_status, v_owner, v_nr
    from public.charge_los where id = new.los_id;

  if new.richtung = 'ausgang' and v_status in ('quarantaene', 'gesperrt') then
    raise exception 'Charge % ist % und darf nicht ausgeliefert oder verwendet werden. Erst nach bestandener Pruefung freigeben.',
      v_nr, case v_status when 'quarantaene' then 'in Quarantaene' else 'gesperrt' end
      using errcode = '23514';
  end if;

  if new.richtung = 'eingang' and nullif(btrim(coalesce(new.referenz, '')), '') is not null then
    select l.status, l.charge_nr into v_status, v_nr
      from public.charge_los l
     where l.owner_user_id = coalesce(new.owner_user_id, v_owner)
       and lower(btrim(l.charge_nr)) = lower(btrim(new.referenz))
       and l.status in ('quarantaene', 'gesperrt')
     limit 1;
    if found then
      raise exception 'Rohstoff-Charge % ist % und darf nicht verwendet werden. Erst nach bestandener Wareneingangspruefung freigeben.',
        v_nr, case v_status when 'quarantaene' then 'in Quarantaene' else 'gesperrt' end
        using errcode = '23514';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists p320_verwendung_sperre_trg on public.charge_verwendung;
create trigger p320_verwendung_sperre_trg
  before insert or update on public.charge_verwendung
  for each row execute function public.p320_verwendung_sperre();

commit;

-- KONTROLLE (nur lesen) — Erwartung: 1 | 0
select (select count(*) from pg_trigger where tgname = 'p320_verwendung_sperre_trg') as waechter,
       (select count(*) from public.charge_los where status not in ('freigegeben', 'quarantaene', 'gesperrt', 'verbraucht')) as unbekannter_status;
