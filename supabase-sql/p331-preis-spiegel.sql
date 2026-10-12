-- ============================================================
-- ARGONAUT OS · Paket 331 (12.10.2026) · PS-1 Preis-Spiegel für Dienstleister
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- preis_spiegel_posten:   was verglichen wird — eine eigene Leistung aus dem
--                         Leistungskatalog ODER ein freier Posten mit eigenem
--                         Bruttopreis (z. B. ein Gericht).
-- preis_spiegel_vergleich: Preise von Mitbewerbern, die der Betrieb SELBST
--                         erfasst (Aushang, Webseite, Speisekarte). Keine
--                         Personendaten: Kennung „Mitbewerber A" / „Salon
--                         Innenstadt", kein Name, kein Telefon, keine E-Mail.
--
-- Rechte wie Paket 276: Besitzer = Betrieb (Auslöser p181_besitzer),
-- Mitarbeiter lesen mit Modul „leistungskatalog", anlegen/ändern mit
-- Schreibrecht. Vergleiche darf ein Mitarbeiter mit Schreibrecht löschen
-- (eigene Fehleingaben), Posten löscht nur die Geschäftsleitung (sonst
-- „aktiv" aus). Wächter p331: Leistung und Posten gehören zum eigenen
-- Betrieb, der Betrieb eines Eintrags bleibt fest.
-- ============================================================

create table if not exists public.preis_spiegel_posten (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  bezeichnung   text not null check (char_length(bezeichnung) between 1 and 120),
  leistung_id   uuid references public.leistungskatalog(id) on delete set null,
  eigener_preis numeric(12,2) check (eigener_preis is null or eigener_preis > 0),
  mwst_satz     numeric(5,2) not null default 19 check (mwst_satz >= 0 and mwst_satz <= 30),
  notiz         text check (notiz is null or char_length(notiz) <= 200),
  aktiv         boolean not null default true,
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists preis_spiegel_posten_idx on public.preis_spiegel_posten (owner_user_id, aktiv);

create table if not exists public.preis_spiegel_vergleich (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  posten_id     uuid not null references public.preis_spiegel_posten(id) on delete cascade,
  anbieter      text not null check (char_length(anbieter) between 1 and 40 and anbieter !~ '@'),
  preis         numeric(12,2) not null check (preis > 0),
  ist_brutto    boolean not null default true,
  quelle        text not null default 'Sonstige' check (char_length(quelle) between 1 and 60),
  entfernung_km numeric(6,1) check (entfernung_km is null or (entfernung_km >= 0 and entfernung_km <= 500)),
  link          text check (link is null or (char_length(link) <= 500 and link ~ '^https://')),
  notiz         text check (notiz is null or char_length(notiz) <= 200),
  erfasst_am    date not null default current_date,
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now()
);
create index if not exists preis_spiegel_vergleich_idx on public.preis_spiegel_vergleich (owner_user_id, posten_id, erfasst_am);

alter table public.preis_spiegel_posten enable row level security;
alter table public.preis_spiegel_vergleich enable row level security;

-- Besitzer = Betrieb (gleicher Auslöser wie überall seit Paket 181)
drop trigger if exists p181_besitzer on public.preis_spiegel_posten;
create trigger p181_besitzer before insert or update on public.preis_spiegel_posten
  for each row execute function public.p181_besitzer();
drop trigger if exists p181_besitzer on public.preis_spiegel_vergleich;
create trigger p181_besitzer before insert or update on public.preis_spiegel_vergleich
  for each row execute function public.p181_besitzer();

-- Wächter: Leistung bzw. Posten gehören zum selben Betrieb; Betrieb bleibt fest
create or replace function public.p331_preis_spiegel_waechter()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'UPDATE' and new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Der Betrieb eines Eintrags kann nicht geändert werden.';
  end if;
  if tg_table_name = 'preis_spiegel_posten' then
    if new.leistung_id is not null and not exists (
      select 1 from public.leistungskatalog k where k.id = new.leistung_id and k.owner_user_id = new.owner_user_id
    ) then
      raise exception 'Die Leistung gehört nicht zu Ihrem Betrieb.';
    end if;
    if new.leistung_id is not null then
      new.eigener_preis := null;   -- der Preis kommt aus dem Katalog
    end if;
    new.aktualisiert_am := now();
  else
    if tg_op = 'UPDATE' and new.posten_id is distinct from old.posten_id then
      raise exception 'Ein Vergleich kann nicht zu einem anderen Posten wandern.';
    end if;
    if not exists (
      select 1 from public.preis_spiegel_posten p where p.id = new.posten_id and p.owner_user_id = new.owner_user_id
    ) then
      raise exception 'Der Posten gehört nicht zu Ihrem Betrieb.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists p331_waechter on public.preis_spiegel_posten;
create trigger p331_waechter before insert or update on public.preis_spiegel_posten
  for each row execute function public.p331_preis_spiegel_waechter();
drop trigger if exists p331_waechter on public.preis_spiegel_vergleich;
create trigger p331_waechter before insert or update on public.preis_spiegel_vergleich
  for each row execute function public.p331_preis_spiegel_waechter();

-- Regeln: Posten
drop policy if exists psp_owner_all on public.preis_spiegel_posten;
create policy psp_owner_all on public.preis_spiegel_posten for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p331_ma_select on public.preis_spiegel_posten;
create policy p331_ma_select on public.preis_spiegel_posten for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('leistungskatalog') or public.darf_ich_modul_aendern('leistungskatalog')));
drop policy if exists p331_ma_insert on public.preis_spiegel_posten;
create policy p331_ma_insert on public.preis_spiegel_posten for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('leistungskatalog'));
drop policy if exists p331_ma_update on public.preis_spiegel_posten;
create policy p331_ma_update on public.preis_spiegel_posten for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('leistungskatalog'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('leistungskatalog'));

-- Regeln: Vergleiche
drop policy if exists psv_owner_all on public.preis_spiegel_vergleich;
create policy psv_owner_all on public.preis_spiegel_vergleich for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p331_ma_select on public.preis_spiegel_vergleich;
create policy p331_ma_select on public.preis_spiegel_vergleich for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('leistungskatalog') or public.darf_ich_modul_aendern('leistungskatalog')));
drop policy if exists p331_ma_insert on public.preis_spiegel_vergleich;
create policy p331_ma_insert on public.preis_spiegel_vergleich for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('leistungskatalog'));
drop policy if exists p331_ma_update on public.preis_spiegel_vergleich;
create policy p331_ma_update on public.preis_spiegel_vergleich for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('leistungskatalog'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('leistungskatalog'));
drop policy if exists p331_ma_delete on public.preis_spiegel_vergleich;
create policy p331_ma_delete on public.preis_spiegel_vergleich for delete to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('leistungskatalog'));

-- KONTROLLE — Erwartung: tabellen = 2 | regeln = 9 | ausloeser = 4 | rls_an = 2
-- (regeln = 11 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel, die
--  Paket 164 an jede neue Tabelle hängt — je Tabelle eine mehr, harmlos)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('preis_spiegel_posten', 'preis_spiegel_vergleich')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('preis_spiegel_posten', 'preis_spiegel_vergleich')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.preis_spiegel_posten'::regclass, 'public.preis_spiegel_vergleich'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('preis_spiegel_posten', 'preis_spiegel_vergleich') and relrowsecurity) as rls_an;
