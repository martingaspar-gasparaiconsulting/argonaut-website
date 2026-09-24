-- ============================================================
-- ARGONAUT OS · Paket PN · Kunden-Portal plus (B26) — Stand 24.09.2026
--   portal_projekt     welches Projekt ein Kunde im Portal sehen darf
--   portal_meldung     Baufortschritt-Nachrichten an den Kunden (optional mit %)
--   portal_dokument    Dateien fuer den Kunden (Bucket portal-dokumente, privat)
--   portal_freigabe    der Kunde gibt frei oder lehnt ab (Name + Zeitpunkt)
--   baustellen_fotos.fuer_kunde   nur angehakte Fotos erscheinen im Portal
--
-- ADDITIV UND IDEMPOTENT: vier neue Tabellen, eine neue Spalte (Standard
-- false -> bisher ist NICHTS fuer Kunden sichtbar), ein neuer Bucket.
-- Das bestehende Portal (portal_zugaenge, /api/oeffentlich/portal) bleibt unberuehrt.
-- Nach aussen liest NUR /api/oeffentlich/portal/baustelle (Service-Key,
-- hart auf Betrieb + Kontakt aus dem Token gefiltert).
-- RLS: Chef alles; Mitarbeiter lesen (Freigaben, Meldungen, Projekte, Dokumente).
-- ============================================================

alter table public.baustellen_fotos add column if not exists fuer_kunde boolean not null default false;

create table if not exists public.portal_projekt (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  kontakt_id    uuid not null references public.kontakte(id) on delete cascade,
  projekt_id    uuid not null references public.projekte(id) on delete cascade,
  erstellt_am   timestamptz not null default now()
);
create unique index if not exists portal_projekt_uidx on public.portal_projekt (kontakt_id, projekt_id);

create table if not exists public.portal_meldung (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  kontakt_id    uuid not null references public.kontakte(id) on delete cascade,
  projekt_id    uuid references public.projekte(id) on delete set null,
  text          text not null,
  fortschritt   integer check (fortschritt is null or (fortschritt between 0 and 100)),
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now()
);
create index if not exists portal_meldung_kontakt_idx on public.portal_meldung (owner_user_id, kontakt_id, erstellt_am desc);

create table if not exists public.portal_dokument (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  kontakt_id    uuid not null references public.kontakte(id) on delete cascade,
  projekt_id    uuid references public.projekte(id) on delete set null,
  titel         text not null,
  dateiname     text,
  pfad          text not null,
  groesse       bigint,
  erstellt_am   timestamptz not null default now()
);
create index if not exists portal_dokument_kontakt_idx on public.portal_dokument (owner_user_id, kontakt_id);

create table if not exists public.portal_freigabe (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(mein_chef_id(), auth.uid()),
  kontakt_id        uuid not null references public.kontakte(id) on delete cascade,
  projekt_id        uuid references public.projekte(id) on delete set null,
  titel             text not null,
  text              text not null,
  frist             date,
  status            text not null default 'offen' check (status in ('offen', 'freigegeben', 'abgelehnt', 'zurueckgezogen')),
  antwort_name      text,
  antwort_kommentar text,
  beantwortet_am    timestamptz,
  erstellt_von      uuid default auth.uid(),
  erstellt_am       timestamptz not null default now()
);
create index if not exists portal_freigabe_kontakt_idx on public.portal_freigabe (owner_user_id, kontakt_id, status);

alter table public.portal_projekt enable row level security;
alter table public.portal_meldung enable row level security;
alter table public.portal_dokument enable row level security;
alter table public.portal_freigabe enable row level security;

do $$
declare t text;
begin
  foreach t in array array['portal_projekt', 'portal_meldung', 'portal_dokument', 'portal_freigabe'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || '_chef') then
      execute format('create policy %I on public.%I for all to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid())', t || '_chef', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || '_ma_select') then
      execute format('create policy %I on public.%I for select to authenticated using (owner_user_id = mein_chef_id())', t || '_ma_select', t);
    end if;
  end loop;
end $$;

-- Speicher: privater Bucket, erster Ordner = Betrieb. Hochladen/Loeschen nur Chef.
insert into storage.buckets (id, name, public)
values ('portal-dokumente', 'portal-dokumente', false)
on conflict (id) do nothing;

drop policy if exists portal_dok_select on storage.objects;
create policy portal_dok_select on storage.objects for select to authenticated
  using (bucket_id = 'portal-dokumente' and (storage.foldername(name))[1] = coalesce(mein_chef_id(), auth.uid())::text);
drop policy if exists portal_dok_insert on storage.objects;
create policy portal_dok_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'portal-dokumente' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists portal_dok_delete on storage.objects;
create policy portal_dok_delete on storage.objects for delete to authenticated
  using (bucket_id = 'portal-dokumente' and (storage.foldername(name))[1] = auth.uid()::text);

-- Fotos fuer Kunden freigeben: der Chef darf fuer_kunde an seinen Fotos setzen.
-- (btb/bfo-Regeln aus R2 bleiben; hier nur pruefen, ob eine Update-Regel existiert.)
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='baustellen_fotos' and cmd='UPDATE') then
    create policy bfo_update_chef on public.baustellen_fotos for update to authenticated
      using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
  end if;
end $$;

select tablename, count(*) as regeln
  from pg_policies
 where schemaname = 'public'
   and tablename in ('portal_projekt', 'portal_meldung', 'portal_dokument', 'portal_freigabe', 'baustellen_fotos')
 group by tablename
 order by tablename;
