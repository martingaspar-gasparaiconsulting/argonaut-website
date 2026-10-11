-- ============================================================================
-- ARGONAUT OS · Paket 315 (11.10.2026) · S1 Produkt-Dokumente am Artikel
--
--   produkt_dokument   PDF je Artikel: Art (Sicherheitsdatenblatt, Technisches
--                      Merkblatt, Leistungserklärung, Konformitätserklärung,
--                      Spezifikation, Zertifikat, Anleitung, Sonstiges),
--                      Sprache, Version, Ausgabe, gültig bis, im Shop ja/nein,
--                      aktuell/ersetzt, Verweis aufs Firmen-Wissen
--   Speicher „produkt-dokumente" (privat, nur PDF, 20 MB)
--
-- Wächter in der Datenbank:
--   · der Artikel muss zum Betrieb gehören, die Datei muss im Ordner
--     <Betrieb>/<Artikel>/ liegen
--   · Artikel, Datei, Betrieb, wer/wann angelegt sind danach fest
--   · neue aktuelle Fassung von SDB, Merkblatt, Leistungserklärung oder
--     Spezifikation in derselben Sprache setzt die alte auf „ersetzt"
--
-- Rechte: Chef alles; Mitarbeiter mit Recht „ERP/Lager" sehen, mit
-- Schreibrecht „ERP/Lager" hochladen und ändern. Löschen nur der Chef.
-- Der Shop liest nur über den Server (aktuell + im Shop + nicht abgelaufen).
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — nur neue Tabelle, neue Funktionen, neuer Speicher.
-- RÜCKWEG (nur im Notfall): drop table public.produkt_dokument; Speicher
--   „produkt-dokumente" im Dashboard leeren und löschen.
-- ============================================================================

begin;

create table if not exists public.produkt_dokument (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  artikel_id    uuid not null references public.artikel(id) on delete cascade,
  art           text not null,
  titel         text,
  sprache       text not null default 'de',
  version       text,
  ausgabe_am    date,
  gueltig_bis   date,
  datei_pfad    text not null,
  datei_name    text not null,
  datei_bytes   integer not null,
  im_shop       boolean not null default false,
  aktuell       boolean not null default true,
  document_id   uuid,
  angelegt_von  uuid default auth.uid(),
  angelegt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'p315_art_check' and conrelid = 'public.produkt_dokument'::regclass) then
    alter table public.produkt_dokument add constraint p315_art_check
      check (art in ('sdb', 'tdb', 'zertifikat', 'anleitung', 'leistungserklaerung', 'konformitaet', 'spezifikation', 'sonstiges'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p315_angaben_check' and conrelid = 'public.produkt_dokument'::regclass) then
    alter table public.produkt_dokument add constraint p315_angaben_check check (
      sprache ~ '^[a-z]{2}$'
      and (titel is null or char_length(titel) between 1 and 120)
      and (version is null or char_length(version) between 1 and 40)
      and char_length(datei_name) between 1 and 200
      and datei_bytes > 0 and datei_bytes <= 20971520
      and (gueltig_bis is null or ausgabe_am is null or gueltig_bis >= ausgabe_am)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'p315_pfad_eindeutig' and conrelid = 'public.produkt_dokument'::regclass) then
    alter table public.produkt_dokument add constraint p315_pfad_eindeutig unique (datei_pfad);
  end if;
end $$;

create index if not exists produkt_dokument_artikel_idx on public.produkt_dokument (artikel_id);
create index if not exists produkt_dokument_owner_idx on public.produkt_dokument (owner_user_id);

comment on table public.produkt_dokument is
  'Paket 315: Produkt-Dokumente (PDF) je Artikel — Datenblaetter, Zertifikate, Anleitungen; Shop-Download und Firmen-Wissen.';

-- ---------------------------------------------------------------- Wächter ---
create or replace function public.p315_dokument_waechter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_artikel_owner uuid;
begin
  if tg_op = 'INSERT' then
    select owner_user_id into v_artikel_owner from public.artikel where id = new.artikel_id;
    if v_artikel_owner is null or v_artikel_owner <> new.owner_user_id then
      raise exception 'Der Artikel gehoert nicht zu diesem Betrieb.' using errcode = '42501';
    end if;
    if split_part(new.datei_pfad, '/', 1) <> new.owner_user_id::text
       or split_part(new.datei_pfad, '/', 2) <> new.artikel_id::text
       or split_part(new.datei_pfad, '/', 3) !~ '^[A-Za-z0-9]+-[a-z0-9._-]+\.pdf$'
       or split_part(new.datei_pfad, '/', 4) <> ''
       or position('..' in new.datei_pfad) > 0 then
      raise exception 'Die Datei liegt nicht im Ordner dieses Artikels.' using errcode = '42501';
    end if;
    if auth.uid() is not null then
      new.angelegt_von := auth.uid();
    end if;
    new.angelegt_am := now();
    new.geaendert_am := now();
    return new;
  end if;

  -- UPDATE: Zuordnung und Datei bleiben fest
  if new.owner_user_id <> old.owner_user_id or new.artikel_id <> old.artikel_id
     or new.datei_pfad <> old.datei_pfad or new.datei_name <> old.datei_name or new.datei_bytes <> old.datei_bytes
     or new.angelegt_von is distinct from old.angelegt_von or new.angelegt_am <> old.angelegt_am then
    raise exception 'Artikel und Datei eines Dokuments sind fest. Fuer eine neue Fassung bitte neu hochladen.' using errcode = '42501';
  end if;
  new.geaendert_am := now();
  return new;
end $$;

drop trigger if exists p315_dokument_waechter_trg on public.produkt_dokument;
create trigger p315_dokument_waechter_trg
  before insert or update on public.produkt_dokument
  for each row execute function public.p315_dokument_waechter();

-- Neue aktuelle Fassung ersetzt die alte (nur bei Arten mit genau einer gültigen Fassung je Sprache)
create or replace function public.p315_alte_fassung()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.aktuell and new.art in ('sdb', 'tdb', 'leistungserklaerung', 'spezifikation')
     and (tg_op = 'INSERT' or old.aktuell is distinct from new.aktuell or old.art <> new.art or old.sprache <> new.sprache) then
    update public.produkt_dokument
       set aktuell = false
     where artikel_id = new.artikel_id
       and art = new.art
       and sprache = new.sprache
       and aktuell
       and id <> new.id;
  end if;
  return null;
end $$;

drop trigger if exists p315_alte_fassung_trg on public.produkt_dokument;
create trigger p315_alte_fassung_trg
  after insert or update on public.produkt_dokument
  for each row execute function public.p315_alte_fassung();

-- ---------------------------------------------------------------- Regeln ---
alter table public.produkt_dokument enable row level security;

drop policy if exists pdok_chef_all on public.produkt_dokument;
create policy pdok_chef_all on public.produkt_dokument for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists pdok_ma_select on public.produkt_dokument;
create policy pdok_ma_select on public.produkt_dokument for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('erp') or public.darf_ich_modul_aendern('erp')));
drop policy if exists pdok_ma_insert on public.produkt_dokument;
create policy pdok_ma_insert on public.produkt_dokument for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('erp'));
drop policy if exists pdok_ma_update on public.produkt_dokument;
create policy pdok_ma_update on public.produkt_dokument for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('erp'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('erp'));

-- ---------------------------------------------------------------- Speicher ---
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produkt-dokumente', 'produkt-dokumente', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists produktdok_select on storage.objects;
create policy produktdok_select on storage.objects for select to authenticated
  using (bucket_id = 'produkt-dokumente'
    and (storage.foldername(name))[1] = coalesce(public.mein_chef_id(), auth.uid())::text
    and (public.mein_chef_id() is null or public.darf_ich_modul_sehen('erp') or public.darf_ich_modul_aendern('erp')));
drop policy if exists produktdok_insert on storage.objects;
create policy produktdok_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'produkt-dokumente'
    and (storage.foldername(name))[1] = coalesce(public.mein_chef_id(), auth.uid())::text
    and (public.mein_chef_id() is null or public.darf_ich_modul_aendern('erp')));
drop policy if exists produktdok_delete on storage.objects;
create policy produktdok_delete on storage.objects for delete to authenticated
  using (bucket_id = 'produkt-dokumente' and (storage.foldername(name))[1] = auth.uid()::text and public.mein_chef_id() is null);

commit;

-- KONTROLLE (nur lesen) — Erwartung: 1 | 4 | 2 | 3 | true
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'produkt_dokument') as tabelle,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'produkt_dokument') as regeln,
       (select count(*) from pg_trigger where tgname in ('p315_dokument_waechter_trg', 'p315_alte_fassung_trg')) as waechter,
       (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'produktdok_%') as speicher_regeln,
       (select public = false from storage.buckets where id = 'produkt-dokumente') as ordner_privat;
