// ============================================================================
// ARGONAUT OS · lib/rechtsTexte.ts — Paket 347 (13.10.2026)
// A1 Vorlagen-Prinzip Teil 1: „Meine Rechtstexte"
//
// Martins Beschluss (Ampel-Beschluss 12.10.2026): ARGONAUT ist das Werkzeug,
// der Betrieb verantwortet sein Branchenrecht. Verträge, Bedingungen,
// Einwilligungen und Haftungsverzichte hinterlegt der Betrieb SELBST. Wo
// ARGONAUT etwas anbietet, ist es ein leeres GERÜST (nur Überschriften und
// „[Ihr Text]"), kein Wortlaut — mit dem Hinweis „durch Ihren Anwalt prüfen
// lassen". Muster: Vermietung (P291), Bußgeld (P293), Trackday (P296).
//
// Hier: Katalog aller Rechtstexte, Gerüste, Platzhalter, Prüfung, Füllen.
// Keine Hooks, kein Supabase — node-testbar (tests/rechtstexteP347).
// Datenbank: supabase-sql/p347-rechtstexte.sql (rechtstext, rechtstext_fassung).
// ============================================================================

export const HINWEIS_ANWALT =
  'ARGONAUT liefert hierfür bewusst keinen Mustertext. Bitte hinterlegen Sie Ihren eigenen, von Ihrem Anwalt geprüften Text.';

export const TEXT_MIN = 50;
export const TEXT_MAX = 30000;
export const VERMERK_MAX = 300;
/** Markierung im Gerüst — solange sie im Text steht, ist er nicht fertig. */
export const LUECKE = '[Ihr Text]';

export type Platzhalter = { key: string; label: string };

export type RechtsTextEintrag = {
  /** Schlüssel in der Datenbank (bleibt fest): bereich.name */
  schluessel: string;
  titel: string;
  /** Gruppe auf der Seite „Meine Rechtstexte". */
  bereich: string;
  /** Wofür und wo der Text erscheint (für Laien). */
  wofuer: string;
  /** Wo in ARGONAUT er verwendet wird (Menüpfad). */
  wo: string;
  /** Wer ihn bekommt bzw. unterschreibt. */
  empfaenger: string;
  /** Überschriften des leeren Gerüsts. */
  gliederung: string[];
  /** Erlaubte Platzhalter {{key}} — werden beim Erstellen des Dokuments gefüllt. */
  platzhalter: Platzhalter[];
  /** Ist das Dokument schon an „Meine Rechtstexte" angebunden? Sonst: in Kürze. */
  angebunden: boolean;
};

const BETRIEB: Platzhalter = { key: 'betrieb', label: 'Name Ihres Betriebs' };
const KUNDE: Platzhalter = { key: 'kunde', label: 'Name des Kunden' };
const DATUM: Platzhalter = { key: 'datum', label: 'Datum des Dokuments' };

/** Der Katalog. Schlüssel nie umbenennen — sie stehen in der Datenbank. */
export const RECHTS_TEXTE: readonly RechtsTextEintrag[] = Object.freeze([
  {
    schluessel: 'verwahrung.bedingungen', titel: 'Bedingungen der Einlagerung (Verwahrung)', bereich: 'Werkstatt und Einlagerung',
    wofuer: 'Steht im Verwahrprotokoll, z. B. beim Reifenhotel: Laufzeit, Obhut, Vergütung, was bei Nichtabholung geschieht.',
    wo: 'Reservierung & Platz → Einlagerung → „📄 Protokoll"',empfaenger: 'Ihr Kunde (unterschreibt das Protokoll)',
    gliederung: ['Laufzeit und Abholung', 'Obhut und Haftung', 'Vergütung', 'Vorgehen bei Nichtabholung', 'Versicherung'],
    platzhalter: [BETRIEB, KUNDE, DATUM], angebunden: true,
  },
  {
    schluessel: 'kfz.kaufvertrag', titel: 'Kaufvertrag gebrauchtes Fahrzeug', bereich: 'Fahrzeughandel',
    wofuer: 'Vertragsbedingungen im Kaufvertrag: Eigentumsvorbehalt, Sachmängel, Verjährung, Übergabe.',
    wo: 'Fahrzeughandel → Fahrzeug → Verkauf', empfaenger: 'Käufer (unterschreibt)',
    gliederung: ['Eigentumsvorbehalt', 'Sachmängelhaftung und Verjährung', 'Übergabe und Gefahrübergang', 'Zahlung', 'Sonstiges'],
    platzhalter: [BETRIEB, KUNDE, DATUM], angebunden: false,
  },
  {
    schluessel: 'kfz.reservierung', titel: 'Reservierung eines Fahrzeugs', bereich: 'Fahrzeughandel',
    wofuer: 'Bedingungen einer Reservierung: Dauer, Anzahlung, was bei Rücktritt gilt.',
    wo: 'Fahrzeughandel → Fahrzeug → Verkauf → Reservierung', empfaenger: 'Interessent (unterschreibt)',
    gliederung: ['Dauer der Reservierung', 'Anzahlung', 'Rücktritt'],
    platzhalter: [BETRIEB, KUNDE, DATUM], angebunden: false,
  },
  {
    schluessel: 'kfz.zulassungsvollmacht', titel: 'Zulassungsvollmacht', bereich: 'Fahrzeughandel',
    wofuer: 'Vollmacht, mit der Ihr Betrieb das Fahrzeug für den Käufer zulässt.',
    wo: 'Fahrzeughandel → Fahrzeug → Verkauf → Zulassungsvollmacht', empfaenger: 'Käufer (unterschreibt), Zulassungsstelle',
    gliederung: ['Umfang der Vollmacht', 'Unterlagen', 'Dauer'],
    platzhalter: [BETRIEB, KUNDE, DATUM], angebunden: false,
  },
  {
    schluessel: 'kfz.probefahrt', titel: 'Probefahrt, Vorführwagen, Ersatzwagen', bereich: 'Fahrzeughandel',
    wofuer: 'Vereinbarung für die Fahrt mit einem Fahrzeug des Betriebs: Haftung, Selbstbeteiligung, Bußgelder, Rückgabe.',
    wo: 'Fahrzeughandel → Probefahrt', empfaenger: 'Fahrer (unterschreibt)',
    gliederung: ['Haftung und Selbstbeteiligung', 'Bußgelder und Verstöße', 'Rückgabe', 'Führerschein'],
    platzhalter: [BETRIEB, KUNDE, DATUM], angebunden: false,
  },
  {
    schluessel: 'kfz.ankauf', titel: 'Ankauf eines Fahrzeugs', bereich: 'Fahrzeughandel',
    wofuer: 'Erklärungen des Verkäufers beim Ankauf: Eigentum, bekannte Mängel, Übergabe.',
    wo: 'Fahrzeughandel → Ankauf → Ankaufschein', empfaenger: 'Verkäufer (unterschreibt)',
    gliederung: ['Eigentum und Lastenfreiheit', 'Bekannte Mängel und Unfälle', 'Übergabe und Zahlung'],
    platzhalter: [BETRIEB, KUNDE, DATUM], angebunden: false,
  },
  {
    schluessel: 'kfz.werkstattauftrag', titel: 'Bedingungen des Werkstattauftrags', bereich: 'Werkstatt und Einlagerung',
    wofuer: 'Steht auf dem Werkstattauftrag: Zustand bei Annahme, Kostenrahmen, Probefahrt durch die Werkstatt, Abholung.',
    wo: 'Werkstatt → Auftrag → PDF', empfaenger: 'Ihr Kunde (unterschreibt)',
    gliederung: ['Zustand bei Annahme', 'Kostenrahmen und Zusatzarbeiten', 'Probefahrt durch die Werkstatt', 'Abholung'],
    platzhalter: [BETRIEB, KUNDE, DATUM], angebunden: false,
  },
]);

export function eintragFuer(schluessel: string): RechtsTextEintrag | null {
  return RECHTS_TEXTE.find((e) => e.schluessel === schluessel) ?? null;
}

/** Das leere Gerüst: Überschriften, darunter „[Ihr Text]". Kein Wortlaut. */
export function geruest(e: RechtsTextEintrag): string {
  return e.gliederung.map((g, i) => `${i + 1}. ${g}\n${LUECKE}`).join('\n\n');
}

/** Bereiche in Katalog-Reihenfolge, je mit ihren Einträgen. */
export function nachBereich(liste: readonly RechtsTextEintrag[] = RECHTS_TEXTE): { bereich: string; eintraege: RechtsTextEintrag[] }[] {
  const raus: { bereich: string; eintraege: RechtsTextEintrag[] }[] = [];
  for (const e of liste) {
    const b = raus.find((x) => x.bereich === e.bereich);
    if (b) b.eintraege.push(e); else raus.push({ bereich: e.bereich, eintraege: [e] });
  }
  return raus;
}

/** Platzhalter {{…}} im Text (ohne Doppelte, in Reihenfolge). */
export function platzhalterImText(text: string): string[] {
  const raus: string[] = [];
  for (const m of text.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) if (!raus.includes(m[1])) raus.push(m[1]);
  return raus;
}

/** Prüfung vor dem Speichern — dieselben Grenzen wie die Datenbank. Leer = in Ordnung. */
export function textPruefen(e: RechtsTextEintrag, text: string, vermerk: string = ''): string[] {
  const f: string[] = [];
  const t = text.trim();
  if (t.length < TEXT_MIN) f.push(`Bitte mindestens ${TEXT_MIN} Zeichen eintragen.`);
  if (t.length > TEXT_MAX) f.push('Der Text ist zu lang (höchstens 30.000 Zeichen).');
  if (t.includes(LUECKE)) f.push(`Im Text steht noch „${LUECKE}" — bitte jede Lücke mit Ihrem eigenen Text füllen oder den Abschnitt löschen.`);
  const erlaubt = new Set(e.platzhalter.map((p) => p.key));
  const fremd = platzhalterImText(t).filter((p) => !erlaubt.has(p));
  if (fremd.length) f.push(`Unbekannte Platzhalter: ${fremd.map((p) => `{{${p}}}`).join(', ')}. Erlaubt sind: ${e.platzhalter.map((p) => `{{${p.key}}}`).join(', ') || 'keine'}.`);
  if (vermerk.trim().length > VERMERK_MAX) f.push('Der Prüf-Vermerk ist zu lang (höchstens 300 Zeichen).');
  return f;
}

/**
 * Text für das Dokument: Platzhalter füllen. Fehlt ein Wert, bleibt eine
 * sichtbare Lücke „[…]" stehen — nie ein stilles Weglassen.
 */
export function textFuellen(text: string, werte: Readonly<Record<string, string | null | undefined>>): string {
  return text.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (_m, k: string) => {
    const v = werte[k];
    return typeof v === 'string' && v.trim() ? v.trim() : `[${k}]`;
  });
}

export type GespeicherterText = { text: string; fassung: number; geaendert_am: string | null; geprueft_vermerk?: string | null };

export type DokumentText =
  | { eigen: true; text: string; fassung: number; stand: string }
  | { eigen: false; hinweis: string };

/** Was ins Dokument kommt: der eigene Text des Betriebs — oder ein klarer Hinweis, dass keiner hinterlegt ist. */
export function dokumentText(e: RechtsTextEintrag, gespeichert: GespeicherterText | null | undefined, werte: Readonly<Record<string, string | null | undefined>> = {}): DokumentText {
  const t = (gespeichert?.text ?? '').trim();
  if (!gespeichert || t.length < TEXT_MIN || t.includes(LUECKE)) {
    return { eigen: false, hinweis: `Für „${e.titel}" ist kein eigener Text des Betriebs hinterlegt.` };
  }
  return { eigen: true, text: textFuellen(t, werte), fassung: gespeichert.fassung, stand: standText(gespeichert) };
}

/** „Fassung 3 vom 13.10.2026" (Berliner Datum). */
export function standText(g: { fassung: number; geaendert_am: string | null }): string {
  const d = g.geaendert_am ? new Date(g.geaendert_am) : null;
  const tag = d && !Number.isNaN(d.getTime())
    ? new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
    : null;
  return `Fassung ${g.fassung}${tag ? ` vom ${tag}` : ''}`;
}

/** Übersicht für die Seite: wie viele hinterlegt, wie viele angebunden fehlen noch. */
export function uebersicht(gespeichert: readonly { schluessel: string }[], liste: readonly RechtsTextEintrag[] = RECHTS_TEXTE): { gesamt: number; hinterlegt: number; fehlenAngebunden: number } {
  const da = new Set(gespeichert.map((g) => g.schluessel));
  return {
    gesamt: liste.length,
    hinterlegt: liste.filter((e) => da.has(e.schluessel)).length,
    fehlenAngebunden: liste.filter((e) => e.angebunden && !da.has(e.schluessel)).length,
  };
}
