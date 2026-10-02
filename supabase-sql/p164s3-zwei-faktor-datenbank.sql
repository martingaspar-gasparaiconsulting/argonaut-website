-- ============================================================
-- ARGONAUT OS · Paket 164·3 (02.10.2026) · Zwei-Faktor auch in der Datenbank
--
-- Bisher prüft nur der Pförtner der Seiten (/dashboard, /admin) den zweiten
-- Faktor. Wer ein gestohlenes Passwort hat, kommt zwar nicht auf die Seiten,
-- konnte aber mit der Anmeldung direkt die Schnittstelle der Datenbank
-- abfragen. Jetzt verlangt die DATENBANK selbst:
--
--   Hat ein Zugang einen bestätigten zweiten Faktor, sieht und ändert er nur
--   dann Daten, wenn die Anmeldung mit Code bestätigt ist (aal2).
--   Zugänge OHNE Faktor merken nichts (wie bisher nur Passwort).
--
-- Umsetzung: je Tabelle mit Zeilen-Regeln (RLS) im Bereich „public" und für
-- den Dateispeicher eine zusätzliche, EINSCHRÄNKENDE Regel „p164s3_aal".
-- Sie gibt nie etwas frei, sie kann nur sperren. Nicht betroffen: der
-- Server-Schlüssel (Zeitpläne, öffentliche Seiten, Kundenportal, Webhooks),
-- nicht angemeldete Besucher (anon), Datenbank-Funktionen mit eigenen Rechten.
--
-- AUSSPERR-RISIKO: Wer einen Faktor hat und NUR mit Passwort angemeldet ist,
-- sieht danach leere Listen, bis er den Code eingibt. Die Seiten schicken ihn
-- ohnehin zur Code-Eingabe — betroffen wären nur Sitzungen, die irgendwie am
-- Pförtner vorbeilaufen. Die Code-Eingabe, Notfall-Codes und die Hilfe-
-- Anfrage laufen über den Server-Schlüssel und bleiben erreichbar.
--
-- RÜCKWEG (sofort wirksam, nichts geht verloren):
--   do $$ declare r record; begin
--     for r in select schemaname, tablename from pg_policies where policyname = 'p164s3_aal' loop
--       execute format('drop policy if exists p164s3_aal on %I.%I', r.schemaname, r.tablename);
--     end loop; end $$;
--
-- Live-Stand 02.10.2026 (Vorab-Abfrage): 448 Tabellen mit RLS, 0 ohne,
-- 27 Zugänge, davon 0 mit bestätigtem Faktor, 0 offene Sitzungen nur mit
-- Passwort -> heute wird NIEMAND gesperrt; die Regel greift erst, wenn
-- jemand einen Faktor einrichtet.
--
-- Mehrfach ausführbar. Neue Tabellen später: Datei einfach erneut ausführen.
-- ============================================================

-- 1) Prüffunktion: darf diese Sitzung an die Daten?
create or replace function public.p164s3_aal_ok()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      );
$$;

revoke all on function public.p164s3_aal_ok() from public;
grant execute on function public.p164s3_aal_ok() to authenticated;

-- 2) Einschränkende Regel auf jede Tabelle mit RLS (nur Rolle authenticated)
do $$
declare
  t record;
  n integer := 0;
begin
  for t in
    select schemaname, tablename from pg_tables
     where schemaname = 'public' and rowsecurity
  loop
    execute format('drop policy if exists p164s3_aal on %I.%I', t.schemaname, t.tablename);
    execute format(
      'create policy p164s3_aal on %I.%I as restrictive for all to authenticated using ((select public.p164s3_aal_ok())) with check ((select public.p164s3_aal_ok()))',
      t.schemaname, t.tablename);
    n := n + 1;
  end loop;
  raise notice 'p164s3: Regel auf % Tabellen gesetzt', n;
end $$;

-- 3) Dateispeicher
drop policy if exists p164s3_aal on storage.objects;
create policy p164s3_aal on storage.objects as restrictive for all to authenticated
  using ((select public.p164s3_aal_ok())) with check ((select public.p164s3_aal_ok()));

-- Kontrolle — Erwartung: tabellen_mit_regel 448 · fehlend 0 · speicher 1 · funktion 1
--   (448 = Tabellen mit RLS laut Vorab-Abfrage vom 02.10.; neue Tabellen erhöhen die Zahl)
select
  (select count(*) from pg_policies where schemaname = 'public' and policyname = 'p164s3_aal') as tabellen_mit_regel,
  (select count(*) from pg_tables t where t.schemaname = 'public' and t.rowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename and p.policyname = 'p164s3_aal')) as fehlend,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'p164s3_aal') as speicher,
  (select count(*) from pg_proc where proname = 'p164s3_aal_ok') as funktion;
