-- ============================================================
-- ARGONAUT OS · Paket 210 (05.10.2026) · Stufe 3 B7 Eigene Absender-Domain je Betrieb
--
-- Neu: Tabelle absender_domain — je Betrieb höchstens EINE eigene Domain,
-- die der Betreiber im Command Center bei Resend anlegt. Kunden-Mails des
-- Betriebs gehen erst dann von dort, wenn Resend die Domain bestätigt hat
-- UND der Schalter „aktiv" an ist (Prüfung in der Datenbank: aktiv nur bei
-- status = verifiziert). Dieselbe Domain kann nie zwei Betrieben gehören.
--
-- Nur der Server liest und schreibt (/api/admin/absender-domain und
-- /api/absender-domain) — KEINE Regel für Nutzer. Zwei-Faktor-Regel (164·3)
-- wie bei jeder neuen Tabelle.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht oder geändert.
-- AUSSPERR-RISIKO: keines (neue Tabelle; ohne Zeile bleibt der Absender
-- wie bisher noreply@argonaut-os.com).
--
-- RÜCKWEG (nur im Notfall): drop table public.absender_domain;
-- ============================================================

create table if not exists public.absender_domain (
  owner_user_id  uuid primary key,
  domain         text not null check (domain ~ '^[a-z0-9][a-z0-9.-]{1,198}[a-z0-9]$' and domain not like '%argonaut-os.com'),
  lokalteil      text not null default 'post' check (lokalteil ~ '^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$'),
  resend_id      text,
  status         text not null default 'wartet' check (status in ('wartet', 'verifiziert', 'fehler', 'entfernt')),
  dns            jsonb not null default '[]'::jsonb,
  aktiv          boolean not null default false,
  fehler         text check (fehler is null or char_length(fehler) <= 500),
  angelegt_am    timestamptz not null default now(),
  angelegt_von   uuid,
  geprueft_am    timestamptz,
  verifiziert_am timestamptz,
  geaendert_am   timestamptz not null default now(),
  constraint absender_domain_aktiv_nur_verifiziert check (not aktiv or status = 'verifiziert')
);

-- Eine Domain gehört höchstens einem Betrieb (entfernte zählen nicht).
create unique index if not exists absender_domain_domain_eindeutig
  on public.absender_domain (lower(domain)) where status <> 'entfernt';

alter table public.absender_domain enable row level security;
revoke all on public.absender_domain from anon, authenticated;

drop policy if exists p164s3_aal on public.absender_domain;
create policy p164s3_aal on public.absender_domain as restrictive for all to authenticated
  using ((select public.p164s3_aal_ok())) with check ((select public.p164s3_aal_ok()));

comment on table public.absender_domain is
  'Paket 210: eigene Absender-Domain je Betrieb (Resend). Nur der Server liest/schreibt; aktiv nur bei status verifiziert.';

-- KONTROLLE — Erwartung: tabelle 1 · nutzer_regeln 0 · rls_an true · pruefregel 1 · zwei_faktor_fehlt 0
select
  (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'absender_domain') as tabelle,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'absender_domain' and policyname <> 'p164s3_aal') as nutzer_regeln,
  (select relrowsecurity from pg_class where oid = 'public.absender_domain'::regclass) as rls_an,
  (select count(*) from pg_constraint where conname = 'absender_domain_aktiv_nur_verifiziert') as pruefregel,
  (select count(*) from pg_tables t where t.schemaname = 'public' and t.rowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename and p.policyname = 'p164s3_aal')) as zwei_faktor_fehlt;
