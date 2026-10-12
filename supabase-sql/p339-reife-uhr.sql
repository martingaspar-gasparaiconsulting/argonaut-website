-- ============================================================
-- ARGONAUT OS · Paket 339 (12.10.2026) · BV3a Manufaktur Teil 1 · Reife-Uhr
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder umgebaut.
--
-- reife_charge:  eine Reife-Charge (Dry-Aged, Rohschinken, Rohwurst, Käse,
--                Wein, Confiserie …) mit Start, Ziel-, Mindest- und
--                Höchstreife, Startmenge und Soll-Klima.
-- reife_messung: Messungen dazu (Gewicht, Temperatur, Luftfeuchte). Eine
--                Messung wird nicht geändert — Fehleingaben löscht nur die
--                Geschäftsleitung (Nachweis bleibt sonst stehen).
--
-- Rechte wie Paket 331: Besitzer = Betrieb (Auslöser p181_besitzer),
-- Mitarbeiter lesen mit Modul „lebensmittel", anlegen/ändern mit
-- Schreibrecht. Chargen löscht nur die Geschäftsleitung (sonst Status
-- „verworfen"). Wächter p339: Messung gehört zu einer Charge desselben
-- Betriebs, Betrieb und Charge bleiben fest.
-- ============================================================

create table if not exists public.reife_charge (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  nummer        text not null check (char_length(nummer) between 1 and 30),
  produkt       text not null check (char_length(produkt) between 1 and 120),
  art           text not null default 'sonstig' check (art in ('dry_aged', 'rohschinken', 'rohwurst', 'kaese', 'wein', 'confiserie', 'sonstig')),
  start_datum   date not null,
  ziel_tage     integer check (ziel_tage is null or ziel_tage between 1 and 3650),
  min_tage      integer check (min_tage is null or min_tage between 0 and 3650),
  max_tage      integer check (max_tage is null or max_tage between 1 and 3650),
  start_menge   numeric(12,3) check (start_menge is null or start_menge > 0),
  einheit       text not null default 'kg' check (einheit in ('kg', 'g', 'l', 'Stk')),
  lagerort      text check (lagerort is null or char_length(lagerort) <= 80),
  temp_min      numeric(5,1) check (temp_min is null or temp_min between -40 and 60),
  temp_max      numeric(5,1) check (temp_max is null or temp_max between -40 and 60),
  feuchte_min   numeric(5,1) check (feuchte_min is null or feuchte_min between 0 and 100),
  feuchte_max   numeric(5,1) check (feuchte_max is null or feuchte_max between 0 and 100),
  status        text not null default 'reift' check (status in ('reift', 'bereit', 'abgeschlossen', 'verworfen')),
  end_datum     date,
  end_menge     numeric(12,3) check (end_menge is null or end_menge > 0),
  notiz         text check (notiz is null or char_length(notiz) <= 500),
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now(),
  constraint reife_charge_tage_ck check (
    (min_tage is null or ziel_tage is null or min_tage <= ziel_tage)
    and (max_tage is null or ziel_tage is null or max_tage >= ziel_tage)
  ),
  constraint reife_charge_klima_ck check (
    (temp_min is null or temp_max is null or temp_min <= temp_max)
    and (feuchte_min is null or feuchte_max is null or feuchte_min <= feuchte_max)
  ),
  constraint reife_charge_ende_ck check (end_datum is null or end_datum >= start_datum)
);
create index if not exists reife_charge_idx on public.reife_charge (owner_user_id, status, start_datum);
create unique index if not exists reife_charge_nummer_uq on public.reife_charge (owner_user_id, nummer);

create table if not exists public.reife_messung (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(public.mein_chef_id(), auth.uid()),
  charge_id     uuid not null references public.reife_charge(id) on delete cascade,
  datum         date not null default current_date,
  menge         numeric(12,3) check (menge is null or menge > 0),
  temperatur    numeric(5,1) check (temperatur is null or temperatur between -40 and 60),
  feuchte       numeric(5,1) check (feuchte is null or feuchte between 0 and 100),
  notiz         text check (notiz is null or char_length(notiz) <= 200),
  erfasst_von   uuid default auth.uid(),
  erstellt_am   timestamptz not null default now(),
  constraint reife_messung_inhalt_ck check (menge is not null or temperatur is not null or feuchte is not null)
);
create index if not exists reife_messung_idx on public.reife_messung (owner_user_id, charge_id, datum);

alter table public.reife_charge enable row level security;
alter table public.reife_messung enable row level security;

-- Besitzer = Betrieb (gleicher Auslöser wie überall seit Paket 181)
drop trigger if exists p181_besitzer on public.reife_charge;
create trigger p181_besitzer before insert or update on public.reife_charge
  for each row execute function public.p181_besitzer();
drop trigger if exists p181_besitzer on public.reife_messung;
create trigger p181_besitzer before insert or update on public.reife_messung
  for each row execute function public.p181_besitzer();

-- Wächter: Betrieb bleibt fest; Messung gehört zu einer Charge desselben Betriebs
create or replace function public.p339_reife_waechter()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_start date;
begin
  if tg_op = 'UPDATE' and new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Der Betrieb eines Eintrags kann nicht geändert werden.';
  end if;
  if tg_table_name = 'reife_charge' then
    new.aktualisiert_am := now();
    if new.status in ('abgeschlossen', 'verworfen') and new.end_datum is null then
      new.end_datum := current_date;
    end if;
  else
    if tg_op = 'UPDATE' then
      raise exception 'Eine Messung wird nicht geändert — bitte eine neue Messung erfassen.';
    end if;
    select c.start_datum into v_start from public.reife_charge c
      where c.id = new.charge_id and c.owner_user_id = new.owner_user_id;
    if v_start is null then
      raise exception 'Die Charge gehört nicht zu Ihrem Betrieb.';
    end if;
    if new.datum < v_start then
      raise exception 'Die Messung liegt vor dem Start der Reifung.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists p339_waechter on public.reife_charge;
create trigger p339_waechter before insert or update on public.reife_charge
  for each row execute function public.p339_reife_waechter();
drop trigger if exists p339_waechter on public.reife_messung;
create trigger p339_waechter before insert or update on public.reife_messung
  for each row execute function public.p339_reife_waechter();

-- Regeln: Chargen
drop policy if exists rfc_owner_all on public.reife_charge;
create policy rfc_owner_all on public.reife_charge for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p339_ma_select on public.reife_charge;
create policy p339_ma_select on public.reife_charge for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('lebensmittel') or public.darf_ich_modul_aendern('lebensmittel')));
drop policy if exists p339_ma_insert on public.reife_charge;
create policy p339_ma_insert on public.reife_charge for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('lebensmittel'));
drop policy if exists p339_ma_update on public.reife_charge;
create policy p339_ma_update on public.reife_charge for update to authenticated
  using (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('lebensmittel'))
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('lebensmittel'));

-- Regeln: Messungen (Mitarbeiter: lesen + anlegen, kein Ändern, kein Löschen)
drop policy if exists rfm_owner_all on public.reife_messung;
create policy rfm_owner_all on public.reife_messung for all to authenticated
  using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists p339_ma_select on public.reife_messung;
create policy p339_ma_select on public.reife_messung for select to authenticated
  using (owner_user_id = public.mein_chef_id() and (public.darf_ich_modul_sehen('lebensmittel') or public.darf_ich_modul_aendern('lebensmittel')));
drop policy if exists p339_ma_insert on public.reife_messung;
create policy p339_ma_insert on public.reife_messung for insert to authenticated
  with check (owner_user_id = public.mein_chef_id() and public.darf_ich_modul_aendern('lebensmittel'));

-- KONTROLLE — Erwartung: tabellen = 2 | regeln = 7 | ausloeser = 4 | rls_an = 2
-- (regeln = 9 ist ebenfalls richtig: p164s3_aal, die Zwei-Faktor-Regel, die
--  Paket 164 an jede neue Tabelle hängt — je Tabelle eine mehr, harmlos)
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('reife_charge', 'reife_messung')) as tabellen,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('reife_charge', 'reife_messung')) as regeln,
  (select count(*) from pg_trigger where tgrelid in ('public.reife_charge'::regclass, 'public.reife_messung'::regclass) and not tgisinternal) as ausloeser,
  (select count(*) from pg_class where relname in ('reife_charge', 'reife_messung') and relrowsecurity) as rls_an;
