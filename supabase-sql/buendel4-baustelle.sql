-- ============================================================
-- ARGONAUT OS · Bündel 4 · Bau & Handwerk Teil 2 — Baustellen-Doku
-- 1) bautagebuch      — Tages-/Regieberichte je Projekt
-- 2) baustellen_fotos — Fotos je Bautagebuch-Eintrag
-- 3) maengel          — Mängel- & Abnahmemanagement je Projekt
-- + privater Storage-Bucket 'baustellen-fotos' (Owner-Ordner-Prinzip)
-- Nicht-brechend · idempotent · RLS wie die übrigen Module.
-- ============================================================

-- 1) Bautagebuch / Regieberichte -------------------------------------------
create table if not exists public.bautagebuch (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  projekt_id    uuid references public.projekte(id) on delete set null,
  datum         date not null default current_date,
  wetter        text,
  temperatur    text,
  anwesende     text,
  arbeiten      text,
  material      text,
  vorkommnisse  text,
  erstellt_von  uuid,
  erstellt_am   timestamptz not null default now()
);
create index if not exists bautagebuch_projekt_idx on public.bautagebuch (projekt_id, datum desc);

-- 2) Fotos je Eintrag -------------------------------------------------------
create table if not exists public.baustellen_fotos (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  bautagebuch_id uuid references public.bautagebuch(id) on delete cascade,
  pfad           text not null,
  dateiname      text,
  erstellt_am    timestamptz not null default now()
);
create index if not exists baustellen_fotos_eintrag_idx on public.baustellen_fotos (bautagebuch_id);

-- 3) Mängel- & Abnahmemanagement -------------------------------------------
create table if not exists public.maengel (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  projekt_id    uuid references public.projekte(id) on delete set null,
  titel         text not null,
  beschreibung  text,
  status        text not null default 'offen',   -- offen | in_arbeit | behoben | abgenommen
  frist         date,
  foto_pfad     text,
  erstellt_am   timestamptz not null default now(),
  erledigt_am   timestamptz
);
create index if not exists maengel_projekt_idx on public.maengel (projekt_id, status);

-- ===== RLS: Chef pflegt seine, Mitarbeiter sieht die des Chefs =============
alter table public.bautagebuch enable row level security;
alter table public.baustellen_fotos enable row level security;
alter table public.maengel enable row level security;

-- bautagebuch
drop policy if exists btb_select on public.bautagebuch;
create policy btb_select on public.bautagebuch for select to public using ((auth.uid() = owner_user_id));
drop policy if exists btb_select_ma on public.bautagebuch;
create policy btb_select_ma on public.bautagebuch for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists btb_insert on public.bautagebuch;
create policy btb_insert on public.bautagebuch for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists btb_update on public.bautagebuch;
create policy btb_update on public.bautagebuch for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists btb_delete on public.bautagebuch;
create policy btb_delete on public.bautagebuch for delete to public using ((auth.uid() = owner_user_id));

-- baustellen_fotos
drop policy if exists bfo_select on public.baustellen_fotos;
create policy bfo_select on public.baustellen_fotos for select to public using ((auth.uid() = owner_user_id));
drop policy if exists bfo_select_ma on public.baustellen_fotos;
create policy bfo_select_ma on public.baustellen_fotos for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists bfo_insert on public.baustellen_fotos;
create policy bfo_insert on public.baustellen_fotos for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists bfo_delete on public.baustellen_fotos;
create policy bfo_delete on public.baustellen_fotos for delete to public using ((auth.uid() = owner_user_id));

-- maengel
drop policy if exists mgl_select on public.maengel;
create policy mgl_select on public.maengel for select to public using ((auth.uid() = owner_user_id));
drop policy if exists mgl_select_ma on public.maengel;
create policy mgl_select_ma on public.maengel for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists mgl_insert on public.maengel;
create policy mgl_insert on public.maengel for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists mgl_update on public.maengel;
create policy mgl_update on public.maengel for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists mgl_delete on public.maengel;
create policy mgl_delete on public.maengel for delete to public using ((auth.uid() = owner_user_id));

-- ===== Storage-Bucket für Baustellen-Fotos (privat) ========================
insert into storage.buckets (id, name, public)
values ('baustellen-fotos', 'baustellen-fotos', false)
on conflict (id) do nothing;

-- Owner-Ordner-Prinzip: der erste Pfad-Abschnitt ist die User-ID.
drop policy if exists baustellen_fotos_select on storage.objects;
create policy baustellen_fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'baustellen-fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists baustellen_fotos_insert on storage.objects;
create policy baustellen_fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'baustellen-fotos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists baustellen_fotos_delete on storage.objects;
create policy baustellen_fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'baustellen-fotos' and (storage.foldername(name))[1] = auth.uid()::text);
