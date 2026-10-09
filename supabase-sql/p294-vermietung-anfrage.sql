-- ============================================================================
-- ARGONAUT OS · Paket 294 (09.10.2026) · V2b Vermietung: Online-Anfrage
--
--   miet_anfrage   unverbindliche Anfrage von der öffentlichen Seite
--                  /mieten/<kennung>: Fahrzeug, Wunsch-Abholung/-Rückgabe,
--                  Name, E-Mail/Telefon, Nachricht, Zeitpunkt der Datenschutz-
--                  Zustimmung, Endpreis-Vorschau (nur zur Info). Nummer
--                  MA-JJJJ-0001 vergibt die Datenbank.
--                  Angelegt wird NUR von der Server-Tür (Service-Rolle) — es
--                  gibt keine Einfüge-Regel für Mitarbeiter.
--                  Bearbeitung: neu → reserviert (nur mit eigener Reservierung
--                  für dasselbe Fahrzeug) / abgelehnt / erledigt; Angaben des
--                  Interessenten bleiben unverändert.
--   Einstellung „miet-online" (Kennung, an/aus, Google) liegt in
--   modul_einstellung (Regeln aus Paket 259: Chef schreibt).
--
-- Rechte: Chef alles (auch löschen); Mitarbeiter mit Recht „Verleih" sehen,
-- mit Schreibrecht „Verleih" bearbeiten.
-- Additiv, mehrfach ausführbar.
-- AUSSPERR-RISIKO: keines — nur eine neue Tabelle und neue Funktionen.
-- ============================================================================

begin;

create table if not exists public.miet_anfrage (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null,
  nr                  text,
  fahrzeug_id         uuid not null references public.miet_fahrzeug(id) on delete cascade,
  von                 timestamptz not null,
  bis                 timestamptz not null,
  name                text not null check (char_length(name) between 2 and 120),
  email               text check (email is null or char_length(email) <= 160),
  telefon             text check (telefon is null or char_length(telefon) <= 40),
  nachricht           text check (nachricht is null or char_length(nachricht) <= 1000),
  vorschau_cent       integer check (vorschau_cent is null or vorschau_cent between 0 and 100000000),
  datenschutz_am      timestamptz not null,
  status              text not null default 'neu' check (status in ('neu', 'reserviert', 'abgelehnt', 'erledigt')),
  buchung_id          uuid references public.miet_buchung(id) on delete set null,
  bearbeitet_am       timestamptz,
  bearbeitet_von      uuid,
  erstellt_am         timestamptz not null default now(),
  check (bis > von and bis - von <= interval '120 days'),
  check (email is not null or telefon is not null),
  unique (owner_user_id, nr)
);
create index if not exists miet_anfrage_idx on public.miet_anfrage (owner_user_id, status, erstellt_am desc);

create or replace function public.p294_anfrage_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.miet_fahrzeug m where m.id = new.fahrzeug_id and m.owner_user_id = new.owner_user_id and m.aktiv) then
      raise exception 'Das Fahrzeug gehört nicht zu diesem Betrieb oder ist nicht buchbar.';
    end if;
    new.status := 'neu'; new.buchung_id := null; new.bearbeitet_am := null; new.bearbeitet_von := null; new.erstellt_am := now();
    perform pg_advisory_xact_lock(hashtext('miet_anfrage:' || new.owner_user_id::text));
    select coalesce(max(substring(a.nr from 9)::integer), 0) + 1 into v_n from public.miet_anfrage a
     where a.owner_user_id = new.owner_user_id and a.nr ~ ('^MA-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY') || '-[0-9]+$');
    new.nr := 'MA-' || to_char(now() at time zone 'Europe/Berlin', 'YYYY') || '-' || lpad(v_n::text, 4, '0');
    return new;
  end if;

  -- UPDATE: Angaben des Interessenten bleiben, wie sie eingegangen sind
  if (new.owner_user_id, new.nr, new.fahrzeug_id, new.von, new.bis, new.name, new.email, new.telefon, new.nachricht, new.vorschau_cent, new.datenschutz_am, new.erstellt_am)
     is distinct from
     (old.owner_user_id, old.nr, old.fahrzeug_id, old.von, old.bis, old.name, old.email, old.telefon, old.nachricht, old.vorschau_cent, old.datenschutz_am, old.erstellt_am) then
    raise exception 'Die Angaben einer Online-Anfrage bleiben, wie sie eingegangen sind.';
  end if;
  if new.status <> old.status then
    if not ((old.status = 'neu' and new.status in ('reserviert', 'abgelehnt', 'erledigt'))
         or (old.status = 'reserviert' and new.status = 'erledigt')) then
      raise exception 'Dieser Statuswechsel ist nicht möglich (% → %).', old.status, new.status;
    end if;
    new.bearbeitet_am := now(); new.bearbeitet_von := auth.uid();
  elsif (new.bearbeitet_am, new.bearbeitet_von) is distinct from (old.bearbeitet_am, old.bearbeitet_von) then
    raise exception 'Bearbeitet-Vermerk setzt die Datenbank.';
  end if;
  if new.buchung_id is distinct from old.buchung_id then
    if old.buchung_id is not null or new.status <> 'reserviert' then
      raise exception 'Die Reservierung wird mit dem Status „reserviert" einmal verknüpft.';
    end if;
  end if;
  if new.status = 'reserviert' then
    if new.buchung_id is null or not exists (select 1 from public.miet_buchung b where b.id = new.buchung_id and b.owner_user_id = new.owner_user_id and b.fahrzeug_id = new.fahrzeug_id) then
      raise exception 'Bitte zuerst eine Reservierung für dieses Fahrzeug anlegen.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists p294_anfrage_waechter_trg on public.miet_anfrage;
create trigger p294_anfrage_waechter_trg before insert or update on public.miet_anfrage
  for each row execute function public.p294_anfrage_waechter();
revoke all on function public.p294_anfrage_waechter() from public, anon, authenticated;

alter table public.miet_anfrage enable row level security;

drop policy if exists man_chef_all on public.miet_anfrage;
create policy man_chef_all on public.miet_anfrage for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists man_ma_select on public.miet_anfrage;
create policy man_ma_select on public.miet_anfrage for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('verleih') or public.darf_ich_modul_aendern('verleih')));
drop policy if exists man_ma_update on public.miet_anfrage;
create policy man_ma_update on public.miet_anfrage for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('verleih'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('verleih'));

commit;

-- KONTROLLE (nur lesen) — Erwartung: 1 | 3 | 1 | t
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'miet_anfrage') as tabelle,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'miet_anfrage') as regeln,
       (select count(*) from pg_trigger where tgname = 'p294_anfrage_waechter_trg') as waechter,
       (select relrowsecurity from pg_class where oid = 'public.miet_anfrage'::regclass) as rls_an;
