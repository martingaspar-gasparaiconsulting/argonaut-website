-- ============================================================================
-- ARGONAUT OS · supabase-sql/darf-abrechnen.sql — Recht „Darf abrechnen" (27.09.2026)
--
-- Martins Entscheidung 27.09.2026: Rechnungen schreiben muss auch ein
-- Mitarbeiter können (z. B. die Büroleitung). Der Chef will kontrollieren,
-- nicht selbst tippen. Das ersetzt die harte Sperre aus B1b-2 (26.09.).
--
-- WAS HIER PASSIERT (alles additiv, nichts wird gelöscht):
--  1. mitarbeiter.darf_abrechnen (Standard: aus). Setzen kann es nur der
--     Eigentümer — mitarbeiter hat nur die Update-Regel für den Owner.
--  2. Funktion darf_ich_abrechnen(): true nur für einen Mitarbeiter mit Haken.
--  3. Neue Spalten rechnungen.erstellt_von und zahlungen.erfasst_von
--     (Vorgabe: wer gerade angemeldet ist) — „erstellt von Simone".
--  4. Besitzer-Vorgabe von rechnungen, rechnung_positionen, zahlungen und
--     mahnung_historie: auth.uid() -> coalesce(mein_chef_id(), auth.uid()).
--     Alles, was ein Mitarbeiter anlegt, gehört damit dem Betrieb.
--     Wird nur umgestellt, wo die Vorgabe heute genau auth.uid() ist.
--  5. Regeln (abr_*) für Mitarbeiter MIT Haken, immer nur im eigenen Betrieb:
--       rechnungen          lesen, anlegen, ändern       — kein Löschen
--       rechnung_positionen lesen, anlegen, ändern, löschen (Entwurf bearbeiten)
--       zahlungen           lesen, anlegen               — kein Ändern/Löschen
--       mahnung_historie    lesen, anlegen
--       rechnung_abschlaege lesen, anlegen, löschen (nur falls Tabelle da)
--  6. Wächter: Stornieren und Reaktivieren bleibt bei der Geschäftsleitung.
--     Einzige Ausnahme: die eigene, gerade (< 10 Min.) angelegte Rechnung —
--     damit das System eine fehlerhaft angelegte Rechnung selbst stornieren kann.
--  7. Glocke: Legt ein Mitarbeiter eine Rechnung oder Zahlung an, bekommt
--     der Chef eine Meldung.
--
-- Die bestehenden Regeln (rechnungen_owner_all, rechnungen_select_mitarbeiter,
-- zahlungen_*_own …) bleiben unverändert. „drop policy if exists" betrifft
-- nur die NEUEN abr_*-Regeln dieser Datei (Wiederholbarkeit) — Supabase warnt
-- deshalb vor „destructive operations", das ist harmlos.
-- ============================================================================

-- 1) Das Recht
alter table public.mitarbeiter add column if not exists darf_abrechnen boolean not null default false;

-- 2) Prüffunktion
create or replace function public.darf_ich_abrechnen()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select m.darf_abrechnen from public.mitarbeiter m where m.auth_user_id = auth.uid() limit 1),
    false
  );
$$;

-- 3) Wer hat es angelegt?
alter table public.rechnungen add column if not exists erstellt_von uuid default auth.uid();
alter table public.zahlungen  add column if not exists erfasst_von  uuid default auth.uid();

-- 4) Besitzer-Vorgabe = Betrieb
do $$
declare
  t text;
  vorgabe text;
begin
  foreach t in array array['rechnungen', 'rechnung_positionen', 'zahlungen', 'mahnung_historie'] loop
    select pg_get_expr(d.adbin, d.adrelid) into vorgabe
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where n.nspname = 'public' and c.relname = t and a.attname = 'owner_user_id' and not a.attisdropped;
    if vorgabe = 'auth.uid()' then
      execute format('alter table public.%I alter column owner_user_id set default coalesce(public.mein_chef_id(), auth.uid())', t);
      raise notice 'Vorgabe umgestellt: %', t;
    else
      raise notice 'Vorgabe unveraendert: % (%)', t, coalesce(vorgabe, 'keine');
    end if;
  end loop;
end $$;

-- 5) Regeln für Mitarbeiter mit Haken
drop policy if exists abr_select on public.rechnungen;
create policy abr_select on public.rechnungen for select to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());
drop policy if exists abr_insert on public.rechnungen;
create policy abr_insert on public.rechnungen for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());
drop policy if exists abr_update on public.rechnungen;
create policy abr_update on public.rechnungen for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen())
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());

drop policy if exists abr_select on public.rechnung_positionen;
create policy abr_select on public.rechnung_positionen for select to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());
drop policy if exists abr_insert on public.rechnung_positionen;
create policy abr_insert on public.rechnung_positionen for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());
drop policy if exists abr_update on public.rechnung_positionen;
create policy abr_update on public.rechnung_positionen for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen())
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());
drop policy if exists abr_delete on public.rechnung_positionen;
create policy abr_delete on public.rechnung_positionen for delete to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());

drop policy if exists abr_select on public.zahlungen;
create policy abr_select on public.zahlungen for select to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());
drop policy if exists abr_insert on public.zahlungen;
create policy abr_insert on public.zahlungen for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());

drop policy if exists abr_select on public.mahnung_historie;
create policy abr_select on public.mahnung_historie for select to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());
drop policy if exists abr_insert on public.mahnung_historie;
create policy abr_insert on public.mahnung_historie for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen());

-- rechnung_abschlaege hängt an der Schlussrechnung (keine eigene Besitzer-Spalte nötig)
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'rechnung_abschlaege' and column_name = 'schlussrechnung_id') then
    execute 'drop policy if exists abr_select on public.rechnung_abschlaege';
    execute 'create policy abr_select on public.rechnung_abschlaege for select to authenticated using (public.darf_ich_abrechnen() and exists (select 1 from public.rechnungen r where r.id = schlussrechnung_id and r.owner_user_id = public.mein_chef_id()))';
    execute 'drop policy if exists abr_insert on public.rechnung_abschlaege';
    execute 'create policy abr_insert on public.rechnung_abschlaege for insert to authenticated with check (public.darf_ich_abrechnen() and exists (select 1 from public.rechnungen r where r.id = schlussrechnung_id and r.owner_user_id = public.mein_chef_id()))';
    execute 'drop policy if exists abr_delete on public.rechnung_abschlaege';
    execute 'create policy abr_delete on public.rechnung_abschlaege for delete to authenticated using (public.darf_ich_abrechnen() and exists (select 1 from public.rechnungen r where r.id = schlussrechnung_id and r.owner_user_id = public.mein_chef_id()))';
    raise notice 'rechnung_abschlaege: Regeln gesetzt';
  else
    raise notice 'rechnung_abschlaege: Tabelle/Spalte nicht gefunden, uebersprungen';
  end if;
end $$;

-- 6) Wächter: Stornieren und Reaktivieren nur die Geschäftsleitung
create or replace function public.rechnung_storno_nur_chef()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.mein_chef_id() is not null
     and new.zahlungsstatus is distinct from old.zahlungsstatus
     and (new.zahlungsstatus = 'storniert' or old.zahlungsstatus = 'storniert') then
    -- Ausnahme: eigene, gerade angelegte Rechnung (Selbst-Storno bei Fehler im Anlegen)
    if new.zahlungsstatus = 'storniert'
       and old.erstellt_von = auth.uid()
       and old.created_at > now() - interval '10 minutes' then
      return new;
    end if;
    raise exception 'Stornieren und Reaktivieren macht die Geschäftsleitung.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_rechnung_storno_nur_chef on public.rechnungen;
create trigger trg_rechnung_storno_nur_chef
  before update on public.rechnungen
  for each row execute function public.rechnung_storno_nur_chef();

-- 7) Glocke für den Chef
create or replace function public.abrechnung_melden()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  wer text;
  betrag numeric;
  betrag_text text;
begin
  if public.mein_chef_id() is null or new.owner_user_id is null then
    return new;
  end if;
  select nullif(trim(coalesce(m.vorname, '') || ' ' || coalesce(m.nachname, '')), '')
    into wer
    from public.mitarbeiter m where m.auth_user_id = auth.uid() limit 1;
  wer := coalesce(wer, 'Mitarbeiter');

  if tg_table_name = 'rechnungen' then
    betrag := coalesce(new.brutto_summe, 0);
  else
    betrag := coalesce(new.betrag, 0);
  end if;
  betrag_text := replace(replace(replace(to_char(betrag, 'FM999,999,990.00'), ',', '#'), '.', ','), '#', '.') || ' €';

  if tg_table_name = 'rechnungen' then
    perform public.benachrichtigung_erstellen(
      new.owner_user_id, 'rechnung_mitarbeiter',
      'Neue Rechnung von ' || wer,
      coalesce(new.rechnungsnummer, 'Rechnung') || ' über ' || betrag_text,
      '/dashboard/rechnungen/' || new.id::text, 'rechnungen', new.id::text, 24);
  else
    perform public.benachrichtigung_erstellen(
      new.owner_user_id, 'zahlung_mitarbeiter',
      'Zahlung erfasst von ' || wer,
      betrag_text,
      case when new.rechnung_id is not null then '/dashboard/rechnungen/' || new.rechnung_id::text else '/dashboard/zahlungen' end,
      'zahlungen', new.id::text, 24);
  end if;
  return new;
exception when others then
  -- Eine fehlende Glocke darf nie die Rechnung oder Zahlung verhindern
  return new;
end;
$$;

drop trigger if exists trg_rechnung_mitarbeiter_melden on public.rechnungen;
create trigger trg_rechnung_mitarbeiter_melden
  after insert on public.rechnungen
  for each row execute function public.abrechnung_melden();

drop trigger if exists trg_zahlung_mitarbeiter_melden on public.zahlungen;
create trigger trg_zahlung_mitarbeiter_melden
  after insert on public.zahlungen
  for each row execute function public.abrechnung_melden();

-- Kontrolle: soll 1 Zeile zeigen — darf_abrechnen = boolean, abr_regeln = 14
-- (11, falls es rechnung_abschlaege nicht gibt), waechter = 3
select
  (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'mitarbeiter' and column_name = 'darf_abrechnen') as darf_abrechnen,
  (select count(*) from pg_policies where schemaname = 'public' and policyname like 'abr_%') as abr_regeln,
  (select count(*) from pg_trigger where tgname in ('trg_rechnung_storno_nur_chef', 'trg_rechnung_mitarbeiter_melden', 'trg_zahlung_mitarbeiter_melden')) as waechter;
