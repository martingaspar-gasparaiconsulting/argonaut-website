-- ============================================================
-- ARGONAUT OS · Paket PB · Einkauf dicht — Stand 24.09.2026
--   B02 Rechnungs-Abgleich: Beleg merkt sich seine Bestellung
--   B28 Material-Abruf: Monteur fordert Material vom Einsatz an
--
-- ADDITIV UND IDEMPOTENT: eine neue Spalte (nullable), eine neue Tabelle.
-- Bestehende Zeilen werden nicht angefasst. Beliebig oft ausfuehrbar.
-- Bewusst OHNE Fremdschluessel auf bestellung/einsaetze: ein geloeschter
-- Einsatz oder eine geloeschte Bestellung soll hier nichts mitreissen.
-- ============================================================

-- B02 ------------------------------------------------------------------
alter table public.eingangsbelege add column if not exists bestellung_id uuid;
create index if not exists idx_eingangsbelege_bestellung on public.eingangsbelege (bestellung_id);

-- B28 ------------------------------------------------------------------
create table if not exists public.material_abruf (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null,              -- der Betrieb (Chef)
  angefordert_von  uuid not null,              -- eingeloggter Monteur
  mitarbeiter_name text,
  einsatz_id       uuid,
  einsatz_titel    text,
  bezeichnung      text not null,
  menge            numeric(14,3) not null check (menge > 0),
  einheit          text,
  benoetigt_bis    date,
  notiz            text,
  status           text not null default 'angefordert'
                   check (status in ('angefordert', 'bestellt', 'bereit', 'erledigt', 'abgelehnt')),
  antwort          text,
  erstellt_am      timestamptz not null default now(),
  geaendert_am     timestamptz
);

create index if not exists material_abruf_owner_status_idx on public.material_abruf (owner_user_id, status, benoetigt_bis);
create index if not exists material_abruf_einsatz_idx on public.material_abruf (einsatz_id);

alter table public.material_abruf enable row level security;

do $$
begin
  -- Chef: alles im eigenen Betrieb
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'material_abruf' and policyname = 'material_abruf_chef') then
    create policy material_abruf_chef on public.material_abruf
      for all to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
  -- Monteur: nur SEINE eigenen Anforderungen sehen ...
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'material_abruf' and policyname = 'material_abruf_ma_select') then
    create policy material_abruf_ma_select on public.material_abruf
      for select to authenticated
      using (owner_user_id = mein_chef_id() and angefordert_von = auth.uid());
  end if;
  -- ... und neue anlegen, nur fuer den eigenen Betrieb und nur als er selbst.
  -- Kein update/delete fuer Monteure: den Status setzt das Buero.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'material_abruf' and policyname = 'material_abruf_ma_insert') then
    create policy material_abruf_ma_insert on public.material_abruf
      for insert to authenticated
      with check (owner_user_id = mein_chef_id() and angefordert_von = auth.uid() and status = 'angefordert');
  end if;
end $$;

-- Kontrolle: zwei Zeilen erwartet (bestellung_id | uuid und material_abruf | true)
select 'bestellung_id' as was, data_type as ergebnis from information_schema.columns
 where table_schema = 'public' and table_name = 'eingangsbelege' and column_name = 'bestellung_id'
union all
select 'material_abruf', rowsecurity::text from pg_tables where schemaname = 'public' and tablename = 'material_abruf';
