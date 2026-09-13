-- ============================================================================
-- ARGONAUT OS · Rückhol-Strecke (3.15 Paket 3)          Stand 13.09.2026
--
-- Vier Tabellen:
--   rueckhol_strecke  — die Einstellung je Betrieb (ab wann gilt jemand ruhend)
--   rueckhol_schritt  — die einzelnen Nachrichten der Strecke
--   rueckhol_lauf     — wer gerade in der Strecke ist und wo
--   rueckhol_versand  — Sperre gegen Doppelmails (ein Schritt je Lauf, EINMAL)
--
-- ADDITIV UND IDEMPOTENT: nichts wird gelöscht, nichts überschrieben.
-- Der Block darf beliebig oft laufen.
--
-- Das Protokoll (lauf + versand) kennt bewusst KEIN Löschrecht — wer belegen
-- muss, wann er wem geschrieben hat, darf diese Zeilen nicht wegräumen können.
-- ============================================================================

-- ---------------------------------------------------------------- 1) Strecke
create table if not exists public.rueckhol_strecke (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name          text not null default 'Rückhol-Strecke',
  aktiv         boolean not null default false,
  ruhe_tage     integer not null default 180,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default now()
);

create index if not exists rueckhol_strecke_owner_idx
  on public.rueckhol_strecke (owner_user_id);

-- Die Untergrenze steht zusätzlich in lib/rueckholung.ts (MIN_RUHE_TAGE).
-- Hier noch einmal, damit auch ein direkter Datenbank-Eingriff sie einhält.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'rueckhol_strecke_ruhe_tage_check'
  ) then
    alter table public.rueckhol_strecke
      add constraint rueckhol_strecke_ruhe_tage_check
      check (ruhe_tage >= 30 and ruhe_tage <= 3650);
  end if;
end $$;

-- ---------------------------------------------------------------- 2) Schritte
create table if not exists public.rueckhol_schritt (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  strecke_id    uuid not null references public.rueckhol_strecke(id) on delete cascade,
  schritt       integer not null,
  nach_tagen    integer not null default 0,
  betreff       text not null default '',
  text          text not null default '',
  aktiv         boolean not null default true,
  erstellt_am   timestamptz not null default now()
);

create unique index if not exists rueckhol_schritt_eindeutig_idx
  on public.rueckhol_schritt (strecke_id, schritt);

create index if not exists rueckhol_schritt_owner_idx
  on public.rueckhol_schritt (owner_user_id);

-- ------------------------------------------------------------------- 3) Läufe
create table if not exists public.rueckhol_lauf (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  strecke_id    uuid not null references public.rueckhol_strecke(id) on delete cascade,
  kontakt_id    uuid,
  email         text not null,
  gestartet_am  date not null default current_date,
  -- zuletzt GESENDETER Schritt; 0 = noch keiner
  schritt       integer not null default 0,
  faellig_am    date,
  -- aktiv | fertig | gestoppt
  status        text not null default 'aktiv',
  stopp_grund   text,
  beendet_am    date,
  erstellt_am   timestamptz not null default now()
);

-- Ein Kontakt ist nie zweimal gleichzeitig in derselben Strecke.
create unique index if not exists rueckhol_lauf_offen_idx
  on public.rueckhol_lauf (strecke_id, kontakt_id)
  where status = 'aktiv' and kontakt_id is not null;

create index if not exists rueckhol_lauf_faellig_idx
  on public.rueckhol_lauf (status, faellig_am);

create index if not exists rueckhol_lauf_owner_idx
  on public.rueckhol_lauf (owner_user_id);

-- Für die Sperrfrist: wann war dieser Kontakt zuletzt durch?
create index if not exists rueckhol_lauf_kontakt_ende_idx
  on public.rueckhol_lauf (kontakt_id, beendet_am);

-- ---------------------------------------------------------------- 4) Versand
-- Diese Tabelle ist die Doppelmail-Sperre. Der Eintrag entsteht VOR dem
-- Versand: ein Eintrag ohne Mail ist ärgerlich, eine Mail doppelt ist eine
-- Beschwerde. Der eindeutige Schlüssel macht den Eintrag zur Sperre.
create table if not exists public.rueckhol_versand (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  lauf_id       uuid not null references public.rueckhol_lauf(id) on delete cascade,
  schritt       integer not null,
  gesendet_am   timestamptz not null default now()
);

create unique index if not exists rueckhol_versand_eindeutig_idx
  on public.rueckhol_versand (lauf_id, schritt);

-- ------------------------------------------------------------------ 5) RLS an
alter table public.rueckhol_strecke enable row level security;
alter table public.rueckhol_schritt enable row level security;
alter table public.rueckhol_lauf    enable row level security;
alter table public.rueckhol_versand enable row level security;

-- ---------------------------------------------------------------- 6) Regeln
-- Marketing ist Chef-Sache: keine Mitarbeiter-Regeln (kein mein_chef_id()).
-- Wer das später öffnen will, ergänzt _ma-Regeln nach dem Muster der Werkstatt.
do $$
declare
  t text;
  tabellen text[] := array['rueckhol_strecke', 'rueckhol_schritt', 'rueckhol_lauf', 'rueckhol_versand'];
begin
  foreach t in array tabellen loop

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_select') then
      execute format(
        'create policy %I on public.%I for select to authenticated using (auth.uid() = owner_user_id)',
        t || '_select', t);
    end if;

    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_insert') then
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (auth.uid() = owner_user_id)',
        t || '_insert', t);
    end if;

    -- Protokollzeilen werden nicht nachträglich geändert.
    if t in ('rueckhol_strecke', 'rueckhol_schritt', 'rueckhol_lauf') then
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_update') then
        execute format(
          'create policy %I on public.%I for update to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id)',
          t || '_update', t);
      end if;
    end if;

    -- Löschen nur für die eigenen Einstellungen, nie für das Protokoll.
    if t in ('rueckhol_strecke', 'rueckhol_schritt') then
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_delete') then
        execute format(
          'create policy %I on public.%I for delete to authenticated using (auth.uid() = owner_user_id)',
          t || '_delete', t);
      end if;
    end if;

  end loop;
end $$;

-- ============================================================================
-- 7) KONTROLLE — eine einzige Abfrage (der Supabase-Editor zeigt sonst nur
--    das Ergebnis der letzten). Erwartet: 4 Tabellen, 13 Regeln
--    (Strecke und Schritt je 4, Lauf 3, Versand 2 — Protokollzeilen werden
--    weder geaendert noch geloescht).
-- ============================================================================
select 'Tabelle' as art, tablename as name, '' as zusatz
from pg_tables
where schemaname = 'public' and tablename like 'rueckhol%'
union all
select 'Regel', policyname, tablename
from pg_policies
where schemaname = 'public' and tablename like 'rueckhol%'
union all
select 'SUMME', 'Tabellen: ' || (select count(*) from pg_tables where schemaname='public' and tablename like 'rueckhol%')::text,
       'Regeln: ' || (select count(*) from pg_policies where schemaname='public' and tablename like 'rueckhol%')::text
order by 1, 3, 2;
