-- ============================================================
-- Q1 · Meine Unterschrift (pro Nutzer, in „Mein Bereich")
-- Eine Zeile je auth.uid(); RLS lässt jeden NUR seine eigene sehen/ändern.
-- Idempotent, nicht destruktiv.
-- ============================================================

create table if not exists public.benutzer_unterschrift (
  auth_user_id uuid primary key,
  bild text,                                  -- Unterschrift als PNG-Data-URL (transparent)
  aktiv boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.benutzer_unterschrift enable row level security;

drop policy if exists eigene_select on public.benutzer_unterschrift;
create policy eigene_select on public.benutzer_unterschrift
  for select using (auth.uid() = auth_user_id);

drop policy if exists eigene_insert on public.benutzer_unterschrift;
create policy eigene_insert on public.benutzer_unterschrift
  for insert with check (auth.uid() = auth_user_id);

drop policy if exists eigene_update on public.benutzer_unterschrift;
create policy eigene_update on public.benutzer_unterschrift
  for update using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);

drop policy if exists eigene_delete on public.benutzer_unterschrift;
create policy eigene_delete on public.benutzer_unterschrift
  for delete using (auth.uid() = auth_user_id);
