-- ============================================================
-- ARGONAUT OS · Paket 277 (08.10.2026) · K13 Brief-Tresor und Aufbereitung
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--  1) kfz_tresor       Brief (ZB II), Schein, Schlüssel, CoC … je Bestandsfahrzeug
--                      mit Ort, Status, Ausgabe an (Name) und Rückgabedatum
--  2) kfz_tresor_log   Verlauf jeder Ausgabe/Rückgabe — schreibt NUR die
--                      Datenbank (Auslöser), nicht änderbar, nicht löschbar
--  3) kfz_zulassung    Zulassungsauftrag (Zulassung, Ummeldung, Abmeldung,
--                      Ausfuhr, Kurzzeit) mit Unterlagen-Haken
--  4) werkstatt_auftraege + kfz_bestand_id: Aufbereitung als interner Auftrag
--                      im Werkstatt-Board (leer bei allen bisherigen Aufträgen)
-- Rechte wie Paket 181: Besitzer = Betrieb, Mitarbeiter lesen mit Modul „kfz",
-- schreiben mit Schreibrecht „kfz", löschen nur der Chef.
-- ============================================================

-- 1) Tresor ------------------------------------------------------------------------
create table if not exists public.kfz_tresor (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  bestand_id    uuid not null references public.kfz_bestand(id) on delete cascade,
  art           text not null check (art in ('zb2', 'zb1', 'schluessel', 'coc', 'serviceheft', 'hu', 'sonstiges')),
  bezeichnung   text check (bezeichnung is null or char_length(bezeichnung) <= 120),
  anzahl        integer not null default 1 check (anzahl between 1 and 20),
  ort           text check (ort is null or char_length(ort) <= 80),
  status        text not null default 'im_haus' check (status in ('im_haus', 'ausgegeben', 'bei_zulassung', 'bei_bank', 'fehlt', 'beim_kaeufer')),
  ausgegeben_an text check (ausgegeben_an is null or char_length(ausgegeben_an) <= 120),
  ausgegeben_am timestamptz,
  zurueck_bis   date,
  notiz         text check (notiz is null or char_length(notiz) <= 300),
  erstellt_am   timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  constraint kfz_tresor_ausgabe_check check (status <> 'ausgegeben' or ausgegeben_an is not null)
);
create index if not exists kfz_tresor_idx on public.kfz_tresor (owner_user_id, bestand_id);
create index if not exists kfz_tresor_status_idx on public.kfz_tresor (owner_user_id, status);

-- 2) Verlauf (nur Auslöser schreibt) -------------------------------------------------
create table if not exists public.kfz_tresor_log (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  tresor_id     uuid not null references public.kfz_tresor(id) on delete cascade,
  bestand_id    uuid not null,
  von_status    text,
  nach_status   text not null,
  an            text,
  geaendert_von uuid,
  geaendert_am  timestamptz not null default now()
);
create index if not exists kfz_tresor_log_idx on public.kfz_tresor_log (tresor_id, geaendert_am);

create or replace function public.p277_tresor_merken()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status or new.ausgegeben_an is distinct from old.ausgegeben_an then
    insert into public.kfz_tresor_log (owner_user_id, tresor_id, bestand_id, von_status, nach_status, an, geaendert_von)
    values (new.owner_user_id, new.id, new.bestand_id, case when tg_op = 'INSERT' then null else old.status end, new.status, new.ausgegeben_an, auth.uid());
  end if;
  return null;
end $$;

-- 3) Zulassungsauftrag ------------------------------------------------------------------
create table if not exists public.kfz_zulassung (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  bestand_id    uuid not null references public.kfz_bestand(id) on delete cascade,
  art           text not null check (art in ('zulassung', 'ummeldung', 'abmeldung', 'ausfuhr', 'kurzzeit')),
  status        text not null default 'offen' check (status in ('offen', 'beim_amt', 'erledigt', 'storniert')),
  halter        text check (halter is null or char_length(halter) <= 160),
  evb           text check (evb is null or evb ~ '^[A-Z0-9]{7}$'),
  wunschkennzeichen text check (wunschkennzeichen is null or char_length(wunschkennzeichen) <= 15),
  kennzeichen_neu   text check (kennzeichen_neu is null or char_length(kennzeichen_neu) <= 15),
  termin        date,
  unterlagen    jsonb not null default '{}'::jsonb,
  kosten_netto  numeric(10,2) check (kosten_netto is null or kosten_netto >= 0),
  notiz         text check (notiz is null or char_length(notiz) <= 500),
  erledigt_am   date,
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists kfz_zulassung_idx on public.kfz_zulassung (owner_user_id, status);

-- 4) Werkstattauftrag kennt das Bestandsfahrzeug (interne Aufbereitung) -------------------
alter table if exists public.werkstatt_auftraege add column if not exists kfz_bestand_id uuid references public.kfz_bestand(id) on delete set null;
create index if not exists werkstatt_auftraege_kfz_idx on public.werkstatt_auftraege (kfz_bestand_id) where kfz_bestand_id is not null;
comment on column public.werkstatt_auftraege.kfz_bestand_id is 'Paket 277: interner Auftrag (z. B. Aufbereitung) zu einem Bestandsfahrzeug — keine Kundenrechnung';

-- Rechte ---------------------------------------------------------------------------------
alter table public.kfz_tresor enable row level security;
alter table public.kfz_tresor_log enable row level security;
alter table public.kfz_zulassung enable row level security;

drop trigger if exists p181_besitzer on public.kfz_tresor;
create trigger p181_besitzer before insert or update on public.kfz_tresor
  for each row execute function public.p181_besitzer();
drop trigger if exists p277_tresor_log on public.kfz_tresor;
create trigger p277_tresor_log after insert or update on public.kfz_tresor
  for each row execute function public.p277_tresor_merken();
drop trigger if exists p181_besitzer on public.kfz_zulassung;
create trigger p181_besitzer before insert or update on public.kfz_zulassung
  for each row execute function public.p181_besitzer();

-- kfz_tresor: Chef alles, Mitarbeiter nach Modul „kfz", löschen nur Chef
drop policy if exists kfztr_owner_all on public.kfz_tresor;
create policy kfztr_owner_all on public.kfz_tresor for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_tresor;
create policy p181_ma_select on public.kfz_tresor for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_tresor;
create policy p181_ma_insert on public.kfz_tresor for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_tresor;
create policy p181_ma_update on public.kfz_tresor for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- kfz_tresor_log: nur lesen
drop policy if exists kfztrl_owner_select on public.kfz_tresor_log;
create policy kfztrl_owner_select on public.kfz_tresor_log for select to authenticated
  using (auth.uid() = owner_user_id);
drop policy if exists kfztrl_ma_select on public.kfz_tresor_log;
create policy kfztrl_ma_select on public.kfz_tresor_log for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));

-- kfz_zulassung: wie Tresor
drop policy if exists kfzzu_owner_all on public.kfz_zulassung;
create policy kfzzu_owner_all on public.kfz_zulassung for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_zulassung;
create policy p181_ma_select on public.kfz_zulassung for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_zulassung;
create policy p181_ma_insert on public.kfz_zulassung for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_zulassung;
create policy p181_ma_update on public.kfz_zulassung for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- KONTROLLE — Erwartung: tabellen = 3, regeln_tresor = 4, regeln_log = 2, regeln_zulassung = 4,
-- ausloeser = 3, rls_an = 3, werkstatt_spalte = 1
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('kfz_tresor', 'kfz_tresor_log', 'kfz_zulassung')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_tresor') as regeln_tresor,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_tresor_log') as regeln_log,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_zulassung') as regeln_zulassung,
  (select count(*) from pg_trigger where tgrelid in ('public.kfz_tresor'::regclass, 'public.kfz_zulassung'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('kfz_tresor', 'kfz_tresor_log', 'kfz_zulassung') and relrowsecurity) as rls_an,
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'werkstatt_auftraege' and column_name = 'kfz_bestand_id') as werkstatt_spalte;
