-- ============================================================
-- ARGONAUT OS · Paket 200 (04.10.2026) · Werkstatt-Bühne auch mit Recht „Werkstatt"
-- Entscheidungsrunde Block 2: E7 (E8 „Angelegt von" braucht kein SQL)
--
-- Befund (Paket 165): Bühne buchen verlangt das Schreibrecht „Buchungen".
-- Ein Mitarbeiter mit nur „Werkstatt" kann zu SEINEM Werkstatt-Auftrag keine
-- Bühne buchen.
--
-- Additiv und mehrfach ausführbar. Nichts wird gelöscht, keine bestehende
-- Regel geändert. Niemand verliert etwas — es kommt nur ein Weg dazu:
-- 1) buchungen: anlegen und ändern auch mit Schreibrecht „Werkstatt",
--    aber NUR Buchungen, die an einem Werkstatt-Auftrag hängen
--    (werkstatt_auftrag_id gesetzt). Andere Buchungen (Räume, Verleih …)
--    bleiben beim Recht „Buchungen".
-- 2) ressourcen: Mitarbeiter mit Werkstatt-Recht dürfen die Bühnen lesen
--    (zur Auswahl). Anlegen/Ändern von Bühnen bleibt bei „Buchungen".
-- 3) Zwei-Faktor-Regel (164·3): keine neue Tabelle — Kontrolle bleibt 0.
--
-- RÜCKWEG (nur im Notfall):
--   drop policy if exists p200_werkstatt_insert on public.buchungen;
--   drop policy if exists p200_werkstatt_update on public.buchungen;
--   drop policy if exists p200_werkstatt_select on public.ressourcen;
-- ============================================================

drop policy if exists p200_werkstatt_insert on public.buchungen;
create policy p200_werkstatt_insert on public.buchungen for insert to authenticated
  with check (
    owner_user_id = public.mein_chef_id()
    and werkstatt_auftrag_id is not null
    and public.darf_ich_modul_aendern('werkstatt')
  );

drop policy if exists p200_werkstatt_update on public.buchungen;
create policy p200_werkstatt_update on public.buchungen for update to authenticated
  using (
    owner_user_id = public.mein_chef_id()
    and werkstatt_auftrag_id is not null
    and public.darf_ich_modul_aendern('werkstatt')
  )
  with check (
    owner_user_id = public.mein_chef_id()
    and werkstatt_auftrag_id is not null
    and public.darf_ich_modul_aendern('werkstatt')
  );

drop policy if exists p200_werkstatt_select on public.ressourcen;
create policy p200_werkstatt_select on public.ressourcen for select to authenticated
  using (
    owner_user_id = public.mein_chef_id()
    and (public.darf_ich_modul_sehen('werkstatt') or public.darf_ich_modul_aendern('werkstatt'))
  );

-- KONTROLLE — Erwartung: regeln 3 · sperren_davor 0 · zwei_faktor_fehlt 0
-- (sperren_davor > 0 heißt: eine weitere Schranken-Regel blockiert trotzdem — dann bitte melden)
select
  (select count(*) from pg_policies where schemaname = 'public'
     and ((tablename = 'buchungen' and policyname in ('p200_werkstatt_insert', 'p200_werkstatt_update'))
       or (tablename = 'ressourcen' and policyname = 'p200_werkstatt_select'))) as regeln,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('buchungen', 'ressourcen')
     and permissive = 'RESTRICTIVE' and policyname <> 'p164s3_aal' and cmd in ('INSERT', 'UPDATE', 'SELECT', 'ALL')) as sperren_davor,
  (select count(*) from pg_tables t where t.schemaname = 'public' and t.rowsecurity
     and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename and p.policyname = 'p164s3_aal')) as zwei_faktor_fehlt;
