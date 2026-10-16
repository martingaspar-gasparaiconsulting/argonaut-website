-- ============================================================
-- ARGONAUT OS · Paket 396 · MO4 Mengen-Abrechnung
--   mengen_leistung  Leistung je Einheit (Std, km, ha, Tag, m³ …) mit Preis,
--                    Zuschlag, Steuersatz; spaeter Sammelrechnung je Kunde
--
-- ADDITIV UND IDEMPOTENT: eine neue Tabelle mit RLS. Nichts Bestehendes angefasst.
-- RLS: Chef alles. Mitarbeiter: eigene Erfassungen lesen/anlegen und aendern,
-- solange nicht abgerechnet; Abrechnen laeuft ueber die Server-Route (darf abrechnen).
-- ============================================================

create table if not exists public.mengen_leistung (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default coalesce(mein_chef_id(), auth.uid()),
  datum            date not null,
  kontakt_id       uuid,
  empfaenger_name  text,
  bezug_typ        text check (bezug_typ is null or bezug_typ in ('auftrag', 'objekt', 'projekt', 'kunde', 'sonstiges')),
  bezug_id         uuid,
  leistungskatalog_id uuid,
  bezeichnung      text not null check (char_length(btrim(bezeichnung)) between 2 and 300),
  menge            numeric(12,3) not null check (menge > 0 and menge <= 100000),
  einheit          text not null,
  einzelpreis      numeric(12,4) not null default 0 check (einzelpreis >= 0),
  zuschlag_prozent numeric(6,2) not null default 0 check (zuschlag_prozent between 0 and 300),
  mwst_satz        numeric(5,2) not null default 19,
  notiz            text,
  erfasst_von      uuid default auth.uid(),
  erfasst_von_name text,
  abgerechnet      boolean not null default false,
  rechnung_id      uuid references public.rechnungen(id) on delete set null,
  erstellt_am      timestamptz not null default now(),
  constraint mengen_leistung_kunde_chk check (kontakt_id is not null or char_length(btrim(coalesce(empfaenger_name, ''))) > 0)
);
create index if not exists mengen_leistung_offen_idx on public.mengen_leistung (owner_user_id, abgerechnet, datum);
create index if not exists mengen_leistung_rechnung_idx on public.mengen_leistung (rechnung_id);

alter table public.mengen_leistung enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mengen_leistung' and policyname='mengen_leistung_chef') then
    create policy mengen_leistung_chef on public.mengen_leistung for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mengen_leistung' and policyname='mengen_leistung_ma_select') then
    create policy mengen_leistung_ma_select on public.mengen_leistung for select to authenticated
      using (owner_user_id = mein_chef_id() and erfasst_von = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mengen_leistung' and policyname='mengen_leistung_ma_insert') then
    create policy mengen_leistung_ma_insert on public.mengen_leistung for insert to authenticated
      with check (owner_user_id = mein_chef_id() and erfasst_von = auth.uid() and abgerechnet = false and rechnung_id is null);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mengen_leistung' and policyname='mengen_leistung_ma_update') then
    create policy mengen_leistung_ma_update on public.mengen_leistung for update to authenticated
      using (owner_user_id = mein_chef_id() and erfasst_von = auth.uid() and abgerechnet = false)
      with check (owner_user_id = mein_chef_id() and erfasst_von = auth.uid() and abgerechnet = false and rechnung_id is null);
  end if;
end $$;

select (select count(*) from pg_tables where schemaname='public' and tablename='mengen_leistung')
       || '|' || (select count(*) from pg_policies where tablename='mengen_leistung') as kontrolle_1_4;
