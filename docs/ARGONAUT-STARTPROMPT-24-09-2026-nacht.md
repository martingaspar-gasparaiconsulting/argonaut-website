# ARGONAUT OS · Startprompt Do 24.09.2026 (Nacht) — Fortsetzung Bautag

Hallo Claude, ich bin Martin. Wir setzen den Bautag vom 24.09.2026 fort.
Bitte zuerst lesen: dieses Dokument, dann `docs/ARGONAUT-STARTPROMPT-24-09-2026.md` (Regeln + Paketplan)
und das Gedaechtnis `/areas/argonaut-bauliste-0924.md` (Baulog heute) sowie `/areas/argonaut-testtag-2.md`.
Repo: `C:\Users\Admin\Desktop\gaspar-ai-system\argonaut\website\argonaut-website` (beide Ordner anfordern).
Testtag: So 27.09.2026.

## 1. Stand

| Paket | Inhalt | Bat | Stand |
|---|---|---|---|
| PA–PL, PG3, R1, R2 | siehe Startprompt Abend | _p70–_p86 | live |
| PM | Mehrsprachiges Team (/dashboard/mehrsprachig, Team-Chat uebersetzt) | _p87 | live (2dc17fb) |
| PN | Kunden-Portal plus (/dashboard/portal/baustelle, oeffentlich /api/oeffentlich/portal/baustelle + /freigabe) | _p88 | live (7be460c) |
| PO | Dispo mit Befaehigungen + Route (/dashboard/dispo/qualifikationen) | _p89 | live (37b26d3) |
| PP | Chef-Blick (/dashboard/chef-blick): Auslastung 8 Wochen, Fruehwarnung, Morgen-Briefing, Bank-Mappe | _p90 | live (5342953) |
| PQ | Praxis-Paket (/dashboard/wellness/praxis): Recall, Ausfallhonorar, Einwilligungen, geschuetzte Gesundheitsangaben (AES-256-GCM, Zugriffsprotokoll), HWG-Werbe-Pruefer (auch in der Text-Werkstatt) | _p91 | SQL supabase-sql/pq-gesundheit.sql + Vercel-Variable GESUNDHEIT_SCHLUESSEL |

**17 von 19 Paketen + PG3 fertig, 2 uebrig (PR, PS).** Naechste freie Bat-Nummer: **_p92**.
Diese Datei wurde mit _p91 committet.

GESUNDHEIT_SCHLUESSEL: 32 Byte Base64, liegt NUR in Vercel (Production + Preview) und in Martins Passwort-Manager. Geht er verloren, sind die geschuetzten Gesundheitsangaben nicht mehr lesbar. Ohne Schluessel antwortet /api/gesundheit-notiz mit 503 — sonst laeuft alles.

## 2. Naechste Pakete
PR Pflichten-Helfer (K03 Kassen-Meldung, K04 Barrierefreiheit) -> PS Branchen-Blaetter (B21, ~6 Pakete). H00 Hilfsmittel wartet weiter auf Anwalt R07 (nicht angefasst).

## 3. Befunde heute (Claude)
- /api/team-chat-ki hatte keine Anmelde-Pruefung — in PM behoben.
- B31 Sprachbefehle existierten schon im Chef-Cockpit (Mikrofon -> /api/cockpit-chat -> Bestaetigung -> /api/cockpit-action).
- Zeitzonen: Vercel laeuft in UTC — Tagesgrenzen immer ueber Intl mit timeZone Europe/Berlin (lib/kundenPortalPlus, lib/chefPaket). Gegenprobe mit `TZ=UTC node --test`.
- Anwalt neu: R18 (maschinelle Uebersetzung Unterweisung), R19 (Freigabe per Portal-Link, Personen auf Baustellenfotos), R20 (PQ: Einwilligungs-Mustertexte, Ausfallhonorar, HWG-Regeln, Verschluesselung als TOM).
- PQ: wellness_kunden.hinweise ist ein Klartextfeld und war mit "Allergien" beschriftet -> Beschriftung geaendert, Knopf "In geschuetzte Ablage uebernehmen" im Praxis-Paket.

## 4. Regeln (unveraendert)
Deutsch, CMD, additiv, idempotentes SQL komplett in den Chat, eigene _pNN.bat (nie ueberschreiben), gezielter git add, Pruef-Kette + Gegenproben, Pfade mit [id]/[token] als `git add -- ":(literal)pfad"`, neue Seiten als Unterpfad oder `immer: true`/`nurChef: true` statt neuem modul-Schluessel, Speicher-Ordner = Betrieb.
