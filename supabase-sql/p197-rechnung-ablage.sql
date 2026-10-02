-- ============================================================
-- ARGONAUT OS · Paket 197 (02.10.2026) · Verschickte Rechnungen fest ablegen (GoBD)
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht, keine bestehende
-- Regel geändert. Niemand wird ausgesperrt: Anmeldung, Lesen, Bezahlen,
-- Mahnen, Stornieren bleiben wie bisher.
--
-- 1) Tabelle rechnung_ablage: je Versand/Festschreiben ein Eintrag mit
--    Speicherpfad und SHA-256-Prüfsumme. Lesen: Chef bzw. „Darf abrechnen".
--    Anlegen nur der Server. ÄNDERN NIEMAND; Löschen nur der Server-Schlüssel
--    (Musterbetrieb aufräumen).
-- 2) Privater Speicherordner „rechnung-ablage" OHNE Speicherregeln für Nutzer
--    (nur der Server liest/schreibt; 10 MB, nur PDF/XML).
-- 3) rechnungen.festgeschrieben_am (leer = noch nicht verschickt).
-- 4) Sperre in der Datenbank: Ist eine Rechnung festgeschrieben, lassen sich
--    Nummer, Daten, Beträge, Empfänger und Positionen nicht mehr ändern und
--    die Rechnung nicht mehr löschen —
--    Korrektur nur per Storno + neue Rechnung. Zahlungsstatus, Mahnstufe,
--    Notizen, SEPA-Vermerk bleiben änderbar. Der Server-Schlüssel ist
--    ausgenommen (Aufräumen von Testkonten).
--    Bisher ist keine Rechnung festgeschrieben -> heute ändert sich nichts.
--
-- RÜCKWEG (nur im Notfall, Ablage bleibt erhalten):
--   drop trigger if exists p197_rechnung_fest on public.rechnungen;
--   drop trigger if exists p197_position_fest on public.rechnung_positionen;
-- ============================================================

-- 1) Ablage-Tabelle
create table if not exists public.rechnung_ablage (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  rechnung_id    uuid not null,              -- bewusst ohne Fremdschlüssel: die Ablage bleibt, auch wenn die Rechnung verschwindet
  rechnungsnummer text,
  anlass         text not null check (anlass in ('versand_mail', 'festgeschrieben')),
  datei_pfad     text not null,
  datei_name     text not null,
  datei_typ      text not null check (datei_typ in ('application/pdf', 'application/xml')),
  datei_hash     text not null check (datei_hash ~ '^[0-9a-f]{64}$'),
  datei_groesse  integer not null check (datei_groesse > 0),
  empfaenger     text,
  erstellt_von   uuid,
  erstellt_am    timestamptz not null default now()
);
create index if not exists rechnung_ablage_rechnung_idx on public.rechnung_ablage (owner_user_id, rechnung_id);

alter table public.rechnung_ablage enable row level security;

drop policy if exists p197_ablage_select on public.rechnung_ablage;
create policy p197_ablage_select on public.rechnung_ablage for select to authenticated
  using (
    owner_user_id = auth.uid()
    or (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen())
  );
-- Keine Regel für anlegen/ändern/löschen: das darf nur der Server.

create or replace function public.p197_ablage_unveraenderbar()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Abgelegte Rechnungen sind unveränderbar (GoBD).' using errcode = '42501';
  end if;
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Abgelegte Rechnungen werden nicht gelöscht (GoBD, 10 Jahre).' using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists p197_ablage_unveraenderbar on public.rechnung_ablage;
create trigger p197_ablage_unveraenderbar
  before update or delete on public.rechnung_ablage
  for each row execute function public.p197_ablage_unveraenderbar();

-- 2) Privater Speicherordner (keine storage.objects-Regeln -> nur Server-Schlüssel)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rechnung-ablage', 'rechnung-ablage', false, 10485760, array['application/pdf', 'application/xml', 'text/xml'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'application/xml', 'text/xml'];

-- 3) Festschreib-Zeitpunkt
alter table public.rechnungen add column if not exists festgeschrieben_am timestamptz;

-- 4a) Sperre auf dem Rechnungskopf
create or replace function public.p197_rechnung_fest()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  c text;
  alt jsonb := to_jsonb(old);
  neu jsonb := to_jsonb(new);
begin
  if old.festgeschrieben_am is null or coalesce(auth.role(), '') = 'service_role' then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Diese Rechnung ist festgeschrieben (verschickt) und wird nicht gelöscht (GoBD). Stornieren Sie sie stattdessen.' using errcode = '42501';
  end if;
  if new.festgeschrieben_am is distinct from old.festgeschrieben_am then
    raise exception 'Die Festschreibung einer Rechnung lässt sich nicht aufheben (GoBD).' using errcode = '42501';
  end if;
  foreach c in array array['rechnungsnummer', 'rechnungsdatum', 'leistungsdatum', 'faelligkeitsdatum',
    'zahlungsziel_tage', 'netto_summe', 'mwst_summe', 'brutto_summe', 'kleinunternehmer', 'waehrung',
    'kontakt_id', 'firma_id', 'titel', 'rechnungsart', 'skonto_prozent', 'skonto_tage',
    'einbehalt_prozent', 'reverse_charge', 'ust_id_kunde', 'owner_user_id'] loop
    if (neu -> c) is distinct from (alt -> c) then
      raise exception 'Diese Rechnung ist festgeschrieben (verschickt) — „%" lässt sich nicht mehr ändern. Korrektur per Storno und neuer Rechnung.', c
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists p197_rechnung_fest on public.rechnungen;
create trigger p197_rechnung_fest
  before update or delete on public.rechnungen
  for each row execute function public.p197_rechnung_fest();

-- 4b) Sperre auf den Positionen
create or replace function public.p197_position_fest()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  rid uuid;
  fest timestamptz;
  c text;
  alt jsonb;
  neu jsonb;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return coalesce(new, old);
  end if;
  rid := case when tg_op = 'DELETE' then old.rechnung_id else new.rechnung_id end;
  select r.festgeschrieben_am into fest from public.rechnungen r where r.id = rid;
  -- Beim Verschieben einer Position auch die alte Rechnung prüfen
  if fest is null and tg_op = 'UPDATE' and old.rechnung_id is distinct from new.rechnung_id then
    select r.festgeschrieben_am into fest from public.rechnungen r where r.id = old.rechnung_id;
  end if;
  if fest is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' then
    alt := to_jsonb(old); neu := to_jsonb(new);
    foreach c in array array['rechnung_id', 'position', 'bezeichnung', 'menge', 'einheit', 'einzelpreis', 'mwst_satz', 'gesamt_netto'] loop
      if (neu -> c) is distinct from (alt -> c) then
        raise exception 'Diese Rechnung ist festgeschrieben (verschickt) — Positionen lassen sich nicht mehr ändern.' using errcode = '42501';
      end if;
    end loop;
    return new;
  end if;
  raise exception 'Diese Rechnung ist festgeschrieben (verschickt) — Positionen lassen sich nicht mehr hinzufügen oder löschen.' using errcode = '42501';
end;
$$;

drop trigger if exists p197_position_fest on public.rechnung_positionen;
create trigger p197_position_fest
  before insert or update or delete on public.rechnung_positionen
  for each row execute function public.p197_position_fest();

-- Kontrolle — Erwartung: tabelle 1 · spalte 1 · ordner 1 · trigger 3 · regel 1 · festgeschrieben 0
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'rechnung_ablage') as tabelle,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'rechnungen' and column_name = 'festgeschrieben_am') as spalte,
  (select count(*) from storage.buckets where id = 'rechnung-ablage' and public = false) as ordner,
  (select count(*) from pg_trigger where tgname in ('p197_ablage_unveraenderbar', 'p197_rechnung_fest', 'p197_position_fest') and not tgisinternal) as trigger,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'rechnung_ablage') as regel,
  (select count(*) from public.rechnungen where festgeschrieben_am is not null) as festgeschrieben;
