-- ============================================================================
-- ARGONAUT OS · Paket 322 (11.10.2026) · R1 Rezeptur in Prozent (Teil 2)
--
--   rezepturen      + artikel_id   Fertigprodukt (Artikel) für die Charge
--   rezeptur_version               eingefrorener Stand einer Rezeptur
--                                  (Eckdaten + Rohstoffe als JSON), unveränderbar
--   rezeptur_zutaten_speichern()   Rohstoffe/Zutaten ersetzen in EINEM Schritt
--   rezeptur_version_anlegen()     Stand festhalten (mit Notiz)
--   rezeptur_rohstoff_tauschen()   Rohstoff in allen Rezepturen tauschen —
--                                  vorher wird je Rezeptur eine Version angelegt
--   rezeptur_ansatz_charge()       Ansatz -> Charge in Quarantäne, Rohstoffe als
--                                  Eingang; Rohstoff-Chargen bekommen einen Ausgang
--
-- Claude-Befund (11.10.): Mitarbeiter haben auf rezeptur_zutaten kein
-- Löschrecht (p185b: nur anlegen/ändern). Die Seite speicherte „neue Zeilen
-- anlegen, alte löschen" — beim Mitarbeiter blieb das Löschen still bei 0
-- Zeilen, die Zutaten standen danach DOPPELT da. Jetzt speichert die Seite
-- über rezeptur_zutaten_speichern(): prüft Betrieb und Schreibrecht, ersetzt
-- alles in einer Transaktion (scheitert etwas, bleibt der alte Stand).
--
-- Rechte: Geschäftsleitung immer; Mitarbeiter nur mit Schreibrecht „rezeptur".
-- Die Charge legt rezeptur_ansatz_charge() mit den Rechten des Nutzers an
-- (security invoker) — es gelten die bestehenden Regeln von charge_los und
-- charge_verwendung und der Wächter p320 (gesperrte Rohstoff-Chargen).
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — neue Tabelle, neue Funktionen, eine neue Spalte.
-- RÜCKWEG (nur im Notfall): die Seite fällt NICHT von allein zurück; die
--   Funktionen bitte nicht löschen, solange P322 live ist.
-- ============================================================================

begin;

alter table public.rezepturen add column if not exists artikel_id uuid references public.artikel(id) on delete set null;
create index if not exists rezepturen_artikel_idx on public.rezepturen (artikel_id);

-- Fertigprodukt muss zum Betrieb gehören
create or replace function public.p322_rezeptur_waechter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if new.artikel_id is not null and (tg_op = 'INSERT' or new.artikel_id is distinct from old.artikel_id) then
    select owner_user_id into v_owner from public.artikel where id = new.artikel_id;
    if v_owner is null or v_owner is distinct from new.owner_user_id then
      raise exception 'Der Artikel gehoert nicht zu diesem Betrieb.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists p322_rezeptur_waechter_trg on public.rezepturen;
create trigger p322_rezeptur_waechter_trg
  before insert or update on public.rezepturen
  for each row execute function public.p322_rezeptur_waechter();

-- ---------------------------------------------------------------- Versionen ---
create table if not exists public.rezeptur_version (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  rezeptur_id   uuid not null references public.rezepturen(id) on delete cascade,
  version_nr    integer not null,
  notiz         text,
  anlass        text not null default 'manuell' check (anlass in ('manuell', 'tausch')),
  daten         jsonb not null,
  erstellt_von  uuid default auth.uid(),
  erstellt_von_name text,
  erstellt_am   timestamptz not null default now(),
  unique (rezeptur_id, version_nr),
  check (notiz is null or char_length(notiz) <= 500)
);
create index if not exists rezeptur_version_owner_idx on public.rezeptur_version (owner_user_id, rezeptur_id);

alter table public.rezeptur_version enable row level security;
-- lesen ja, schreiben nie direkt (auch nicht die Geschäftsleitung) — nur über die Funktionen
revoke all on public.rezeptur_version from anon;
revoke insert, update, delete, truncate on public.rezeptur_version from authenticated;
grant select on public.rezeptur_version to authenticated;
-- nur lesen über Regeln; angelegt wird ausschließlich über die Funktionen unten
drop policy if exists p322_version_chef on public.rezeptur_version;
create policy p322_version_chef on public.rezeptur_version for select to authenticated
  using (owner_user_id = auth.uid() and public.mein_chef_id() is null);
drop policy if exists p322_version_ma on public.rezeptur_version;
create policy p322_version_ma on public.rezeptur_version for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('rezeptur') or public.darf_ich_modul_aendern('rezeptur')));

-- Hilfe: Betrieb + Schreibrecht prüfen, Rezeptur gehört zum Betrieb
create or replace function public.p322_rezeptur_pruefen(p_rezeptur uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_betrieb uuid := coalesce(public.mein_chef_id(), auth.uid());
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Nicht angemeldet.' using errcode = '42501';
  end if;
  if public.mein_chef_id() is not null and not public.darf_ich_modul_aendern('rezeptur') then
    raise exception 'Kein Schreibrecht fuer Rezepturen.' using errcode = '42501';
  end if;
  select owner_user_id into v_owner from public.rezepturen where id = p_rezeptur;
  if v_owner is null or v_owner <> v_betrieb then
    raise exception 'Rezeptur nicht gefunden.' using errcode = '42501';
  end if;
  return v_betrieb;
end $$;
revoke all on function public.p322_rezeptur_pruefen(uuid) from public, anon;

-- Hilfe: aktueller Stand einer Rezeptur als JSON
create or replace function public.p322_rezeptur_stand(p_rezeptur uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', r.name, 'typ', r.typ, 'basis_menge', r.basis_menge, 'basis_einheit', r.basis_einheit,
    'verlust_prozent', r.backverlust_prozent, 'gebinde_menge', r.gebinde_menge, 'gebinde_kosten', r.gebinde_kosten,
    'zeilen', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', z.position, 'bezeichnung', z.bezeichnung, 'menge', z.menge, 'einheit', z.einheit,
        'preis_pro_einheit', z.preis_pro_einheit, 'rolle', z.rolle, 'anteil_prozent', z.anteil_prozent,
        'ist_rest', z.ist_rest, 'artikel_id', z.artikel_id) order by z.position)
      from public.rezeptur_zutaten z where z.rezeptur_id = r.id), '[]'::jsonb))
  from public.rezepturen r where r.id = p_rezeptur;
$$;
revoke all on function public.p322_rezeptur_stand(uuid) from public, anon;

-- Hilfe: Version anlegen (ohne Rechteprüfung — nur aus den Funktionen hier)
create or replace function public.p322_version_schreiben(p_rezeptur uuid, p_betrieb uuid, p_notiz text, p_anlass text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nr integer;
begin
  perform pg_advisory_xact_lock(hashtext('rezeptur_version:' || p_rezeptur::text));
  select coalesce(max(version_nr), 0) + 1 into v_nr from public.rezeptur_version where rezeptur_id = p_rezeptur;
  insert into public.rezeptur_version (owner_user_id, rezeptur_id, version_nr, notiz, anlass, daten, erstellt_von, erstellt_von_name)
  values (p_betrieb, p_rezeptur, v_nr, nullif(btrim(left(coalesce(p_notiz, ''), 500)), ''), p_anlass,
          public.p322_rezeptur_stand(p_rezeptur), auth.uid(), public.nachweis_name(auth.uid()));
  return v_nr;
end $$;
revoke all on function public.p322_version_schreiben(uuid, uuid, text, text) from public, anon, authenticated;

-- 1) Stand festhalten
create or replace function public.rezeptur_version_anlegen(p_rezeptur uuid, p_notiz text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_betrieb uuid := public.p322_rezeptur_pruefen(p_rezeptur);
begin
  return public.p322_version_schreiben(p_rezeptur, v_betrieb, p_notiz, 'manuell');
end $$;
revoke all on function public.rezeptur_version_anlegen(uuid, text) from public, anon;
grant execute on function public.rezeptur_version_anlegen(uuid, text) to authenticated;

-- 2) Rohstoffe/Zutaten ersetzen (eine Transaktion)
create or replace function public.rezeptur_zutaten_speichern(p_rezeptur uuid, p_zeilen jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_betrieb uuid := public.p322_rezeptur_pruefen(p_rezeptur);
  v_n integer;
begin
  if jsonb_typeof(p_zeilen) <> 'array' or jsonb_array_length(p_zeilen) > 300 then
    raise exception 'Zeilen ungueltig (hoechstens 300).' using errcode = '22023';
  end if;
  delete from public.rezeptur_zutaten where rezeptur_id = p_rezeptur and owner_user_id = v_betrieb;
  insert into public.rezeptur_zutaten (owner_user_id, rezeptur_id, position, bezeichnung, menge, einheit, preis_pro_einheit, rolle, anteil_prozent, ist_rest, artikel_id)
  select v_betrieb, p_rezeptur, z.ord::integer,
         left(coalesce(nullif(btrim(z.v->>'bezeichnung'), ''), 'Zutat'), 200),
         nullif(z.v->>'menge', '')::numeric,
         left(coalesce(nullif(btrim(z.v->>'einheit'), ''), 'kg'), 20),
         nullif(z.v->>'preis_pro_einheit', '')::numeric,
         left(coalesce(nullif(z.v->>'rolle', ''), 'sonstige'), 20),
         nullif(z.v->>'anteil_prozent', '')::numeric,
         coalesce((z.v->>'ist_rest')::boolean, false),
         nullif(z.v->>'artikel_id', '')::uuid
    from jsonb_array_elements(p_zeilen) with ordinality as z(v, ord);
  get diagnostics v_n = row_count;
  update public.rezepturen set aktualisiert_am = now() where id = p_rezeptur;
  return v_n;
end $$;
revoke all on function public.rezeptur_zutaten_speichern(uuid, jsonb) from public, anon;
grant execute on function public.rezeptur_zutaten_speichern(uuid, jsonb) to authenticated;

-- 3) Rohstoff in allen Rezepturen tauschen (je betroffene Rezeptur vorher eine Version)
create or replace function public.rezeptur_rohstoff_tauschen(
  p_alt_artikel uuid, p_alt_name text, p_neu_artikel uuid, p_neu_name text, p_neu_preis numeric, p_notiz text)
returns table (rezeptur_id uuid, name text, zeilen integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_betrieb uuid := coalesce(public.mein_chef_id(), auth.uid());
  v_alt text := lower(btrim(coalesce(p_alt_name, '')));
  v_neu text := left(btrim(coalesce(p_neu_name, '')), 200);
  r record;
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  if public.mein_chef_id() is not null and not public.darf_ich_modul_aendern('rezeptur') then
    raise exception 'Kein Schreibrecht fuer Rezepturen.' using errcode = '42501';
  end if;
  if p_alt_artikel is null and v_alt = '' then raise exception 'Welcher Rohstoff soll ersetzt werden?' using errcode = '22023'; end if;
  if v_neu = '' and p_neu_artikel is null then raise exception 'Bitte den neuen Rohstoff angeben.' using errcode = '22023'; end if;
  if p_neu_preis is not null and p_neu_preis < 0 then raise exception 'Preis darf nicht negativ sein.' using errcode = '22023'; end if;
  if p_neu_artikel is not null and not exists (select 1 from public.artikel a where a.id = p_neu_artikel and a.owner_user_id = v_betrieb) then
    raise exception 'Der Artikel gehoert nicht zu diesem Betrieb.' using errcode = '42501';
  end if;
  if v_neu = '' then select a.bezeichnung into v_neu from public.artikel a where a.id = p_neu_artikel; end if;

  for r in
    select distinct rz.id, rz.name
      from public.rezepturen rz
      join public.rezeptur_zutaten z on z.rezeptur_id = rz.id
     where rz.owner_user_id = v_betrieb and coalesce(rz.archiviert, false) = false
       and ((p_alt_artikel is not null and z.artikel_id = p_alt_artikel)
         or (p_alt_artikel is null and z.artikel_id is null and lower(btrim(z.bezeichnung)) = v_alt))
     order by rz.name
  loop
    perform public.p322_version_schreiben(r.id, v_betrieb,
      'Vor dem Tausch: ' || coalesce(nullif(btrim(p_alt_name), ''), 'Rohstoff') || ' -> ' || v_neu
        || coalesce(' (' || nullif(btrim(left(coalesce(p_notiz, ''), 300)), '') || ')', ''), 'tausch');
    update public.rezeptur_zutaten z
       set bezeichnung = v_neu,
           artikel_id = p_neu_artikel,
           preis_pro_einheit = coalesce(p_neu_preis, z.preis_pro_einheit)
     where z.rezeptur_id = r.id and z.owner_user_id = v_betrieb
       and ((p_alt_artikel is not null and z.artikel_id = p_alt_artikel)
         or (p_alt_artikel is null and z.artikel_id is null and lower(btrim(z.bezeichnung)) = v_alt));
    get diagnostics v_n = row_count;
    update public.rezepturen set aktualisiert_am = now() where id = r.id;
    rezeptur_id := r.id; name := r.name; zeilen := v_n;
    return next;
  end loop;
end $$;
revoke all on function public.rezeptur_rohstoff_tauschen(uuid, text, uuid, text, numeric, text) from public, anon;
grant execute on function public.rezeptur_rohstoff_tauschen(uuid, text, uuid, text, numeric, text) to authenticated;

-- 4) Ansatz -> Charge (Rechte des Nutzers: Regeln von charge_los/charge_verwendung + Wächter p320)
create or replace function public.rezeptur_ansatz_charge(
  p_rezeptur uuid, p_charge_nr text, p_menge numeric, p_einheit text, p_mhd date, p_bemerkung text, p_rohstoffe jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_betrieb uuid := coalesce(public.mein_chef_id(), auth.uid());
  v_rz record;
  v_nr text := left(btrim(coalesce(p_charge_nr, '')), 60);
  v_los uuid;
  v_roh record;
  v_ref text;
  v_roh_los uuid;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet.' using errcode = '42501'; end if;
  select id, name, artikel_id, owner_user_id into v_rz from public.rezepturen where id = p_rezeptur;
  if v_rz.id is null or v_rz.owner_user_id <> v_betrieb then raise exception 'Rezeptur nicht gefunden.' using errcode = '42501'; end if;
  if v_nr = '' then raise exception 'Bitte eine Chargennummer angeben.' using errcode = '22023'; end if;
  if p_menge is null or p_menge <= 0 then raise exception 'Die Menge muss groesser als 0 sein.' using errcode = '22023'; end if;
  if jsonb_typeof(p_rohstoffe) <> 'array' or jsonb_array_length(p_rohstoffe) > 300 then
    raise exception 'Rohstoffe ungueltig.' using errcode = '22023';
  end if;
  if exists (select 1 from public.charge_los l where l.owner_user_id = v_betrieb and lower(btrim(l.charge_nr)) = lower(v_nr)) then
    raise exception 'Die Chargennummer % gibt es schon.', v_nr using errcode = '23505';
  end if;

  insert into public.charge_los (owner_user_id, charge_nr, typ, bezeichnung, artikel_id, menge, einheit, herstell_datum, mhd, herkunft, status, bemerkung)
  values (v_betrieb, v_nr, 'charge', v_rz.name, v_rz.artikel_id, p_menge, left(coalesce(nullif(btrim(p_einheit), ''), 'kg'), 20),
          (now() at time zone 'Europe/Berlin')::date, p_mhd, left('Rezeptur: ' || v_rz.name, 200), 'quarantaene',
          nullif(btrim(left(coalesce(p_bemerkung, ''), 1000)), ''))
  returning id into v_los;

  for v_roh in
    select left(coalesce(nullif(btrim(x->>'bezeichnung'), ''), 'Rohstoff'), 200) as bez,
           nullif(x->>'menge', '')::numeric as menge,
           nullif(btrim(coalesce(x->>'charge_nr', '')), '') as cnr
      from jsonb_array_elements(p_rohstoffe) x
  loop
    v_ref := left(coalesce(v_roh.cnr, v_roh.bez), 200);
    -- Eingang an der neuen Charge (Wächter p320 sperrt Rohstoff-Chargen in Quarantäne/gesperrt)
    insert into public.charge_verwendung (owner_user_id, los_id, richtung, referenz, menge, datum, notiz)
    values (v_betrieb, v_los, 'eingang', v_ref, v_roh.menge, (now() at time zone 'Europe/Berlin')::date,
            left('Rohstoff ' || v_roh.bez || ' aus Rezeptur ' || v_rz.name, 500));
    -- Ausgang an der Rohstoff-Charge, wenn es sie im Betrieb gibt (Rückverfolgung vorwärts)
    if v_roh.cnr is not null then
      select l.id into v_roh_los from public.charge_los l
       where l.owner_user_id = v_betrieb and lower(btrim(l.charge_nr)) = lower(v_roh.cnr) limit 1;
      if v_roh_los is not null then
        insert into public.charge_verwendung (owner_user_id, los_id, richtung, referenz, menge, datum, notiz)
        values (v_betrieb, v_roh_los, 'ausgang', v_nr, v_roh.menge, (now() at time zone 'Europe/Berlin')::date,
                left('In Charge ' || v_nr || ' (' || v_rz.name || ')', 500));
      end if;
      v_roh_los := null;
    end if;
  end loop;
  return v_los;
end $$;
revoke all on function public.rezeptur_ansatz_charge(uuid, text, numeric, text, date, text, jsonb) from public, anon;
grant execute on function public.rezeptur_ansatz_charge(uuid, text, numeric, text, date, text, jsonb) to authenticated;

commit;

-- KONTROLLE (nur lesen) — Erwartung: 1 | 1 | 2 | 4 | 0
select (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'rezepturen' and column_name = 'artikel_id') as fertigprodukt,
       (select count(*) from pg_trigger where tgname = 'p322_rezeptur_waechter_trg') as waechter,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'rezeptur_version') as regeln,
       (select count(*) from pg_proc where proname in ('rezeptur_version_anlegen', 'rezeptur_zutaten_speichern', 'rezeptur_rohstoff_tauschen', 'rezeptur_ansatz_charge')) as funktionen,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'rezeptur_version' and cmd <> 'SELECT') as schreib_regeln;
