-- ============================================================================
-- ARGONAUT OS · Paket 302 (10.10.2026) · J1 Jobticket, Dienstrad, Mobilitätszuschuss
--
--   mobilitaet_leistung   je Mitarbeiter und Leistung eine Zeile: Art (Jobticket,
--                         Dienstrad, Ladestrom-Vereinbarung, Fahrtkosten-Zuschuss,
--                         Sonstiges), Betrag des Betriebs und Eigenanteil in Cent,
--                         monatlich oder einmalig, Beginn/Ende, Nachweis (Text +
--                         „gültig bis“), Hinweis für die Lohnabrechnung.
--
-- Hinweis Lohnabrechnung: „offen“ (mit Steuerberater klären) ist Standard.
-- Steuerfrei / pauschal / steuerpflichtig nur MIT Datum der Bestätigung durch
-- den Steuerberater (Datenbank-Regel). ARGONAUT rechnet keine Steuern aus.
--
-- Additiv, mehrfach ausführbar. Rechte: Chef alles; Mitarbeiter mit Leserecht
-- „Personal“ sehen, mit Schreibrecht „Personal“ legen an und ändern; löschen
-- nur der Chef. Der Mitarbeiter muss zum eigenen Betrieb gehören (Wächter).
-- AUSSPERR-RISIKO: keines — nur eine neue Tabelle.
-- ============================================================================

begin;

create table if not exists public.mobilitaet_leistung (
  id                 uuid primary key default gen_random_uuid(),
  owner_user_id      uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  mitarbeiter_id     uuid,
  person_name        text not null check (char_length(person_name) between 2 and 120),
  art                text not null check (art in ('jobticket', 'dienstrad', 'ladestrom', 'fahrtkosten', 'sonstiges')),
  bezeichnung        text check (bezeichnung is null or char_length(bezeichnung) <= 120),
  betrag_cent        integer not null check (betrag_cent between 0 and 500000),
  eigenanteil_cent   integer not null default 0 check (eigenanteil_cent between 0 and 500000),
  turnus             text not null default 'monatlich' check (turnus in ('monatlich', 'einmalig')),
  beginn             date not null,
  ende               date,
  lohn_behandlung    text not null default 'offen' check (lohn_behandlung in ('offen', 'steuerfrei', 'pauschal', 'steuerpflichtig')),
  stb_bestaetigt_am  date,
  stb_name           text check (stb_name is null or char_length(stb_name) <= 120),
  nachweis           text check (nachweis is null or char_length(nachweis) <= 200),
  nachweis_bis       date,
  notiz              text check (notiz is null or char_length(notiz) <= 300),
  erfasst_am         timestamptz not null default now(),
  erfasst_von        uuid default auth.uid(),
  geaendert_am       timestamptz,
  check (betrag_cent + eigenanteil_cent > 0),
  check (ende is null or ende >= beginn),
  check (turnus = 'monatlich' or ende is null),
  check (lohn_behandlung = 'offen' or stb_bestaetigt_am is not null),
  check (lohn_behandlung <> 'offen' or (stb_bestaetigt_am is null and stb_name is null))
);
create index if not exists mobilitaet_leistung_idx on public.mobilitaet_leistung (owner_user_id, beginn);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='mitarbeiter' and column_name='id' and data_type='uuid')
     and not exists (select 1 from pg_constraint where conname='mobilitaet_leistung_ma_fk') then
    alter table public.mobilitaet_leistung add constraint mobilitaet_leistung_ma_fk foreign key (mitarbeiter_id) references public.mitarbeiter(id) on delete set null;
  end if;
end $$;

-- Wächter: Mitarbeiter aus dem eigenen Betrieb, Besitzer/Erfassung unveränderlich, Änderungszeit setzen
create or replace function public.p302_mobilitaet_waechter()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.mitarbeiter_id is not null and not exists (
       select 1 from public.mitarbeiter m where m.id = new.mitarbeiter_id and m.owner_user_id = new.owner_user_id) then
    raise exception 'Der Mitarbeiter gehört nicht zu diesem Betrieb.';
  end if;
  if tg_op = 'UPDATE' then
    if new.owner_user_id <> old.owner_user_id or new.erfasst_am <> old.erfasst_am or new.erfasst_von is distinct from old.erfasst_von then
      raise exception 'Besitzer und Erfassung einer Mobilitäts-Leistung sind unveränderlich.';
    end if;
    new.geaendert_am := now();
  end if;
  return new;
end;
$$;
drop trigger if exists p302_mobilitaet_waechter_trg on public.mobilitaet_leistung;
create trigger p302_mobilitaet_waechter_trg before insert or update on public.mobilitaet_leistung
  for each row execute function public.p302_mobilitaet_waechter();
revoke all on function public.p302_mobilitaet_waechter() from public, anon, authenticated;

alter table public.mobilitaet_leistung enable row level security;

drop policy if exists mob_chef_all on public.mobilitaet_leistung;
create policy mob_chef_all on public.mobilitaet_leistung for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists mob_ma_select on public.mobilitaet_leistung;
create policy mob_ma_select on public.mobilitaet_leistung for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('personal') or public.darf_ich_modul_aendern('personal')));
drop policy if exists mob_ma_insert on public.mobilitaet_leistung;
create policy mob_ma_insert on public.mobilitaet_leistung for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('personal'));
drop policy if exists mob_ma_update on public.mobilitaet_leistung;
create policy mob_ma_update on public.mobilitaet_leistung for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('personal'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('personal'));

commit;

-- KONTROLLE (nur lesen) — Erwartung: 1 | 4 | 1
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'mobilitaet_leistung') as tabellen,
       (select count(*) from pg_policies where schemaname = 'public' and tablename = 'mobilitaet_leistung') as regeln,
       (select count(*) from pg_trigger where tgname = 'p302_mobilitaet_waechter_trg') as waechter;
