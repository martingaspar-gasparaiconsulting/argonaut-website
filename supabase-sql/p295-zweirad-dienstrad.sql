-- ============================================================================
-- ARGONAUT OS · Paket 295 (09.10.2026) · Z1 Zweirad, E-Bike und Dienstrad-Leasing
--
--   zweirad              Rad-Akte: Fahrrad, Pedelec, S-Pedelec, Lastenrad.
--                        Rahmennummer (Großbuchstaben, ohne Leerzeichen, je
--                        Betrieb einmalig), Motor-/Akku-/Display-/Schlüssel-
--                        nummer, Akku-Wh, Versicherungskennzeichen, Kauf-
--                        datum, Herstellergarantie, Inspektions-Intervall.
--                        Herkunft „bestand" (Händlerware) oder „kunde".
--                        Ist das Rad als Dienstrad übergeben, bleiben Marke,
--                        Modell und Nummern so, wie sie im Übergabeprotokoll
--                        stehen.
--   zweirad_garantie     Garantie-, Gewährleistungs- und Kulanzfälle je Rad
--                        (Bauteil, Fehler, Vorgangsnummer des Herstellers).
--   dienstrad_vorgang    Angebot → im Leasing-Portal eingereicht → genehmigt
--                        (Auftragsnummer des Portals) → übergeben (Rad mit
--                        Rahmennummer, Ausweis geprüft, Einweisung) →
--                        abgerechnet (Rechnung an den Leasinggeber). Nummer
--                        DR-JJJJ-0001 vergibt die Datenbank. Positionen sind
--                        ab „genehmigt" eingefroren. KEINE Schnittstelle zum
--                        Portal — der Betrieb setzt den Status von Hand.
--   werkstatt_auftraege  + zweirad_id: Reparatur-Annahme und Inspektion als
--                        normaler Auftrag im Werkstatt-Board.
--
-- Rechte: Chef alles; Mitarbeiter mit Recht „Werkstatt" sehen, mit Schreib-
-- recht „Werkstatt" anlegen und ändern. Löschen nur der Chef — ein Rad mit
-- Dienstrad-Vorgang und ein übergebener Vorgang bleiben erhalten.
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — drei neue Tabellen, eine neue Spalte (leer) an
-- werkstatt_auftraege. Bestehende Regeln und Tabellen bleiben unverändert.
-- ============================================================================

begin;

-- ------------------------------------------------------------ Rad-Akte ---
create table if not exists public.zweirad (
  id                           uuid primary key default gen_random_uuid(),
  owner_user_id                uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  herkunft                     text not null default 'bestand' check (herkunft in ('bestand', 'kunde')),
  status                       text not null default 'bestand' check (status in ('bestand', 'reserviert', 'verkauft', 'kunde', 'archiv')),
  art                          text not null default 'pedelec' check (art in ('fahrrad', 'pedelec', 's_pedelec', 'lastenrad', 'lastenrad_e', 'kinderrad', 'sonstiges')),
  marke                        text not null check (char_length(marke) between 2 and 60),
  modell                       text check (modell is null or char_length(modell) <= 80),
  modelljahr                   integer check (modelljahr is null or modelljahr between 1950 and 2100),
  farbe                        text check (farbe is null or char_length(farbe) <= 40),
  rahmengroesse                text check (rahmengroesse is null or char_length(rahmengroesse) <= 20),
  rahmennummer                 text check (rahmennummer is null or rahmennummer ~ '^[A-Z0-9][A-Z0-9./-]{3,29}$'),
  motor_hersteller             text check (motor_hersteller is null or char_length(motor_hersteller) <= 40),
  motor_nr                     text check (motor_nr is null or char_length(motor_nr) <= 40),
  akku_nr                      text check (akku_nr is null or char_length(akku_nr) <= 40),
  akku_wh                      integer check (akku_wh is null or akku_wh between 1 and 5000),
  display_nr                   text check (display_nr is null or char_length(display_nr) <= 40),
  schluessel_nr                text check (schluessel_nr is null or char_length(schluessel_nr) <= 40),
  versicherungskennzeichen     text check (versicherungskennzeichen is null or char_length(versicherungskennzeichen) <= 20),
  kontakt_id                   uuid,
  halter_name                  text check (halter_name is null or char_length(halter_name) <= 120),
  kaufdatum                    date,
  garantie_bis                 date,
  inspektion_intervall_monate  integer not null default 12 check (inspektion_intervall_monate between 0 and 60),
  letzte_inspektion            date,
  ek_cent                      integer check (ek_cent is null or ek_cent between 0 and 100000000),
  vk_cent                      integer check (vk_cent is null or vk_cent between 0 and 100000000),
  verkauft_am                  date,
  notiz                        text check (notiz is null or char_length(notiz) <= 1000),
  erstellt_am                  timestamptz not null default now(),
  erstellt_von                 uuid default auth.uid(),
  aktualisiert_am              timestamptz not null default now(),
  check (garantie_bis is null or kaufdatum is null or garantie_bis >= kaufdatum),
  check ((herkunft = 'kunde' and status in ('kunde', 'archiv')) or (herkunft = 'bestand' and status in ('bestand', 'reserviert', 'verkauft', 'archiv')))
);
create index if not exists zweirad_idx on public.zweirad (owner_user_id, status);
create unique index if not exists zweirad_rahmen_uq on public.zweirad (owner_user_id, rahmennummer) where rahmennummer is not null;
create index if not exists zweirad_akku_idx on public.zweirad (owner_user_id, akku_nr) where akku_nr is not null;

-- ---------------------------------------------------------- Garantie ---
create table if not exists public.zweirad_garantie (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  zweirad_id            uuid not null references public.zweirad(id) on delete cascade,
  art                   text not null default 'garantie' check (art in ('garantie', 'gewaehrleistung', 'kulanz')),
  bauteil               text not null check (bauteil in ('akku', 'motor', 'display', 'ladegeraet', 'rahmen', 'schaltung', 'bremse', 'sonstiges')),
  fehler                text not null check (char_length(fehler) between 3 and 1000),
  gemeldet_am           date not null default ((now() at time zone 'Europe/Berlin')::date),
  hersteller_nr         text check (hersteller_nr is null or char_length(hersteller_nr) <= 60),
  status                text not null default 'offen' check (status in ('offen', 'eingereicht', 'genehmigt', 'abgelehnt', 'erledigt')),
  ergebnis              text check (ergebnis is null or char_length(ergebnis) <= 1000),
  werkstatt_auftrag_id  uuid,
  erledigt_am           timestamptz,
  erstellt_am           timestamptz not null default now(),
  erstellt_von          uuid default auth.uid(),
  aktualisiert_am       timestamptz not null default now()
);
create index if not exists zweirad_garantie_idx on public.zweirad_garantie (owner_user_id, status);
create index if not exists zweirad_garantie_rad_idx on public.zweirad_garantie (zweirad_id);

-- ---------------------------------------------------------- Dienstrad ---
create table if not exists public.dienstrad_vorgang (
  id                       uuid primary key default gen_random_uuid(),
  owner_user_id            uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  nummer                   text,
  status                   text not null default 'angebot' check (status in ('angebot', 'eingereicht', 'genehmigt', 'uebergeben', 'abgerechnet', 'storniert')),
  zweirad_id               uuid references public.zweirad(id) on delete restrict,
  arbeitnehmer_name        text not null check (char_length(arbeitnehmer_name) between 2 and 120),
  arbeitnehmer_kontakt_id  uuid,
  arbeitnehmer_telefon     text check (arbeitnehmer_telefon is null or char_length(arbeitnehmer_telefon) <= 40),
  arbeitgeber_name         text not null check (char_length(arbeitgeber_name) between 2 and 160),
  portal                   text check (portal is null or char_length(portal) <= 80),
  portal_nr                text check (portal_nr is null or char_length(portal_nr) <= 60),
  abholcode                text check (abholcode is null or char_length(abholcode) <= 40),
  leasinggeber_name        text check (leasinggeber_name is null or char_length(leasinggeber_name) <= 160),
  leasinggeber_anschrift   text check (leasinggeber_anschrift is null or char_length(leasinggeber_anschrift) <= 400),
  posten                   jsonb not null default '[]'::jsonb check (jsonb_typeof(posten) = 'array' and jsonb_array_length(posten) <= 30),
  uebergabe_check          jsonb not null default '{}'::jsonb check (jsonb_typeof(uebergabe_check) = 'object'),
  uebergabe_am             timestamptz,
  uebergeben_von           uuid,
  rechnung_id              uuid,
  notiz                    text check (notiz is null or char_length(notiz) <= 1000),
  erstellt_am              timestamptz not null default now(),
  erstellt_von             uuid default auth.uid(),
  aktualisiert_am          timestamptz not null default now(),
  unique (owner_user_id, nummer)
);
create index if not exists dienstrad_vorgang_idx on public.dienstrad_vorgang (owner_user_id, status, erstellt_am desc);
create index if not exists dienstrad_vorgang_rad_idx on public.dienstrad_vorgang (zweirad_id) where zweirad_id is not null;

-- --------------------------------------------------- Werkstatt-Kopplung ---
alter table if exists public.werkstatt_auftraege add column if not exists zweirad_id uuid references public.zweirad(id) on delete set null;
create index if not exists werkstatt_auftraege_zweirad_idx on public.werkstatt_auftraege (zweirad_id) where zweirad_id is not null;

-- ------------------------------------------------------ Wächter: Rad ---
create or replace function public.p295_rad_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.rahmennummer := nullif(upper(regexp_replace(coalesce(new.rahmennummer, ''), '\s', '', 'g')), '');
  new.aktualisiert_am := now();
  if tg_op = 'INSERT' then
    new.erstellt_am := now(); new.erstellt_von := auth.uid();
    if new.herkunft = 'kunde' then new.status := 'kunde'; elsif new.status not in ('bestand', 'reserviert') then new.status := 'bestand'; end if;
    new.verkauft_am := null;
    return new;
  end if;
  if new.owner_user_id <> old.owner_user_id or new.erstellt_am <> old.erstellt_am or new.erstellt_von is distinct from old.erstellt_von then
    raise exception 'Besitzer und Anlage eines Rads sind unveränderlich.';
  end if;
  if exists (select 1 from public.dienstrad_vorgang d where d.zweirad_id = old.id and d.status in ('uebergeben', 'abgerechnet')) then
    if (new.herkunft, new.marke, new.modell, new.rahmennummer, new.motor_nr, new.akku_nr)
       is distinct from (old.herkunft, old.marke, old.modell, old.rahmennummer, old.motor_nr, old.akku_nr) then
      raise exception 'Das Rad ist als Dienstrad übergeben — Marke, Modell, Rahmen-, Motor- und Akkunummer bleiben so, wie sie im Übergabeprotokoll stehen.';
    end if;
    if new.status not in ('verkauft', 'archiv') then
      raise exception 'Das Rad ist als Dienstrad übergeben und bleibt verkauft.';
    end if;
  end if;
  if new.herkunft <> old.herkunft and exists (select 1 from public.dienstrad_vorgang d where d.zweirad_id = old.id and d.status <> 'storniert') then
    raise exception 'Das Rad hängt an einem Dienstrad-Vorgang — die Herkunft bleibt.';
  end if;
  if new.status = 'verkauft' and old.status <> 'verkauft' then
    new.verkauft_am := coalesce(new.verkauft_am, (now() at time zone 'Europe/Berlin')::date);
  end if;
  return new;
end;
$$;
drop trigger if exists p295_rad_waechter_trg on public.zweirad;
create trigger p295_rad_waechter_trg before insert or update on public.zweirad
  for each row execute function public.p295_rad_waechter();
revoke all on function public.p295_rad_waechter() from public, anon, authenticated;

-- ------------------------------------------------- Wächter: Garantie ---
create or replace function public.p295_garantie_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.zweirad z where z.id = new.zweirad_id and z.owner_user_id = new.owner_user_id) then
      raise exception 'Das Rad gehört nicht zu diesem Betrieb.';
    end if;
    if new.gemeldet_am > (now() at time zone 'Europe/Berlin')::date then
      raise exception 'Das Meldedatum liegt in der Zukunft.';
    end if;
    new.status := 'offen'; new.erledigt_am := null;
    new.erstellt_am := now(); new.erstellt_von := auth.uid(); new.aktualisiert_am := now();
    return new;
  end if;
  if (new.owner_user_id, new.zweirad_id, new.erstellt_am) is distinct from (old.owner_user_id, old.zweirad_id, old.erstellt_am)
     or new.erstellt_von is distinct from old.erstellt_von then
    raise exception 'Rad, Besitzer und Anlage eines Garantiefalls sind unveränderlich.';
  end if;
  if old.status = 'erledigt' and (new.art, new.bauteil, new.fehler, new.gemeldet_am, new.hersteller_nr, new.status, new.ergebnis)
     is distinct from (old.art, old.bauteil, old.fehler, old.gemeldet_am, old.hersteller_nr, old.status, old.ergebnis) then
    raise exception 'Der Garantiefall ist erledigt und bleibt so.';
  end if;
  if new.status <> old.status then
    if not ((old.status = 'offen' and new.status in ('eingereicht', 'erledigt'))
         or (old.status = 'eingereicht' and new.status in ('genehmigt', 'abgelehnt'))
         or (old.status in ('genehmigt', 'abgelehnt') and new.status = 'erledigt')) then
      raise exception 'Dieser Statuswechsel ist nicht möglich (% → %).', old.status, new.status;
    end if;
    if new.status = 'erledigt' then new.erledigt_am := now(); end if;
  elsif new.erledigt_am is distinct from old.erledigt_am then
    raise exception 'Das Erledigt-Datum setzt die Datenbank.';
  end if;
  new.aktualisiert_am := now();
  return new;
end;
$$;
drop trigger if exists p295_garantie_waechter_trg on public.zweirad_garantie;
create trigger p295_garantie_waechter_trg before insert or update on public.zweirad_garantie
  for each row execute function public.p295_garantie_waechter();
revoke all on function public.p295_garantie_waechter() from public, anon, authenticated;

-- ------------------------------------------------ Wächter: Dienstrad ---
create or replace function public.p295_dienstrad_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
  v_rad public.zweirad%rowtype;
  v_jahr text := to_char(now() at time zone 'Europe/Berlin', 'YYYY');
begin
  if tg_op = 'DELETE' then
    if old.status in ('uebergeben', 'abgerechnet') or old.rechnung_id is not null then
      raise exception 'Ein übergebener oder abgerechneter Dienstrad-Vorgang bleibt erhalten.';
    end if;
    if old.zweirad_id is not null then
      update public.zweirad set status = 'bestand' where id = old.zweirad_id and status = 'reserviert';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'angebot'; new.uebergabe_am := null; new.uebergeben_von := null; new.rechnung_id := null;
    new.uebergabe_check := '{}'::jsonb;
    new.erstellt_am := now(); new.erstellt_von := auth.uid(); new.aktualisiert_am := now();
    perform pg_advisory_xact_lock(hashtext('dienstrad_vorgang:' || new.owner_user_id::text));
    select coalesce(max(substring(d.nummer from 9)::integer), 0) + 1 into v_n from public.dienstrad_vorgang d
     where d.owner_user_id = new.owner_user_id and d.nummer ~ ('^DR-' || v_jahr || '-[0-9]+$');
    new.nummer := 'DR-' || v_jahr || '-' || lpad(v_n::text, 4, '0');
  else
    if (new.owner_user_id, new.nummer, new.erstellt_am) is distinct from (old.owner_user_id, old.nummer, old.erstellt_am)
       or new.erstellt_von is distinct from old.erstellt_von then
      raise exception 'Besitzer, Nummer und Anlage eines Dienstrad-Vorgangs sind unveränderlich.';
    end if;
    new.aktualisiert_am := now();
    if old.status in ('abgerechnet', 'storniert') and new.rechnung_id is not distinct from old.rechnung_id
       and (new.status, new.zweirad_id, new.posten, new.portal, new.portal_nr, new.arbeitnehmer_name, new.arbeitgeber_name, new.leasinggeber_name, new.leasinggeber_anschrift, new.uebergabe_check)
           is distinct from
           (old.status, old.zweirad_id, old.posten, old.portal, old.portal_nr, old.arbeitnehmer_name, old.arbeitgeber_name, old.leasinggeber_name, old.leasinggeber_anschrift, old.uebergabe_check) then
      raise exception 'Der Vorgang ist abgeschlossen und bleibt so.';
    end if;
    -- Positionen: ab „genehmigt" so, wie das Portal sie freigegeben hat
    if new.posten is distinct from old.posten and old.status not in ('angebot', 'eingereicht') then
      raise exception 'Die Positionen sind vom Portal genehmigt und bleiben so.';
    end if;
    -- Arbeitnehmer, Arbeitgeber, Portal und Auftragsnummer: ab Übergabe fest
    if old.status in ('uebergeben', 'abgerechnet')
       and (new.zweirad_id, new.arbeitnehmer_name, new.arbeitgeber_name, new.portal, new.portal_nr, new.uebergabe_check, new.uebergabe_am, new.uebergeben_von)
           is distinct from
           (old.zweirad_id, old.arbeitnehmer_name, old.arbeitgeber_name, old.portal, old.portal_nr, old.uebergabe_check, old.uebergabe_am, old.uebergeben_von) then
      raise exception 'Das Rad ist übergeben — Rad, Nutzer, Portal und Übergabe bleiben so.';
    end if;
    if old.status not in ('uebergeben', 'abgerechnet') and (new.uebergabe_am, new.uebergeben_von) is distinct from (old.uebergabe_am, old.uebergeben_von) then
      raise exception 'Übergabe-Zeitpunkt und -Person setzt die Datenbank.';
    end if;
    -- Rechnung: erst nach der Übergabe, Verknüpfung bleibt
    if new.rechnung_id is distinct from old.rechnung_id then
      if new.rechnung_id is null then
        raise exception 'Die Verknüpfung zur Rechnung bleibt erhalten.';
      end if;
      if old.status not in ('uebergeben', 'abgerechnet') then
        raise exception 'Die Rechnung an den Leasinggeber entsteht erst nach der Übergabe.';
      end if;
      if not exists (select 1 from public.rechnungen r where r.id = new.rechnung_id and r.owner_user_id = new.owner_user_id) then
        raise exception 'Die Rechnung gehört nicht zu diesem Betrieb.';
      end if;
      new.status := 'abgerechnet';
    end if;
  end if;

  -- Rad prüfen (bei Anlage und solange nicht übergeben)
  if new.zweirad_id is not null and (tg_op = 'INSERT' or new.zweirad_id is distinct from old.zweirad_id) then
    select * into v_rad from public.zweirad z where z.id = new.zweirad_id;
    if not found or v_rad.owner_user_id <> new.owner_user_id then
      raise exception 'Das Rad gehört nicht zu diesem Betrieb.';
    end if;
    if v_rad.herkunft <> 'bestand' or v_rad.status not in ('bestand', 'reserviert') then
      raise exception 'Als Dienstrad geht nur ein Rad aus Ihrem Bestand, das noch nicht verkauft ist.';
    end if;
    if exists (select 1 from public.dienstrad_vorgang d where d.zweirad_id = new.zweirad_id and d.id <> new.id and d.status not in ('storniert')) then
      raise exception 'Dieses Rad hängt schon an einem anderen Dienstrad-Vorgang.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;

  -- Statuswechsel von Hand (abgerechnet nur über die Rechnung, oben)
  if new.status <> old.status and new.rechnung_id is not distinct from old.rechnung_id then
    if not ((old.status = 'angebot' and new.status in ('eingereicht', 'storniert'))
         or (old.status = 'eingereicht' and new.status in ('angebot', 'genehmigt', 'storniert'))
         or (old.status = 'genehmigt' and new.status in ('uebergeben', 'storniert'))) then
      raise exception 'Dieser Statuswechsel ist nicht möglich (% → %).', old.status, new.status;
    end if;
    if new.status = 'eingereicht' then
      if coalesce(btrim(new.portal), '') = '' then raise exception 'Bitte das Leasing-Portal eintragen.'; end if;
      if jsonb_array_length(new.posten) = 0 then raise exception 'Das Angebot braucht mindestens eine Position.'; end if;
    end if;
    if new.status = 'genehmigt' and coalesce(btrim(new.portal_nr), '') = '' then
      raise exception 'Bitte die Bestell- bzw. Auftragsnummer aus dem Portal eintragen.';
    end if;
    if new.status = 'uebergeben' then
      if new.zweirad_id is null then raise exception 'Bitte zuerst das Rad aus Ihrem Bestand zuordnen.'; end if;
      select * into v_rad from public.zweirad z where z.id = new.zweirad_id;
      if v_rad.rahmennummer is null then
        raise exception 'Das Rad braucht eine Rahmennummer — sie steht im Übergabeprotokoll des Portals.';
      end if;
      if v_rad.herkunft <> 'bestand' or v_rad.status not in ('bestand', 'reserviert') then
        raise exception 'Als Dienstrad geht nur ein Rad aus Ihrem Bestand, das noch nicht verkauft ist.';
      end if;
      if coalesce(new.uebergabe_check ->> 'ausweis', '') <> 'true' or coalesce(new.uebergabe_check ->> 'einweisung', '') <> 'true' then
        raise exception 'Vor der Übergabe: Ausweis prüfen und Einweisung geben (beides abhaken).';
      end if;
      new.uebergabe_am := now(); new.uebergeben_von := auth.uid();
      update public.zweirad set status = 'verkauft', verkauft_am = (now() at time zone 'Europe/Berlin')::date where id = new.zweirad_id;
    end if;
    if new.status = 'storniert' and new.zweirad_id is not null then
      update public.zweirad set status = 'bestand' where id = new.zweirad_id and status = 'reserviert';
    end if;
  end if;

  -- Reservierung des Rads mitführen, solange der Vorgang läuft
  if new.status in ('angebot', 'eingereicht', 'genehmigt') then
    if old.zweirad_id is not null and old.zweirad_id is distinct from new.zweirad_id then
      update public.zweirad set status = 'bestand' where id = old.zweirad_id and status = 'reserviert';
    end if;
    if new.status = 'genehmigt' and new.zweirad_id is not null then
      update public.zweirad set status = 'reserviert' where id = new.zweirad_id and status = 'bestand';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists p295_dienstrad_waechter_trg on public.dienstrad_vorgang;
create trigger p295_dienstrad_waechter_trg before insert or update or delete on public.dienstrad_vorgang
  for each row execute function public.p295_dienstrad_waechter();
revoke all on function public.p295_dienstrad_waechter() from public, anon, authenticated;

-- ------------------------------------------------------------- Regeln ---
alter table public.zweirad enable row level security;
alter table public.zweirad_garantie enable row level security;
alter table public.dienstrad_vorgang enable row level security;

drop policy if exists zr_chef_all on public.zweirad;
create policy zr_chef_all on public.zweirad for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists zr_ma_select on public.zweirad;
create policy zr_ma_select on public.zweirad for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('werkstatt') or public.darf_ich_modul_aendern('werkstatt')));
drop policy if exists zr_ma_insert on public.zweirad;
create policy zr_ma_insert on public.zweirad for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('werkstatt'));
drop policy if exists zr_ma_update on public.zweirad;
create policy zr_ma_update on public.zweirad for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('werkstatt'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('werkstatt'));

drop policy if exists zg_chef_all on public.zweirad_garantie;
create policy zg_chef_all on public.zweirad_garantie for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists zg_ma_select on public.zweirad_garantie;
create policy zg_ma_select on public.zweirad_garantie for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('werkstatt') or public.darf_ich_modul_aendern('werkstatt')));
drop policy if exists zg_ma_insert on public.zweirad_garantie;
create policy zg_ma_insert on public.zweirad_garantie for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('werkstatt'));
drop policy if exists zg_ma_update on public.zweirad_garantie;
create policy zg_ma_update on public.zweirad_garantie for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('werkstatt'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('werkstatt'));

drop policy if exists dr_chef_all on public.dienstrad_vorgang;
create policy dr_chef_all on public.dienstrad_vorgang for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists dr_ma_select on public.dienstrad_vorgang;
create policy dr_ma_select on public.dienstrad_vorgang for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('werkstatt') or public.darf_ich_modul_aendern('werkstatt')));
drop policy if exists dr_ma_insert on public.dienstrad_vorgang;
create policy dr_ma_insert on public.dienstrad_vorgang for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('werkstatt'));
drop policy if exists dr_ma_update on public.dienstrad_vorgang;
create policy dr_ma_update on public.dienstrad_vorgang for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('werkstatt'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('werkstatt'));

commit;

-- KONTROLLE (nur lesen) — Erwartung: 3 | 12 | 3 | 1 | 3
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('zweirad', 'zweirad_garantie', 'dienstrad_vorgang')) as tabellen,
       (select count(*) from pg_policies where schemaname = 'public' and tablename in ('zweirad', 'zweirad_garantie', 'dienstrad_vorgang')) as regeln,
       (select count(*) from pg_trigger where tgname in ('p295_rad_waechter_trg', 'p295_garantie_waechter_trg', 'p295_dienstrad_waechter_trg')) as waechter,
       (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'werkstatt_auftraege' and column_name = 'zweirad_id') as werkstatt_spalte,
       (select count(*) from pg_class where relname in ('zweirad', 'zweirad_garantie', 'dienstrad_vorgang') and relnamespace = 'public'::regnamespace and relrowsecurity) as rls_an;
