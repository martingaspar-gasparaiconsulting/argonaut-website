-- ============================================================
-- ARGONAUT OS · Nachkalkulation · Projektkosten (Material/Fremd)
-- Material- und Fremdkosten je Projekt fuer den echten Deckungsbeitrag
-- (Erbracht - Kosten). Heute von Hand erfasst; das Feld beleg_id ist schon
-- vorgesehen, damit spaeter zugeordnete Belege in DIESELBE Tabelle fliessen
-- koennen (kein Umbau noetig).
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

create table if not exists public.projekt_kosten (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  projekt_id    uuid references public.projekte(id) on delete cascade,
  art           text not null default 'material',   -- material | fremd | sonstige
  bezeichnung   text,
  betrag        numeric(12,2) not null default 0,
  beleg_id      uuid,                                -- optional: spaetere Beleg-Verknuepfung (Weg B)
  datum         date not null default current_date,
  erstellt_am   timestamptz not null default now()
);
create index if not exists projekt_kosten_idx on public.projekt_kosten (owner_user_id, projekt_id);

alter table public.projekt_kosten enable row level security;

drop policy if exists pk_select on public.projekt_kosten;
create policy pk_select on public.projekt_kosten for select to public using ((auth.uid() = owner_user_id));
drop policy if exists pk_select_ma on public.projekt_kosten;
create policy pk_select_ma on public.projekt_kosten for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists pk_insert on public.projekt_kosten;
create policy pk_insert on public.projekt_kosten for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists pk_update on public.projekt_kosten;
create policy pk_update on public.projekt_kosten for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists pk_delete on public.projekt_kosten;
create policy pk_delete on public.projekt_kosten for delete to public using ((auth.uid() = owner_user_id));
