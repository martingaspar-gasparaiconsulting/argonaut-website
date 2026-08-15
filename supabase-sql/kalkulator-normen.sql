-- ============================================================
-- ARGONAUT OS · Thema 4 · Branchen-Kalkulator (Schritt 1/5)
--
-- Was heute fehlt: die VORKALKULATION. Der Leistungskatalog kennt
-- Verkaufspreise, die Nachkalkulation vergleicht hinterher Plan und Ist,
-- die Rezeptur rechnet Material (nur Lebensmittel), der Zuschnitt rechnet
-- Mengen ohne Geld. Was nirgends passiert: aus Material + Zeit + Maschine
-- die SELBSTKOSTEN JE EINHEIT ausrechnen, bevor das Angebot rausgeht.
--
-- Zwei Tabellen:
--
--  1) kalkulator_normen — die Erfahrungswerte des Betriebs.
--     "Wie lange brauche ich fuer einen Quadratmeter?" · "Wieviel Farbe geht
--     drauf?" · "Wieviel Strom zieht die Maschine pro Stunde?"
--     Ausgeliefert werden Startwerte je Gewerk; jeder Betrieb ueberschreibt
--     sie mit seinen eigenen Zahlen. Spaeter (Schritt 5) fuellt sich das aus
--     echten Projekten von selbst — dafuer ist `quelle` da.
--
--  2) kalkulationen — die gerechneten Vorgaenge, damit man sie wiederfindet
--     und weiterverwenden kann. Posten und Ergebnis liegen als jsonb, weil
--     jedes Gewerk andere Zeilen hat und eine feste Spaltenstruktur nur im
--     Weg waere.
--
-- Nicht-brechend · idempotent · RLS wie die uebrigen Module.
-- ============================================================

-- ---------- 1) Normwerte je Gewerk ----------
create table if not exists public.kalkulator_normen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  gewerk         text not null,                     -- metallbau | maler | baecker | elektro | ...
  schluessel     text not null,                     -- z.B. zeit_streichen_m2
  bezeichnung    text not null,                     -- "Streichen, zwei Anstriche"
  art            text not null default 'zeit',      -- zeit | material | energie | zuschlag
  wert           numeric(14,4) not null default 0,
  einheit        text not null default 'min',       -- min | kg | l | kWh | Prozent | EUR
  bezug          text not null default 'm2',        -- je m2 | lfm | Stk | h | kg
  preis_je_einheit numeric(12,4),                   -- optional: was die Einheit kostet
  quelle         text not null default 'eigen',     -- vorlage | eigen | gelernt
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create unique index if not exists kalkulator_normen_uidx
  on public.kalkulator_normen (owner_user_id, gewerk, schluessel);
create index if not exists kalkulator_normen_idx
  on public.kalkulator_normen (owner_user_id, gewerk, art);

alter table public.kalkulator_normen enable row level security;

drop policy if exists kn_select on public.kalkulator_normen;
create policy kn_select on public.kalkulator_normen for select to public using ((auth.uid() = owner_user_id));
drop policy if exists kn_select_ma on public.kalkulator_normen;
create policy kn_select_ma on public.kalkulator_normen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kn_insert on public.kalkulator_normen;
create policy kn_insert on public.kalkulator_normen for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists kn_update on public.kalkulator_normen;
create policy kn_update on public.kalkulator_normen for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kn_delete on public.kalkulator_normen;
create policy kn_delete on public.kalkulator_normen for delete to public using ((auth.uid() = owner_user_id));

-- ---------- 2) Gerechnete Kalkulationen ----------
create table if not exists public.kalkulationen (
  id             uuid primary key default gen_random_uuid(),
  owner_user_id  uuid not null,
  name           text not null default 'Neue Kalkulation',
  gewerk         text,
  menge          numeric(14,4) not null default 1,
  einheit        text not null default 'Stk',
  posten         jsonb not null default '[]'::jsonb,   -- die Eingabezeilen
  zuschlaege     jsonb not null default '{}'::jsonb,   -- Gemeinkosten/Wagnis/Skonto in Prozent
  ergebnis       jsonb not null default '{}'::jsonb,   -- Momentaufnahme der Summen
  kontakt_id     uuid,                                  -- optional: fuer wen gerechnet
  projekt_id     uuid,
  notiz          text,
  erstellt_am    timestamptz not null default now(),
  aktualisiert_am timestamptz not null default now()
);
create index if not exists kalkulationen_idx
  on public.kalkulationen (owner_user_id, erstellt_am desc);

alter table public.kalkulationen enable row level security;

drop policy if exists kalk_select on public.kalkulationen;
create policy kalk_select on public.kalkulationen for select to public using ((auth.uid() = owner_user_id));
drop policy if exists kalk_select_ma on public.kalkulationen;
create policy kalk_select_ma on public.kalkulationen for select to public using ((owner_user_id = mein_chef_id()));
drop policy if exists kalk_insert on public.kalkulationen;
create policy kalk_insert on public.kalkulationen for insert to public with check ((auth.uid() = owner_user_id));
drop policy if exists kalk_update on public.kalkulationen;
create policy kalk_update on public.kalkulationen for update to public using ((auth.uid() = owner_user_id)) with check ((auth.uid() = owner_user_id));
drop policy if exists kalk_delete on public.kalkulationen;
create policy kalk_delete on public.kalkulationen for delete to public using ((auth.uid() = owner_user_id));
