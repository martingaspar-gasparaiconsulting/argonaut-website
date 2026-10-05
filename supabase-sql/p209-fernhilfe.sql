-- ============================================================
-- ARGONAUT OS · Paket 209 (05.10.2026) · Stufe 3 B10 Fernhilfe (Bildschirm teilen)
--
-- Neu: Tabelle fernhilfe_sitzung — wer hat wann Hilfe angefordert, wer hat
-- geholfen, wann beendet. Das BILD selbst wird nie gespeichert (läuft direkt
-- zwischen den Browsern). Der Kanal ist ein Zufalls-Geheimnis, das der
-- Helfer erst nach der Rechte-Prüfung vom Server bekommt.
--
-- Nur der Server liest und schreibt (/api/fernhilfe) — KEINE Regel für
-- Nutzer. Zwei-Faktor-Regel (164·3) wie bei jeder neuen Tabelle.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder geändert.
-- AUSSPERR-RISIKO: keines (neue Tabelle).
--
-- RÜCKWEG (nur im Notfall): drop table public.fernhilfe_sitzung;
-- ============================================================

create table if not exists public.fernhilfe_sitzung (
  id               uuid primary key default gen_random_uuid(),
  owner_user_id    uuid not null,
  angefordert_von  uuid not null,
  angefordert_name text not null default '',
  helfer_art       text not null check (helfer_art in ('betrieb', 'argonaut')),
  status           text not null default 'wartet' check (status in ('wartet', 'verbunden', 'beendet')),
  kanal            text not null unique check (kanal ~ '^[0-9a-f]{48}$'),
  grund            text check (grund is null or char_length(grund) <= 300),
  helfer_id        uuid,
  helfer_name      text,
  erstellt_am      timestamptz not null default now(),
  gueltig_bis      timestamptz not null,
  beendet_am       timestamptz,
  beendet_von      text check (beendet_von is null or beendet_von in ('teiler', 'helfer'))
);

create index if not exists fernhilfe_sitzung_owner_idx on public.fernhilfe_sitzung (owner_user_id, erstellt_am desc);
create index if not exists fernhilfe_sitzung_person_idx on public.fernhilfe_sitzung (angefordert_von, status);

alter table public.fernhilfe_sitzung enable row level security;
revoke all on public.fernhilfe_sitzung from anon, authenticated;

drop policy if exists p164s3_aal on public.fernhilfe_sitzung;
create policy p164s3_aal on public.fernhilfe_sitzung as restrictive for all to authenticated
  using ((select public.p164s3_aal_ok())) with check ((select public.p164s3_aal_ok()));

comment on table public.fernhilfe_sitzung is
  'Paket 209: Fernhilfe-Sitzungen (nur Nachweis wer/wann; kein Bild). Nur der Server liest/schreibt.';

-- KONTROLLE — Erwartung: tabelle 1 · nutzer_regeln 0 · rls_an true · zwei_faktor_fehlt 0
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'fernhilfe_sitzung') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'fernhilfe_sitzung' and policyname <> 'p164s3_aal') as nutzer_regeln,
  (select relrowsecurity from pg_class where oid = 'public.fernhilfe_sitzung'::regclass) as rls_an,
  (select count(*) from pg_tables t where t.schemaname = 'public' and t.rowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename and p.policyname = 'p164s3_aal')) as zwei_faktor_fehlt;
