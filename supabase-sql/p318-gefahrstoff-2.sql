-- ============================================================================
-- ARGONAUT OS · Paket 318 (11.10.2026) · G2a Gefahrstoffverzeichnis 2.0 (Teil 1)
--
--   gefahrstoff  + artikel_id     Verknüpfung Stoff ↔ Artikel (Menge aus dem Lager,
--                                 Sicherheitsdatenblatt aus den Produkt-Dokumenten)
--                + lagerklasse    Lagerklasse nach TRGS 510 (nur Feld, keine Ampel)
--                + lagerplatz     wo der Stoff steht (für den QR-Aushang in Teil 2)
--                + sdb_pfad/_name/_bytes  eigene SDB-Datei für Stoffe ohne Artikel
--                                 (z. B. Reinigungsmittel im Eigenverbrauch)
--   Speicher „gefahrstoff-sdb" (privat, nur PDF, 20 MB)
--
-- Befund (Claude, 11.10.): Besitzer-Vorgabe war auth.uid() statt
-- coalesce(mein_chef_id(), auth.uid()) — jetzt wie überall. Mitarbeiter lesen
-- das Verzeichnis weiter OHNE Modul-Prüfung — das ist gewollt: § 6 und § 14
-- GefStoffV verlangen, dass Beschäftigte Verzeichnis, Sicherheitsdatenblatt
-- und Betriebsanweisung einsehen können.
--
-- Wächter in der Datenbank:
--   · der verknüpfte Artikel muss zum Betrieb gehören
--   · die SDB-Datei muss im Ordner <Betrieb>/<Stoff>/ liegen
--   · Besitzer eines Stoffs ist danach fest
--
-- Rechte: unverändert — Chef pflegt, Mitarbeiter lesen. Die SDB-Datei öffnen
-- alle über den Server (/api/gefahrstoff/sdb, 60-Sekunden-Link), im Speicher
-- selbst darf nur der Chef lesen, hochladen und löschen.
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — nur neue Spalten, ein Wächter, ein neuer Speicher.
--   Bestehende Regeln werden nicht verändert.
-- RÜCKWEG (nur im Notfall): Wächter-Trigger p318_gefahrstoff_waechter_trg
--   löschen; die neuen Spalten stören nicht.
-- ============================================================================

begin;

alter table public.gefahrstoff alter column owner_user_id set default coalesce(public.mein_chef_id(), auth.uid());

alter table public.gefahrstoff add column if not exists artikel_id  uuid references public.artikel(id) on delete set null;
alter table public.gefahrstoff add column if not exists lagerklasse text;
alter table public.gefahrstoff add column if not exists lagerplatz  text;
alter table public.gefahrstoff add column if not exists sdb_pfad    text;
alter table public.gefahrstoff add column if not exists sdb_name    text;
alter table public.gefahrstoff add column if not exists sdb_bytes   integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p318_lagerklasse_check' and conrelid = 'public.gefahrstoff'::regclass) then
    alter table public.gefahrstoff add constraint p318_lagerklasse_check check (
      lagerklasse is null or lagerklasse in ('1', '2A', '2B', '3', '4.1A', '4.1B', '4.2', '4.3', '5.1A', '5.1B', '5.1C', '5.2',
                                             '6.1A', '6.1B', '6.1C', '6.1D', '6.2', '7', '8A', '8B', '10', '11', '12', '13'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p318_angaben_check' and conrelid = 'public.gefahrstoff'::regclass) then
    alter table public.gefahrstoff add constraint p318_angaben_check check (
      (lagerplatz is null or char_length(lagerplatz) between 1 and 80)
      and ((sdb_pfad is null and sdb_name is null and sdb_bytes is null)
        or (sdb_pfad is not null and sdb_name is not null and sdb_bytes is not null
            and char_length(sdb_name) between 1 and 200 and sdb_bytes > 0 and sdb_bytes <= 20971520))
    );
  end if;
end $$;

create index if not exists gefahrstoff_artikel_idx on public.gefahrstoff (artikel_id);
create index if not exists gefahrstoff_platz_idx on public.gefahrstoff (owner_user_id, lagerplatz);

-- ---------------------------------------------------------------- Wächter ---
create or replace function public.p318_gefahrstoff_waechter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artikel_owner uuid;
begin
  if tg_op = 'UPDATE' and new.owner_user_id <> old.owner_user_id then
    raise exception 'Der Betrieb eines Gefahrstoffs ist fest.' using errcode = '42501';
  end if;
  if new.artikel_id is not null and (tg_op = 'INSERT' or new.artikel_id is distinct from old.artikel_id) then
    select owner_user_id into v_artikel_owner from public.artikel where id = new.artikel_id;
    if v_artikel_owner is null or v_artikel_owner <> new.owner_user_id then
      raise exception 'Der Artikel gehoert nicht zu diesem Betrieb.' using errcode = '42501';
    end if;
  end if;
  if new.sdb_pfad is not null and (tg_op = 'INSERT' or new.sdb_pfad is distinct from old.sdb_pfad) then
    if split_part(new.sdb_pfad, '/', 1) <> new.owner_user_id::text
       or split_part(new.sdb_pfad, '/', 2) <> new.id::text
       or split_part(new.sdb_pfad, '/', 3) !~ '^[A-Za-z0-9]+-[a-z0-9._-]+\.pdf$'
       or split_part(new.sdb_pfad, '/', 4) <> ''
       or position('..' in new.sdb_pfad) > 0 then
      raise exception 'Die Datei liegt nicht im Ordner dieses Gefahrstoffs.' using errcode = '42501';
    end if;
  end if;
  if new.lagerplatz is not null then
    new.lagerplatz := nullif(btrim(regexp_replace(new.lagerplatz, '\s+', ' ', 'g')), '');
  end if;
  return new;
end $$;

drop trigger if exists p318_gefahrstoff_waechter_trg on public.gefahrstoff;
create trigger p318_gefahrstoff_waechter_trg
  before insert or update on public.gefahrstoff
  for each row execute function public.p318_gefahrstoff_waechter();

-- ---------------------------------------------------------------- Speicher ---
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gefahrstoff-sdb', 'gefahrstoff-sdb', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists gefahrstoffsdb_select on storage.objects;
create policy gefahrstoffsdb_select on storage.objects for select to authenticated
  using (bucket_id = 'gefahrstoff-sdb' and (storage.foldername(name))[1] = auth.uid()::text and public.mein_chef_id() is null);
drop policy if exists gefahrstoffsdb_insert on storage.objects;
create policy gefahrstoffsdb_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gefahrstoff-sdb' and (storage.foldername(name))[1] = auth.uid()::text and public.mein_chef_id() is null);
drop policy if exists gefahrstoffsdb_delete on storage.objects;
create policy gefahrstoffsdb_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gefahrstoff-sdb' and (storage.foldername(name))[1] = auth.uid()::text and public.mein_chef_id() is null);

commit;

-- KONTROLLE (nur lesen) — Erwartung: 6 | 1 | 2 | 3 | true | true
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'gefahrstoff'
          and column_name in ('artikel_id', 'lagerklasse', 'lagerplatz', 'sdb_pfad', 'sdb_name', 'sdb_bytes')) as neue_spalten,
       (select count(*) from pg_trigger where tgname = 'p318_gefahrstoff_waechter_trg') as waechter,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'gefahrstoff') as regeln,
       (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'gefahrstoffsdb_%') as speicher_regeln,
       (select public = false from storage.buckets where id = 'gefahrstoff-sdb') as ordner_privat,
       (select column_default like '%mein_chef_id%' from information_schema.columns
         where table_schema = 'public' and table_name = 'gefahrstoff' and column_name = 'owner_user_id') as besitzer_betrieb;
