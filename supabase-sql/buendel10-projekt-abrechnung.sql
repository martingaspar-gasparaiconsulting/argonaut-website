-- ============================================================
-- ARGONAUT OS · Bündel 10 · Projekt-Abrechnung (billable)
-- Abrechenbare Leistungen/Zeiten je Projekt. Aus den offenen Posten entsteht
-- über /api/rechnung-aus-projekt eine echte Rechnung (bestehende Pipeline).
-- Nicht-brechend · idempotent · RLS wie die übrigen Module.
-- ============================================================

create table if not exists public.projektleistungen (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  projekt_id    uuid references public.projekte(id) on delete set null,
  kunde_name    text,
  datum         date not null default current_date,
  beschreibung  text not null,
  stunden       numeric(12,2) not null default 0,
  stundensatz   numeric(12,2) not null default 0,
  mwst_satz     numeric(5,2) not null default 19,
  abgerechnet   boolean not null default false,
  rechnung_id   uuid,
  erstellt_am   timestamptz not null default now()
);
create index if not exists projektleistungen_idx on public.projektleistungen (owner_user_id, projekt_id, abgerechnet);

alter table public.projektleistungen enable row level security;

drop policy if exists pl_select on public.projektleistungen;
create policy pl_select on public.projektleistungen for select to public using ((auth.uid() = owner_user_id));
drop policy if exists pl_select_ma on public.projektleistungen;
create policy pl_select_ma on public.projektleistungen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists pl_insert on public.projektleistungen;
create policy pl_insert on public.projektleistungen for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists pl_update on public.projektleistungen;
create policy pl_update on public.projektleistungen for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists pl_delete on public.projektleistungen;
create policy pl_delete on public.projektleistungen for delete to public using ((auth.uid() = owner_user_id));
