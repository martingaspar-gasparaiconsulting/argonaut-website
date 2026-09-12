-- ============================================================
-- ARGONAUT OS · Punkt 2.6 · Mandantentrennung — die Reparaturen
-- Stand: 12.09.2026
--
-- VORGESCHICHTE
-- Geprueft wurde am 12.09. in drei Stufen:
--   1) Tabellen ohne RLS                      -> KEINE. Sauber.
--   2) Regeln, die nichts filtern             -> vier, alle SELECT/public.
--   3) Wer greift mit welchem Client zu       -> scripts/pruefe-rls-nutzung.cjs
-- 1.196 von 1.200 Regeln binden sauber an Nutzer oder Betrieb.
--
-- ALLES HIER IST ADDITIV UND UMKEHRBAR.
-- Es wird keine Tabelle, keine Spalte und keine Zeile angefasst. Geaendert
-- werden ausschliesslich Zugriffsregeln. Der Rueckweg steht am Ende der
-- Datei und stellt den Stand vom 12.09.2026 wieder her.
--
-- REIHENFOLGE
--   Block 1  churned_customers — faellt unter die GEMEINSAM-Regel (Auth).
--            Erst ausfuehren, wenn Martin ausdruecklich zugestimmt hat.
--   Block 2  die vier offenen Regeln — unkritisch.
-- ============================================================


-- ============================================================
-- BLOCK 1 · churned_customers — der Churn-Lock ist wirkungslos
--
-- BEFUND
-- app/auth/callback/route.ts prueft nach dem Login, ob die E-Mail in
-- churned_customers steht, und sperrt gekuendigte Kunden aus. Der Client
-- dort ist createServerClient mit dem ANON-Schluessel. Die Tabelle hat RLS
-- an und keine einzige Regel — die Abfrage liefert also nie eine Zeile.
-- `churned` ist immer null, die Sperre greift nie. Ohne Fehlermeldung.
--
-- WARUM DIESE REGEL UND KEINE ANDERE
-- Der Nutzer ist an dieser Stelle bereits angemeldet (exchangeCodeForSession
-- lief durch), sein JWT traegt seine E-Mail. Die Regel erlaubt ihm, GENAU
-- SEINE EIGENE Zeile zu sehen — nicht die Liste. Er erfaehrt damit nichts,
-- was er nicht ohnehin erfaehrt: dass sein eigener Zugang gesperrt ist.
-- Fremde Kuendigungen bleiben unsichtbar.
--
-- lower() auf beiden Seiten, weil E-Mail-Adressen bei der Anmeldung in
-- unterschiedlicher Schreibweise ankommen koennen.
--
-- GEMEINSAM-REGEL: Das ist Auth/Login. Nicht unbeaufsichtigt ausfuehren.
-- ============================================================

drop policy if exists churned_eigene_email_lesen on public.churned_customers;

create policy churned_eigene_email_lesen
  on public.churned_customers
  for select
  to authenticated
  using ( lower(email) = lower(auth.jwt() ->> 'email') );


-- ============================================================
-- BLOCK 2 · Die vier Regeln, die nichts filtern
--
-- Alle vier lauten `using (true)` fuer die Rolle `public`. `public` schliesst
-- `anon` ein — also jeden, der den anon-Schluessel aus dem Browser-Bundle
-- nimmt. Die Tabellen enthalten keine Kundendaten (keine Mandantenspalte,
-- keine E-Mail), es ist also kein Vorfall. Aber sie gehen niemanden etwas
-- an, der nicht angemeldet ist.
--
-- Aus `public` wird `authenticated`. Fuer jeden eingeloggten Kunden aendert
-- sich nichts. Nur der Zugriff ohne Anmeldung faellt weg.
-- ============================================================

-- 2a · academy_kurse (8 Zeilen · Kurs-Katalog)
-- WICHTIG: Diese Tabelle wird tatsaechlich mit anon-Client gelesen —
-- app/dashboard/academy/page.tsx:23 ueber lib/supabase-server. Das ist der
-- eingeloggte Bereich, also traegt `authenticated`. Ein blosses Zumachen
-- wuerde die Academy-Seite leeren.
drop policy if exists academy_read_all on public.academy_kurse;
create policy academy_read_all
  on public.academy_kurse
  for select
  to authenticated
  using ( true );

-- 2b · agents (24 Zeilen · alte Agenten-Liste, im Code nicht mehr benutzt)
-- Die Spalte n8n_webhook_url ist in keiner einzigen Zeile befuellt —
-- es liegt dort kein Schluessel offen.
drop policy if exists agents_read_all on public.agents;
create policy agents_read_all
  on public.agents
  for select
  to authenticated
  using ( true );

-- 2c · automatisierungen (128 Zeilen · Workflow-Katalog mit min_paket)
-- Im Code nicht gefunden. Das ist Produktwissen, keine Kundendaten —
-- aber es ist Monate an Arbeit und muss nicht oeffentlich abrufbar sein.
drop policy if exists "Alle lesen" on public.automatisierungen;
create policy "Alle lesen"
  on public.automatisierungen
  for select
  to authenticated
  using ( true );

-- 2d · betreiber_flags (1 Zeile: cta_modus = beide)
-- Beide Zugriffe im Code laufen ueber Service-Role
-- (app/admin/command-center/page.tsx und app/api/admin/cta-modus/route.ts).
-- Die Lese-Regel wird also von niemandem gebraucht. Sie bleibt trotzdem
-- bestehen und wird nur auf `authenticated` verengt — SAFETY-FIRST:
-- verengen ist umkehrbar, und ein Loeschen braeuchte es nicht zu sein.
drop policy if exists betreiber_flags_select on public.betreiber_flags;
create policy betreiber_flags_select
  on public.betreiber_flags
  for select
  to authenticated
  using ( true );


-- ============================================================
-- KONTROLLE · nach dem Ausfuehren, als eigene Abfrage
-- Erwartung: fuenf Zeilen, alle mit rollen = authenticated.
-- ============================================================
-- select tablename as tabelle, policyname as regel,
--        array_to_string(roles, ',') as rollen,
--        coalesce(qual, '—') as lesebedingung
-- from pg_policies
-- where schemaname = 'public'
--   and policyname in ('churned_eigene_email_lesen', 'academy_read_all',
--                      'agents_read_all', 'Alle lesen', 'betreiber_flags_select')
-- order by tablename;


-- ============================================================
-- RUECKWEG · stellt den Stand vom 12.09.2026 wieder her
-- Nur ausfuehren, wenn nach Block 2 eine Seite leer bleibt.
-- ============================================================
-- drop policy if exists churned_eigene_email_lesen on public.churned_customers;
--
-- drop policy if exists academy_read_all on public.academy_kurse;
-- create policy academy_read_all on public.academy_kurse
--   for select to public using ( true );
--
-- drop policy if exists agents_read_all on public.agents;
-- create policy agents_read_all on public.agents
--   for select to public using ( true );
--
-- drop policy if exists "Alle lesen" on public.automatisierungen;
-- create policy "Alle lesen" on public.automatisierungen
--   for select to public using ( true );
--
-- drop policy if exists betreiber_flags_select on public.betreiber_flags;
-- create policy betreiber_flags_select on public.betreiber_flags
--   for select to public using ( true );
