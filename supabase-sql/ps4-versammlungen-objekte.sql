-- ============================================================
-- ARGONAUT OS · Paket PS4 · Versammlungen & Objekte — Stand 25.09.2026
--   versammlung            Eigentuemer- und Mitgliederversammlungen
--   versammlung_beschluss  Beschluesse = Beschluss-Sammlung (nie loeschen)
--   immo_schaden           Schadensmeldungen der Mieter
--   immo_mietanpassung     Mieterhoehung Vergleichsmiete / Indexmiete (nur Chef)
--   immo_kaution           Kautionskonto je Mietvertrag (nur Chef)
--   foerder_vorhaben       + finanzplan, bewilligung_von, bewilligung_bis, sachbericht
--   foerder_beleg          Belegliste zum Verwendungsnachweis (Chef; Mitarbeiter lesen/anlegen)
--   verein_ehrenamt        Ehrenamtsstunden
--   verein_pauschale       Zahlungen Uebungsleiter-/Ehrenamtspauschale (nur Chef)
--
-- ADDITIV UND IDEMPOTENT: neue Tabellen, neue Spalten, nichts geaendert oder geloescht.
-- Besitzer = Betrieb (coalesce(mein_chef_id(), auth.uid())).
-- Loeschen: nur der Chef. Beschluesse loescht niemand (Sammlung, § 24 Abs. 8 WEG).
-- ============================================================

-- ---------- Versammlungen ----------
create table if not exists public.versammlung (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(mein_chef_id(), auth.uid()),
  art               text not null check (art in ('weg', 'verein')),
  objekt            text,
  titel             text,
  termin            date not null,
  uhrzeit           text,
  ort               text,
  online            text,
  frist_tage        integer check (frist_tage is null or frist_tage between 0 and 365),
  post              boolean not null default false,
  versandt_am       date,
  tagesordnung      jsonb not null default '[]'::jsonb,
  status            text not null default 'geplant' check (status in ('geplant', 'eingeladen', 'abgeschlossen', 'abgesagt')),
  beginn            text,
  ende              text,
  leitung           text,
  protokollfuehrung text,
  anwesend          text,
  notizen           jsonb not null default '{}'::jsonb,
  beirat            boolean not null default false,
  erstellt_von      uuid default auth.uid(),
  erstellt_am       timestamptz not null default now(),
  aktualisiert_am   timestamptz not null default now()
);
create index if not exists versammlung_owner_idx on public.versammlung (owner_user_id, art, termin desc);

create table if not exists public.versammlung_beschluss (
  id                uuid primary key default gen_random_uuid(),
  owner_user_id     uuid not null default coalesce(mein_chef_id(), auth.uid()),
  versammlung_id    uuid not null references public.versammlung(id) on delete restrict,
  art               text not null check (art in ('weg', 'verein')),
  objekt            text,
  top_nr            integer,
  nummer            integer not null,
  text              text not null,
  mehrheit          text not null check (mehrheit in ('einfach', 'dreiviertel', 'weg_bauliche', 'alle_mitglieder', 'alle_anwesenden')),
  ja                numeric(12,2),
  nein              numeric(12,2),
  enthaltung        numeric(12,2),
  ja_mea            numeric(14,4),
  mea_gesamt        numeric(14,4),
  mitglieder_gesamt integer,
  angenommen        boolean not null,
  beschlossen_am    date not null default current_date,
  angefochten_am    date,
  aufgehoben_am     date,
  erstellt_von      uuid default auth.uid(),
  erstellt_am       timestamptz not null default now()
);
create unique index if not exists versammlung_beschluss_nr_uidx on public.versammlung_beschluss (owner_user_id, art, coalesce(objekt, ''), nummer);

alter table public.versammlung enable row level security;
drop policy if exists vs_chef_all on public.versammlung;
create policy vs_chef_all on public.versammlung for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists vs_ma_select on public.versammlung;
create policy vs_ma_select on public.versammlung for select to public using (owner_user_id = mein_chef_id());
drop policy if exists vs_ma_insert on public.versammlung;
create policy vs_ma_insert on public.versammlung for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists vs_ma_update on public.versammlung;
create policy vs_ma_update on public.versammlung for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

-- Beschluss-Sammlung: anlegen und Vermerke setzen ja, loeschen NIEMAND (keine delete-Regel).
alter table public.versammlung_beschluss enable row level security;
drop policy if exists vb_chef_select on public.versammlung_beschluss;
create policy vb_chef_select on public.versammlung_beschluss for select to public using (auth.uid() = owner_user_id);
drop policy if exists vb_chef_insert on public.versammlung_beschluss;
create policy vb_chef_insert on public.versammlung_beschluss for insert to public with check (auth.uid() = owner_user_id);
drop policy if exists vb_chef_update on public.versammlung_beschluss;
create policy vb_chef_update on public.versammlung_beschluss for update to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists vb_ma_select on public.versammlung_beschluss;
create policy vb_ma_select on public.versammlung_beschluss for select to public using (owner_user_id = mein_chef_id());
drop policy if exists vb_ma_insert on public.versammlung_beschluss;
create policy vb_ma_insert on public.versammlung_beschluss for insert to public with check (owner_user_id = mein_chef_id());

-- ---------- Mieter ----------
create table if not exists public.immo_schaden (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default coalesce(mein_chef_id(), auth.uid()),
  vertrag_id      uuid,
  einheit_id      uuid,
  kategorie       text not null,
  dringlichkeit   text not null default 'normal' check (dringlichkeit in ('notfall', 'dringend', 'normal')),
  status          text not null default 'gemeldet' check (status in ('gemeldet', 'beauftragt', 'termin', 'erledigt', 'abgelehnt')),
  beschreibung    text not null,
  gemeldet_am     timestamptz not null default now(),
  gemeldet_von    text,
  handwerker      text,
  termin          date,
  kosten          numeric(12,2),
  erledigt_am     date,
  erstellt_von    uuid default auth.uid(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists immo_schaden_owner_idx on public.immo_schaden (owner_user_id, status, gemeldet_am desc);

create table if not exists public.immo_mietanpassung (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  vertrag_id    uuid not null,
  art           text not null check (art in ('vergleich', 'index')),
  miete_alt     numeric(12,2) not null,
  miete_neu     numeric(12,2) not null,
  zugang_am     date not null,
  wirksam_ab    date not null,
  index_alt     numeric(10,2),
  index_neu     numeric(10,2),
  status        text not null default 'verschickt' check (status in ('entwurf', 'verschickt', 'zugestimmt', 'abgelehnt', 'wirksam')),
  uebernommen   boolean not null default false,
  erstellt_am   timestamptz not null default now()
);
create index if not exists immo_mietanpassung_vertrag_idx on public.immo_mietanpassung (vertrag_id, wirksam_ab desc);

create table if not exists public.immo_kaution (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  vertrag_id    uuid not null,
  soll          numeric(12,2) not null default 0,
  eingaenge     jsonb not null default '[]'::jsonb,
  anlage        text,
  zinsen        numeric(12,2),
  einbehalte    jsonb not null default '[]'::jsonb,
  rueckgabe_am  date,
  ausgezahlt    numeric(12,2),
  erstellt_am   timestamptz not null default now()
);
create unique index if not exists immo_kaution_vertrag_uidx on public.immo_kaution (vertrag_id);

-- Fremdschluessel nur, wenn die Bezugstabellen uuid-Schluessel haben.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'immo_mietvertraege' and column_name = 'id' and data_type = 'uuid') then
    if not exists (select 1 from pg_constraint where conname = 'immo_schaden_vertrag_fk') then
      alter table public.immo_schaden add constraint immo_schaden_vertrag_fk foreign key (vertrag_id) references public.immo_mietvertraege(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'immo_mietanpassung_vertrag_fk') then
      alter table public.immo_mietanpassung add constraint immo_mietanpassung_vertrag_fk foreign key (vertrag_id) references public.immo_mietvertraege(id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'immo_kaution_vertrag_fk') then
      alter table public.immo_kaution add constraint immo_kaution_vertrag_fk foreign key (vertrag_id) references public.immo_mietvertraege(id) on delete cascade;
    end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'immo_einheiten' and column_name = 'id' and data_type = 'uuid')
     and not exists (select 1 from pg_constraint where conname = 'immo_schaden_einheit_fk') then
    alter table public.immo_schaden add constraint immo_schaden_einheit_fk foreign key (einheit_id) references public.immo_einheiten(id) on delete set null;
  end if;
end $$;

alter table public.immo_schaden enable row level security;
drop policy if exists isd_chef_all on public.immo_schaden;
create policy isd_chef_all on public.immo_schaden for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists isd_ma_select on public.immo_schaden;
create policy isd_ma_select on public.immo_schaden for select to public using (owner_user_id = mein_chef_id());
drop policy if exists isd_ma_insert on public.immo_schaden;
create policy isd_ma_insert on public.immo_schaden for insert to public with check (owner_user_id = mein_chef_id());
drop policy if exists isd_ma_update on public.immo_schaden;
create policy isd_ma_update on public.immo_schaden for update to public using (owner_user_id = mein_chef_id()) with check (owner_user_id = mein_chef_id());

alter table public.immo_mietanpassung enable row level security;
drop policy if exists ima_chef_all on public.immo_mietanpassung;
create policy ima_chef_all on public.immo_mietanpassung for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

alter table public.immo_kaution enable row level security;
drop policy if exists ika_chef_all on public.immo_kaution;
create policy ika_chef_all on public.immo_kaution for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ---------- Foerdermittel ----------
alter table public.foerder_vorhaben add column if not exists finanzplan jsonb not null default '[]'::jsonb;
alter table public.foerder_vorhaben add column if not exists bewilligung_von date;
alter table public.foerder_vorhaben add column if not exists bewilligung_bis date;
alter table public.foerder_vorhaben add column if not exists sachbericht text;

create table if not exists public.foerder_beleg (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  vorhaben_id   uuid not null references public.foerder_vorhaben(id) on delete cascade,
  position      text not null,
  betrag        numeric(12,2) not null,
  datum         date,
  beleg_nr      text,
  lieferant     text,
  notiz         text,
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now()
);
create index if not exists foerder_beleg_vorhaben_idx on public.foerder_beleg (vorhaben_id, datum);

alter table public.foerder_beleg enable row level security;
drop policy if exists fb_chef_all on public.foerder_beleg;
create policy fb_chef_all on public.foerder_beleg for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists fb_ma_select on public.foerder_beleg;
create policy fb_ma_select on public.foerder_beleg for select to public using (owner_user_id = mein_chef_id());
drop policy if exists fb_ma_insert on public.foerder_beleg;
create policy fb_ma_insert on public.foerder_beleg for insert to public with check (owner_user_id = mein_chef_id());

-- ---------- Ehrenamt ----------
create table if not exists public.verein_ehrenamt (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default coalesce(mein_chef_id(), auth.uid()),
  mitglied_id   uuid,
  person        text not null,
  datum         date not null default current_date,
  stunden       numeric(5,2) not null check (stunden > 0 and stunden <= 24),
  taetigkeit    text,
  erstellt_von  uuid default auth.uid(),
  erstellt_am   timestamptz not null default now()
);
create index if not exists verein_ehrenamt_idx on public.verein_ehrenamt (owner_user_id, datum desc);

create table if not exists public.verein_pauschale (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid(),
  mitglied_id   uuid,
  person        text not null,
  datum         date not null default current_date,
  betrag        numeric(12,2) not null check (betrag > 0),
  art           text not null check (art in ('uebungsleiter', 'ehrenamt')),
  notiz         text,
  erstellt_am   timestamptz not null default now()
);
create index if not exists verein_pauschale_idx on public.verein_pauschale (owner_user_id, person, datum);

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'verein_mitglieder' and column_name = 'id' and data_type = 'uuid') then
    if not exists (select 1 from pg_constraint where conname = 'verein_ehrenamt_mitglied_fk') then
      alter table public.verein_ehrenamt add constraint verein_ehrenamt_mitglied_fk foreign key (mitglied_id) references public.verein_mitglieder(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'verein_pauschale_mitglied_fk') then
      alter table public.verein_pauschale add constraint verein_pauschale_mitglied_fk foreign key (mitglied_id) references public.verein_mitglieder(id) on delete set null;
    end if;
  end if;
end $$;

alter table public.verein_ehrenamt enable row level security;
drop policy if exists veh_chef_all on public.verein_ehrenamt;
create policy veh_chef_all on public.verein_ehrenamt for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists veh_ma_select on public.verein_ehrenamt;
create policy veh_ma_select on public.verein_ehrenamt for select to public using (owner_user_id = mein_chef_id());
drop policy if exists veh_ma_insert on public.verein_ehrenamt;
create policy veh_ma_insert on public.verein_ehrenamt for insert to public with check (owner_user_id = mein_chef_id());

alter table public.verein_pauschale enable row level security;
drop policy if exists vpa_chef_all on public.verein_pauschale;
create policy vpa_chef_all on public.verein_pauschale for all to public using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ---------- Kontrolle (nur lesen) ----------
select tablename, count(*) as regeln
from pg_policies
where schemaname = 'public' and tablename in ('versammlung', 'versammlung_beschluss', 'immo_schaden', 'immo_mietanpassung', 'immo_kaution', 'foerder_beleg', 'verein_ehrenamt', 'verein_pauschale')
group by tablename
order by tablename;
