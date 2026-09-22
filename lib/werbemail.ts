// ============================================================================
// ARGONAUT OS · lib/werbemail.ts — was an JEDE Werbe-Mail gehoert
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT (Punkt 68, 22.09.2026) ▄▄▄
// Am echten Code nachgesehen (22.09.):
//   - sendeMail() in lib/mail.ts hatte GAR KEINEN Kopfzeilen-Parameter. Es
//     ging also aus dem ganzen Haus keine einzige Mail mit List-Unsubscribe
//     raus — dem Abmeldeknopf, den Gmail und Outlook oben in der Mail anzeigen.
//   - newsletterMailHtml und autoresponderMailHtml haben SEHR WOHL schon einen
//     Abmelde-Fuss (§ 7 UWG). Die beiden brauchen also KEINEN zweiten.
//   - kundenMailLayout dagegen setzt im Fuss nur den Firmennamen. Ueber dieses
//     Layout laeuft die Post aus Automationen, Rueckholung und Lead-Nachfass —
//     dort fehlte der Fuss ganz.
// Diese Datei liefert die fehlenden Bausteine, an EINER Stelle.
//
// ▄▄▄ EINE GEFAHR, DIE HIER ABGEFANGEN WIRD ▄▄▄
// 'List-Unsubscribe-Post: List-Unsubscribe=One-Click' (RFC 8058) heisst dem
// Mailanbieter gegenueber: "Schick mir ein POST und der Empfaenger ist raus."
// Beantwortet die Abmelde-Adresse kein POST, meldet der Anbieter den
// Empfaenger fuer sich ab, ARGONAUT erfaehrt NICHTS davon und schickt weiter
// Werbung — genau der Fall, der eine Abmahnung nach sich zieht. Deshalb wird
// diese Kopfzeile nur auf ausdrueckliche Ansage gesetzt (einKlick: true), und
// nur fuer Adressen, die POST wirklich beantworten.
//
// ▄▄▄ KOPFZEILEN-EINSCHLEUSUNG ▄▄▄
// Ein Zeilenumbruch in einem Kopfzeilenwert haengt eine FREMDE Kopfzeile an
// die Mail. Deshalb wird jeder Wert geprueft, und was nicht sauber ist, fuehrt
// dazu, dass GAR KEINE Kopfzeile entsteht — nie eine halbe.
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln, node-getestet.
// ============================================================================

/** Nur http(s), keine Steuerzeichen, keine spitzen Klammern. */
export function abmeldeLinkGueltig(link: unknown): boolean {
  if (typeof link !== 'string') return false;
  const l = link.trim();
  if (!l || l.length > 998) return false;
  if (/[\r\n<>\s]/.test(l)) return false;
  return /^https?:\/\/[^\s]+$/i.test(l);
}

/** Eine Mailadresse fuer den mailto-Teil — schlicht und streng geprueft. */
export function abmeldeMailGueltig(mail: unknown): boolean {
  if (typeof mail !== 'string') return false;
  const m = mail.trim();
  if (!m || m.length > 254) return false;
  if (/[\r\n<>\s,;]/.test(m)) return false;
  return /^[^@]+@[^@.]+\.[^@]+$/.test(m);
}

export interface WerbeKopfzeilenOptionen {
  /** Zusaetzliche Abmeldung per Mail. */
  abmeldeMail?: string;
  /**
   * Nur true, wenn die Abmelde-Adresse ein POST wirklich beantwortet und den
   * Empfaenger dabei auch in ARGONAUT abmeldet. Im Zweifel weglassen.
   */
  einKlick?: boolean;
}

/**
 * Die Kopfzeilen fuer eine Werbe-Mail. Liefert ein LEERES Objekt, wenn der
 * Abmeldelink nicht taugt — lieber keine Kopfzeile als eine kaputte.
 */
export function werbeKopfzeilen(
  abmeldeLink: string,
  optionen: WerbeKopfzeilenOptionen = {},
): Record<string, string> {
  if (!abmeldeLinkGueltig(abmeldeLink)) return {};
  const teile = [`<${abmeldeLink.trim()}>`];
  if (optionen.abmeldeMail && abmeldeMailGueltig(optionen.abmeldeMail)) {
    teile.unshift(`<mailto:${optionen.abmeldeMail.trim()}?subject=unsubscribe>`);
  }
  const kopf: Record<string, string> = { 'List-Unsubscribe': teile.join(', ') };
  if (optionen.einKlick === true) {
    kopf['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  return kopf;
}

// ---------------------------------------------------------------------------
// Der Fuss
// ---------------------------------------------------------------------------

export interface WerbeFussDaten {
  /** Firmenname des Betriebs, schon HTML-entschaerft. */
  firmaHtml: string;
  /** Akzentfarbe, schon abgesichert. */
  akzent: string;
  /** Fertiger Abmelde-Link. */
  abmeldeLink: string;
  /** Impressum-Zeile des Betriebs (Anschrift), schon HTML-entschaerft. */
  impressumHtml?: string;
  /** Warum der Empfaenger diese Mail bekommt, schon HTML-entschaerft. */
  grundHtml?: string;
}

/**
 * PLATZHALTER-WORTLAUT (Stand 22.09.2026).
 * Der endgueltige Text — Impressum-Zeile, Abmeldelink, Widerspruchshinweis
 * nach § 7 Abs. 3 Nr. 4 UWG — kommt vom Anwalt (Punkt B5, Termin Anfang
 * Oktober). Die MECHANIK steht damit, nur die Saetze werden getauscht.
 */
export const FUSS_WIDERSPRUCH =
  'Sie können der Verwendung Ihrer E-Mail-Adresse für Werbung jederzeit widersprechen, '
  + 'ohne dass hierfür andere als die Übermittlungskosten nach den Basistarifen entstehen.';

export const FUSS_ABMELDE_TEXT = 'Keine weiteren E-Mails erhalten';

/** Baut den Werbe-Fuss. Ohne brauchbaren Abmeldelink entsteht KEIN Fuss. */
export function werbeFuss(d: WerbeFussDaten): string {
  if (!abmeldeLinkGueltig(d.abmeldeLink)) return '';
  const grund = d.grundHtml
    ? `${d.grundHtml}<br>`
    : `Sie erhalten diese E-Mail von ${d.firmaHtml}.<br>`;
  const impressum = d.impressumHtml ? `${d.impressumHtml}<br>` : '';
  return `
        <div style="padding:16px 28px;background:#fafbfc;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#8a94a6;">
          ${grund}${impressum}
          <a href="${d.abmeldeLink.trim()}" style="color:${d.akzent};text-decoration:underline;">${FUSS_ABMELDE_TEXT}</a>.<br>
          ${FUSS_WIDERSPRUCH}
        </div>`;
}

// ---------------------------------------------------------------------------
// Der Waechter
// ---------------------------------------------------------------------------

export interface WerbePruefung {
  ok: boolean;
  fehlt: string[];
}

/**
 * Prueft eine fertige Werbe-Mail, BEVOR sie rausgeht: Abmeldelink im Text,
 * List-Unsubscribe in den Kopfzeilen, Widerspruchshinweis im Fuss.
 *
 * ACHTUNG, was das hier NICHT ist: die Sperre "kein Impressum, keine
 * Werbemail". Die kann einen Betrieb aussperren, braucht eine benannte
 * Ausnahmeliste und die Freigabe des Anwalts (Punkt B6) — und wird eigens
 * geliefert. Diese Pruefung faengt Programmierfehler im eigenen Haus ab.
 */
export function werbeMailPruefen(
  html: string,
  kopfzeilen: Record<string, string> | undefined,
): WerbePruefung {
  const fehlt: string[] = [];
  const h = typeof html === 'string' ? html : '';
  if (!/href=["']https?:\/\//i.test(h) || !h.includes(FUSS_ABMELDE_TEXT)) {
    // Newsletter und Autoresponder tragen einen eigenen Abmeldetext — deshalb
    // gilt auch ein anderer Abmeldelink, sofern er erkennbar ist.
    if (!/abmelden|abbestellen|keine weiteren e-mails/i.test(h)) {
      fehlt.push('Abmeldelink im Text');
    }
  }
  if (!kopfzeilen || !kopfzeilen['List-Unsubscribe']) {
    fehlt.push('List-Unsubscribe-Kopfzeile');
  }
  if (!h.includes(FUSS_WIDERSPRUCH) && !/widersprechen/i.test(h)) {
    fehlt.push('Widerspruchshinweis');
  }
  return { ok: fehlt.length === 0, fehlt };
}
