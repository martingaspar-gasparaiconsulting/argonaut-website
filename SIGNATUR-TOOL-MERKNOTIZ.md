# ARGONAUT OS — Merk-Notiz: E-Signatur (Docuseal-Ablösung + Eigenbau-Plan)

> Erstellt beim Aufräumen der Docuseal-Reste. Zweck: Idee & alten Aufbau
> konservieren, damit beim späteren Eigenbau nichts neu erdacht werden muss.
> **Status:** Docuseal-Dateien wurden entfernt (in Git-Historie weiter auffindbar).

---

## 1. Was Docuseal früher gemacht hat (alter Aufbau, als Referenz)

**Zwei gelöschte Dateien:**

- `lib/docuseal.ts` — Hilfsbibliothek, sprach mit der self-hosted Docuseal-API.
  - `createSubmissionFromPdf(name, pdfBase64, submitters)` → PDF an Docuseal,
    Docuseal mailte dem Empfänger automatisch den Signatur-Link (`send_email: true`).
  - `getSubmissionStatus(submissionId)` → Status-Abfrage (pending/completed),
    lieferte auch `audit_log_url` (Nachweis).
  - ENV: `DOCUSEAL_URL`, `DOCUSEAL_API_TOKEN`.

- `app/api/erstellte-dokumente/signieren/route.ts` — POST-Route.
  - Ablauf: (1) User + Ownership per RLS prüfen → (2) PDF aus privatem
    Storage-Bucket `erstellte-dokumente` holen (Admin-Client) → base64 →
    (3) an Docuseal schicken → (4) `docuseal_submission_id` + `status='gesendet'`
    in Tabelle `erstellte_dokumente` speichern.
  - Nur PDF konnte signiert werden (`doc.typ === 'pdf'`).

**Offener DB-Rest (bewusst NICHT gelöscht):**
- Spalte `erstellte_dokumente.docuseal_submission_id` bleibt stehen
  (SAFETY-FIRST: keine destruktiven DB-Änderungen). Stört nicht.
  Beim Eigenbau kann sie umbenannt/nachgenutzt werden (z.B. `signatur_anfrage_id`).

---

## 2. Bauplan: eigenes E-Signatur-Tool (ohne Fremd-Dienst)

**Rechtsrahmen (Alltag Mittelstand):**
Für Angebote, Aufträge, interne Freigaben reicht eine **einfache elektronische
Signatur (EES)** — die kann man selbst bauen. Für streng formgebundene Fälle
(z.B. Arbeitsvertrag-Kündigung) bräuchte man eine **qualifizierte Signatur (QES)**
mit Identitätsprüfung → nur über zertifizierten Anbieter, NICHT selbst baubar.
Eigenbau deckt ~95 % des Alltags ab.

**Bausteine (fast alles schon vorhanden):**

1. **DB-Tabelle `signatur_anfragen`** (Supabase, idempotent anlegen):
   - `id`, `dokument_id` (→ erstellte_dokumente), `empfaenger_email`,
     `zugangs_token` (geheim, für Link), `status` ('offen'/'signiert'/'abgelaufen'),
     `owner_user_id`, `erstellt_am`,
     Nachweis: `signiert_am`, `signiert_ip`, `zustimmung_text`.

2. **Öffentliche Signier-Seite** `/signieren/[token]` (Next.js, OHNE Login):
   - Token aus URL → Anfrage laden → PDF anzeigen.
   - Zeichen-Feld für Unterschrift: Bibliothek **`signature_pad`** (klein, bewährt).
   - Checkbox „Gelesen & einverstanden".

3. **Signatur ins PDF einbrennen:**
   - Unterschrift-Bild an Zielposition aufs PDF legen — mit **`pdf-lib`**
     (oder bestehende Gotenberg-Pipeline).

4. **E-Mail-Versand:** bestehende **n8n → Gmail**-Kette nutzt den Signier-Link.
   Kein neuer Dienst.

5. **Nachweis/Audit:** beim Signieren `signiert_am` + IP + Zustimmung speichern
   = einfache elektronische Signatur.

**Wiederverwendbar aus dem Bestand:** Supabase, privater Bucket
`erstellte-dokumente`, PDF-Erzeugung, n8n-Mailversand, RLS/Owner-Muster.
**Wirklich neu:** nur die öffentliche Signier-Seite mit Zeichenfeld.

**Einordnung:** GROSSER eigener Baustein — sauber terminieren, kein Quick-Win.
