-- ============================================================================
-- ARGONAUT OS · Paket 321 (11.10.2026) · R1 Rezeptur in Prozent (Teil 1)
--
--   rezeptur_zutaten + anteil_prozent   Anteil des Rohstoffs in Prozent (0–100)
--                    + ist_rest         „ad 100" — die Zeile bekommt den Rest
--                    + artikel_id       Rohstoff aus dem Lager (Preis, später
--                                       Tausch in allen Rezepten und Charge)
--   rezepturen       + gebinde_menge    Inhalt je Gebinde (Einheit des Ansatzes)
--                    + gebinde_kosten   Verpackung je Gebinde in €
--
-- Neue Rezepturen mit Typ „mischung" rechnen in Prozent; Standard-Ansatz =
-- basis_menge, Verlust = backverlust_prozent (bestehende Spalten).
-- Bestehende Rezepte (Teig, Wurst, Konditor …) bleiben unverändert.
--
-- Wächter: der verknüpfte Artikel muss zum Betrieb der Rezeptur gehören.
-- Additiv, mehrfach ausführbar. Keine Regeln (RLS) geändert.
-- AUSSPERR-RISIKO: keines — nur neue Spalten und ein Wächter.
-- RÜCKWEG (nur im Notfall):
--   drop trigger if exists p321_rezeptur_zutat_waechter_trg on public.rezeptur_zutaten;
-- ============================================================================

begin;

alter table public.rezeptur_zutaten add column if not exists anteil_prozent numeric(9,4);
alter table public.rezeptur_zutaten add column if not exists ist_rest boolean not null default false;
alter table public.rezeptur_zutaten add column if not exists artikel_id uuid references public.artikel(id) on delete set null;

alter table public.rezepturen add column if not exists gebinde_menge  numeric(14,3);
alter table public.rezepturen add column if not exists gebinde_kosten numeric(12,2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p321_anteil_check' and conrelid = 'public.rezeptur_zutaten'::regclass) then
    alter table public.rezeptur_zutaten add constraint p321_anteil_check
      check (anteil_prozent is null or (anteil_prozent >= 0 and anteil_prozent <= 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p321_gebinde_check' and conrelid = 'public.rezepturen'::regclass) then
    alter table public.rezepturen add constraint p321_gebinde_check
      check ((gebinde_menge is null or gebinde_menge > 0) and (gebinde_kosten is null or gebinde_kosten >= 0));
  end if;
end $$;

create index if not exists rezeptur_zutaten_artikel_idx on public.rezeptur_zutaten (artikel_id);

-- ---------------------------------------------------------------- Wächter ---
create or replace function public.p321_rezeptur_zutat_waechter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.artikel_id is not null and (tg_op = 'INSERT' or new.artikel_id is distinct from old.artikel_id) then
    select owner_user_id into v_owner from public.artikel where id = new.artikel_id;
    if v_owner is null or v_owner is distinct from new.owner_user_id then
      raise exception 'Der Artikel gehoert nicht zu diesem Betrieb.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists p321_rezeptur_zutat_waechter_trg on public.rezeptur_zutaten;
create trigger p321_rezeptur_zutat_waechter_trg
  before insert or update on public.rezeptur_zutaten
  for each row execute function public.p321_rezeptur_zutat_waechter();

commit;

-- KONTROLLE (nur lesen) — Erwartung: 5 | 1 | 0
--   typ_sperren = Anzahl CHECK-Regeln auf rezepturen.typ (muss 0 sein, sonst
--   lässt die Datenbank den neuen Typ „mischung" nicht zu — dann Bescheid geben)
select (select count(*) from information_schema.columns where table_schema = 'public'
          and ((table_name = 'rezeptur_zutaten' and column_name in ('anteil_prozent', 'ist_rest', 'artikel_id'))
            or (table_name = 'rezepturen' and column_name in ('gebinde_menge', 'gebinde_kosten')))) as neue_spalten,
       (select count(*) from pg_trigger where tgname = 'p321_rezeptur_zutat_waechter_trg') as waechter,
       (select count(*) from pg_constraint where conrelid = 'public.rezepturen'::regclass and contype = 'c'
          and pg_get_constraintdef(oid) ilike '%typ%' and conname <> 'p321_gebinde_check') as typ_sperren;
