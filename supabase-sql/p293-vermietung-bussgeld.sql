-- ============================================================================
-- ARGONAUT OS · Paket 293 (09.10.2026) · V2a Vermietung: Bußgelder und
-- Halteranfragen, Bearbeitungsgebühr
--
--   miet_vorgang       Halteranfrage, Anhörung, Bußgeld, Verwarnung, Maut,
--                      Parkverstoß zu einem Mietfahrzeug: Behörde, Aktenzeichen,
--                      Tatzeit, Tatort, Frist. DIE DATENBANK sucht den Mieter
--                      zum Tatzeitpunkt selbst (tatsächliche Übergabe bis
--                      Rückgabe) — der Browser bestimmt das nicht. Fahrer
--                      benennen nur aus dem Mietvertrag (Haupt- oder
--                      Zusatzfahrer), danach ist der Vorgang festgehalten.
--                      Bearbeitungsgebühr und Steuersatz werden beim Anlegen
--                      aus den Einstellungen des Betriebs eingefroren.
--   miet_einstellung   + bearbeitungsgebuehr_cent, gebuehr_ust_satz (19 oder 0),
--                      benennung_text (eigener Begleittext des Betriebs)
--
-- Rechte: Chef alles; Mitarbeiter mit Recht „Verleih" sehen, mit Schreibrecht
-- „Verleih" anlegen, Fahrer benennen, erledigen. Löschen nur der Chef und nur
-- ohne Gebühren-Rechnung. ARGONAUT verschickt nichts an Behörden — der Betrieb
-- sendet die Fahrerbenennung selbst.
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — neue Tabelle, neue Spalten mit Standardwert,
-- neue Funktionen. Bestehende Regeln und Tabellen bleiben unverändert.
-- ============================================================================

begin;

-- ------------------------------------------------------- Einstellungen ---
alter table public.miet_einstellung add column if not exists bearbeitungsgebuehr_cent integer not null default 0;
alter table public.miet_einstellung add column if not exists gebuehr_ust_satz integer not null default 19;
alter table public.miet_einstellung add column if not exists benennung_text text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'miet_einstellung_gebuehr_chk') then
    alter table public.miet_einstellung add constraint miet_einstellung_gebuehr_chk
      check (bearbeitungsgebuehr_cent between 0 and 100000 and gebuehr_ust_satz in (0, 19)
             and (benennung_text is null or char_length(benennung_text) <= 4000));
  end if;
end $$;

-- ------------------------------------------------------------- Tabelle ---
create table if not exists public.miet_vorgang (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  fahrzeug_id          uuid not null references public.miet_fahrzeug(id) on delete restrict,
  art                  text not null default 'halteranfrage' check (art in ('halteranfrage', 'anhoerung', 'bussgeld', 'verwarnung', 'parkverstoss', 'maut', 'sonstiges')),
  behoerde             text not null check (char_length(behoerde) between 2 and 160),
  aktenzeichen         text not null check (char_length(aktenzeichen) between 2 and 60),
  tatzeit              timestamptz not null,
  tatort               text check (tatort is null or char_length(tatort) <= 200),
  vorwurf              text check (vorwurf is null or char_length(vorwurf) <= 300),
  eingang_am           date not null default ((now() at time zone 'Europe/Berlin')::date),
  frist_am             date not null,
  -- von der Datenbank gesetzt: wer hatte das Fahrzeug zum Tatzeitpunkt?
  zuordnung            text not null default 'kein_mieter' check (zuordnung in ('mieter', 'kein_mieter', 'mehrdeutig')),
  buchung_id           uuid references public.miet_buchung(id) on delete restrict,
  -- Fahrer benennen (nur aus dem Mietvertrag)
  benannt_fahrer_id    uuid references public.miet_fahrer(id) on delete restrict,
  benannt_name         text,
  benannt_am           timestamptz,
  benannt_von          uuid,
  status               text not null default 'offen' check (status in ('offen', 'benannt', 'erledigt')),
  erledigt_am          timestamptz,
  -- Bearbeitungsgebühr (eingefroren beim Anlegen)
  gebuehr_cent         integer not null default 0 check (gebuehr_cent between 0 and 100000),
  gebuehr_ust_satz     integer not null default 19 check (gebuehr_ust_satz in (0, 19)),
  gebuehr_rechnung_id  uuid,
  notiz                text check (notiz is null or char_length(notiz) <= 1000),
  erstellt_am          timestamptz not null default now(),
  erstellt_von         uuid default auth.uid(),
  aktualisiert_am      timestamptz not null default now(),
  check (frist_am >= eingang_am - 1),
  unique (owner_user_id, behoerde, aktenzeichen)
);
create index if not exists miet_vorgang_idx on public.miet_vorgang (owner_user_id, status, frist_am);
create index if not exists miet_vorgang_fz_idx on public.miet_vorgang (fahrzeug_id, tatzeit);

-- ------------------------------------------- Mieter zum Tatzeitpunkt finden ---
-- Maßgeblich ist die TATSÄCHLICHE Übergabe bis zur TATSÄCHLICHEN Rückgabe
-- (halb-offen). Ist das Fahrzeug noch unterwegs, gilt die Miete bis jetzt.
-- Reservierte und stornierte Verträge zählen nicht.
create or replace function public.p293_mieter_zur_tatzeit(p_fahrzeug uuid, p_tatzeit timestamptz)
returns table (anzahl integer, buchung uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer, (array_agg(b.id order by b.uebergabe_am))[1]
    from public.miet_buchung b
   where b.fahrzeug_id = p_fahrzeug
     and b.status in ('uebergeben', 'zurueck')
     and b.uebergabe_am is not null
     and p_tatzeit >= b.uebergabe_am
     and p_tatzeit < coalesce(b.rueckgabe_ist, 'infinity'::timestamptz);
$$;
revoke all on function public.p293_mieter_zur_tatzeit(uuid, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------- Wächter ---
create or replace function public.p293_vorgang_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chef boolean := (auth.uid() is not null and auth.uid() = coalesce(new.owner_user_id, old.owner_user_id));
  v_anz integer;
  v_bu uuid;
  v_fa public.miet_fahrer%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.gebuehr_rechnung_id is not null then
      raise exception 'Für diesen Vorgang gibt es eine Gebühren-Rechnung — er bleibt erhalten.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if not exists (select 1 from public.miet_fahrzeug m where m.id = new.fahrzeug_id and m.owner_user_id = new.owner_user_id) then
      raise exception 'Das Fahrzeug gehört nicht zu diesem Betrieb.';
    end if;
    -- Gebühr und Steuersatz aus den Einstellungen einfrieren (der Browser bestimmt sie nicht)
    select coalesce(e.bearbeitungsgebuehr_cent, 0), coalesce(e.gebuehr_ust_satz, 19)
      into new.gebuehr_cent, new.gebuehr_ust_satz
      from public.miet_einstellung e where e.owner_user_id = new.owner_user_id;
    new.gebuehr_cent := coalesce(new.gebuehr_cent, 0);
    new.gebuehr_ust_satz := coalesce(new.gebuehr_ust_satz, 19);
    new.status := 'offen'; new.benannt_fahrer_id := null; new.benannt_name := null; new.benannt_am := null; new.benannt_von := null;
    new.erledigt_am := null; new.gebuehr_rechnung_id := null;
    new.erstellt_am := now(); new.erstellt_von := auth.uid(); new.aktualisiert_am := now();
    if new.tatzeit > now() + interval '1 hour' then
      raise exception 'Die Tatzeit liegt in der Zukunft.';
    end if;
  else
    -- UPDATE
    if new.owner_user_id <> old.owner_user_id or new.erstellt_am <> old.erstellt_am or new.erstellt_von is distinct from old.erstellt_von then
      raise exception 'Besitzer und Anlage eines Vorgangs sind unveränderlich.';
    end if;
    new.aktualisiert_am := now();
    if (new.gebuehr_cent, new.gebuehr_ust_satz) is distinct from (old.gebuehr_cent, old.gebuehr_ust_satz) then
      if not v_chef or old.gebuehr_rechnung_id is not null then
        raise exception 'Die Bearbeitungsgebühr ändert nur der Chef, und nur bevor sie berechnet ist.';
      end if;
    end if;
    if old.gebuehr_rechnung_id is not null and new.gebuehr_rechnung_id is null then
      raise exception 'Die Verknüpfung zur Gebühren-Rechnung bleibt erhalten.';
    end if;
    if old.status <> 'offen'
       and (new.fahrzeug_id, new.art, new.behoerde, new.aktenzeichen, new.tatzeit, new.tatort, new.vorwurf, new.eingang_am, new.frist_am)
           is distinct from
           (old.fahrzeug_id, old.art, old.behoerde, old.aktenzeichen, old.tatzeit, old.tatort, old.vorwurf, old.eingang_am, old.frist_am) then
      raise exception 'Der Vorgang ist bearbeitet — die Angaben der Behörde lassen sich nicht mehr ändern.';
    end if;
    if new.fahrzeug_id <> old.fahrzeug_id
       and not exists (select 1 from public.miet_fahrzeug m where m.id = new.fahrzeug_id and m.owner_user_id = new.owner_user_id) then
      raise exception 'Das Fahrzeug gehört nicht zu diesem Betrieb.';
    end if;
    if new.tatzeit <> old.tatzeit and new.tatzeit > now() + interval '1 hour' then
      raise exception 'Die Tatzeit liegt in der Zukunft.';
    end if;
  end if;

  -- Zuordnung: immer die Datenbank — solange der Vorgang offen ist, bei jeder
  -- Änderung neu (z. B. wurde die Übergabe erst nach dem Anlegen erfasst)
  if tg_op = 'INSERT' or old.status = 'offen' then
    select t.anzahl, t.buchung into v_anz, v_bu from public.p293_mieter_zur_tatzeit(new.fahrzeug_id, new.tatzeit) t;
    if v_anz = 1 then
      new.zuordnung := 'mieter'; new.buchung_id := v_bu;
    elsif v_anz > 1 then
      new.zuordnung := 'mehrdeutig'; new.buchung_id := null;
    else
      new.zuordnung := 'kein_mieter'; new.buchung_id := null;
    end if;
  elsif (new.zuordnung, new.buchung_id) is distinct from (old.zuordnung, old.buchung_id) then
    raise exception 'Der Vorgang ist bearbeitet — die Zuordnung zum Mietvertrag bleibt.';
  end if;

  -- Fahrer benennen
  if tg_op = 'INSERT' then
    return new;
  end if;
  if new.benannt_fahrer_id is distinct from old.benannt_fahrer_id then
    if old.benannt_fahrer_id is not null then
      raise exception 'Die Fahrerbenennung ist festgehalten und lässt sich nicht ändern.';
    end if;
    if old.status <> 'offen' then
      raise exception 'Benennen geht nur bei offenen Vorgängen.';
    end if;
    if new.buchung_id is null then
      raise exception 'Zum Tatzeitpunkt war das Fahrzeug nicht (eindeutig) vermietet — es gibt keinen Fahrer aus einem Mietvertrag.';
    end if;
    select * into v_fa from public.miet_fahrer f where f.id = new.benannt_fahrer_id;
    if not found or v_fa.buchung_id <> new.buchung_id or v_fa.owner_user_id <> new.owner_user_id then
      raise exception 'Der Fahrer steht nicht in diesem Mietvertrag.';
    end if;
    new.benannt_name := v_fa.name; new.benannt_am := now(); new.benannt_von := auth.uid(); new.status := 'benannt';
  elsif (new.benannt_name, new.benannt_am, new.benannt_von) is distinct from (old.benannt_name, old.benannt_am, old.benannt_von) then
    raise exception 'Die Fahrerbenennung ist festgehalten und lässt sich nicht ändern.';
  end if;

  -- Statuswechsel: offen → benannt (nur über Benennen), offen/benannt → erledigt; erledigt bleibt
  if new.status <> old.status and not (new.benannt_fahrer_id is distinct from old.benannt_fahrer_id) then
    if not (old.status in ('offen', 'benannt') and new.status = 'erledigt') then
      raise exception 'Dieser Statuswechsel ist nicht möglich (% → %).', old.status, new.status;
    end if;
    new.erledigt_am := now();
  elsif new.erledigt_am is distinct from old.erledigt_am then
    raise exception 'Das Erledigt-Datum setzt die Datenbank.';
  end if;
  return new;
end;
$$;
drop trigger if exists p293_vorgang_waechter_trg on public.miet_vorgang;
create trigger p293_vorgang_waechter_trg before insert or update or delete on public.miet_vorgang
  for each row execute function public.p293_vorgang_waechter();
revoke all on function public.p293_vorgang_waechter() from public, anon, authenticated;

-- ------------------------------------------------------------- Regeln ---
alter table public.miet_vorgang enable row level security;

drop policy if exists mvo_chef_all on public.miet_vorgang;
create policy mvo_chef_all on public.miet_vorgang for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists mvo_ma_select on public.miet_vorgang;
create policy mvo_ma_select on public.miet_vorgang for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('verleih') or public.darf_ich_modul_aendern('verleih')));
drop policy if exists mvo_ma_insert on public.miet_vorgang;
create policy mvo_ma_insert on public.miet_vorgang for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('verleih'));
drop policy if exists mvo_ma_update on public.miet_vorgang;
create policy mvo_ma_update on public.miet_vorgang for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('verleih'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('verleih'));

commit;

-- KONTROLLE (nur lesen) — Erwartung: 1 | 4 | 1 | 3 | t
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'miet_vorgang') as tabelle,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'miet_vorgang') as regeln,
       (select count(*) from pg_trigger where tgname = 'p293_vorgang_waechter_trg') as waechter,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'miet_einstellung'
          and column_name in ('bearbeitungsgebuehr_cent', 'gebuehr_ust_satz', 'benennung_text')) as neue_spalten,
       (select relrowsecurity from pg_class where oid = 'public.miet_vorgang'::regclass) as rls_an;
