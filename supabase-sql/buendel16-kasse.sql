-- ============================================================
-- ARGONAUT OS · Bündel 16 · Kasse mit TSE
-- Fiskalkonforme Kasse: Belege (Bons) + Positionen. Die TSE-Signatur kommt
-- über den Konnektor (Bündel 15) — im Demo-Modus eine Demo-Signatur, mit
-- echtem Anbieter (fiskaly/Deutsche Fiskal/Epson) die echte TSE-Signatur.
-- Bestand wird beim Verkauf aus dem ERP (artikel) abgebucht (+ lagerbewegung).
-- Nicht-brechend · idempotent · RLS (Chef + Kassierer/Mitarbeiter).
-- ============================================================

create table if not exists public.kassen_belege (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  beleg_nr       text,
  typ            text not null default 'verkauf',   -- verkauf | retoure
  zahlart        text not null default 'bar',        -- bar | karte | ec | ueberweisung
  netto_summe    numeric(12,2) not null default 0,
  mwst_summe     numeric(12,2) not null default 0,
  brutto_summe   numeric(12,2) not null default 0,
  gegeben        numeric(12,2),
  rueckgeld      numeric(12,2),
  -- TSE-Felder (aus dem Konnektor)
  tse_modus      text not null default 'demo',       -- demo | live
  tse_anbieter   text,
  tse_signatur   text,
  tse_seriennummer text,
  tse_zeit       timestamptz,
  storniert      boolean not null default false,
  kassierer_id   uuid,
  erstellt_am    timestamptz not null default now()
);
create index if not exists kassen_belege_idx on public.kassen_belege (owner_user_id, erstellt_am desc);

create table if not exists public.kassen_positionen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  beleg_id      uuid not null references public.kassen_belege(id) on delete cascade,
  position      integer not null default 1,
  artikel_id    uuid references public.artikel(id) on delete set null,
  bezeichnung   text not null default '',
  menge         numeric(12,2) not null default 1,
  einzelpreis   numeric(12,2) not null default 0,   -- BRUTTO je Einheit (Kassen-Übung)
  mwst_satz     numeric(5,2) not null default 19,
  gesamt_brutto numeric(12,2) not null default 0
);
create index if not exists kassen_positionen_idx on public.kassen_positionen (beleg_id, position);

alter table public.kassen_belege enable row level security;
alter table public.kassen_positionen enable row level security;

-- Belege: Chef voll; Mitarbeiter (Kassierer) dürfen lesen + anlegen.
drop policy if exists kb_owner_all on public.kassen_belege;
create policy kb_owner_all on public.kassen_belege for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kb_select_ma on public.kassen_belege;
create policy kb_select_ma on public.kassen_belege for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kb_insert_ma on public.kassen_belege;
create policy kb_insert_ma on public.kassen_belege for insert to public with check ((owner_user_id = mein_chef_id()));

-- Positionen: analog.
drop policy if exists kp_owner_all on public.kassen_positionen;
create policy kp_owner_all on public.kassen_positionen for all to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kp_select_ma on public.kassen_positionen;
create policy kp_select_ma on public.kassen_positionen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kp_insert_ma on public.kassen_positionen;
create policy kp_insert_ma on public.kassen_positionen for insert to public with check ((owner_user_id = mein_chef_id()));
