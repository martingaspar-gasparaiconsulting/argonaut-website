-- ============================================================
-- ARGONAUT OS · Paket 167 (29.09.2026) · Ablauf-Bausteine: Ergebnisse
--
--   ablauf_ergebnisse  Entwuerfe (KI-Baustein) und PDFs (PDF erstellen) aus Ablaeufen
--   Speicher "ablauf-dateien"  privater Ordner fuer die PDFs, je Betrieb ein Unterordner
--
-- NEU, sonst nichts. Mehrfach ausfuehrbar. Sperrt niemanden aus.
-- Nur die Geschaeftsleitung sieht die Ergebnisse (Entwuerfe koennen Kundendaten
-- enthalten). Mitarbeiter: kein Zugriff. Loeschen: nicht vorgesehen (Status
-- "erledigt"/"verworfen" statt Loeschen).
-- ============================================================

create table if not exists public.ablauf_ergebnisse (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  lauf_id       uuid references public.ablauf_laeufe(id) on delete set null,
  ablauf_id     uuid references public.ablaeufe(id) on delete set null,
  ablauf_name   text,
  art           text not null check (art in ('entwurf', 'pdf')),
  titel         text not null default '',
  inhalt        text,
  datei_pfad    text,
  ziel_typ      text,
  ziel_id       uuid,
  status        text not null default 'offen' check (status in ('offen', 'erledigt', 'verworfen')),
  erstellt_am   timestamptz not null default now(),
  erledigt_am   timestamptz
);
create index if not exists ablauf_ergebnisse_owner_idx on public.ablauf_ergebnisse (owner_user_id, erstellt_am desc);

alter table public.ablauf_ergebnisse enable row level security;

drop policy if exists able_chef_select on public.ablauf_ergebnisse;
create policy able_chef_select on public.ablauf_ergebnisse for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists able_chef_insert on public.ablauf_ergebnisse;
create policy able_chef_insert on public.ablauf_ergebnisse for insert to authenticated with check (owner_user_id = auth.uid());
drop policy if exists able_chef_update on public.ablauf_ergebnisse;
create policy able_chef_update on public.ablauf_ergebnisse for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

-- Privater Speicher fuer die PDFs (10 MB je Datei, nur PDF)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ablauf-dateien', 'ablauf-dateien', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

-- Nur die Geschaeftsleitung, nur im eigenen Ordner <betrieb>/...
drop policy if exists ablauf_dateien_select on storage.objects;
create policy ablauf_dateien_select on storage.objects for select to authenticated using (
  bucket_id = 'ablauf-dateien' and (storage.foldername(name))[1] = auth.uid()::text and public.mein_chef_id() is null
);
drop policy if exists ablauf_dateien_insert on storage.objects;
create policy ablauf_dateien_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'ablauf-dateien' and (storage.foldername(name))[1] = auth.uid()::text and public.mein_chef_id() is null
);
drop policy if exists ablauf_dateien_delete on storage.objects;
create policy ablauf_dateien_delete on storage.objects for delete to authenticated using (
  bucket_id = 'ablauf-dateien' and (storage.foldername(name))[1] = auth.uid()::text and public.mein_chef_id() is null
);

-- Kontrolle: erwartet 14 | 3 | 1 | 3
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'ablauf_ergebnisse') as spalten,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'ablauf_ergebnisse') as regeln,
  (select count(*) from storage.buckets where id = 'ablauf-dateien') as speicher,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'ablauf_dateien_%') as speicher_regeln;
