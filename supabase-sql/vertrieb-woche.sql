-- ============================================================
-- ARGONAUT OS · Vertriebs-Kette je Woche (Betreiber + später Kunde)
-- Additiv · idempotent · NICHT destruktiv
-- Ausgeführt am 13.09.2026 · Kontrolle ergab 21 Spalten · 4 Regeln
--
-- WARUM
-- Der Termin-Wert-Rechner (lib/terminWert.ts) rechnet seit 07.09.2026
-- rueckwaerts vom Kundenwert — aber niemand traegt ein, was tatsaechlich
-- passiert ist. Diese Tabelle ist der Ort dafuer: eine Zeile je Woche und
-- Kanal, mit Stueckzahlen UND eingesetzter Zeit.
--
-- Die Zeit ist bewusst eine eigene Spalte je Stufe: nur so laesst sich der
-- Stundensatz im Vertrieb rechnen — die Zahl, an der „selbst machen oder
-- abgeben" haengt. Gerechnet wird in lib/vertriebsKette.ts (node-getestet),
-- angezeigt unter /admin/command-center/vertrieb/kette.
--
-- KEIN Personenbezug: gezaehlt wird der BETRIEB und die Woche, nie ein
-- einzelner Mitarbeiter. Das haelt die Tabelle aus § 87 Abs. 1 Nr. 6 BetrVG
-- heraus (Leistungs- und Verhaltenskontrolle).
-- ============================================================

create table if not exists public.vertrieb_woche (
  id               uuid        primary key default gen_random_uuid(),
  owner_user_id    uuid        not null default auth.uid(),
  woche            date        not null,                      -- immer der Montag
  kanal            text        not null default 'gesamt',     -- social | telefon | mail | netzwerk | gesamt

  -- hinaus
  beitraege        integer     not null default 0,
  ansprachen       integer     not null default 0,

  -- zurueck
  reaktionen       integer     not null default 0,
  antworten        integer     not null default 0,
  gespraeche       integer     not null default 0,

  -- Trichter
  eintragungen     integer     not null default 0,
  termine_gebucht  integer     not null default 0,
  termine_gehalten integer     not null default 0,
  kunden           integer     not null default 0,
  umsatz           numeric(12,2) not null default 0,

  -- Zeit in Minuten
  min_inhalte      integer     not null default 0,
  min_ansprache    integer     not null default 0,
  min_gespraeche   integer     not null default 0,
  min_termine      integer     not null default 0,

  notiz            text,
  erstellt_am      timestamptz not null default now(),
  geaendert_am     timestamptz not null default now()
);

comment on table public.vertrieb_woche is
  'Vertriebs-Kette je Woche und Kanal: Stueckzahlen und eingesetzte Minuten. '
  'Ohne Personenbezug — gezaehlt wird der Betrieb, nie ein Mitarbeiter.';

-- Eine Zeile je Woche und Kanal (zugleich das Ziel des upsert in KetteClient)
create unique index if not exists vertrieb_woche_eindeutig_idx
  on public.vertrieb_woche (owner_user_id, woche, kanal);

create index if not exists vertrieb_woche_zeit_idx
  on public.vertrieb_woche (owner_user_id, woche desc);

alter table public.vertrieb_woche enable row level security;

-- Regeln: jeder sieht und schreibt ausschliesslich seine eigenen Wochen.
-- Bewusst KEINE Mitarbeiter-Regel (_ma) — das ist Chefsache.
-- Loeschen ist hier erlaubt, anders als sonst: eine vertippte Wochenzeile muss
-- man wegwerfen koennen, und es haengt kein anderer Datensatz daran.
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'vertrieb_woche'
                   and policyname = 'vertrieb_woche_select') then
    create policy vertrieb_woche_select on public.vertrieb_woche
      for select to authenticated using (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'vertrieb_woche'
                   and policyname = 'vertrieb_woche_insert') then
    create policy vertrieb_woche_insert on public.vertrieb_woche
      for insert to authenticated with check (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'vertrieb_woche'
                   and policyname = 'vertrieb_woche_update') then
    create policy vertrieb_woche_update on public.vertrieb_woche
      for update to authenticated using (owner_user_id = auth.uid())
      with check (owner_user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'vertrieb_woche'
                   and policyname = 'vertrieb_woche_delete') then
    create policy vertrieb_woche_delete on public.vertrieb_woche
      for delete to authenticated using (owner_user_id = auth.uid());
  end if;
end $$;

-- Kontrolle (eine Abfrage, der Editor zeigt sonst nur die letzte):
select 'spalten' as was, count(*)::text as wert
  from information_schema.columns
 where table_schema = 'public' and table_name = 'vertrieb_woche'
union all
select 'regeln', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'vertrieb_woche';
