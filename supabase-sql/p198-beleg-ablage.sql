-- ============================================================
-- ARGONAUT OS · Paket 198 (04.10.2026) · Mahnungen und Angebots-Zusagen fest ablegen,
-- Rechnungen automatisch festschreiben (GoBD / Nachweis)
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht, keine bestehende
-- Regel geändert. Niemand wird ausgesperrt: Anmeldung, Lesen, Zahlung
-- erfassen, Mahnen, Stornieren bleiben wie bisher.
--
-- 1) Tabelle beleg_ablage: je abgelegter Mahnung bzw. Zusage ein Eintrag mit
--    Speicherpfad und SHA-256-Prüfsumme. Lesen: Chef bzw. „Darf abrechnen".
--    Anlegen nur der Server. ÄNDERN NIEMAND; Löschen nur der Server-Schlüssel.
-- 2) Speicherordner „rechnung-ablage" (aus 197) nimmt zusätzlich JSON an
--    (Zusage-Nachweis). Weiterhin privat, ohne Speicherregeln für Nutzer.
-- 3) Rechnungen werden AUTOMATISCH festgeschrieben, sobald sie nachweislich
--    beim Kunden sind: Zahlung ganz/teilweise erfasst, Mahnstufe erhöht,
--    Zahlung vom Kunden gemeldet. Nur bei diesem Übergang — bestehende
--    Rechnungen bleiben, wie sie sind.
-- 4) Angenommene Angebote (angenommen_am gesetzt) sind gesperrt: Kopf-Daten,
--    Summen und Positionen nicht mehr änderbar, Angebot nicht löschbar.
--    Status, Notiz und Rechnungs-Verknüpfung bleiben änderbar.
--    Der Server-Schlüssel ist ausgenommen (Musterbetrieb aufräumen).
-- 5) Zwei-Faktor-Regel (164·3) auch auf die neue Tabelle.
--
-- RÜCKWEG (nur im Notfall, Ablage bleibt erhalten):
--   drop trigger if exists p198_auto_fest on public.rechnungen;
--   drop trigger if exists p198_angebot_fest on public.angebote;
--   drop trigger if exists p198_angebot_position_fest on public.angebot_positionen;
-- ============================================================

-- 1) Ablage-Tabelle
create table if not exists public.beleg_ablage (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  art            text not null check (art in ('mahnung', 'angebot_annahme')),
  bezug_id       uuid not null,              -- Rechnung bzw. Angebot; bewusst ohne Fremdschlüssel
  bezug_nummer   text,
  stufe          integer check (stufe is null or (stufe between 0 and 9)),
  datei_pfad     text not null,
  datei_name     text not null,
  datei_typ      text not null check (datei_typ in ('application/pdf', 'application/json')),
  datei_hash     text not null check (datei_hash ~ '^[0-9a-f]{64}$'),
  datei_groesse  integer not null check (datei_groesse > 0),
  erstellt_von   uuid,
  erstellt_am    timestamptz not null default now()
);
create index if not exists beleg_ablage_bezug_idx on public.beleg_ablage (owner_user_id, art, bezug_id);

alter table public.beleg_ablage enable row level security;

drop policy if exists p198_beleg_select on public.beleg_ablage;
create policy p198_beleg_select on public.beleg_ablage for select to authenticated
  using (
    owner_user_id = auth.uid()
    or (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen())
  );
-- Keine Regel für anlegen/ändern/löschen: das darf nur der Server.

create or replace function public.p198_beleg_unveraenderbar()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Abgelegte Belege sind unveränderbar (GoBD).' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Abgelegte Belege werden nicht gelöscht (GoBD).' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists p198_beleg_unveraenderbar on public.beleg_ablage;
create trigger p198_beleg_unveraenderbar
  before update or delete on public.beleg_ablage
  for each row execute function public.p198_beleg_unveraenderbar();

-- 2) Speicherordner nimmt zusätzlich JSON an (bleibt privat, 10 MB)
update storage.buckets
   set allowed_mime_types = array['application/pdf', 'application/xml', 'text/xml', 'application/json'],
       public = false
 where id = 'rechnung-ablage';

-- 3) Automatisch festschreiben (Spiegel: lib/belegAblage.ts autoFestschreiben)
create or replace function public.p198_auto_fest()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if old.festgeschrieben_am is not null or new.festgeschrieben_am is not null then
    return new;
  end if;
  if (coalesce(new.zahlungsstatus, '') in ('bezahlt', 'teilbezahlt')
        and coalesce(old.zahlungsstatus, '') not in ('bezahlt', 'teilbezahlt'))
     or coalesce(new.mahnstufe, 0) > coalesce(old.mahnstufe, 0)
     or (new.zahlung_gemeldet_am is not null and old.zahlung_gemeldet_am is null) then
    new.festgeschrieben_am := now();
  end if;
  return new;
end;
$$;

drop trigger if exists p198_auto_fest on public.rechnungen;
create trigger p198_auto_fest
  before update on public.rechnungen
  for each row execute function public.p198_auto_fest();

-- 4a) Angenommene Angebote: Kopf sperren, nicht löschen
create or replace function public.p198_angebot_fest()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  c text;
  alt jsonb := to_jsonb(old);
  neu jsonb := to_jsonb(new);
begin
  if old.angenommen_am is null or coalesce(auth.role(), '') = 'service_role' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Dieses Angebot wurde vom Kunden angenommen und bleibt als Nachweis erhalten.' using errcode = '42501';
  end if;
  foreach c in array array['angebotsnummer', 'titel', 'kunde_name', 'kunde_email', 'kontakt_id', 'gueltig_bis',
    'netto_summe', 'mwst_summe', 'brutto_summe', 'angenommen_am', 'entschieden_name', 'entschieden_erklaerung',
    'owner_user_id'] loop
    if (neu -> c) is distinct from (alt -> c) then
      raise exception 'Dieses Angebot wurde angenommen — „%" lässt sich nicht mehr ändern. Für Änderungen bitte ein neues Angebot (Nachtrag) erstellen.', c
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists p198_angebot_fest on public.angebote;
create trigger p198_angebot_fest
  before update or delete on public.angebote
  for each row execute function public.p198_angebot_fest();

-- 4b) Positionen angenommener Angebote sperren
create or replace function public.p198_angebot_position_fest()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  aid uuid;
  angenommen timestamptz;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return coalesce(new, old);
  end if;
  aid := case when tg_op = 'DELETE' then old.angebot_id else new.angebot_id end;
  select a.angenommen_am into angenommen from public.angebote a where a.id = aid;
  if angenommen is null and tg_op = 'UPDATE' and old.angebot_id is distinct from new.angebot_id then
    select a.angenommen_am into angenommen from public.angebote a where a.id = old.angebot_id;
  end if;
  if angenommen is null then
    return coalesce(new, old);
  end if;
  raise exception 'Dieses Angebot wurde angenommen — Positionen lassen sich nicht mehr ändern. Für Änderungen bitte ein neues Angebot (Nachtrag) erstellen.' using errcode = '42501';
end;
$$;

drop trigger if exists p198_angebot_position_fest on public.angebot_positionen;
create trigger p198_angebot_position_fest
  before insert or update or delete on public.angebot_positionen
  for each row execute function public.p198_angebot_position_fest();

-- 5) Zwei-Faktor-Regel (Paket 164·3) auf die neue Tabelle
drop policy if exists p164s3_aal on public.beleg_ablage;
create policy p164s3_aal on public.beleg_ablage as restrictive for all to authenticated
  using ((select public.p164s3_aal_ok())) with check ((select public.p164s3_aal_ok()));

-- KONTROLLE — Erwartung: tabelle 1 · regeln 2 · trigger 4 · json 1 · zwei_faktor_fehlt 0
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'beleg_ablage') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'beleg_ablage') as regeln,
  (select count(*) from pg_trigger where tgname in ('p198_beleg_unveraenderbar', 'p198_auto_fest', 'p198_angebot_fest', 'p198_angebot_position_fest') and not tgisinternal) as trigger,
  (select count(*) from storage.buckets where id = 'rechnung-ablage' and public = false and 'application/json' = any(allowed_mime_types)) as json,
  (select count(*) from pg_tables t where t.schemaname = 'public' and t.rowsecurity
      and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename and p.policyname = 'p164s3_aal')) as zwei_faktor_fehlt;
