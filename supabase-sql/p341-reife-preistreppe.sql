-- ============================================================
-- ARGONAUT OS · Paket 341 (12.10.2026) · BV3a Manufaktur Teil 3
-- Preis-Treppe nach Reife und Mindesthaltbarkeit (MHD)
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- reife_charge + mhd:         Mindesthaltbarkeitsdatum der Charge (darf
--                             nicht vor dem Start der Reifung liegen).
-- reife_kalk + preis_treppe:  Reife-Stufen [{ab_tag, aufschlag}] (höchstens 8)
--            + mhd_treppe:    MHD-Stufen [{tage_vor, abschlag}] (höchstens 6)
--
-- Die Stufen liegen bei der Kalkulation (Paket 340): sehen und ändern nur
-- Geschäftsleitung und Mitarbeiter mit „Darf abrechnen". Keine neuen Regeln
-- nötig — die Regeln aus Paket 339/340 gelten für die neuen Spalten mit.
-- ============================================================

alter table public.reife_charge add column if not exists mhd date;
alter table public.reife_kalk add column if not exists preis_treppe jsonb not null default '[]'::jsonb;
alter table public.reife_kalk add column if not exists mhd_treppe jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reife_charge_mhd_ck') then
    alter table public.reife_charge add constraint reife_charge_mhd_ck check (mhd is null or mhd >= start_datum);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reife_kalk_treppe_ck') then
    alter table public.reife_kalk add constraint reife_kalk_treppe_ck check (
      jsonb_typeof(preis_treppe) = 'array' and jsonb_array_length(preis_treppe) <= 8
      and jsonb_typeof(mhd_treppe) = 'array' and jsonb_array_length(mhd_treppe) <= 6
    );
  end if;
end $$;

-- KONTROLLE — Erwartung: spalten = 3 | pruefungen = 2
select
  (select count(*) from information_schema.columns where table_schema = 'public'
     and ((table_name = 'reife_charge' and column_name = 'mhd')
       or (table_name = 'reife_kalk' and column_name in ('preis_treppe', 'mhd_treppe')))) as spalten,
  (select count(*) from pg_constraint where conname in ('reife_charge_mhd_ck', 'reife_kalk_treppe_ck')) as pruefungen;
