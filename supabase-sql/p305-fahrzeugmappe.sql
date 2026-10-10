-- ============================================================
-- ARGONAUT OS · Paket 305 (10.10.2026) · FM1 Fahrzeugmappe (Kunden-Seite)
--
-- Wer sein Auto verkaufen oder in Zahlung geben will, schickt dem Autohaus
-- eine komplette Mappe: Fahrzeugschein, 8 Pflichtfotos, Schäden, Kaltstart-
-- Video, Unterlagen (TÜV, Serviceheft, Rechnungen), Preisvorstellung.
-- Die Mappe geht an GENAU EINEN Betrieb (den, auf dessen Seite sie entsteht).
--
-- Additiv und mehrfach ausführbar. Es wird nichts gelöscht oder umgebaut.
--  1) Speicherordner „fahrzeugmappe": privat, 50 MB je Datei, Bilder, Videos,
--     PDF. OHNE Regeln für Nutzer — nur der Server liest und schreibt
--     (Kunde ohne Login über seinen Mappen-Link, Betrieb über eine Tür mit Login).
--  2) kfz_mappe: eine Mappe je Verkäufer, Entwurf -> eingereicht.
--     Zugang des Verkäufers nur über einen Link; gespeichert wird nur der
--     SHA-256-Prüfwert, nie der Link selbst.
--  3) kfz_mappe_datei: jede Datei der Mappe (Fach, Art, Pfad, Größe,
--     Ergebnis der Schärfe-Prüfung im Browser).
--  4) Wächter: Dateien nur an Entwürfe, höchstens 70 je Mappe, Besitzer =
--     Betrieb der Mappe; Status nur vorwärts, Prüfwert und Besitzer fest.
-- Rechte: Geschäftsleitung liest und löscht; Mitarbeiter mit Recht „KFZ"
-- lesen. Schreiben tut nur der Server (keine Regel für insert/update).
-- Aussperr-Risiko: keins (neue Tabellen, neuer Ordner).
-- ============================================================

-- 1) Speicherordner ------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fahrzeugmappe', 'fahrzeugmappe', false, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
              'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 2) Mappe ----------------------------------------------------------------------------
create table if not exists public.kfz_mappe (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null,
  token_hash          text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  status              text not null default 'entwurf' check (status in ('entwurf', 'eingereicht', 'verworfen')),
  wunsch              text check (wunsch is null or wunsch in ('verkauf', 'inzahlungnahme')),
  angaben             jsonb not null default '{}'::jsonb check (jsonb_typeof(angaben) = 'object'),
  ankauf_id           uuid references public.kfz_ankauf(id) on delete set null,
  einwilligung_am     timestamptz,
  einwilligung_fassung text check (einwilligung_fassung is null or char_length(einwilligung_fassung) <= 40),
  eingereicht_am      timestamptz,
  erstellt_am         timestamptz not null default now(),
  aktualisiert_am     timestamptz not null default now()
);
create unique index if not exists kfz_mappe_token_uq on public.kfz_mappe (token_hash);
create unique index if not exists kfz_mappe_ankauf_uq on public.kfz_mappe (ankauf_id) where ankauf_id is not null;
create index if not exists kfz_mappe_owner_idx on public.kfz_mappe (owner_user_id, status, erstellt_am);
alter table public.kfz_mappe enable row level security;

-- 3) Dateien der Mappe --------------------------------------------------------------------
create table if not exists public.kfz_mappe_datei (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  mappe_id       uuid not null references public.kfz_mappe(id) on delete cascade,
  fach           text not null check (fach ~ '^[a-z_]{2,30}$'),
  art            text not null check (art in ('schein', 'foto', 'schaden', 'video', 'dokument')),
  pfad           text not null check (char_length(pfad) <= 200),
  mime           text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
                                               'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf')),
  bytes          bigint check (bytes is null or (bytes > 0 and bytes <= 52428800)),
  dateiname      text check (dateiname is null or char_length(dateiname) <= 120),
  beschreibung   text check (beschreibung is null or char_length(beschreibung) <= 200),
  pruefung       jsonb not null default '{}'::jsonb check (jsonb_typeof(pruefung) = 'object'),
  status         text not null default 'reserviert' check (status in ('reserviert', 'fertig')),
  erstellt_am    timestamptz not null default now()
);
create unique index if not exists kfz_mappe_datei_pfad_uq on public.kfz_mappe_datei (pfad);
create index if not exists kfz_mappe_datei_idx on public.kfz_mappe_datei (mappe_id, fach, erstellt_am);
alter table public.kfz_mappe_datei enable row level security;

-- 4) Wächter ---------------------------------------------------------------------------
create or replace function public.p305_mappe_waechter() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.token_hash is distinct from old.token_hash then raise exception 'p305: Der Prüfwert einer Mappe ist fest.'; end if;
  if new.owner_user_id is distinct from old.owner_user_id then raise exception 'p305: Der Betrieb einer Mappe ist fest.'; end if;
  if old.status <> 'entwurf' and new.status is distinct from old.status then
    raise exception 'p305: Eine eingereichte oder verworfene Mappe ändert ihren Status nicht mehr.';
  end if;
  if old.status = 'entwurf' and new.status = 'eingereicht' and (new.ankauf_id is null or new.eingereicht_am is null or new.einwilligung_am is null) then
    raise exception 'p305: Eingereicht nur mit Ankauf, Zeitpunkt und Einwilligung.';
  end if;
  new.aktualisiert_am := now();
  return new;
end $$;
drop trigger if exists p305_mappe_waechter on public.kfz_mappe;
create trigger p305_mappe_waechter before update on public.kfz_mappe
  for each row execute function public.p305_mappe_waechter();

create or replace function public.p305_datei_waechter() returns trigger
language plpgsql set search_path = public as $$
declare m record; n integer;
begin
  if tg_op = 'UPDATE' then
    if new.mappe_id is distinct from old.mappe_id or new.pfad is distinct from old.pfad
       or new.owner_user_id is distinct from old.owner_user_id or new.fach is distinct from old.fach then
      raise exception 'p305: Mappe, Fach, Pfad und Betrieb einer Datei sind fest.';
    end if;
    if old.status = 'fertig' and new.status <> 'fertig' then raise exception 'p305: Eine fertige Datei bleibt fertig.'; end if;
    return new;
  end if;
  select owner_user_id, status into m from public.kfz_mappe where id = new.mappe_id for update;
  if not found then raise exception 'p305: Mappe gibt es nicht.'; end if;
  if m.status <> 'entwurf' then raise exception 'p305: An eine eingereichte Mappe kommen keine Dateien mehr.'; end if;
  if new.owner_user_id is distinct from m.owner_user_id then raise exception 'p305: Datei gehört zu einem anderen Betrieb.'; end if;
  select count(*) into n from public.kfz_mappe_datei where mappe_id = new.mappe_id;
  if n >= 70 then raise exception 'p305: Höchstens 70 Dateien je Mappe.'; end if;
  return new;
end $$;
drop trigger if exists p305_datei_waechter on public.kfz_mappe_datei;
create trigger p305_datei_waechter before insert or update on public.kfz_mappe_datei
  for each row execute function public.p305_datei_waechter();

-- 5) Regeln: lesen (Chef, Mitarbeiter mit KFZ), löschen (nur Chef) --------------------------
drop policy if exists p305_chef_select on public.kfz_mappe;
create policy p305_chef_select on public.kfz_mappe for select to authenticated
  using (auth.uid() = owner_user_id);
drop policy if exists p305_ma_select on public.kfz_mappe;
create policy p305_ma_select on public.kfz_mappe for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p305_chef_delete on public.kfz_mappe;
create policy p305_chef_delete on public.kfz_mappe for delete to authenticated
  using (auth.uid() = owner_user_id);

drop policy if exists p305_chef_select on public.kfz_mappe_datei;
create policy p305_chef_select on public.kfz_mappe_datei for select to authenticated
  using (auth.uid() = owner_user_id);
drop policy if exists p305_ma_select on public.kfz_mappe_datei;
create policy p305_ma_select on public.kfz_mappe_datei for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p305_chef_delete on public.kfz_mappe_datei;
create policy p305_chef_delete on public.kfz_mappe_datei for delete to authenticated
  using (auth.uid() = owner_user_id);

-- KONTROLLE — Erwartung: ordner = 1 | ordner_privat = true | speicher_regeln = 0 |
-- tabellen = 2 | regeln = 6 | waechter = 2 | rls_an = 2
select
  (select count(*) from storage.buckets where id = 'fahrzeugmappe') as ordner,
  (select public = false from storage.buckets where id = 'fahrzeugmappe') as ordner_privat,
  (select count(*) from pg_policies where schemaname = 'storage' and (qual like '%fahrzeugmappe%' or with_check like '%fahrzeugmappe%')) as speicher_regeln,
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('kfz_mappe', 'kfz_mappe_datei')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('kfz_mappe', 'kfz_mappe_datei')) as regeln,
  (select count(*) from pg_trigger where tgname in ('p305_mappe_waechter', 'p305_datei_waechter') and not tgisinternal) as waechter,
  (select count(*) from pg_class where relname in ('kfz_mappe', 'kfz_mappe_datei') and relrowsecurity) as rls_an;
