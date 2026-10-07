# ARGONAUT Logo – Segel-A (entschieden 07.10.2026)

Martin hat das neue Logo festgelegt: das **Segel-A** – zwei Haelften, die steil
nach oben gehen (der Betrieb und ARGONAUT), getrennt durch die senkrechte
Mittelfuge, mit dem geschwungenen Querbogen. Liest sich zugleich als A, als
Segel und als Bug eines Schiffs. Schriftzug: ARGONAUT kraeftig, OS leichter.

Ersetzt den Emoji-Dreizack und alle Entwuerfe aus LOGO-NOTIZ-1.md.

## Dateien

Quelle (Martins Originale, je 1254 x 1254 px, weisser Hintergrund) wurden
vektorisiert. Die Fugen sind echte Luecken, alles ist freigestellt.

**Fuer die Webseite / App** – `public/images/marke/`
- `argonaut-logo-*.svg` – Zeichen + Schriftzug
- `argonaut-zeichen-*.svg` – nur das Zeichen
- Fassungen: `gold` (Verlauf, Hauptlogo), `flach` (ein Goldton #C9A84C),
  `schwarz` (Druck s/w, Rechnung, Stempel), `weiss` (auf Nachtblau/Foto),
  `navy` (auf hellem Gold/Papier)
- `argonaut-linkvorschau.png` – 1200 x 630, Vorschau fuer WhatsApp/LinkedIn/Mail

**Fuer Druck und Social Media** – `docs/marke/export/`
- `argonaut-logo-{gold,schwarz,weiss,flach}-2000.png` – transparent
- `argonaut-zeichen-{gold,schwarz,weiss}-1024.png` – transparent
- `argonaut-profilbild-1080.png` – Profilbild LinkedIn/Instagram/Google
- `argonaut-linkvorschau-1200x630.png`

**Im Code**
- `lib/argonautZeichen.ts` – DIE eine Form (Pfad, Hoehe 1, Verhaeltnis 1,37)
- `components/Dreizack.tsx` – zeichnet sie ueberall (Name bleibt aus
  Kompatibilitaet, gut 20 Stellen)
- `lib/onboardingZertifikat.ts` – PDF-Zertifikat nutzt dieselbe Form
- `app/favicon.ico` (16/32/48, Zeichen auf Nachtblau), `app/apple-icon.png`
  (180), `public/images/argonaut-icon-*.png` (App-Symbole 192/512, maskable)

## Regeln
- Hauptlogo: Gold auf Nachtblau (#0A1628) oder Gold auf Weiss
- Einfarbig: Schwarz auf Weiss, Weiss auf Nachtblau
- Unter ca. 24 px nur das Zeichen, ohne Schriftzug
- Kein Glow, kein Pulsieren, keine Schatten (siehe LOGO-NOTIZ-1)

## Noch offen
- Teil 2: die ca. 27 Stellen mit dem Emoji 🔱 (Angebots-/Portal-/Buchungsseiten,
  Dossier- und E-Book-HTML, Testen, Upgrade …) auf das neue Zeichen umstellen
- Markenrecherche DPMA/EUIPO vor dem Einsatz (Anwalt-Checkliste)
- Fuer die Eintragung beim DPMA: Vektor-Datei `argonaut-logo-schwarz.svg`
