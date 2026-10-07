-- ============================================================
-- ARGONAUT OS · Paket 265 (07.10.2026) · K5 Kalkulation und Provision
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--  1) kfz_bestand_kosten  Kostenposten je Bestandsfahrzeug (Plan oder Ist):
--                         Aufbereitung, Reparatur, Teile, Transport …
--                         Rechte wie der Bestand (Modul „kfz").
--  2) kfz_bestand_kalk    Kalkulation je Fahrzeug: erzielter Verkaufspreis,
--                         Verkäufer, Hereinnehmer, Provisionen, Kommission.
--                         STRENGER: Provisionen sind Vergütung — Mitarbeiter
--                         lesen und schreiben nur mit „Darf abrechnen"
--                         (darf_ich_abrechnen) UND Recht „kfz".
-- Gemeinkosten-Satz liegt in modul_einstellung (Modul „kfz-kalk", Chef schreibt).
-- ============================================================

-- 1) Kostenposten ----------------------------------------------------------------
create table if not exists public.kfz_bestand_kosten (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  bestand_id    uuid not null references public.kfz_bestand(id) on delete cascade,
  art           text not null default 'sonstiges' check (art in ('aufbereitung', 'reparatur', 'teile', 'lack', 'reifen', 'hu', 'transport', 'zulassung', 'werbung', 'fremd', 'sonstiges')),
  bezeichnung   text check (bezeichnung is null or char_length(bezeichnung) <= 160),
  betrag_netto  numeric(12,2) not null check (betrag_netto >= 0),
  plan          boolean not null default false,
  datum         date not null default current_date,
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now()
);
create index if not exists kfz_bestand_kosten_idx on public.kfz_bestand_kosten (bestand_id, datum);
alter table public.kfz_bestand_kosten enable row level security;

drop trigger if exists p181_besitzer on public.kfz_bestand_kosten;
create trigger p181_besitzer before insert or update on public.kfz_bestand_kosten
  for each row execute function public.p181_besitzer();

drop policy if exists kfzbk_owner_all on public.kfz_bestand_kosten;
create policy kfzbk_owner_all on public.kfz_bestand_kosten for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p181_ma_select on public.kfz_bestand_kosten;
create policy p181_ma_select on public.kfz_bestand_kosten for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p181_ma_insert on public.kfz_bestand_kosten;
create policy p181_ma_insert on public.kfz_bestand_kosten for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p181_ma_update on public.kfz_bestand_kosten;
create policy p181_ma_update on public.kfz_bestand_kosten for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p265_ma_delete on public.kfz_bestand_kosten;
create policy p265_ma_delete on public.kfz_bestand_kosten for delete to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('kfz'));

-- 2) Kalkulation und Provision (1 Zeile je Fahrzeug) ----------------------------------
create table if not exists public.kfz_bestand_kalk (
  bestand_id            uuid primary key references public.kfz_bestand(id) on delete cascade,
  owner_user_id         uuid not null,
  vk_erzielt            numeric(12,2) check (vk_erzielt is null or vk_erzielt >= 0),
  verkaeufer            text check (verkaeufer is null or char_length(verkaeufer) <= 120),
  hereinnehmer          text check (hereinnehmer is null or char_length(hereinnehmer) <= 120),
  prov_v_art            text check (prov_v_art is null or prov_v_art in ('rohertrag', 'umsatz', 'fest')),
  prov_v_wert           numeric(12,2) check (prov_v_wert is null or prov_v_wert >= 0),
  prov_h_art            text check (prov_h_art is null or prov_h_art in ('rohertrag', 'umsatz', 'fest')),
  prov_h_wert           numeric(12,2) check (prov_h_wert is null or prov_h_wert >= 0),
  prov_ausgezahlt_am    date,
  kommission            boolean not null default false,
  kommission_eigentuemer text check (kommission_eigentuemer is null or char_length(kommission_eigentuemer) <= 160),
  notiz                 text,
  aktualisiert_am       timestamptz not null default now()
);
alter table public.kfz_bestand_kalk enable row level security;

drop trigger if exists p181_besitzer on public.kfz_bestand_kalk;
create trigger p181_besitzer before insert or update on public.kfz_bestand_kalk
  for each row execute function public.p181_besitzer();

drop policy if exists kfzbkalk_owner_all on public.kfz_bestand_kalk;
create policy kfzbkalk_owner_all on public.kfz_bestand_kalk for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p265_ma_select on public.kfz_bestand_kalk;
create policy p265_ma_select on public.kfz_bestand_kalk for select to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen()
         and (public.darf_ich_modul_sehen('kfz') or public.darf_ich_modul_aendern('kfz')));
drop policy if exists p265_ma_insert on public.kfz_bestand_kalk;
create policy p265_ma_insert on public.kfz_bestand_kalk for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen() and public.darf_ich_modul_aendern('kfz'));
drop policy if exists p265_ma_update on public.kfz_bestand_kalk;
create policy p265_ma_update on public.kfz_bestand_kalk for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen() and public.darf_ich_modul_aendern('kfz'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_abrechnen() and public.darf_ich_modul_aendern('kfz'));

-- KONTROLLE — Erwartung: tabellen = 2, regeln_kosten = 5, regeln_kalk = 4, ausloeser = 2, rls_an = 2
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('kfz_bestand_kosten', 'kfz_bestand_kalk')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_bestand_kosten') as regeln_kosten,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'kfz_bestand_kalk') as regeln_kalk,
  (select count(*) from pg_trigger where tgrelid in ('public.kfz_bestand_kosten'::regclass, 'public.kfz_bestand_kalk'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('kfz_bestand_kosten', 'kfz_bestand_kalk') and relrowsecurity) as rls_an;
