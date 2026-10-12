-- ============================================================================
-- ARGONAUT OS · Paket 327 (12.10.2026) · S3b Schalter „nur Gewerbekunden"
--
--   shop_kunde  + nachweis_art      ustid | gewerbe | register
--               + ust_id            Form geprüft (Seite), z. B. DE136695976
--               + nachweis_notiz    was vorgelegt bzw. wann beim BZSt bestätigt
--               + nachweis_ok       geprüft ja/nein
--               + nachweis_geprueft_am / _von   setzt die Datenbank
--
-- Der Schalter selbst steht in modul_einstellung (Modul „shop-b2b",
-- einstellung.nur_gewerbe) — keine neue Spalte. Er wirkt erst nach der
-- Freigabe durch den Anwalt (lib/startSperre „gewerbeNachweis", R49).
--
-- Wächter: „geprüft" nur mit Art und Vermerk (bei USt-IdNr. mit Nummer);
-- wer und wann setzt die Datenbank; eine Änderung am Nachweis mit „geprüft"
-- gilt als neue Prüfung (neuer Zeitpunkt), ohne „geprüft" fällt er weg.
-- Rechte unverändert (Paket 316): pflegen nur die Geschäftsleitung.
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — nur neue Spalten mit Standardwert; solange der
-- Schalter aus ist, ändert sich am Shop nichts.
-- RÜCKWEG (nur im Notfall): die neuen Spalten können bleiben;
--   drop trigger p327_nachweis_trg on public.shop_kunde;
-- ============================================================================

begin;

alter table public.shop_kunde add column if not exists nachweis_art text;
alter table public.shop_kunde add column if not exists ust_id text;
alter table public.shop_kunde add column if not exists nachweis_notiz text;
alter table public.shop_kunde add column if not exists nachweis_ok boolean not null default false;
alter table public.shop_kunde add column if not exists nachweis_geprueft_am timestamptz;
alter table public.shop_kunde add column if not exists nachweis_geprueft_von uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p327_nachweis_check' and conrelid = 'public.shop_kunde'::regclass) then
    alter table public.shop_kunde add constraint p327_nachweis_check check (
      (nachweis_art is null or nachweis_art in ('ustid', 'gewerbe', 'register'))
      and (ust_id is null or ust_id ~ '^[A-Z]{2}[A-Z0-9+*]{2,13}$')
      and (nachweis_notiz is null or char_length(nachweis_notiz) <= 300)
      and (not nachweis_ok or (
        nachweis_art is not null
        and nachweis_notiz is not null and char_length(btrim(nachweis_notiz)) > 0
        and (nachweis_art <> 'ustid' or ust_id is not null)
      ))
    );
  end if;
end $$;

comment on column public.shop_kunde.nachweis_ok is 'Paket 327: Gewerbe geprueft (USt-IdNr./Gewerbeanmeldung/Handelsregister). Wirkt mit Schalter nur_gewerbe nach Freigabe R49.';

create or replace function public.p327_nachweis_waechter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_neu boolean;
begin
  v_neu := tg_op = 'INSERT'
    or new.nachweis_art is distinct from old.nachweis_art
    or new.ust_id is distinct from old.ust_id
    or new.nachweis_notiz is distinct from old.nachweis_notiz;

  if new.nachweis_ok and (tg_op = 'INSERT' or v_neu or not old.nachweis_ok) then
    -- neu bestätigt (oder Nachweis geändert und im selben Schritt bestätigt)
    new.nachweis_geprueft_am := now();
    new.nachweis_geprueft_von := auth.uid();
  elsif not new.nachweis_ok then
    new.nachweis_geprueft_am := null;
    new.nachweis_geprueft_von := null;
  else
    new.nachweis_geprueft_am := old.nachweis_geprueft_am;
    new.nachweis_geprueft_von := old.nachweis_geprueft_von;
  end if;
  return new;
end $$;

drop trigger if exists p327_nachweis_trg on public.shop_kunde;
create trigger p327_nachweis_trg before insert or update on public.shop_kunde
  for each row execute function public.p327_nachweis_waechter();

commit;

-- KONTROLLE (nur lesen) — Erwartung: 6 | 1 | 1
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'shop_kunde'
          and column_name in ('nachweis_art', 'ust_id', 'nachweis_notiz', 'nachweis_ok', 'nachweis_geprueft_am', 'nachweis_geprueft_von')) as spalten,
       (select count(*) from pg_constraint where conname = 'p327_nachweis_check') as pruefung,
       (select count(*) from pg_trigger where tgname = 'p327_nachweis_trg') as waechter;
