-- ============================================================
-- ARGONAUT OS · Paket 156 (28.09.2026) · Ablauf-Baukasten, Teil 1: Datenbank
--
--   ablaeufe          ein Ablauf: Ausloeser + Schritte (Karten-Kette), startet AUS
--   ablauf_versionen  jede gespeicherte Fassung (nur anhaengen, nie aendern)
--   ablauf_laeufe     ein Lauf je Ablauf und Vorgang (wartet / Freigabe / fertig)
--   ablauf_protokoll  jeder Schritt eines Laufs (nur anhaengen)
--
-- NEUE Tabellen, sonst nichts. Die bisherigen Automationen (automation_regeln)
-- bleiben unberuehrt und laufen weiter. Mehrfach ausfuehrbar. Sperrt niemanden aus.
-- Schreiben: nur die Geschaeftsleitung. Mitarbeiter sehen (lesen) den Betrieb.
-- ============================================================

create table if not exists public.ablaeufe (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null default auth.uid(),
  name             text not null default 'Neuer Ablauf',
  beschreibung     text,
  ausloeser        jsonb not null default '{}'::jsonb,
  schritte         jsonb not null default '[]'::jsonb,
  aktiv            boolean not null default false,
  version          integer not null default 1,
  vorlage_key      text,
  alt_regel_id     uuid,
  erstellt_am      timestamptz not null default now(),
  geaendert_am     timestamptz not null default now(),
  zuletzt_lauf_am  timestamptz,
  constraint ablaeufe_schritte_liste check (jsonb_typeof(schritte) = 'array'),
  constraint ablaeufe_ausloeser_objekt check (jsonb_typeof(ausloeser) = 'object')
);
create index if not exists ablaeufe_owner_idx on public.ablaeufe (owner_user_id, aktiv);
create unique index if not exists ablaeufe_alt_regel_uidx on public.ablaeufe (alt_regel_id) where alt_regel_id is not null;

create table if not exists public.ablauf_versionen (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null default auth.uid(),
  ablauf_id       uuid not null references public.ablaeufe(id) on delete cascade,
  version         integer not null,
  name            text,
  ausloeser       jsonb not null default '{}'::jsonb,
  schritte        jsonb not null default '[]'::jsonb,
  gespeichert_am  timestamptz not null default now(),
  gespeichert_von uuid default auth.uid()
);
create unique index if not exists ablauf_versionen_uidx on public.ablauf_versionen (ablauf_id, version);

create table if not exists public.ablauf_laeufe (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  ablauf_id      uuid not null references public.ablaeufe(id) on delete cascade,
  version        integer not null default 1,
  ziel_typ       text,
  ziel_id        uuid,
  status         text not null default 'laeuft'
                 check (status in ('laeuft', 'wartet', 'freigabe', 'fertig', 'gestoppt', 'abgebrochen', 'fehler')),
  pfad           text,
  weiter_am      timestamptz,
  probe          boolean not null default false,
  kontext        jsonb not null default '{}'::jsonb,
  meldung        text,
  gestartet_am   timestamptz not null default now(),
  beendet_am     timestamptz
);
-- EINMALIG: je Ablauf und Vorgang hoechstens ein echter Lauf (wie bei den Automationen)
create unique index if not exists ablauf_laeufe_einmalig on public.ablauf_laeufe (ablauf_id, ziel_typ, ziel_id) where ziel_id is not null and probe = false;
create index if not exists ablauf_laeufe_wartet_idx on public.ablauf_laeufe (weiter_am) where status = 'wartet';
create index if not exists ablauf_laeufe_owner_idx on public.ablauf_laeufe (owner_user_id, gestartet_am desc);

create table if not exists public.ablauf_protokoll (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  lauf_id        uuid not null references public.ablauf_laeufe(id) on delete cascade,
  ablauf_id      uuid,
  pfad           text,
  schritt_typ    text,
  ergebnis       text not null default 'ok'
                 check (ergebnis in ('ok', 'fehler', 'uebersprungen', 'wartet', 'freigabe', 'probe')),
  meldung        text,
  details        jsonb not null default '{}'::jsonb,
  zeit           timestamptz not null default now()
);
create index if not exists ablauf_protokoll_lauf_idx on public.ablauf_protokoll (lauf_id, zeit);
create index if not exists ablauf_protokoll_owner_idx on public.ablauf_protokoll (owner_user_id, zeit desc);

alter table public.ablaeufe         enable row level security;
alter table public.ablauf_versionen enable row level security;
alter table public.ablauf_laeufe    enable row level security;
alter table public.ablauf_protokoll enable row level security;

-- Ablaeufe: Chef alles, Mitarbeiter lesen
drop policy if exists abl_chef_all on public.ablaeufe;
create policy abl_chef_all on public.ablaeufe for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists abl_ma_select on public.ablaeufe;
create policy abl_ma_select on public.ablaeufe for select to authenticated using (owner_user_id = mein_chef_id());

-- Versionen: nur anlegen und lesen (kein Aendern, kein Loeschen — faellt nur mit dem Ablauf weg)
drop policy if exists ablv_chef_select on public.ablauf_versionen;
create policy ablv_chef_select on public.ablauf_versionen for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists ablv_chef_insert on public.ablauf_versionen;
create policy ablv_chef_insert on public.ablauf_versionen for insert to authenticated with check (owner_user_id = auth.uid());
drop policy if exists ablv_ma_select on public.ablauf_versionen;
create policy ablv_ma_select on public.ablauf_versionen for select to authenticated using (owner_user_id = mein_chef_id());

-- Laeufe: Chef lesen/anlegen/aendern (Freigabe, Abbrechen), Mitarbeiter lesen
drop policy if exists abll_chef_select on public.ablauf_laeufe;
create policy abll_chef_select on public.ablauf_laeufe for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists abll_chef_insert on public.ablauf_laeufe;
create policy abll_chef_insert on public.ablauf_laeufe for insert to authenticated with check (owner_user_id = auth.uid());
drop policy if exists abll_chef_update on public.ablauf_laeufe;
create policy abll_chef_update on public.ablauf_laeufe for update to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
drop policy if exists abll_ma_select on public.ablauf_laeufe;
create policy abll_ma_select on public.ablauf_laeufe for select to authenticated using (owner_user_id = mein_chef_id());

-- Protokoll: nur anhaengen und lesen
drop policy if exists ablp_chef_select on public.ablauf_protokoll;
create policy ablp_chef_select on public.ablauf_protokoll for select to authenticated using (owner_user_id = auth.uid());
drop policy if exists ablp_chef_insert on public.ablauf_protokoll;
create policy ablp_chef_insert on public.ablauf_protokoll for insert to authenticated with check (owner_user_id = auth.uid());
drop policy if exists ablp_ma_select on public.ablauf_protokoll;
create policy ablp_ma_select on public.ablauf_protokoll for select to authenticated using (owner_user_id = mein_chef_id());

-- ---------- Kontrolle (EINE Abfrage) ----------
-- Erwartet: ablaeufe 13 Spalten/2 Regeln · ablauf_laeufe 14/4 · ablauf_protokoll 10/3 · ablauf_versionen 9/3, je RLS an (true)
select c.relname as tabelle,
       (select count(*) from information_schema.columns i where i.table_schema = 'public' and i.table_name = c.relname) as spalten,
       c.relrowsecurity as rls,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as regeln
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('ablaeufe', 'ablauf_versionen', 'ablauf_laeufe', 'ablauf_protokoll')
 order by c.relname;
