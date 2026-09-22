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
import { escapeHtml, sichereFarbe } from "@/lib/newsletter";
import { werbeFuss } from "@/lib/werbemail";

// ---------------------------------------------------------------------------
// Konfiguration — zentrale Absender-Identitaet.
// ---------------------------------------------------------------------------
const ABSENDER_NAME = "ARGONAUT OS";
const ABSENDER_MAIL = "noreply@argonaut-os.com";
const ANTWORT_MAIL = "info@argonaut-os.com";

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

/** Baut den From-Header. Standard-Absendername ARGONAUT OS; einzelne Module
 *  (z. B. der Kunden-Newsletter) koennen einen eigenen Anzeigenamen setzen —
 *  die Absender-Domain bleibt IMMER die verifizierte argonaut-os.com. */
function fromHeader(absenderName?: string): string {
  const clean = (absenderName || "").replace(/[<>"\r\n]/g, "").trim();
  return `${clean || ABSENDER_NAME} <${ABSENDER_MAIL}>`;
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
  /** Abweichender Absender-ANZEIGENAME (Domain bleibt argonaut-os.com).
   *  Fuer den Kunden-Newsletter = der Firmenname des Kunden. Standard: ARGONAUT OS. */
  absenderName?: string;
  /** Optionale Datei-Anhaenge (z. B. Rechnungs-PDF). */
  anhaenge?: MailAnhang[];
  /**
   * Zusaetzliche Kopfzeilen, z. B. List-Unsubscribe bei Werbe-Post.
   * Sie werden geprueft: ein Zeilenumbruch in Name oder Wert wuerde eine
   * FREMDE Kopfzeile an die Mail haengen, deshalb fliegt so ein Eintrag raus.
   * Bauen laesst man sie mit werbeKopfzeilen() aus lib/werbemail.ts.
   */
  kopfzeilen?: Record<string, string>;
  /**
   * Post, die im NAMEN DES BETRIEBS an dessen Kunden geht.
   * Dann darf die Antwort NIEMALS bei ARGONAUT landen: ohne antwortAn geht die
   * Mail lieber ganz ohne Antwort-Adresse raus (22.09.2026, Punkt 68).
   */
  kundenPost?: boolean;
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
/**
 * Kopfzeilen absichern. Ein Zeilenumbruch oder Doppelpunkt im Namen wuerde
 * eine fremde Kopfzeile einschleusen — solche Eintraege werden verworfen,
 * nicht repariert.
 */
function saubereKopfzeilen(k: Record<string, string> | undefined): Record<string, string> {
  const raus: Record<string, string> = {};
  if (!k) return raus;
  for (const [name, wert] of Object.entries(k)) {
    if (typeof name !== "string" || typeof wert !== "string") continue;
    if (!/^[A-Za-z0-9-]{1,64}$/.test(name)) continue;
    if (/[\r\n\0]/.test(wert) || wert.length > 998) continue;
    raus[name] = wert;
  }
  return raus;
}

export async function sendeMail(eingang: MailEingang): Promise<MailErgebnis> {
  try {
    const resend = client();

    // Anhaenge ins Resend-Format bringen (erwartet content als Buffer/base64).
    const attachments = eingang.anhaenge?.map((a) => ({
      filename: a.dateiname,
      content: a.inhalt,
      ...(a.typ ? { contentType: a.typ } : {}),
    }));

    const kopfzeilen = saubereKopfzeilen(eingang.kopfzeilen);
    const kopfAntwort = eingang.kundenPost
      ? (eingang.antwortAn || "").trim() || undefined
      : eingang.antwortAn ?? ANTWORT_MAIL;

    const { data, error } = await resend.emails.send({
      from: fromHeader(eingang.absenderName),
      to: eingang.an,
      subject: eingang.betreff,
      html: eingang.html,
      ...(eingang.text ? { text: eingang.text } : {}),
      ...(eingang.cc ? { cc: eingang.cc } : {}),
      ...(eingang.bcc ? { bcc: eingang.bcc } : {}),
      // Antwort-Adresse: bei Post im Namen des Betriebs NUR dessen eigene.
      // Fehlt sie, geht die Mail ohne Antwort-Adresse raus — vorher landete
      // die Antwort des fremden Kunden bei info@argonaut-os.com.
      ...(kopfAntwort ? { replyTo: kopfAntwort } : {}),
      ...(Object.keys(kopfzeilen).length > 0 ? { headers: kopfzeilen } : {}),
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
// HINWEIS: Nur fuer ARGONAUT-EIGENE Post (System-Mails). Kunden-Post, die im
// Namen des Kunden rausgeht (Newsletter), nutzt ein neutrales Kunden-Layout.
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

// ---------------------------------------------------------------------------
// KUNDEN-Layout (Punkt 29c-Folge) — fuer Mails, die im Namen DES KUNDEN an
// dessen Kunden gehen (Rechnung, Terminbestaetigung, Erinnerung, Bewertung…).
// Neutrales Weiss, Firmenname im Kopf, Firmen-Akzentfarbe — KEIN ARGONAUT.
// `inhalt` ist bereits fertiges HTML (wie bei mailLayout), wird roh eingesetzt.
// ---------------------------------------------------------------------------

/** Firmen-Branding eines Kontos laden (Absendername/Akzentfarbe/Antwort-Mail).
 *  `supabase` ist ein beliebiger Client mit .from() (Session ODER Admin). */
export async function absenderBranding(
  supabase: any,
  userId: string,
): Promise<{ firma: string; akzent: string; email: string | undefined }> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("firma_name, firma_email, firma_akzentfarbe, full_name")
      .eq("id", userId)
      .maybeSingle();
    const p = (data ?? {}) as {
      firma_name?: string | null;
      firma_email?: string | null;
      firma_akzentfarbe?: string | null;
      full_name?: string | null;
    };
    const firma = (p.firma_name || "").trim() || (p.full_name || "").trim() || "Ihr Dienstleister";
    return {
      firma,
      akzent: sichereFarbe(p.firma_akzentfarbe),
      email: (p.firma_email || "").trim() || undefined,
    };
  } catch {
    return { firma: "Ihr Dienstleister", akzent: sichereFarbe(null), email: undefined };
  }
}

/**
 * Neutrales Kunden-Mail-Layout. `inhalt` = bereits fertiges HTML.
 * @param firma       Firmenname des Kunden (Kopf + Signatur).
 * @param akzentfarbe Firmen-Akzentfarbe (Hex, wird abgesichert).
 * @param titel       Optionale Ueberschrift.
 * @param inhalt      HTML-Inhalt des Haupttextes.
 */
export type KundenMailOptionen = {
  /**
   * true = diese Mail ist Werbung. NUR dann kommt der Werbe-Fuss (Abmeldelink,
   * Impressum-Zeile, Widerspruchshinweis) darunter. Ob etwas Werbung ist,
   * entscheidet der Aufrufer — bei Automationen istWerbung() aus
   * lib/automation.ts, die im Zweifel auf true faellt.
   */
  werbung?: boolean;
  /** Fertiger Abmelde-Link. Ohne ihn entsteht KEIN Fuss. */
  abmeldeLink?: string;
  /** Impressum-Zeile des Betriebs (Anschrift). */
  impressum?: string;
  /** Warum der Empfaenger diese Mail bekommt. */
  grund?: string;
};

export function kundenMailLayout(
  firma: string,
  akzentfarbe: string | null | undefined,
  titel: string,
  inhalt: string,
  optionen?: KundenMailOptionen,
): string {
  const f = escapeHtml((firma || "").trim());
  const a = sichereFarbe(akzentfarbe);
  const t = escapeHtml((titel || "").trim());
  // Der Fuss kommt NUR bei Werbung — nicht unter eine Rechnung oder eine
  // Terminbestaetigung. Die Bausteine stehen in lib/werbemail.ts.
  const fuss = optionen?.werbung === true
    ? werbeFuss({
        firmaHtml: f,
        akzent: a,
        abmeldeLink: (optionen.abmeldeLink || "").trim(),
        impressumHtml: optionen.impressum ? escapeHtml(optionen.impressum) : undefined,
        grundHtml: optionen.grund ? escapeHtml(optionen.grund) : undefined,
      })
    : "";
  return `
  <div style="margin:0;padding:0;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="padding:24px 28px;border-bottom:3px solid ${a};">
          <div style="font-size:20px;font-weight:800;color:${a};">${f}</div>
        </div>
        <div style="padding:28px;color:#1a2332;font-size:15px;line-height:1.6;">
          ${t ? `<div style="font-size:18px;font-weight:700;margin:0 0 14px;color:#1a2332;">${t}</div>` : ""}
          ${inhalt}
        </div>
        <div style="padding:16px 28px;background:#fafbfc;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#8a94a6;">
          ${f}
        </div>${fuss}
      </div>
    </div>
  </div>`;
}
