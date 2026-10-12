-- ============================================================
-- ARGONAUT OS · Paket 344 (12.10.2026) · BV3b Feinkost Teil 3
-- Box-Konfigurator mit Saison-Kapazität (Geschenkbox, Präsentkorb,
-- Grillpaket, Weihnachtskiste ...)
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- box_vorlage:     die Box mit Grundpreis (brutto), Steuersatz, Vorlauf
--                  (Bestellschluss X Tage vor Abholung) und Status.
-- box_fach:        Fächer der Box („2 Käse nach Wahl“, „1 Wein“).
-- box_option:      wählbare Artikel je Fach mit Aufpreis.
-- box_kapazitaet:  wie viele Boxen je Tag gepackt werden können.
-- box_bestellung:  die Bestellungen. Der Preis wird IMMER hier in der
--                  Datenbank gerechnet (Grundpreis + Aufpreise) — nie aus
--                  dem Browser übernommen. Die Datenbank lässt je Tag nie
--                  mehr Boxen zu als die Kapazität (Tag wird beim Buchen
--                  gesperrt, FOR UPDATE).
--
-- Rechte wie Paket 342: Besitzer = Betrieb (p181_besitzer), Mitarbeiter
-- lesen mit Modul „lebensmittel“, anlegen/ändern mit Schreibrecht,
-- löschen nur die Geschäftsleitung (sonst „storniert“ bzw. „archiv“).
-- Kein Kunden-Zugang in diesem Paket.
-- ============================================================

-- TEIL 1 von 6: Tabellen Box, Fach, Auswahl
create table if not exists public.box_vorlage (
  id                   uuid primary key default gen_random_uuid(),
  owner_user_id        uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  name                 text not null check (char_length(name) between 1 and 120),
  beschreibung         text check (beschreibung is null or char_length(beschreibung) <= 600),
  grundpreis           numeric(10,2) not null default 0 check (grundpreis >= 0 and grundpreis <= 100000),
  mwst_satz            numeric(4,1) not null default 7 check (mwst_satz in (0, 7, 19)),
  bestell_vorlauf_tage integer not null default 2 check (bestell_vorlauf_tage between 0 and 60),
  status               text not null default 'entwurf' check (status in ('entwurf', 'aktiv', 'archiv')),
  erstellt_von         uuid default auth.uid(),
  erstellt_am          timestamptz not null default now(),
  aktualisiert_am      timestamptz not null default now()
);
create index if not exists box_vorlage_idx on public.box_vorlage (owner_user_id, status);

create table if not exists public.box_fach (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  vorlage_id      uuid not null references public.box_vorlage(id) on delete cascade,
  titel           text not null check (char_length(titel) between 1 and 80),
  anzahl          integer not null default 1 check (anzahl between 1 and 20),
  position        integer not null default 0,
  aktualisiert_am timestamptz not null default now()
);
create index if not exists box_fach_idx on public.box_fach (owner_user_id, vorlage_id, position);

create table if not exists public.box_option (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  fach_id         uuid not null references public.box_fach(id) on delete cascade,
  artikel_id      uuid not null references public.artikel(id) on delete cascade,
  aufpreis        numeric(10,2) not null default 0 check (aufpreis >= 0 and aufpreis <= 10000),
  aktiv           boolean not null default true,
  aktualisiert_am timestamptz not null default now(),
  constraint box_option_eindeutig unique (fach_id, artikel_id)
);
create index if not exists box_option_idx on public.box_option (owner_user_id, fach_id);

-- TEIL 2 von 6: Tabellen Kapazität und Bestellungen
create table if not exists public.box_kapazitaet (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  vorlage_id      uuid not null references public.box_vorlage(id) on delete cascade,
  tag             date not null,
  max_boxen       integer not null check (max_boxen between 1 and 10000),
  aktualisiert_am timestamptz not null default now(),
  constraint box_kapazitaet_eindeutig unique (vorlage_id, tag)
);
create index if not exists box_kapazitaet_idx on public.box_kapazitaet (owner_user_id, tag);

create table if not exists public.box_bestellung (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  vorlage_id      uuid not null references public.box_vorlage(id) on delete restrict,
  kontakt_id      uuid,
  kunde_name      text not null check (char_length(kunde_name) between 1 and 120),
  kunde_tel       text check (kunde_tel is null or char_length(kunde_tel) <= 40),
  kunde_mail      text check (kunde_mail is null or char_length(kunde_mail) <= 160),
  abhol_tag       date not null,
  anzahl          integer not null default 1 check (anzahl between 1 and 100),
  auswahl         jsonb not null default '[]'::jsonb,
  preis_je_box    numeric(10,2) not null default 0,
  gesamt          numeric(12,2) not null default 0,
  status          text not null default 'offen' check (status in ('offen', 'bereit', 'abgeholt', 'storniert', 'nicht_abgeholt')),
  quelle          text not null default 'theke' check (quelle in ('theke', 'telefon', 'mail', 'shop')),
  notiz           text check (notiz is null or char_length(notiz) <= 300),
  erstellt_von    uuid default auth.uid(),
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists box_bestellung_idx on public.box_bestellung (owner_user_id, abhol_tag, status);
create index if not exists box_bestellung_vorlage_idx on public.box_bestellung (vorlage_id, abhol_tag);

-- TEIL 3 von 6: Wächter für Box, Fach, Auswahl und Kapazität
-- (Betrieb fest, Bezüge im eigenen Betrieb, Kapazität nie unter gebucht)
create or replace function public.p344_box_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_belegt integer;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.box_bestellung b where b.vorlage_id = old.vorlage_id and b.abhol_tag = old.tag and b.status in ('offen', 'bereit', 'abgeholt')) then
      raise exception 'An diesem Tag sind Boxen gebucht — die Kapazität bleibt stehen.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Der Betrieb eines Eintrags kann nicht geändert werden.';
  end if;
  new.aktualisiert_am := now();
  if tg_table_name = 'box_fach' or tg_table_name = 'box_kapazitaet' then
    if tg_op = 'UPDATE' and new.vorlage_id is distinct from old.vorlage_id then
      raise exception 'Ein Eintrag wandert nicht in eine andere Box.';
    end if;
    if not exists (select 1 from public.box_vorlage x where x.id = new.vorlage_id and x.owner_user_id = new.owner_user_id) then
      raise exception 'Die Box gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  if tg_table_name = 'box_option' then
    if tg_op = 'UPDATE' and (new.fach_id is distinct from old.fach_id or new.artikel_id is distinct from old.artikel_id) then
      raise exception 'Fach und Artikel einer Auswahl bleiben fest — bitte neu anlegen.';
    end if;
    if not exists (select 1 from public.box_fach x where x.id = new.fach_id and x.owner_user_id = new.owner_user_id) then
      raise exception 'Das Fach gehört nicht zu Ihrem Betrieb.';
    end if;
    if not exists (select 1 from public.artikel x where x.id = new.artikel_id and x.owner_user_id = new.owner_user_id) then
      raise exception 'Der Artikel gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  if tg_table_name = 'box_kapazitaet' and tg_op = 'UPDATE' then
    if new.tag is distinct from old.tag then raise exception 'Box und Tag einer Kapazität bleiben fest.'; end if;
    select coalesce(sum(b.anzahl), 0) into v_belegt from public.box_bestellung b
      where b.vorlage_id = new.vorlage_id and b.abhol_tag = new.tag and b.status in ('offen', 'bereit', 'abgeholt');
    if new.max_boxen < v_belegt then
      raise exception 'Es sind bereits % Boxen gebucht — die Kapazität kann nicht darunter sinken.', v_belegt;
    end if;
  end if;
  return new;
end;
$$;

-- TEIL 4 von 6: Wächter für Bestellungen (Auswahl wie die Box, Preis aus der
-- Datenbank, Bestellschluss im Shop, nie mehr Boxen je Tag als die Kapazität)
create or replace function public.p344_box_bestell_waechter()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v public.box_vorlage%rowtype; k public.box_kapazitaet%rowtype; f record;
  n integer; v_auf numeric; v_belegt integer; v_heute date := (now() at time zone 'Europe/Berlin')::date;
begin
  if tg_op = 'UPDATE' and (new.owner_user_id is distinct from old.owner_user_id or new.vorlage_id is distinct from old.vorlage_id) then
    raise exception 'Betrieb und Box einer Bestellung können nicht geändert werden.';
  end if;
  new.aktualisiert_am := now();
  select * into v from public.box_vorlage x where x.id = new.vorlage_id and x.owner_user_id = new.owner_user_id;
  if v.id is null then raise exception 'Die Box gehört nicht zu Ihrem Betrieb.'; end if;
  if tg_op = 'INSERT' and v.status <> 'aktiv' then raise exception 'Diese Box ist nicht zum Bestellen freigegeben.'; end if;
  if tg_op = 'INSERT' or new.auswahl is distinct from old.auswahl then
    if tg_op = 'UPDATE' and old.status <> 'offen' then raise exception 'Die Auswahl lässt sich nur bei offenen Bestellungen ändern.'; end if;
    if jsonb_typeof(new.auswahl) is distinct from 'array' or jsonb_array_length(new.auswahl) > 400 then raise exception 'Die Auswahl ist ungültig.'; end if;
    for f in select x.id, x.titel, x.anzahl from public.box_fach x where x.vorlage_id = new.vorlage_id loop
      select count(*) into n from jsonb_array_elements(new.auswahl) e where e->>'fach_id' = f.id::text;
      if n <> f.anzahl then raise exception 'Im Fach „%“ sind genau % zu wählen.', f.titel, f.anzahl; end if;
    end loop;
    select count(*) into n from jsonb_array_elements(new.auswahl) e where not exists (select 1 from public.box_option o join public.box_fach x on x.id = o.fach_id
      where x.vorlage_id = new.vorlage_id and o.aktiv and o.fach_id::text = e->>'fach_id' and o.artikel_id::text = e->>'artikel_id');
    if n > 0 then raise exception 'Die Auswahl passt nicht zur Box — bitte neu wählen.'; end if;
    -- Auswahl mit Namen und Aufpreisen als Beleg festhalten, Preis hier rechnen
    select coalesce(jsonb_agg(jsonb_build_object('fach_id', x.id, 'fach', x.titel, 'artikel_id', o.artikel_id, 'name', coalesce(a.bezeichnung, 'Artikel'), 'aufpreis', o.aufpreis) order by x.position, x.titel, e.nr), '[]'::jsonb),
           coalesce(sum(o.aufpreis), 0) into new.auswahl, v_auf
      from jsonb_array_elements(new.auswahl) with ordinality e(el, nr)
      join public.box_fach x on x.id::text = e.el->>'fach_id' and x.vorlage_id = new.vorlage_id
      join public.box_option o on o.fach_id = x.id and o.artikel_id::text = e.el->>'artikel_id' left join public.artikel a on a.id = o.artikel_id;
    new.preis_je_box := v.grundpreis + v_auf;
  else
    new.preis_je_box := old.preis_je_box;
  end if;
  new.gesamt := new.preis_je_box * new.anzahl;
  if new.quelle = 'shop' and (tg_op = 'INSERT' or new.abhol_tag is distinct from old.abhol_tag) and new.abhol_tag - v.bestell_vorlauf_tage < v_heute then
    raise exception 'Für diesen Abholtag ist Bestellschluss.';
  end if;
  if new.status in ('offen', 'bereit', 'abgeholt') and (tg_op = 'INSERT' or new.abhol_tag is distinct from old.abhol_tag or new.anzahl > old.anzahl or old.status not in ('offen', 'bereit', 'abgeholt')) then
    select * into k from public.box_kapazitaet x where x.vorlage_id = new.vorlage_id and x.tag = new.abhol_tag for update;
    if k.id is null then raise exception 'Für diesen Tag ist keine Box-Kapazität eingetragen.'; end if;
    select coalesce(sum(b.anzahl), 0) into v_belegt from public.box_bestellung b
      where b.vorlage_id = new.vorlage_id and b.abhol_tag = new.abhol_tag and b.status in ('offen', 'bereit', 'abgeholt') and b.id <> new.id;
    if v_belegt + new.anzahl > k.max_boxen then
      raise exception 'An diesem Tag sind nur noch % von % Boxen frei.', greatest(k.max_boxen - v_belegt, 0), k.max_boxen;
    end if;
  end if;
  return new;
end;
$$;

-- TEIL 5 von 6: Auslöser und Rechte
do $$
declare
  t text;
begin
  foreach t in array array['box_vorlage', 'box_fach', 'box_option', 'box_kapazitaet', 'box_bestellung'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop trigger if exists p181_besitzer on public.%I', t);
    execute format('create trigger p181_besitzer before insert or update on public.%I for each row execute function public.p181_besitzer()', t);
    execute format('drop trigger if exists p344_waechter on public.%I', t);
    execute format('create trigger p344_waechter before insert or update on public.%I for each row execute function public.%I()', t,
      case when t = 'box_bestellung' then 'p344_box_bestell_waechter' else 'p344_box_waechter' end);
    execute format('drop policy if exists p344_owner_all on public.%I', t);
    execute format('create policy p344_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p344_ma_select on public.%I', t);
    execute format('create policy p344_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''lebensmittel'') or public.darf_ich_modul_aendern(''lebensmittel'')))', t);
    execute format('drop policy if exists p344_ma_insert on public.%I', t);
    execute format('create policy p344_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''lebensmittel''))', t);
    execute format('drop policy if exists p344_ma_update on public.%I', t);
    execute format('create policy p344_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''lebensmittel'')) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''lebensmittel''))', t);
  end loop;
end $$;

drop trigger if exists p344_loeschwaechter on public.box_kapazitaet;
create trigger p344_loeschwaechter before delete on public.box_kapazitaet
  for each row execute function public.p344_box_waechter();

-- TEIL 6 von 6: KONTROLLE — Erwartung: tabellen = 5 | regeln = 20 | ausloeser = 11 | rls_an = 5
-- (regeln = 25 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel, die
--  Paket 164 an jede neue Tabelle hängt — je Tabelle eine mehr, harmlos)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'box\_%' and table_name in ('box_vorlage', 'box_fach', 'box_option', 'box_kapazitaet', 'box_bestellung')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('box_vorlage', 'box_fach', 'box_option', 'box_kapazitaet', 'box_bestellung')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.box_vorlage'::regclass, 'public.box_fach'::regclass, 'public.box_option'::regclass, 'public.box_kapazitaet'::regclass, 'public.box_bestellung'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('box_vorlage', 'box_fach', 'box_option', 'box_kapazitaet', 'box_bestellung') and relrowsecurity) as rls_an;
