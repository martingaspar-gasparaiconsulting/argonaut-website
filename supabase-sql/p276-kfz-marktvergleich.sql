-- ============================================================
-- ARGONAUT OS · Paket 276 (08.10.2026) · K12b Marktvergleich
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
-- kfz_marktvergleich: Vergleichsangebote je Bestandsfahrzeug, die der
-- Betrieb selbst erfasst (Preis, km, Erstzulassung, Quelle, Link, Datum).
-- Keine Personendaten (kein Name, kein Telefon des Anbieters).
-- Rechte wie Paket 181/265: Besitzer = Betrieb (Auslöser p181_besitzer),
-- Mitarbeiter lesen mit Modul „kfz", schreiben und löschen mit Schreibrecht
-- „kfz" (eigene Fehleingaben korrigieren). Fahrzeug gelöscht -> Vergleiche weg.
-- ============================================================

create table if not exists public.kfz_marktvergleich (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  bestand_id    uuid not null references public.kfz_bestand(id) on delete cascade,
  preis         numeric(12,2) not null check (preis > 0),
  km            integer check (km is null or km >= 0),
  erstzulassung date,
  quelle        text not null default 'Sonstige' check (char_length(quelle) between 1 and 60),
  link          text check (link is null or (char_length(link) <= 500 and link ~ '^https://')),
  notiz         text check (notiz is null or char_length(notiz) <= 200),
  erfasst_am    date not null default current_date,
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now()
);
create index if not exists kfz_marktvergleich_idx on public.kfz_marktvergleich (owner_user_id, bestand_id, erfasst_am);

alter table public.kfz_marktvergleich enable row level security;

drop trigger if exists p181_besitzer on public.kfz_marktvergleich;
create trigger p181_besitzer before insert or update on public.kfz_marktvergleich
  for each row execute function public.p181_besitzer();

drop policy if exists kfzmv_owner_all on public.kfz_marktvergleich;
create policy kfzmv_owner_all on public.kfz_marktvergleich for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_marktvergleich;
create policy p181_ma_select on public.kfz_marktvergleich for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_marktvergleich;
create policy p181_ma_insert on public.kfz_marktvergleich for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_marktvergleich;
create policy p181_ma_update on public.kfz_marktvergleich for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p276_ma_delete on public.kfz_marktvergleich;
create policy p276_ma_delete on public.kfz_marktvergleich for delete to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- KONTROLLE — Erwartung: tabelle = 1, regeln = 5, ausloeser = 1, rls_an = 1
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'kfz_marktvergleich') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_marktvergleich') as regeln,
  (select count(*) from pg_trigger where tgrelid = 'public.kfz_marktvergleich'::regclass and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname = 'kfz_marktvergleich' and relrowsecurity) as rls_an;
