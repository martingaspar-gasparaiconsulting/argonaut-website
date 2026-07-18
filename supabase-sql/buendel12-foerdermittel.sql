-- ============================================================
-- ARGONAUT OS · Bündel 12 · Fördermittel-Assistent
-- Merkliste der verfolgten Förderprogramme je Betrieb — mit Status,
-- Frist und Notiz. Der Programm-Katalog selbst liegt statisch im Code
-- (app/dashboard/foerdermittel/programme.ts); hier wird nur gespeichert,
-- WELCHES Programm der Betrieb verfolgt und wie weit er ist.
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

create table if not exists public.foerder_vorhaben (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  programm_key   text not null,                 -- Schluessel aus dem Katalog
  programm_name  text not null,                 -- Name (Kopie, falls Katalog sich aendert)
  status         text not null default 'interessiert',
  -- interessiert | beantragt | bewilligt | abgelehnt | abgeschlossen
  frist          date,                          -- naechste relevante Frist (optional)
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists foerder_vorhaben_idx on public.foerder_vorhaben (owner_user_id, status);
-- Pro Betrieb ein Eintrag je Programm (kein Doppel).
create unique index if not exists foerder_vorhaben_uidx on public.foerder_vorhaben (owner_user_id, programm_key);

alter table public.foerder_vorhaben enable row level security;

drop policy if exists fv_select on public.foerder_vorhaben;
create policy fv_select on public.foerder_vorhaben for select to public using ((auth.uid() = owner_user_id));
drop policy if exists fv_select_ma on public.foerder_vorhaben;
create policy fv_select_ma on public.foerder_vorhaben for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists fv_insert on public.foerder_vorhaben;
create policy fv_insert on public.foerder_vorhaben for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists fv_update on public.foerder_vorhaben;
create policy fv_update on public.foerder_vorhaben for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists fv_delete on public.foerder_vorhaben;
create policy fv_delete on public.foerder_vorhaben for delete to public using ((auth.uid() = owner_user_id));
