-- ============================================================
-- ARGONAUT OS · Paket 342 (12.10.2026) · BV3b Feinkost Teil 1
-- Vorbestellung und Vormerkliste für knappe Ware
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- vorbestell_aktion: eine knappe Ware zum Vorbestellen (z. B. „Dry-Aged
--                    Rib-Eye 42 Tage", „Weihnachtsgans", „Trüffel-Pralinen")
--                    mit Gesamtmenge, Abholzeitraum, Bestellschluss und
--                    Höchstmenge je Kunde; optional mit Reife-Charge
--                    (Paket 339) oder Artikel verknüpft.
-- vorbestell_posten: die Vorbestellungen der Kunden (Theke, Telefon, später
--                    Shop). Die Datenbank lässt NIE mehr zu, als da ist:
--                    Wächter sperrt die Aktion beim Buchen (FOR UPDATE) und
--                    rechnet offen + bereit + abgeholt gegen die Gesamtmenge.
-- vormerkung:        Vormerkliste, wenn ausgebucht. Nur mit Einwilligung in
--                    die Benachrichtigung (Wortlaut und Zeitpunkt werden
--                    gespeichert). Wird etwas frei, rückt die Liste der Reihe
--                    nach nach.
--
-- Rechte wie Paket 339: Besitzer = Betrieb (Auslöser p181_besitzer),
-- Mitarbeiter lesen mit Modul „lebensmittel", anlegen/ändern mit
-- Schreibrecht, löschen nur die Geschäftsleitung (sonst Status „storniert"
-- bzw. „erloschen").
-- Kein Kunden-Zugang in diesem Paket — der Shop folgt in BV3b Teil 2
-- (hinter dem Start-Schalter).
-- ============================================================

create table if not exists public.vorbestell_aktion (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  titel           text not null check (char_length(titel) between 1 and 120),
  reife_charge_id uuid references public.reife_charge(id) on delete set null,
  artikel_id      uuid,
  menge_gesamt    numeric(12,3) not null check (menge_gesamt > 0 and menge_gesamt <= 1000000),
  einheit         text not null default 'Stk' check (einheit in ('kg', 'g', 'l', 'Stk')),
  max_je_kunde    numeric(12,3) check (max_je_kunde is null or max_je_kunde > 0),
  abhol_von       date not null,
  abhol_bis       date not null,
  bestell_schluss date,
  status          text not null default 'entwurf' check (status in ('entwurf', 'offen', 'geschlossen', 'abgeschlossen')),
  notiz           text check (notiz is null or char_length(notiz) <= 500),
  erstellt_von    uuid default auth.uid(),
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  constraint vorbestell_aktion_zeit_ck check (abhol_bis >= abhol_von and (bestell_schluss is null or bestell_schluss <= abhol_bis))
);
create index if not exists vorbestell_aktion_idx on public.vorbestell_aktion (owner_user_id, status, abhol_von);

create table if not exists public.vorbestell_posten (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  aktion_id       uuid not null references public.vorbestell_aktion(id) on delete cascade,
  kontakt_id      uuid,
  kunde_name      text not null check (char_length(kunde_name) between 1 and 120),
  kunde_tel       text check (kunde_tel is null or char_length(kunde_tel) <= 40),
  kunde_mail      text check (kunde_mail is null or char_length(kunde_mail) <= 160),
  menge           numeric(12,3) not null check (menge > 0 and menge <= 1000000),
  abhol_tag       date not null,
  status          text not null default 'offen' check (status in ('offen', 'bereit', 'abgeholt', 'storniert', 'nicht_abgeholt')),
  quelle          text not null default 'theke' check (quelle in ('theke', 'telefon', 'mail', 'shop', 'vormerkliste')),
  vormerkung_id   uuid,
  notiz           text check (notiz is null or char_length(notiz) <= 300),
  erstellt_von    uuid default auth.uid(),
  erstellt_am     timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists vorbestell_posten_idx on public.vorbestell_posten (owner_user_id, aktion_id, status);
create index if not exists vorbestell_posten_tag_idx on public.vorbestell_posten (owner_user_id, abhol_tag);

create table if not exists public.vormerkung (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  aktion_id             uuid not null references public.vorbestell_aktion(id) on delete cascade,
  kontakt_id            uuid,
  kunde_name            text not null check (char_length(kunde_name) between 1 and 120),
  kunde_tel             text check (kunde_tel is null or char_length(kunde_tel) <= 40),
  kunde_mail            text check (kunde_mail is null or char_length(kunde_mail) <= 160),
  menge_wunsch          numeric(12,3) not null check (menge_wunsch > 0 and menge_wunsch <= 1000000),
  einwilligung          boolean not null default false,
  einwilligung_am       timestamptz,
  einwilligung_wortlaut text check (einwilligung_wortlaut is null or char_length(einwilligung_wortlaut) <= 600),
  status                text not null default 'wartet' check (status in ('wartet', 'benachrichtigt', 'uebernommen', 'erloschen', 'abgemeldet')),
  benachrichtigt_am     timestamptz,
  frist_bis             timestamptz,
  notiz                 text check (notiz is null or char_length(notiz) <= 300),
  erstellt_von          uuid default auth.uid(),
  erstellt_am           timestamptz not null default now(),
  aktualisiert_am       timestamptz not null default now(),
  -- Ohne Einwilligung keine Vormerkung, ohne Weg kein Benachrichtigen
  constraint vormerkung_einwilligung_ck check (einwilligung = true and einwilligung_wortlaut is not null and char_length(einwilligung_wortlaut) >= 20),
  constraint vormerkung_weg_ck check (kunde_tel is not null or kunde_mail is not null)
);
create index if not exists vormerkung_idx on public.vormerkung (owner_user_id, aktion_id, status, erstellt_am);

alter table public.vorbestell_aktion enable row level security;
alter table public.vorbestell_posten enable row level security;
alter table public.vormerkung enable row level security;

-- Besitzer = Betrieb (gleicher Auslöser wie überall seit Paket 181)
drop trigger if exists p181_besitzer on public.vorbestell_aktion;
create trigger p181_besitzer before insert or update on public.vorbestell_aktion
  for each row execute function public.p181_besitzer();
drop trigger if exists p181_besitzer on public.vorbestell_posten;
create trigger p181_besitzer before insert or update on public.vorbestell_posten
  for each row execute function public.p181_besitzer();
drop trigger if exists p181_besitzer on public.vormerkung;
create trigger p181_besitzer before insert or update on public.vormerkung
  for each row execute function public.p181_besitzer();

-- Wächter: Betrieb fest, Bezüge im eigenen Betrieb, nie mehr vorbestellt als da ist
create or replace function public.p342_vorbestell_waechter()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a public.vorbestell_aktion%rowtype;
  v_belegt numeric;
begin
  if tg_op = 'UPDATE' and new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Der Betrieb eines Eintrags kann nicht geändert werden.';
  end if;
  new.aktualisiert_am := now();

  if tg_table_name = 'vorbestell_aktion' then
    if new.reife_charge_id is not null and not exists (
      select 1 from public.reife_charge c where c.id = new.reife_charge_id and c.owner_user_id = new.owner_user_id) then
      raise exception 'Die Reife-Charge gehört nicht zu Ihrem Betrieb.';
    end if;
    if new.artikel_id is not null and (tg_op = 'INSERT' or new.artikel_id is distinct from old.artikel_id) and not exists (
      select 1 from public.artikel x where x.id = new.artikel_id and x.owner_user_id = new.owner_user_id) then
      raise exception 'Der Artikel gehört nicht zu Ihrem Betrieb.';
    end if;
    if tg_op = 'UPDATE' and new.menge_gesamt < old.menge_gesamt then
      select coalesce(sum(p.menge), 0) into v_belegt from public.vorbestell_posten p
        where p.aktion_id = new.id and p.status in ('offen', 'bereit', 'abgeholt');
      if new.menge_gesamt < v_belegt then
        raise exception 'Es sind bereits % vorbestellt — die Gesamtmenge kann nicht darunter sinken.', replace(trim_scale(v_belegt)::text, '.', ',');
      end if;
    end if;
    return new;
  end if;

  -- vorbestell_posten und vormerkung: Aktion bleibt fest und gehört zum Betrieb
  if tg_op = 'UPDATE' and new.aktion_id is distinct from old.aktion_id then
    raise exception 'Die Aktion eines Eintrags kann nicht geändert werden.';
  end if;
  select * into a from public.vorbestell_aktion x
    where x.id = new.aktion_id and x.owner_user_id = new.owner_user_id
    for update;
  if a.id is null then
    raise exception 'Die Vorbestell-Aktion gehört nicht zu Ihrem Betrieb.';
  end if;

  if tg_table_name = 'vormerkung' then
    if tg_op = 'INSERT' then
      new.einwilligung_am := now();
      if a.status in ('abgeschlossen') then
        raise exception 'Die Aktion ist abgeschlossen — keine neue Vormerkung.';
      end if;
    elsif new.einwilligung_am is distinct from old.einwilligung_am or new.einwilligung_wortlaut is distinct from old.einwilligung_wortlaut then
      raise exception 'Die Einwilligung wird nicht nachträglich geändert.';
    end if;
    if new.status = 'benachrichtigt' and (tg_op = 'INSERT' or old.status is distinct from 'benachrichtigt') then
      new.benachrichtigt_am := now();
      if new.frist_bis is null then
        new.frist_bis := now() + interval '48 hours';
      end if;
    end if;
    return new;
  end if;

  -- vorbestell_posten
  if tg_op = 'INSERT' and a.status <> 'offen' then
    raise exception 'Die Aktion ist nicht zum Vorbestellen geöffnet.';
  end if;
  if (tg_op = 'INSERT' or new.abhol_tag is distinct from old.abhol_tag) and (new.abhol_tag < a.abhol_von or new.abhol_tag > a.abhol_bis) then
    raise exception 'Der Abholtag liegt außerhalb des Abholzeitraums.';
  end if;
  if a.max_je_kunde is not null and new.menge > a.max_je_kunde and (tg_op = 'INSERT' or new.menge is distinct from old.menge) then
    raise exception 'Höchstens % je Kunde.', replace(trim_scale(a.max_je_kunde)::text, '.', ',');
  end if;
  if new.status in ('offen', 'bereit', 'abgeholt') then
    select coalesce(sum(p.menge), 0) into v_belegt from public.vorbestell_posten p
      where p.aktion_id = new.aktion_id and p.status in ('offen', 'bereit', 'abgeholt') and p.id <> new.id;
    if v_belegt + new.menge > a.menge_gesamt then
      raise exception 'Nicht mehr genug da: frei sind noch %.', replace(trim_scale(greatest(a.menge_gesamt - v_belegt, 0))::text, '.', ',');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists p342_waechter on public.vorbestell_aktion;
create trigger p342_waechter before insert or update on public.vorbestell_aktion
  for each row execute function public.p342_vorbestell_waechter();
drop trigger if exists p342_waechter on public.vorbestell_posten;
create trigger p342_waechter before insert or update on public.vorbestell_posten
  for each row execute function public.p342_vorbestell_waechter();
drop trigger if exists p342_waechter on public.vormerkung;
create trigger p342_waechter before insert or update on public.vormerkung
  for each row execute function public.p342_vorbestell_waechter();

-- Regeln (je Tabelle: Besitzer alles; Mitarbeiter lesen, anlegen, ändern — nicht löschen)
do $$
declare
  t text;
begin
  foreach t in array array['vorbestell_aktion', 'vorbestell_posten', 'vormerkung'] loop
    execute format('drop policy if exists p342_owner_all on public.%I', t);
    execute format('create policy p342_owner_all on public.%I for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)', t);
    execute format('drop policy if exists p342_ma_select on public.%I', t);
    execute format('create policy p342_ma_select on public.%I for select to authenticated using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen(''lebensmittel'') or public.darf_ich_modul_aendern(''lebensmittel'')))', t);
    execute format('drop policy if exists p342_ma_insert on public.%I', t);
    execute format('create policy p342_ma_insert on public.%I for insert to authenticated with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''lebensmittel''))', t);
    execute format('drop policy if exists p342_ma_update on public.%I', t);
    execute format('create policy p342_ma_update on public.%I for update to authenticated using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''lebensmittel'')) with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern(''lebensmittel''))', t);
  end loop;
end $$;

-- KONTROLLE — Erwartung: tabellen = 3 | regeln = 12 | ausloeser = 6 | rls_an = 3
-- (regeln = 15 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel, die
--  Paket 164 an jede neue Tabelle hängt — je Tabelle eine mehr, harmlos)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('vorbestell_aktion', 'vorbestell_posten', 'vormerkung')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('vorbestell_aktion', 'vorbestell_posten', 'vormerkung')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.vorbestell_aktion'::regclass, 'public.vorbestell_posten'::regclass, 'public.vormerkung'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('vorbestell_aktion', 'vorbestell_posten', 'vormerkung') and relrowsecurity) as rls_an;
