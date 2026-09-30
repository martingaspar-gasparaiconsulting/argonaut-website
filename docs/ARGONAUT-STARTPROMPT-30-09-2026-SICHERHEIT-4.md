# ARGONAUT OS – Startprompt SICHERHEIT-4 (30.09.2026)

Hallo Claude, wir machen mit ARGONAUT OS weiter.

## Startritual
1. Beide Ordner anfordern: `C:\Users\Admin\Desktop\gaspar-ai-system` und `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website`.
2. Memory lesen: `/areas/argonaut-bauliste-0929.md` (Baulog), `/areas/argonaut-testtag-3.md`, `/areas/argonaut-anwalt-checkliste-2.md` (bis R38), Preferences.
3. Bauliste im Blick: Artifact „ARGONAUT Bauliste" https://claude.ai/artifact/X2y63fejjA6Qi6pSyxZP8T (Quelle `docs/bauliste/rows.py`, `gen.py`; nach jedem Live-Push Zeile auf „live", gen.py, mit url neu veröffentlichen, Dateien aufs Gerät).
4. Prüf-Klon in der Cloud (git clone, npm test, PGlite für SQL). Nie aus dem Klon pushen.

## Stand
- Live bis **Paket 178** (bbc8625): 164b, 169, 170, 173, 174, 175, 176, 177, 178. Bauliste V11: **9 von 51**.
- `docs/bauliste/*` auf dem Gerät geändert (178 live, 179 nächster) → mit `_p179` committen, ebenso diese Datei.
- Offen von Martin: **Voyage-AI-Opt-out** (dashboard.voyageai.com, Training widersprechen, Screenshot) – die Datenschutzerklärung sagt bereits „widersprochen". Supabase-Region (eu-north-1 Stockholm) im Dashboard bestätigen.

## Nächstes: Paket 179 Musterbetrieb XXL (2 Pushes)
Bestand (Prüfung 30.09.):
- `lib/uebungswelt.ts` (SEEDER + LOESCH_ORDER, Register `beispiel_datensatz`), `app/api/uebungswelt/route.ts` (Kunde: status/laden/entfernen), `app/api/admin/demo-betriebe/route.ts` + `app/admin/demo-betriebe/page.tsx` (21 Vorführ-Betriebe, `lib/demoBetriebe.ts`, kein Löschen, kein Link im Command Center), Cron `demo-aufraeumen` (nur demo_ablauf > 7 Tage vorbei; DEMO_TOKEN-Anschlüsse, Profil, Konto bleiben).
- Heute gefüllt nur ca. 20 Tabellen (kontakte, lieferanten, artikel, verleih_artikel, projekte, mitglieder, angebote(+positionen), rechnungen, zahlungen, crm_deal, versand_sendung, eingangsbelege, assets, wartungsvertraege, 6 Anschluss-Tabellen). Kein Test.
- Plan: Push 1 = Kern-Module (Personal/Zeit, Aufträge/Einsätze/Termine/Aufgaben, Finanzen, CRM/Marketing/Leads, Lager/Bestellungen, Bau) als neue Seeder im selben Register + reine Logik-Datei mit Tests; Knopf „Musterbetrieb XXL anlegen / löschen" im Command Center (nur Betreiber), Löschen vollständig über Register. Push 2 = Branchen-Tabellen. Spalten JEDER Tabelle am echten Insert-Code der Seiten ablesen (kein Raten), Mitarbeiter-/Gesundheitsdaten nur erfunden, nie echte.
- Danach: 180, 190–193, 188 Voice; Entscheidungsrunde Block 2.

## Regeln (unverändert)
_pNNN.bat je Paket, nie überschreiben, GIT_LITERAL_PATHSPECS=1, gezielter git add; Prüf-Kette esbuild + tsc ganzes Projekt + Typfehler-Gegenprobe + npm test + Gegenproben rot + SQL 2× PGlite; SQL additiv/idempotent komplett in den Chat; Aussperr-Risiken vorher nennen; GEMEINSAM = zeigen + sofort bauen; „Sie" in Kundentexten; „Bausteine"; keine Mitbewerber-Namen; CMD, nie PowerShell.
