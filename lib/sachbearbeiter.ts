// ============================================================================
// ARGONAUT OS · lib/sachbearbeiter.ts — der KI-Sachbearbeiter (Paket PA)
//
// B01 Posteingang: eine E-Mail erkennen, einen Vorgang vorschlagen, eine
//     Antwort vorformulieren.
// B07 Behoerdenbrief: Foto oder PDF eines Briefs in Klartext, Frist, Aufgabe.
// B15 Bewertungen: eine Antwort auf eine Kundenbewertung vorformulieren.
//
// Reine Logik: KEINE Netz-Aufrufe, KEINE Supabase-Aufrufe, KEINE Hooks.
// Node-getestet in tests/sachbearbeiterP70.test.mjs.
//
// ▄▄▄ WAS DIESE DATEI GARANTIERT ▄▄▄
// Die KI liefert Text. Was daraus im Betrieb wird (eine Aufgabe mit Datum, eine
// Frist, ein Betrag), entscheidet NICHT die KI, sondern diese Datei:
//   · Eine Art, die nicht im Katalog steht, wird zu "sonstiges" — nie zu einer
//     erfundenen Kategorie, an der kein Knopf haengt.
//   · Eine Frist wird nur uebernommen, wenn sie ein ECHTES Kalenderdatum ist.
//     "31.02.2026" oder "in vier Wochen" ergeben KEIN Datum, sondern einen
//     lauten Hinweis. Wie in lib/fristen.ts gilt: bei einer Frist ist "alles
//     gut" die gefaehrliche Richtung. Was nicht sicher lesbar ist, wird rot.
//   · Ein Betrag wird ueber lib/zahlen gelesen — "1.234,56" wird 1234.56,
//     "siehe Anlage" wird null und NIE still zu 0,00 Euro.
//   · Nichts wird automatisch verschickt. Jeder Antworttext ist ein ENTWURF,
//     den ein Mensch liest, aendert und selbst absendet.
//
// ▄▄▄ WAS DIESE DATEI BEWUSST NICHT TUT ▄▄▄
//   · Keine Rechtsberatung. Der Klartext zu einem Behoerdenbrief erklaert,
//     was im Brief steht — er sagt nicht, ob der Bescheid richtig ist oder ob
//     ein Einspruch Aussicht hat. Der Hinweis HINWEIS_KEINE_BERATUNG steht
//     deshalb unter JEDEM Behoerden-Ergebnis.
//   · Keine Bewertung von Bewerbern (Anwalt-Punkt R06, KI-Verordnung
//     Hochrisiko). Eine Bewerbung wird nur als solche ERKANNT und mit einer
//     neutralen Eingangsbestaetigung beantwortet — nie eingeschaetzt.
// ============================================================================

import { leseBetrag } from './zahlen';

// ---------------------------------------------------------------------------
// Katalog der Arten
// ---------------------------------------------------------------------------

/** Was aus einer erkannten Nachricht im Betrieb werden soll. */
export type Vorgang = 'anfrage' | 'aufgabe' | 'reklamation' | 'beleg' | 'termin' | 'keiner';

export type Art = {
  schluessel: string;
  label: string;
  icon: string;
  vorgang: Vorgang;
  /** Soll ueberhaupt ein Antwortentwurf entstehen? (Werbung: nein) */
  antworten: boolean;
  /** Worauf der Mensch achten soll — steht in der Oberflaeche unter dem Ergebnis. */
  tipp: string;
};

export const ARTEN: Art[] = [
  { schluessel: 'anfrage', label: 'Kundenanfrage', icon: '🙋', vorgang: 'anfrage', antworten: true,
    tipp: 'Als Anfrage übernehmen, dann steht sie in den Leads und geht nicht verloren.' },
  { schluessel: 'auftrag', label: 'Auftrag / Bestellung', icon: '📋', vorgang: 'aufgabe', antworten: true,
    tipp: 'Auftrag bestätigen und als Aufgabe einplanen.' },
  { schluessel: 'reklamation', label: 'Reklamation', icon: '⚠️', vorgang: 'reklamation', antworten: true,
    tipp: 'Schnell reagieren — eine Reklamation, die liegen bleibt, wird zur schlechten Bewertung.' },
  { schluessel: 'rechnung', label: 'Eingangsrechnung', icon: '🧾', vorgang: 'beleg', antworten: false,
    tipp: 'Den Anhang in die Beleg-Inbox geben — dort wird er gelesen und verbucht.' },
  { schluessel: 'mahnung', label: 'Mahnung / Zahlungserinnerung', icon: '⏰', vorgang: 'aufgabe', antworten: false,
    tipp: 'Prüfen, ob die Rechnung schon bezahlt ist, bevor Sie antworten.' },
  { schluessel: 'behoerde', label: 'Behörde / Amt', icon: '🏛', vorgang: 'aufgabe', antworten: false,
    tipp: 'Frist eintragen. Bei Bescheiden mit Geldforderung den Steuerberater einbinden.' },
  { schluessel: 'termin', label: 'Termin', icon: '🗓', vorgang: 'termin', antworten: true,
    tipp: 'Termin im Kalender eintragen oder verschieben.' },
  { schluessel: 'bewerbung', label: 'Bewerbung', icon: '🧑‍💼', vorgang: 'aufgabe', antworten: true,
    tipp: 'Nur Eingang bestätigen. Die Auswahl trifft ein Mensch — die KI bewertet keine Bewerber.' },
  { schluessel: 'lieferant', label: 'Lieferant / Info', icon: '🚚', vorgang: 'keiner', antworten: false,
    tipp: 'Zur Kenntnis nehmen — meist ist nichts zu tun.' },
  { schluessel: 'werbung', label: 'Werbung / Newsletter', icon: '📰', vorgang: 'keiner', antworten: false,
    tipp: 'Nichts zu tun. Nicht auf Links in unbekannter Werbung klicken.' },
  { schluessel: 'sonstiges', label: 'Sonstiges', icon: '📄', vorgang: 'aufgabe', antworten: true,
    tipp: 'Selbst entscheiden, was damit geschieht.' },
];

const ART_NACH_SCHLUESSEL: Record<string, Art> = Object.fromEntries(ARTEN.map((a) => [a.schluessel, a]));

/** Art sicher nachschlagen. Unbekannt -> "sonstiges", nie undefined. */
export function artFuer(schluessel: unknown): Art {
  const s = String(schluessel ?? '').trim().toLowerCase();
  return ART_NACH_SCHLUESSEL[s] ?? ART_NACH_SCHLUESSEL['sonstiges'];
}

export const HINWEIS_KEINE_BERATUNG =
  'ARGONAUT erklärt, was im Schreiben steht. Das ist keine Rechts- oder Steuerberatung. ' +
  'Ob ein Bescheid richtig ist oder ein Widerspruch Aussicht hat, klären Sie bitte mit Ihrem Steuerberater oder Anwalt.';

// ---------------------------------------------------------------------------
// Datum und Frist
// ---------------------------------------------------------------------------

function zweistellig(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Ein echtes Kalenderdatum? (fängt 31.02. und 30.13. ab) */
function echtesDatum(j: number, m: number, t: number): boolean {
  if (!Number.isInteger(j) || !Number.isInteger(m) || !Number.isInteger(t)) return false;
  if (j < 2000 || j > 2100 || m < 1 || m > 12 || t < 1) return false;
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

/**
 * Liest ein Datum als "YYYY-MM-DD". Erlaubt: 2026-10-15, 15.10.2026, 15.10.26,
 * 5.1.2027. Alles andere -> null. Zweistellige Jahre gelten als 20xx — eine
 * Frist liegt nie im letzten Jahrhundert.
 */
export function leseDatum(wert: unknown): string | null {
  const s = String(wert ?? '').trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const j = +m[1], mo = +m[2], t = +m[3];
    return echtesDatum(j, mo, t) ? `${j}-${zweistellig(mo)}-${zweistellig(t)}` : null;
  }
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/);
  if (m) {
    const t = +m[1], mo = +m[2];
    const j = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return echtesDatum(j, mo, t) ? `${j}-${zweistellig(mo)}-${zweistellig(t)}` : null;
  }
  return null;
}

/** Heute als YYYY-MM-DD in deutscher Zeit (nicht UTC — sonst ist um 23 Uhr schon morgen). */
export function heuteIso(jetzt: Date): string {
  const teile = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(jetzt);
  const w = (typ: string) => teile.find((p) => p.type === typ)?.value ?? '';
  return `${w('year')}-${w('month')}-${w('day')}`;
}

/** Tage von a bis b (beide YYYY-MM-DD). Positiv = b liegt in der Zukunft. */
export function tageZwischen(a: string, b: string): number {
  const [ja, ma, ta] = a.split('-').map(Number);
  const [jb, mb, tb] = b.split('-').map(Number);
  return Math.round((Date.UTC(jb, mb - 1, tb) - Date.UTC(ja, ma - 1, ta)) / 86_400_000);
}

/** Datum um n Tage verschieben (YYYY-MM-DD). */
export function plusTage(iso: string, n: number): string {
  const [j, m, t] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(j, m - 1, t + n));
  return `${d.getUTCFullYear()}-${zweistellig(d.getUTCMonth() + 1)}-${zweistellig(d.getUTCDate())}`;
}

export type Dringlichkeit = 'hoch' | 'mittel' | 'normal';

// ---------------------------------------------------------------------------
// Die Antwort der KI lesen
// ---------------------------------------------------------------------------

/**
 * Das erste JSON-Objekt aus einer KI-Antwort holen. Kommt mit ```json-Zaeunen,
 * Vorrede und Nachklapp zurecht. Kein lesbares Objekt -> null.
 */
export function leseKiJson(roh: unknown): Record<string, unknown> | null {
  const s = String(roh ?? '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  // Von hinten nach der passenden schliessenden Klammer suchen, damit ein
  // "}" im Nachklapp nicht stoert.
  for (let ende = s.lastIndexOf('}'); ende > start; ende = s.lastIndexOf('}', ende - 1)) {
    try {
      const o = JSON.parse(s.slice(start, ende + 1));
      if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>;
    } catch { /* weiter kuerzen */ }
  }
  return null;
}

function text(v: unknown, max = 2000): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\r\n/g, '\n').trim().slice(0, max);
}

function textOderNull(v: unknown, max = 300): string | null {
  const t = text(v, max);
  if (!t || /^(null|none|keine?|unbekannt|—|-)$/i.test(t)) return null;
  return t;
}

/**
 * Markdown-Reste und Meta-Saetze aus einem Antwortentwurf entfernen.
 * Der Entwurf geht als normale E-Mail oder als Bewertungsantwort hinaus.
 */
export function saubererEntwurf(roh: unknown): string {
  let s = text(roh, 6000);
  s = s.replace(/^```[a-z]*\n?|```$/gim, '');
  s = s.replace(/^\s*(hier ist|gerne|entwurf)[^\n]*:\s*\n/i, '');
  s = s.replace(/^\s*betreff:[^\n]*\n+/i, '');
  s = s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,6}\s+/gm, '');
  return s.trim();
}

export type Ergebnis = {
  art: Art;
  zusammenfassung: string;
  wasTun: string;
  /** Sicher gelesenes Datum oder null */
  frist: string | null;
  /** Wie die Frist im Schreiben steht, auch wenn kein Datum daraus wurde */
  fristText: string | null;
  betrag: number | null;
  aktenzeichen: string | null;
  absender: string | null;
  dringlichkeit: Dringlichkeit;
  antwortEntwurf: string;
  hinweise: string[];
};

/**
 * Aus der KI-Antwort ein geprueftes Ergebnis machen.
 * @param quelle 'mail' | 'brief' — ein Brief bekommt nie einen Antwortentwurf
 *               von hier (Behoerden schreibt man nicht per Schnellantwort).
 */
export function leseErgebnis(roh: unknown, jetzt: Date, quelle: 'mail' | 'brief' = 'mail'): Ergebnis {
  const o = leseKiJson(roh);
  const hinweise: string[] = [];

  if (!o) {
    return {
      art: artFuer('sonstiges'),
      zusammenfassung: 'Die Antwort der KI war nicht lesbar. Bitte das Schreiben selbst prüfen.',
      wasTun: '',
      frist: null, fristText: null, betrag: null, aktenzeichen: null, absender: null,
      dringlichkeit: 'mittel',
      antwortEntwurf: '',
      hinweise: ['Die Auswertung ist fehlgeschlagen — es wurde nichts übernommen.'],
    };
  }

  const art = artFuer(o.art);
  const heute = heuteIso(jetzt);

  // --- Frist: nur ein ECHTES Datum wird uebernommen --------------------------
  const fristText = textOderNull(o.frist_text ?? o.frist, 200);
  const frist = leseDatum(o.frist);
  if (fristText && !frist) {
    hinweise.push(`Frist nicht als Datum lesbar („${fristText}") — bitte im Original nachsehen und selbst eintragen.`);
  }
  if (frist && frist < heute) {
    hinweise.push(`Die Frist (${datumDeutsch(frist)}) liegt bereits in der Vergangenheit — bitte sofort prüfen.`);
  }

  // --- Betrag: ueber lib/zahlen, nie still 0 --------------------------------
  let betrag: number | null = null;
  if (o.betrag !== null && o.betrag !== undefined && String(o.betrag).trim() !== '') {
    betrag = typeof o.betrag === 'number' && Number.isFinite(o.betrag)
      ? Math.round(o.betrag * 100) / 100
      : leseBetrag(String(o.betrag).replace(/€|eur(o)?/gi, '').trim());
    if (betrag === null) hinweise.push(`Betrag nicht sicher lesbar („${text(o.betrag, 60)}") — bitte im Original nachsehen.`);
  }

  // --- Dringlichkeit: aus der Frist gerechnet, nicht von der KI geglaubt -----
  let dringlichkeit: Dringlichkeit = 'normal';
  if (frist) {
    const rest = tageZwischen(heute, frist);
    if (rest <= 7) dringlichkeit = 'hoch';
    else if (rest <= 21) dringlichkeit = 'mittel';
  } else if (fristText) {
    dringlichkeit = 'hoch'; // Frist genannt, aber unlesbar -> lieber laut
  }
  if (art.schluessel === 'reklamation' || art.schluessel === 'mahnung') {
    if (dringlichkeit === 'normal') dringlichkeit = 'mittel';
  }

  // --- Antwortentwurf -------------------------------------------------------
  let antwortEntwurf = '';
  if (quelle === 'mail' && art.antworten) {
    antwortEntwurf = saubererEntwurf(o.antwort);
    if (/\b(claude|chatgpt|k\.?\s?i\.?-?(assistent|modell)|als (ki|künstliche intelligenz))\b/i.test(antwortEntwurf)) {
      hinweise.push('Der Entwurf erwähnt eine KI — bitte vor dem Versand umformulieren.');
    }
  }

  if (art.schluessel === 'behoerde' || quelle === 'brief') hinweise.push(HINWEIS_KEINE_BERATUNG);
  if (art.schluessel === 'bewerbung') {
    hinweise.push('Bewerbungen enthalten besonders schützenswerte Daten. Nur an die Person weitergeben, die die Auswahl trifft.');
  }

  return {
    art,
    zusammenfassung: text(o.zusammenfassung, 1200) || '—',
    wasTun: text(o.was_tun, 800),
    frist,
    fristText,
    betrag,
    aktenzeichen: textOderNull(o.aktenzeichen, 120),
    absender: textOderNull(o.absender, 200),
    dringlichkeit,
    antwortEntwurf,
    hinweise,
  };
}

export function datumDeutsch(iso: string | null): string {
  if (!iso) return '—';
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

// ---------------------------------------------------------------------------
// Aufgabe und Vorgang aus dem Ergebnis
// ---------------------------------------------------------------------------

/** Wie viele Tage VOR der Frist die Aufgabe faellig wird. */
export const VORLAUF_TAGE = 3;

export type AufgabeVorschlag = {
  titel: string;
  beschreibung: string;
  faellig_am: string | null;
  prioritaet: 'hoch' | 'normal';
};

/**
 * Eine Aufgabe fuer /api/cockpit-action (Typ aufgabe_anlegen). Faellig
 * VORLAUF_TAGE vor der Frist, aber nie vor heute — eine Aufgabe, die schon
 * beim Anlegen ueberfaellig ist, geht in der Liste unter.
 */
export function aufgabeAus(e: Ergebnis, betreff: string, jetzt: Date): AufgabeVorschlag {
  const heute = heuteIso(jetzt);
  let faellig: string | null = null;
  if (e.frist) {
    const vor = plusTage(e.frist, -VORLAUF_TAGE);
    faellig = vor < heute ? heute : vor;
  }
  const kopf = (betreff || e.zusammenfassung).replace(/\s+/g, ' ').trim().slice(0, 80);
  const zeilen = [
    e.zusammenfassung,
    e.wasTun ? `Zu tun: ${e.wasTun}` : '',
    e.absender ? `Absender: ${e.absender}` : '',
    e.aktenzeichen ? `Aktenzeichen: ${e.aktenzeichen}` : '',
    e.frist ? `Frist: ${datumDeutsch(e.frist)}` : (e.fristText ? `Frist laut Schreiben: ${e.fristText} (nicht als Datum lesbar)` : ''),
    e.betrag !== null ? `Betrag: ${e.betrag.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR` : '',
  ].filter(Boolean);
  return {
    titel: `${e.art.label}: ${kopf}`.slice(0, 120),
    beschreibung: zeilen.join('\n'),
    faellig_am: faellig,
    prioritaet: e.dringlichkeit === 'hoch' ? 'hoch' : 'normal',
  };
}

/** Zeile fuer die Tabelle post_vorgang (ohne owner_user_id — setzt der Aufrufer). */
export function vorgangZeile(
  e: Ergebnis,
  quelle: 'mail' | 'brief',
  betreff: string,
  herkunft: { mailUid?: number | null; mailOrdner?: string | null } = {},
) {
  return {
    quelle,
    art: e.art.schluessel,
    betreff: (betreff || '').slice(0, 300) || null,
    absender: e.absender,
    zusammenfassung: e.zusammenfassung,
    was_tun: e.wasTun || null,
    frist: e.frist,
    frist_text: e.fristText,
    betrag: e.betrag,
    aktenzeichen: e.aktenzeichen,
    dringlichkeit: e.dringlichkeit,
    status: 'offen',
    mail_uid: herkunft.mailUid ?? null,
    mail_ordner: herkunft.mailOrdner ?? null,
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const ART_LISTE = ARTEN.map((a) => `${a.schluessel} (${a.label})`).join(', ');

export function systemPost(quelle: 'mail' | 'brief', firma: string): string {
  const wer = firma ? `des Betriebs „${firma}"` : 'eines deutschen Handwerks- oder Dienstleistungsbetriebs';
  return `Sie sind der Sachbearbeiter im Büro ${wer}. Sie lesen eingehende ${quelle === 'brief' ? 'Briefe (oft von Behörden, Ämtern, Finanzamt, Berufsgenossenschaft, Krankenkasse, Gericht)' : 'E-Mails'} und bereiten sie so auf, dass der Inhaber in zehn Sekunden weiß, worum es geht und was zu tun ist.

Antworten Sie AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Erklärung davor oder danach:
{"art": string, "absender": string|null, "zusammenfassung": string, "was_tun": string, "frist": "YYYY-MM-DD"|null, "frist_text": string|null, "betrag": number|null, "aktenzeichen": string|null, "antwort": string}

Regeln:
- art ist GENAU einer dieser Schlüssel: ${ART_LISTE}.
- zusammenfassung: zwei bis vier kurze Sätze in einfachem Deutsch, ohne Fachchinesisch. Amtsdeutsch in Alltagssprache übersetzen.
- was_tun: ein bis drei konkrete Schritte im Imperativ. Wenn nichts zu tun ist: "Nichts zu tun."
- frist: NUR ein ausdrücklich im Schreiben genanntes Datum, im Format YYYY-MM-DD. Ist die Frist relativ angegeben ("innerhalb eines Monats nach Bekanntgabe", "binnen 14 Tagen"), dann frist = null und frist_text = der Wortlaut aus dem Schreiben. Niemals ein Datum selbst ausrechnen oder raten.
- betrag: die geforderte oder genannte Hauptsumme in Euro als Zahl mit Punkt (z. B. 1234.56), sonst null.
- aktenzeichen: Aktenzeichen, Steuernummer-Bezug, Kassenzeichen, Rechnungs- oder Vorgangsnummer, sonst null.
- antwort: ${quelle === 'brief' ? 'immer ein leerer String.' : 'ein höflicher Antwort-ENTWURF in der Sie-Form, den ein Mensch noch prüft. Mit Anrede und Grußformel, Platzhalter in eckigen Klammern für Unbekanntes ([Termin], [Ihr Name]). Keine erfundenen Zusagen, Preise oder Termine. Bei Werbung, Rechnungen, Mahnungen und Lieferanten-Infos ein leerer String. Bei einer Bewerbung NUR eine neutrale Eingangsbestätigung, niemals eine Einschätzung der Person.'}
- Erwähnen Sie niemals, dass Sie eine KI sind, und nennen Sie keinen Modellnamen.
- Geben Sie keine Rechtsberatung und keine Einschätzung, ob ein Bescheid richtig ist.`;
}

/** Maximal so viele Zeichen Mailtext gehen an die KI (Kosten und Laenge). */
export const MAX_MAILTEXT = 12_000;

export function nutzerTextMail(m: { betreff?: unknown; von?: unknown; datum?: unknown; text?: unknown }): string {
  const t = text(m.text, MAX_MAILTEXT + 1);
  const gekuerzt = t.length > MAX_MAILTEXT;
  const zeilen = [
    `Betreff: ${text(m.betreff, 300) || '(kein Betreff)'}`,
    `Von: ${text(m.von, 300) || 'unbekannt'}`,
  ];
  if (m.datum) zeilen.push(`Datum: ${text(m.datum, 60)}`);
  zeilen.push('', t.slice(0, MAX_MAILTEXT) || '(kein Text)');
  if (gekuerzt) zeilen.push('', '[Nachricht gekürzt]');
  return zeilen.join('\n');
}

// ---------------------------------------------------------------------------
// B15 · Bewertungs-Antworten
// ---------------------------------------------------------------------------

export function systemBewertung(firma: string): string {
  return `Sie schreiben im Namen des Betriebs${firma ? ` „${firma}"` : ''} eine öffentliche Antwort auf eine Kundenbewertung.

Regeln:
- Sie-Form, freundlich, kurz: höchstens fünf Sätze.
- Bedanken Sie sich immer für die Bewertung.
- Bei Kritik: nicht rechtfertigen, nicht streiten, nichts abstreiten. Verständnis zeigen und ein direktes Gespräch anbieten ("Bitte melden Sie sich direkt bei uns, damit wir das klären können.").
- Wiederholen Sie KEINE Details aus dem Auftrag, keine Adressen, keine Preise, keine Gesundheits- oder sonstigen persönlichen Angaben — die Antwort ist öffentlich lesbar.
- Nennen Sie den Kunden höchstens beim Vornamen, und nur, wenn er in der Bewertung steht.
- Keine erfundenen Zusagen (keine Rabatte, keine Gutschriften).
- Kein Markdown, keine Emojis, keine Hashtags.
- Erwähnen Sie niemals, dass der Text von einer KI stammt.
- Geben Sie NUR den Antworttext aus, ohne Vorrede.`;
}

export function nutzerTextBewertung(b: { sterne?: unknown; text?: unknown; plattform?: unknown }): string {
  const s = Math.round(Number(b.sterne));
  const sterne = Number.isFinite(s) && s >= 1 && s <= 5 ? s : null;
  return [
    b.plattform ? `Plattform: ${text(b.plattform, 60)}` : '',
    sterne ? `Sterne: ${sterne} von 5` : 'Sterne: unbekannt',
    `Bewertungstext: ${text(b.text, 3000) || '(ohne Text — nur Sterne)'}`,
  ].filter(Boolean).join('\n');
}

/** Pruefung eines Bewertungs-Entwurfs vor der Anzeige. */
export function pruefeBewertungsAntwort(roh: unknown): { text: string; hinweise: string[] } {
  const t = saubererEntwurf(roh);
  const hinweise: string[] = [];
  if (!t) hinweise.push('Es kam kein Text zurück — bitte erneut versuchen.');
  if (t.length > 900) hinweise.push('Die Antwort ist lang. Kürzer wirkt auf Bewertungsportalen besser.');
  if (/\d\s?(€|euro?\b)/i.test(t)) {
    hinweise.push('Die Antwort nennt einen Betrag — öffentliche Antworten sollten keine Preise enthalten.');
  }
  if (/@|\d[\d /-]{5,}\d/.test(t)) {
    hinweise.push('Die Antwort enthält eine Adresse oder Nummer — bitte prüfen, ob das öffentlich stehen darf.');
  }
  if (/\b(claude|chatgpt|künstliche intelligenz)\b/i.test(t)) {
    hinweise.push('Der Entwurf erwähnt eine KI — bitte umformulieren.');
  }
  return { text: t, hinweise };
}
