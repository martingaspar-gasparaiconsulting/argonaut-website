-- ============================================================
-- ARGONAUT OS · Paket 267 (07.10.2026) · Stornorechnung als eigener Beleg
--
-- BEFUND: „Stornieren" setzte nur den Status der Rechnung. Ist die Rechnung
-- schon beim Kunden, braucht es einen eigenen Beleg mit eigener Nummer, der
-- auf die ursprüngliche Rechnung verweist — den gab es nur als freies
-- Dokument ohne Nummernkreis und ohne Ablage.
--
-- JETZT (additiv, mehrfach ausführbar, nichts wird gelöscht):
--  1) rechnungen.storno_zu    Verweis der Stornorechnung auf das Original.
--                             Je Original höchstens EINE Stornorechnung.
--  2) p267_storno_erstellen   legt in EINEM Schritt (alles oder nichts) an:
--                             neue Rechnung mit eigener Nummer aus dem
--                             gleichen Nummernkreis, alle Positionen mit
--                             negativer Menge, Summen negativ, festgeschrieben;
--                             Original -> „storniert" mit Vermerk.
--                             Nur die Geschäftsleitung (wie bisher Stornieren).
--  3) p267_storno_schutz      ein Original mit Stornorechnung lässt sich nicht
--                             reaktivieren; die Stornorechnung bleibt
--                             „storniert" (zählt so wie das Original nicht
--                             als Umsatz — beide zusammen ergeben null);
--                             der Verweis lässt sich nicht ändern.
-- Unbekannte Spalten der Live-Tabelle werden mitkopiert; eindeutige Spalten
-- (z. B. Links/Kennungen) und Versand-/Zahlungsvermerke bleiben leer.
-- ============================================================

-- 1) Verweis -----------------------------------------------------------------------
alter table public.rechnungen add column if not exists storno_zu uuid references public.rechnungen(id) on delete restrict;
create unique index if not exists rechnungen_storno_zu_uq on public.rechnungen (storno_zu) where storno_zu is not null;

-- 2) Stornorechnung anlegen ------------------------------------------------------
create or replace function public.p267_storno_erstellen(p_rechnung uuid, p_grund text default null)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  o public.rechnungen;
  j jsonb;
  jp jsonb;
  p record;
  k text;
  spalten text;
  pspalten text;
  neu_id uuid := gen_random_uuid();
  neu_nr text;
  grund text := nullif(btrim(coalesce(p_grund, '')), '');
begin
  select * into o from public.rechnungen where id = p_rechnung for update;
  if not found then
    raise exception 'Die Rechnung wurde nicht gefunden.' using errcode = 'P0002';
  end if;
  if auth.uid() is null or auth.uid() <> o.owner_user_id then
    raise exception 'Stornorechnungen erstellt nur die Geschäftsleitung.' using errcode = '42501';
  end if;
  if o.storno_zu is not null then
    raise exception 'Eine Stornorechnung wird nicht storniert.' using errcode = '22023';
  end if;
  if exists (select 1 from public.rechnungen r where r.storno_zu = o.id) then
    raise exception 'Zu dieser Rechnung gibt es schon eine Stornorechnung.' using errcode = '23505';
  end if;
  if o.rechnungsnummer is null then
    raise exception 'Die Rechnung hat keine Nummer.' using errcode = '22023';
  end if;
  if grund is not null then grund := left(grund, 300); end if;

  -- Kopf: alles kopieren, dann gezielt überschreiben
  j := to_jsonb(o);
  -- eindeutige Spalten leeren (Nummer vergibt der Auslöser neu)
  for k in
    select a.attname from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = 'public.rechnungen'::regclass and i.indisunique and a.attname <> 'id' and not a.attnotnull
  loop
    j := j - k;
  end loop;
  -- Versand-, Zahlungs-, Mahn- und Link-Vermerke leeren (nur Spalten ohne Pflicht)
  for k in
    select a.attname from pg_attribute a
    where a.attrelid = 'public.rechnungen'::regclass and a.attnum > 0 and not a.attisdropped and not a.attnotnull
      and a.attname ~ '(token|link|_am$|^sepa_|mahn|bezahlt|gemeldet|versend|gesendet|portal|zusage)'
  loop
    j := j - k;
  end loop;
  j := j || jsonb_build_object(
    'id', neu_id,
    'storno_zu', o.id,
    'auftrag_id', null,
    'zahlungsstatus', 'storniert',
    'rechnungsdatum', current_date,
    'faelligkeitsdatum', current_date,
    'titel', left('Stornorechnung zu ' || o.rechnungsnummer || coalesce(' · ' || nullif(o.titel, ''), ''), 300),
    'netto_summe', -coalesce(o.netto_summe, 0),
    'mwst_summe', -coalesce(o.mwst_summe, 0),
    'brutto_summe', -coalesce(o.brutto_summe, 0),
    'bezahlter_betrag', 0,
    'mahnstufe', 0,
    'notizen', 'Storno der Rechnung ' || o.rechnungsnummer || ' vom ' || to_char(o.rechnungsdatum, 'DD.MM.YYYY') || '.' || coalesce(' Grund: ' || grund, ''),
    'created_at', now(),
    'updated_at', now()
  );
  if j ? 'erstellt_von' then j := j || jsonb_build_object('erstellt_von', auth.uid()); end if;

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into spalten
  from pg_attribute a
  where a.attrelid = 'public.rechnungen'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attgenerated = '' and a.attidentity <> 'a';
  execute format('insert into public.rechnungen (%1$s) select %1$s from jsonb_populate_record(null::public.rechnungen, $1)', spalten) using j;

  -- Positionen: gleiche Zeilen, Menge und Netto mit umgekehrtem Vorzeichen
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into pspalten
  from pg_attribute a
  where a.attrelid = 'public.rechnung_positionen'::regclass and a.attnum > 0 and not a.attisdropped
    and a.attgenerated = '' and a.attidentity <> 'a';
  for p in select * from public.rechnung_positionen where rechnung_id = o.id order by position loop
    jp := to_jsonb(p) || jsonb_build_object(
      'id', gen_random_uuid(),
      'rechnung_id', neu_id,
      'menge', -coalesce(p.menge, 0),
      'gesamt_netto', -coalesce(p.gesamt_netto, 0),
      'created_at', now(),
      'updated_at', now()
    );
    execute format('insert into public.rechnung_positionen (%1$s) select %1$s from jsonb_populate_record(null::public.rechnung_positionen, $1)', pspalten) using jp;
  end loop;

  -- Summen sicher setzen (falls ein Auslöser aus den Positionen rechnet) und festschreiben
  update public.rechnungen
     set netto_summe = -coalesce(o.netto_summe, 0), mwst_summe = -coalesce(o.mwst_summe, 0),
         brutto_summe = -coalesce(o.brutto_summe, 0), zahlungsstatus = 'storniert', festgeschrieben_am = now()
   where id = neu_id
  returning rechnungsnummer into neu_nr;

  -- Original: storniert, mit Vermerk
  update public.rechnungen
     set zahlungsstatus = 'storniert',
         notizen = left(coalesce(nullif(notizen, '') || E'\n', '') || 'Storniert durch Stornorechnung ' || coalesce(neu_nr, '') || ' vom ' || to_char(current_date, 'DD.MM.YYYY') || '.' || coalesce(' Grund: ' || grund, ''), 4000),
         updated_at = now()
   where id = o.id;

  return neu_id;
end;
$$;

revoke all on function public.p267_storno_erstellen(uuid, text) from public;
grant execute on function public.p267_storno_erstellen(uuid, text) to authenticated;

-- 3) Schutz ----------------------------------------------------------------------
create or replace function public.p267_storno_schutz()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if new.storno_zu is distinct from old.storno_zu and old.storno_zu is not null then
    raise exception 'Der Verweis einer Stornorechnung lässt sich nicht ändern.' using errcode = '42501';
  end if;
  if old.storno_zu is not null and new.zahlungsstatus is distinct from 'storniert' then
    raise exception 'Eine Stornorechnung bleibt „storniert".' using errcode = '42501';
  end if;
  if old.zahlungsstatus = 'storniert' and new.zahlungsstatus is distinct from 'storniert'
     and exists (select 1 from public.rechnungen r where r.storno_zu = old.id) then
    raise exception 'Zu dieser Rechnung gibt es eine Stornorechnung — sie lässt sich nicht reaktivieren. Erstellen Sie eine neue Rechnung.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists p267_storno_schutz on public.rechnungen;
create trigger p267_storno_schutz
  before update on public.rechnungen
  for each row execute function public.p267_storno_schutz();

-- KONTROLLE — Erwartung: spalte = 1, index = 1, funktion = 1, schutz = 1, stornos = 0
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'rechnungen' and column_name = 'storno_zu') as spalte,
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'rechnungen_storno_zu_uq') as index,
  (select count(*) from pg_proc where proname = 'p267_storno_erstellen') as funktion,
  (select count(*) from pg_trigger where tgname = 'p267_storno_schutz' and not tgisinternal) as schutz,
  (select count(*) from public.rechnungen where storno_zu is not null) as stornos;
