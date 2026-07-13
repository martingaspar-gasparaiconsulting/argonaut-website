// ============================================================================
// ARGONAUT OS · lib/mail.ts — EINE Stelle fuer den gesamten Mail-Versand
//
// Alle Module (Rechnungen, Mahnwesen, Termine, Field-Service-Berichte, ...)
// verschicken Mails ausschliesslich ueber sendeMail(). Kein Modul spricht Resend
// direkt an. Vorteile:
//   - Absender/Reply-To/Branding an EINER Stelle gepflegt.
//   - Fehlerbehandlung + Logging einheitlich.
//   - Wechsel des Versand-Dienstes spaeter = nur diese Datei.
//
// SERVER-ONLY: Diese Datei nutzt den RESEND_API_KEY und darf NIEMALS in eine
// Client-Komponente importiert werden. Nur in Route-Handlern / Server-Code.
//
// Voraussetzung: Env-Variable RESEND_API_KEY (re_...) in Vercel + .env.local.
// Domain argonaut-os.com ist bei Resend verifiziert.
// ============================================================================

import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Konfiguration — zentrale Absender-Identitaet.
// ---------------------------------------------------------------------------
const ABSENDER_NAME = "ARGONAUT OS";
const ABSENDER_MAIL = "noreply@argonaut-os.com";
const ANTWORT_MAIL = "info@argonaut-os.com";

/** Zusammengesetzter From-Header: "ARGONAUT OS <noreply@argonaut-os.com>". */
const FROM = `${ABSENDER_NAME} <${ABSENDER_MAIL}>`;

// ---------------------------------------------------------------------------
// Resend-Client. Lazy erzeugt, damit ein fehlender Key nicht schon beim
// Import knallt, sondern erst beim tatsaechlichen Versand eine klare Meldung
// liefert.
// ---------------------------------------------------------------------------
let _resend: Resend | null = null;

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY fehlt. In Vercel (Environment Variables) und lokal in .env.local eintragen."
    );
  }
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

/** Ein Datei-Anhang (z. B. ein Rechnungs-PDF). */
export type MailAnhang = {
  /** Dateiname inkl. Endung, z. B. "Rechnung-2026-001.pdf". */
  dateiname: string;
  /** Datei-Inhalt als Buffer oder base64-String. */
  inhalt: Buffer | string;
  /** Optionaler MIME-Typ, z. B. "application/pdf". */
  typ?: string;
};

export type MailEingang = {
  /** Empfaenger — eine Adresse oder mehrere. */
  an: string | string[];
  /** Betreffzeile. */
  betreff: string;
  /** HTML-Inhalt der Mail. */
  html: string;
  /** Optionaler reiner Text-Inhalt (Fallback fuer Clients ohne HTML). */
  text?: string;
  /** Optionale Kopie (CC). */
  cc?: string | string[];
  /** Optionale Blindkopie (BCC). */
  bcc?: string | string[];
  /** Abweichende Antwort-Adresse. Standard: info@argonaut-os.com. */
  antwortAn?: string;
  /** Optionale Datei-Anhaenge (z. B. Rechnungs-PDF). */
  anhaenge?: MailAnhang[];
};

export type MailErgebnis =
  | { ok: true; id: string }
  | { ok: false; fehler: string };

// ---------------------------------------------------------------------------
// Die zentrale Sende-Funktion.
// ---------------------------------------------------------------------------

/**
 * Verschickt eine Mail ueber Resend im Namen von ARGONAUT OS.
 * Gibt niemals einen Fehler nach aussen (wirft nicht), sondern liefert
 * ein Ergebnis-Objekt — damit aufrufende Module sauber reagieren koennen,
 * ohne dass ein Mail-Problem den ganzen Vorgang abbricht.
 *
 * @example
 *   const r = await sendeMail({
 *     an: "kunde@example.com",
 *     betreff: "Ihre Rechnung",
 *     html: "<p>Anbei Ihre Rechnung.</p>",
 *     anhaenge: [{ dateiname: "Rechnung.pdf", inhalt: pdfBuffer, typ: "application/pdf" }],
 *   });
 *   if (!r.ok) console.error(r.fehler);
 */
export async function sendeMail(eingang: MailEingang): Promise<MailErgebnis> {
  try {
    const resend = client();

    // Anhaenge ins Resend-Format bringen (erwartet content als Buffer/base64).
    const attachments = eingang.anhaenge?.map((a) => ({
      filename: a.dateiname,
      content: a.inhalt,
      ...(a.typ ? { contentType: a.typ } : {}),
    }));

    const { data, error } = await resend.emails.send({
      from: FROM,
      to: eingang.an,
      subject: eingang.betreff,
      html: eingang.html,
      ...(eingang.text ? { text: eingang.text } : {}),
      ...(eingang.cc ? { cc: eingang.cc } : {}),
      ...(eingang.bcc ? { bcc: eingang.bcc } : {}),
      replyTo: eingang.antwortAn ?? ANTWORT_MAIL,
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    });

    if (error) {
      return { ok: false, fehler: error.message || "Unbekannter Resend-Fehler." };
    }
    if (!data?.id) {
      return { ok: false, fehler: "Resend lieferte keine Nachrichten-ID zurueck." };
    }
    return { ok: true, id: data.id };
  } catch (e: any) {
    return { ok: false, fehler: e?.message || "Mail-Versand fehlgeschlagen." };
  }
}

// ---------------------------------------------------------------------------
// Kleiner HTML-Rahmen im ARGONAUT-Branding — optional nutzbar, damit einzelne
// Module nicht jedes Mal HTML von Hand bauen muessen.
// ---------------------------------------------------------------------------

/**
 * Verpackt einen Inhalt (HTML) in ein schlichtes, markenkonformes Mail-Layout.
 * Navy-Kopf, Gold-Akzent, DM-Sans-naher System-Font (E-Mail-sicher).
 *
 * @param titel   Ueberschrift im Kopfbereich.
 * @param inhalt  HTML-Inhalt des Haupttextes.
 */
export function mailLayout(titel: string, inhalt: string): string {
  return `
  <div style="margin:0;padding:0;background:#0A1628;font-family:Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:0;">
      <div style="background:#0A1628;padding:28px 32px;border-bottom:2px solid #C9A84C;">
        <div style="color:#C9A84C;font-size:22px;font-weight:800;letter-spacing:-0.02em;">ARGONAUT&nbsp;OS</div>
        <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:6px;">${titel}</div>
      </div>
      <div style="background:#ffffff;padding:28px 32px;color:#1a2332;font-size:15px;line-height:1.6;">
        ${inhalt}
      </div>
      <div style="background:#0F1F33;padding:18px 32px;color:#8FA3BE;font-size:12px;line-height:1.5;">
        Diese E-Mail wurde automatisch von ARGONAUT OS versendet.<br>
        Bei Fragen antworten Sie einfach auf diese E-Mail (${ANTWORT_MAIL}).
      </div>
    </div>
  </div>`;
}
