// ============================================================================
// ARGONAUT OS · lib/ablauf.ts — Ablauf-Baukasten, der Kern (Paket 156, 28.09.2026)
//
// Martins Beschluss (27.09.2026): Aus den Automationen werden „Abläufe" —
// Auslöser, beliebig viele Schritte, UND/ODER-Bedingungen, Wenn/Sonst, Warten,
// Aktionen, Platzhalter {{…}}, Probelauf, Protokoll je Schritt, Versionen.
// Schutzgeländer bleiben: Deckel, Werbe-Einwilligung, Geld-Aktionen nur mit
// Freigabe durch den Chef. Bestehende Regeln werden übernommen.
//
// Diese Datei ist der Kern OHNE Datenbank und OHNE Oberfläche:
//   · Typen (Auslöser, Schritte, Bedingungsgruppen)
//   · Kataloge (Auslöser-Arten, Ereignisse, Aktionen mit Schutz-Kennzeichen)
//   · Prüfen einer Bedingungsgruppe, Platzhalter mit Punkt-Pfad
//   · Prüfen eines ganzen Ablaufs (Fehler/Hinweise, bevor er aktiv wird)
//   · Der Fahrplan: welcher Schritt als Nächstes, wo gewartet wird
//   · Übernahme einer alten Automations-Regel
// Motor, Oberfläche und Ereignis-Auslöser folgen in eigenen Paketen.
// Rein, node-getestet.
// ============================================================================

import {
  pruefeBedingung, triggerDef, istWerbung, aktionDef, alsDatum, datumDeutsch, euro,
  type Bedingung, type Datensatz, type AutomationRegel, type AktionsFeld,
} from './automation';
import { pruefeWebhookUrl, gesperrtesFeld, felderListe } from './ablaufWebhookPruefung';

// ---------------------------------------------------------------------------
// 1) Typen
// ---------------------------------------------------------------------------

export type BedingungsGruppe = {
  verknuepfung: 'und' | 'oder';
  regeln: Array<Bedingung | BedingungsGruppe>;
};

export type Ausloeser =
  /** Zu festen Zeiten (der Motor läuft stündlich, führt aber nur zur Zeit aus). */
  | { art: 'zeitplan'; rhythmus: 'taeglich' | 'woechentlich' | 'monatlich'; uhrzeit?: string; wochentag?: number; tag?: number }
  /** Datum erreicht: die bisherigen Automations-Auslöser (Rechnung überfällig …) + Tage. */
  | { art: 'datum'; trigger: string; tage: number; filter?: BedingungsGruppe | null }
  /** Sofort, wenn in einem Modul etwas passiert (Rechnung angelegt …). */
  | { art: 'ereignis'; ereignis: string; filter?: BedingungsGruppe | null }
  /** Von außen (n8n, Formular, anderes Programm) — mit geheimem Schlüssel. */
  | { art: 'webhook' }
  /** Per Knopf in einem Modul. Paket 192: mitarbeiter = auch Mitarbeiter mit Schreibrecht dürfen drücken. */
  | { art: 'knopf'; modul?: string; mitarbeiter?: boolean };

export type SchrittAktion = { id: string; typ: 'aktion'; aktion: string; config: Record<string, unknown> };
export type SchrittWarten = { id: string; typ: 'warten'; tage?: number; stunden?: number };
export type SchrittWenn = { id: string; typ: 'wenn'; bedingung: BedingungsGruppe; dann: Schritt[]; sonst: Schritt[] };
export type SchrittStopp = { id: string; typ: 'stopp' };
export type Schritt = SchrittAktion | SchrittWarten | SchrittWenn | SchrittStopp;

export type Ablauf = {
  id?: string;
  name: string;
  beschreibung?: string | null;
  ausloeser: Ausloeser;
  schritte: Schritt[];
  aktiv?: boolean;
  version?: number;
};

// ---------------------------------------------------------------------------
// 2) Kataloge
// ---------------------------------------------------------------------------

export const AUSLOESER_ARTEN: { art: Ausloeser['art']; label: string; hinweis: string; imMotor: boolean }[] = [
  { art: 'datum', label: 'Datum erreicht', hinweis: 'Z. B. „Rechnung seit 14 Tagen überfällig" — wie die bisherigen Automationen.', imMotor: true },
  { art: 'zeitplan', label: 'Zeitplan', hinweis: 'Täglich, wöchentlich oder monatlich zu einer Uhrzeit (Berliner Zeit).', imMotor: true },
  // Paket 166: im Motor — die Datenbank merkt sich das Ereignis, der Motor startet beim nächsten Durchgang (stündlich).
  { art: 'ereignis', label: 'Ereignis', hinweis: 'Wenn in einem Modul etwas passiert (z. B. Rechnung bezahlt) — der Ablauf startet beim nächsten Durchgang, spätestens nach einer Stunde.', imMotor: true },
  // „Webhook rein" ist GESTRICHEN (Martins Sicherheits-Regel 28.09.2026): interne Abläufe
  // werden nie von außen angestoßen. Der Typ bleibt nur für alte Daten; pruefeAblauf lehnt ihn ab.
  { art: 'knopf', label: 'Knopf', hinweis: 'Per Knopfdruck — auf der Seite Abläufe (ohne Vorgang) oder direkt auf einer Kunden-, Anfrage-, Auftrags- oder Projektseite (mit Vorgang).', imMotor: true },
];

/**
 * Ereignisse für den Auslöser „sofort". werbung: Post an den Kunden aus diesem
 * Ereignis ist Werbung (Einwilligung nötig) — unbekannt gilt als Werbung.
 */
export type EreignisDef = { key: string; label: string; zielTyp: string; tabelle: string; werbung: boolean };
export const EREIGNISSE: EreignisDef[] = [
  { key: 'rechnung_angelegt', label: 'Rechnung angelegt', zielTyp: 'rechnung', tabelle: 'rechnungen', werbung: false },
  { key: 'rechnung_bezahlt', label: 'Rechnung bezahlt', zielTyp: 'rechnung', tabelle: 'rechnungen', werbung: false },
  { key: 'angebot_angelegt', label: 'Angebot angelegt', zielTyp: 'angebot', tabelle: 'angebote', werbung: false },
  { key: 'angebot_angenommen', label: 'Angebot angenommen', zielTyp: 'angebot', tabelle: 'angebote', werbung: false },
  { key: 'kontakt_angelegt', label: 'Kunde angelegt', zielTyp: 'kontakt', tabelle: 'kontakte', werbung: true },
  { key: 'lead_eingegangen', label: 'Anfrage eingegangen', zielTyp: 'lead', tabelle: 'leads', werbung: false },
  { key: 'auftrag_angelegt', label: 'Auftrag angelegt', zielTyp: 'auftrag', tabelle: 'auftraege', werbung: false },
  { key: 'termin_angelegt', label: 'Termin angelegt', zielTyp: 'termin', tabelle: 'termine', werbung: false },
  { key: 'aufgabe_erledigt', label: 'Aufgabe erledigt', zielTyp: 'aufgabe', tabelle: 'aufgaben', werbung: false },
];

export function ereignisDef(key: unknown): EreignisDef | undefined {
  return EREIGNISSE.find((e) => e.key === key);
}

/**
 * Paket 168: Module mit einem Knopf auf der Detailseite. werbung: Post an den
 * Kunden aus diesem Knopf gilt als Werbung (nur mit Einwilligung).
 * Rechnung und Angebot bewusst NICHT (Kern-Geld-Seiten, nur gemeinsam).
 */
export type KnopfModulDef = { modul: string; label: string; einzahl: string; tabelle: string; zielTyp: string; werbung: boolean; recht: string };
/** recht (Paket 192): Modul-Schlüssel in mitarbeiter_rechte (module / schreib_module). */
export const KNOPF_MODULE: KnopfModulDef[] = [
  { modul: 'kontakte', label: 'Kunden', einzahl: 'Kunde', tabelle: 'kontakte', zielTyp: 'kontakt', werbung: true, recht: 'crm' },
  { modul: 'leads', label: 'Anfragen', einzahl: 'Anfrage', tabelle: 'leads', zielTyp: 'lead', werbung: false, recht: 'leads' },
  { modul: 'auftraege', label: 'Aufträge', einzahl: 'Auftrag', tabelle: 'auftraege', zielTyp: 'auftrag', werbung: false, recht: 'auftraege' },
  { modul: 'projekte', label: 'Projekte', einzahl: 'Projekt', tabelle: 'projekte', zielTyp: 'projekt', werbung: false, recht: 'projekte' },
];

export function knopfModul(modul: unknown): KnopfModulDef | undefined {
  return KNOPF_MODULE.find((k) => k.modul === modul);
}

/** Paket 192: Empfänger der Glocke. */
export const GLOCKE_AN = ['chef', 'team', 'personen', 'abteilung'];
export const GLOCKE_MAX_PERSONEN = 50;

/** Mitarbeiter-Kennungen aus der Einstellung „personen" (Komma-Liste oder Liste), nur gültige, ohne Doppelte. */
export function glockePersonen(roh: unknown): string[] {
  const teile = Array.isArray(roh) ? roh.map(String) : String(roh ?? '').split(',');
  const ids = teile.map((x) => x.trim().toLowerCase()).filter((x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x));
  return [...new Set(ids)];
}

/** Abteilungsname aus der Einstellung (getrimmt, höchstens 80 Zeichen; leer = null). */
export function glockeAbteilung(roh: unknown): string | null {
  const s = String(roh ?? '').trim();
  return s ? s.slice(0, 80) : null;
}

export type AblaufAktionDef = {
  key: string;
  label: string;
  hinweis: string;
  /** Bewegt Geld oder Forderungen — nur nach einer Freigabe durch den Chef im selben Zweig. */
  geld?: boolean;
  /** Schreibt dem Kunden — bei Werbung nur mit Einwilligung. */
  kundenpost?: boolean;
  /** Schickt Daten nach außen. */
  extern?: boolean;
  /** Pflichtfelder der Einstellungen. */
  pflicht: string[];
  /** Führt der Motor sie schon aus? (sonst nur planbar, noch nicht aktivierbar) */
  imMotor: boolean;
  /** Einstellungsfelder der neuen Bausteine (Paket 167) — die alten stehen in lib/automation.ts. */
  felder?: AktionsFeld[];
};

export const ABLAUF_AKTIONEN: AblaufAktionDef[] = [
  // Die fünf bisherigen Aktionen (lib/automation.ts) — der Motor kann sie heute.
  { key: 'aufgabe_anlegen', label: 'Aufgabe anlegen', hinweis: 'Legt eine Aufgabe mit Fälligkeit an.', pflicht: ['titel'], imMotor: true },
  { key: 'mail_senden', label: 'E-Mail senden', hinweis: 'Mail an den Kunden oder eine feste Adresse.', kundenpost: true, pflicht: ['betreff', 'text'], imMotor: true },
  { key: 'status_aendern', label: 'Status ändern', hinweis: 'Setzt den Status des Vorgangs.', pflicht: ['neuer_status'], imMotor: true },
  { key: 'mahnstufe_erhoehen', label: 'Mahnstufe erhöhen', hinweis: 'Erhöht die Mahnstufe der Rechnung.', geld: true, pflicht: [], imMotor: true },
  { key: 'notiz_anhaengen', label: 'Notiz anhängen', hinweis: 'Schreibt eine Notiz an den Vorgang.', pflicht: ['text'], imMotor: true },
  // Seit Paket 157 im Motor: der Lauf hält an (Status „freigabe"), bis der Chef auf der Seite zustimmt.
  { key: 'freigabe_chef', label: 'Freigabe durch den Chef', hinweis: 'Hält an, bis die Geschäftsleitung zustimmt.', pflicht: [], imMotor: true },
  // Paket 167: die neuen Bausteine — jetzt im Motor.
  { key: 'glocke', label: 'Meldung in der Glocke', hinweis: 'Benachrichtigt die Geschäftsleitung, das Team, ausgewählte Personen oder eine Abteilung (Glocke oben rechts).', pflicht: ['text'], imMotor: true,
    felder: [
      // Paket 192: auch an ausgewählte Personen oder eine Abteilung (Felder personen/abteilung, eigene Auswahl im Editor).
      { key: 'an', label: 'An', typ: 'auswahl', optionen: ['chef', 'team', 'personen', 'abteilung'], standard: 'chef', pflicht: true },
      { key: 'personen', label: 'Personen', typ: 'text' },
      { key: 'abteilung', label: 'Abteilung', typ: 'text' },
      { key: 'titel', label: 'Überschrift', typ: 'text', standard: 'Ablauf: {{ablauf}}' },
      { key: 'text', label: 'Meldung', typ: 'mehrzeilig', pflicht: true, standard: '{{name}} {{nummer}}' },
    ] },
  { key: 'termin_anlegen', label: 'Termin anlegen', hinweis: 'Legt einen Termin im Kalender an (ohne Mail an den Kunden).', pflicht: ['titel'], imMotor: true,
    felder: [
      { key: 'titel', label: 'Titel des Termins', typ: 'text', pflicht: true, standard: 'Termin: {{name}}' },
      { key: 'in_tagen', label: 'In ... Tagen (0 = heute)', typ: 'zahl', standard: 1 },
      { key: 'uhrzeit', label: 'Uhrzeit (HH:MM, Berliner Zeit)', typ: 'text', standard: '09:00' },
      { key: 'dauer_min', label: 'Dauer in Minuten', typ: 'zahl', standard: 60 },
      { key: 'ort', label: 'Ort', typ: 'text' },
      { key: 'beschreibung', label: 'Beschreibung', typ: 'mehrzeilig' },
    ] },
  { key: 'pdf_erstellen', label: 'PDF erstellen', hinweis: 'Erstellt ein PDF (Schreiben oder Vorgangsblatt) und legt es unter „Ergebnisse" ab.', pflicht: ['vorlage'], imMotor: true,
    felder: [
      { key: 'vorlage', label: 'Vorlage', typ: 'auswahl', optionen: ['schreiben', 'vorgangsblatt'], standard: 'schreiben', pflicht: true },
      { key: 'titel', label: 'Titel', typ: 'text', standard: '{{ablauf}} – {{name}}' },
      { key: 'text', label: 'Text (bei Schreiben)', typ: 'mehrzeilig' },
    ] },
  { key: 'ki_schritt', label: 'KI-Baustein (Entwurf)', hinweis: 'Lässt einen Text von einem Baustein schreiben — nur als Entwurf unter „Ergebnisse", nie direkt versendet.', pflicht: ['auftrag'], imMotor: true,
    felder: [
      { key: 'titel', label: 'Titel des Entwurfs', typ: 'text', standard: 'Entwurf: {{name}}' },
      { key: 'auftrag', label: 'Auftrag an den Baustein', typ: 'mehrzeilig', pflicht: true, standard: 'Einen kurzen, freundlichen Text an {{name}} zum Vorgang {{nummer}} formulieren, in der Sie-Form.' },
    ] },
  { key: 'webhook_senden', label: 'Webhook senden (nach außen)', hinweis: 'Schickt ausgewählte Daten signiert an eine https-Adresse (z. B. n8n). Nur nach außen.', extern: true, pflicht: ['url'], imMotor: true,
    felder: [
      { key: 'url', label: 'Adresse (https://…)', typ: 'text', pflicht: true },
      { key: 'felder', label: 'Zusätzliche Felder, mit Komma (z. B. email, telefon)', typ: 'text' },
    ] },
];

export function ablaufAktion(key: string): AblaufAktionDef | undefined {
  return ABLAUF_AKTIONEN.find((a) => a.key === key);
}

/** Einstellungsfelder einer Aktion — alte aus lib/automation.ts, neue aus diesem Katalog. */
export function aktionFelder(key: string): AktionsFeld[] {
  return aktionDef(key)?.felder ?? ablaufAktion(key)?.felder ?? [];
}

/** Höchstens so viele KI-Bausteine je Ablauf (Kosten). */
export const MAX_KI_SCHRITTE = 3;

/**
 * Hat ein Lauf dieses Auslösers einen Vorgang (Rechnung, Angebot …)?
 * Zeitplan, Webhook und der Knopf auf der Ablauf-Seite haben keinen —
 * dann gehen nur Aktionen ohne Vorgang (Aufgabe, Mail an feste Adresse …).
 */
export function ausloeserHatVorgang(a: Ausloeser | null | undefined): boolean {
  if (!a) return false;
  if (a.art === 'datum' || a.art === 'ereignis') return true;
  if (a.art === 'knopf') return !!a.modul;
  return false;
}

/** Aktionen, die einen Vorgang brauchen (sie ändern ihn). */
export const VORGANG_AKTIONEN = ['status_aendern', 'mahnstufe_erhoehen', 'notiz_anhaengen'];

/** Grenzen, damit kein Ablauf entgleist. */
export const GRENZEN = { schritte: 50, tiefe: 5, wartenTage: 365, bedingungen: 30 } as const;

// ---------------------------------------------------------------------------
// 3) Bedingungen (UND/ODER, verschachtelt)
// ---------------------------------------------------------------------------

export function istGruppe(x: Bedingung | BedingungsGruppe): x is BedingungsGruppe {
  return !!x && typeof x === 'object' && Array.isArray((x as BedingungsGruppe).regeln);
}

/** Leere Gruppe = trifft zu. Felder mit Punkt („kunde.email") werden im Datensatz nachgeschlagen. */
export function pruefeGruppe(g: BedingungsGruppe | null | undefined, datensatz: Datensatz): boolean {
  if (!g || !Array.isArray(g.regeln)) return true;
  const ergebnisse = g.regeln.map((r) => (istGruppe(r)
    ? pruefeGruppe(r, datensatz)
    : pruefeBedingung(r, r.feld.includes('.') ? { ...datensatz, [r.feld]: wertAmPfad(datensatz, r.feld) } : datensatz)));
  return g.verknuepfung === 'oder' ? ergebnisse.some(Boolean) : ergebnisse.every(Boolean);
}

function zaehleBedingungen(g: BedingungsGruppe | null | undefined): number {
  if (!g || !Array.isArray(g.regeln)) return 0;
  return g.regeln.reduce((n, r) => n + (istGruppe(r) ? zaehleBedingungen(r) : 1), 0);
}

// ---------------------------------------------------------------------------
// 4) Platzhalter {{…}} mit Punkt-Pfad
// ---------------------------------------------------------------------------

export function wertAmPfad(daten: unknown, pfad: string): unknown {
  let x: unknown = daten;
  for (const teil of pfad.split('.')) {
    if (x === null || x === undefined || typeof x !== 'object') return undefined;
    x = (x as Record<string, unknown>)[teil];
  }
  return x;
}

/**
 * {{name}}, {{kunde.email}}, {{betrag}} … Werte kommen aus `werte` (vorbereitete
 * Texte wie name/betrag/heute) und sonst aus dem Datensatz (Punkt-Pfad).
 * Datum -> deutsch, Zahl bleibt Zahl. Unbekannt -> leer (nie „undefined").
 */
export function fuellePlatzhalter(text: string, datensatz: Datensatz, werte: Record<string, string> = {}): string {
  if (!text) return '';
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\s*\}\}/g, (_t, pfad: string) => {
    if (pfad in werte) return werte[pfad];
    const v = wertAmPfad(datensatz, pfad);
    if (v === null || v === undefined) return '';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v)) return datumDeutsch(v);
    if (typeof v === 'object') return '';
    return String(v);
  });
}

/** Standard-Platzhalter eines Laufs (wie bei den bisherigen Automationen). */
export function standardWerte(ablauf: Pick<Ablauf, 'name'>, datensatz: Datensatz, jetzt: Date): Record<string, string> {
  const name = String(datensatz.kunde_name ?? '')
    || [datensatz.vorname, datensatz.nachname].filter(Boolean).join(' ').trim()
    || String(datensatz.firma ?? datensatz.titel ?? datensatz.name ?? '');
  return {
    name,
    betrag: euro(datensatz.brutto_summe ?? datensatz.netto_summe ?? datensatz.betrag ?? datensatz.budget),
    nummer: String(datensatz.rechnungsnummer ?? datensatz.angebotsnummer ?? datensatz.nummer ?? ''),
    heute: datumDeutsch(jetzt),
    ablauf: ablauf.name || '',
  };
}

// ---------------------------------------------------------------------------
// 5) Wege durch die Schritte: Pfad „2" oder „3.dann.0"
// ---------------------------------------------------------------------------

/** Schritt an einem Pfad (null = gibt es nicht). */
export function schrittAn(schritte: readonly Schritt[], pfad: string): Schritt | null {
  const teile = pfad.split('.');
  let liste: readonly Schritt[] = schritte;
  let s: Schritt | null = null;
  for (let i = 0; i < teile.length; i++) {
    const idx = Number(teile[i]);
    if (!Number.isInteger(idx) || idx < 0 || idx >= liste.length) return null;
    s = liste[idx];
    if (i + 1 < teile.length) {
      const zweig = teile[++i];
      if (s.typ !== 'wenn' || (zweig !== 'dann' && zweig !== 'sonst')) return null;
      liste = s[zweig];
    }
  }
  return s;
}

/** Der Schritt NACH einem Pfad (Zweig zu Ende -> weiter nach dem Wenn). null = Ablauf fertig. */
export function nachfolger(schritte: readonly Schritt[], pfad: string): string | null {
  const teile = pfad.split('.');
  const idx = Number(teile[teile.length - 1]);
  const eltern = teile.slice(0, -1);                 // [] oder [...wennPfad, 'dann'|'sonst']
  let liste: readonly Schritt[] = schritte;
  if (eltern.length > 0) {
    const zweig = eltern[eltern.length - 1];
    const wenn = schrittAn(schritte, eltern.slice(0, -1).join('.'));
    if (!wenn || wenn.typ !== 'wenn' || (zweig !== 'dann' && zweig !== 'sonst')) return null;
    liste = wenn[zweig];
  }
  if (idx + 1 < liste.length) return [...eltern, String(idx + 1)].join('.');
  if (eltern.length === 0) return null;
  return nachfolger(schritte, eltern.slice(0, -1).join('.'));
}

export type FahrplanEintrag =
  | { pfad: string; art: 'aktion'; schritt: SchrittAktion }
  | { pfad: string; art: 'bedingung'; ergebnis: boolean };

export type Fahrplan = {
  /** In dieser Reihenfolge JETZT ausführen. */
  jetzt: FahrplanEintrag[];
  /** Danach: warten bis … (Pfad des nächsten Schritts), anhalten für Freigabe, oder fertig. */
  danach:
    | { art: 'fertig' }
    | { art: 'warten'; bis: string; weiter: string | null }
    | { art: 'freigabe'; pfad: string; weiter: string | null }
    | { art: 'stopp'; pfad: string };
};

/**
 * Der Fahrplan ab einem Pfad: Wenn/Sonst wird gleich entschieden, Aktionen
 * werden gesammelt, bis ein Warten, eine Chef-Freigabe, ein Stopp oder das
 * Ende kommt. Führt NICHTS aus — der Motor (und der Probelauf) arbeiten ihn ab.
 */
export function fahrplan(ablauf: Pick<Ablauf, 'schritte'>, startPfad: string | null, datensatz: Datensatz, jetzt: Date): Fahrplan {
  const jetztListe: FahrplanEintrag[] = [];
  let pfad: string | null = startPfad ?? (ablauf.schritte.length > 0 ? '0' : null);
  let schutz = 0;
  while (pfad !== null) {
    if (++schutz > GRENZEN.schritte * 2) break;              // nie endlos
    const s = schrittAn(ablauf.schritte, pfad);
    if (!s) break;
    if (s.typ === 'stopp') return { jetzt: jetztListe, danach: { art: 'stopp', pfad } };
    if (s.typ === 'warten') {
      const ms = ((s.tage ?? 0) * 24 + (s.stunden ?? 0)) * 3600 * 1000;
      return { jetzt: jetztListe, danach: { art: 'warten', bis: new Date(jetzt.getTime() + ms).toISOString(), weiter: nachfolger(ablauf.schritte, pfad) } };
    }
    if (s.typ === 'wenn') {
      const ja = pruefeGruppe(s.bedingung, datensatz);
      jetztListe.push({ pfad, art: 'bedingung', ergebnis: ja });
      const zweig = ja ? s.dann : s.sonst;
      pfad = zweig.length > 0 ? `${pfad}.${ja ? 'dann' : 'sonst'}.0` : nachfolger(ablauf.schritte, pfad);
      continue;
    }
    if (s.aktion === 'freigabe_chef') {
      return { jetzt: jetztListe, danach: { art: 'freigabe', pfad, weiter: nachfolger(ablauf.schritte, pfad) } };
    }
    jetztListe.push({ pfad, art: 'aktion', schritt: s });
    pfad = nachfolger(ablauf.schritte, pfad);
  }
  return { jetzt: jetztListe, danach: { art: 'fertig' } };
}

// ---------------------------------------------------------------------------
// 6) Einen Ablauf prüfen, bevor er aktiv wird
// ---------------------------------------------------------------------------

export type AblaufPruefung = { fehler: string[]; hinweise: string[]; aktivierbar: boolean };

/** Ist Post aus diesem Auslöser Werbung? Unbekannt = ja (lieber eine Mail zu wenig). */
export function ausloeserIstWerbung(a: Ausloeser): boolean {
  if (a.art === 'datum') return istWerbung(a.trigger);
  if (a.art === 'ereignis') return EREIGNISSE.find((e) => e.key === a.ereignis)?.werbung ?? true;
  if (a.art === 'knopf' && a.modul) return knopfModul(a.modul)?.werbung ?? true;
  return true;
}

export function pruefeAblauf(ablauf: Ablauf): AblaufPruefung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  let nochNichtImMotor = false;
  if (!String(ablauf.name ?? '').trim()) fehler.push('Bitte einen Namen vergeben.');
  const a = ablauf.ausloeser;
  const art = AUSLOESER_ARTEN.find((x) => x.art === a?.art);
  if (a?.art === 'webhook') fehler.push('Auslöser „von außen" (Webhook) ist gestrichen — interne Abläufe werden nie von außen angestoßen. Bitte einen anderen Auslöser wählen.');
  else if (!art) fehler.push('Bitte einen Auslöser wählen.');
  else {
    if (!art.imMotor) nochNichtImMotor = true;
    if (a.art === 'datum') {
      if (!triggerDef(a.trigger)) fehler.push('Unbekannter Datums-Auslöser.');
      if (!Number.isInteger(a.tage) || a.tage < 0 || a.tage > GRENZEN.wartenTage) fehler.push(`Tage beim Auslöser: 0 bis ${GRENZEN.wartenTage}.`);
    }
    if (a.art === 'ereignis' && !EREIGNISSE.some((e) => e.key === a.ereignis)) fehler.push('Unbekanntes Ereignis.');
    if (a.art === 'zeitplan') {
      if (!['taeglich', 'woechentlich', 'monatlich'].includes(a.rhythmus)) fehler.push('Unbekannter Rhythmus.');
      if (a.uhrzeit && !/^([01]\d|2[0-3]):[0-5]\d$/.test(a.uhrzeit)) fehler.push('Uhrzeit bitte als HH:MM.');
      if (a.rhythmus === 'woechentlich' && !(Number.isInteger(a.wochentag) && (a.wochentag as number) >= 1 && (a.wochentag as number) <= 7)) fehler.push('Wochentag bitte wählen (Montag bis Sonntag).');
      if (a.rhythmus === 'monatlich' && !(Number.isInteger(a.tag) && (a.tag as number) >= 1 && (a.tag as number) <= 31)) fehler.push('Tag im Monat bitte 1 bis 31.');
    }
    // Paket 168: Knopf direkt im Modul (mit Vorgang) — nur für die Module der Liste.
    if (a.art === 'knopf' && a.modul && !knopfModul(a.modul)) fehler.push('Knopf: Dieses Modul hat (noch) keinen Ablauf-Knopf.');
    // Paket 192: Mitarbeiter-Knopf nur auf einer Modulseite (mit Vorgang).
    if (a.art === 'knopf' && a.mitarbeiter === true && !a.modul) fehler.push('Knopf: Mitarbeiter dürfen nur Knöpfe auf einer Modulseite starten, nicht auf der Seite Abläufe.');
    if (a.art === 'knopf' && a.mitarbeiter === true && a.modul) hinweise.push('Auch Mitarbeiter mit Schreibrecht für dieses Modul können den Knopf drücken. Mails gehen im Namen des Betriebs; die Geschäftsleitung sieht jeden Lauf im Protokoll.');
    if ((a.art === 'datum' || a.art === 'ereignis') && zaehleBedingungen(a.filter) > GRENZEN.bedingungen) fehler.push(`Höchstens ${GRENZEN.bedingungen} Bedingungen.`);
  }
  if (!Array.isArray(ablauf.schritte) || ablauf.schritte.length === 0) fehler.push('Mindestens ein Schritt.');

  const ids = new Set<string>();
  let anzahl = 0;
  const werbung = a ? ausloeserIstWerbung(a) : true;
  const mitVorgang = ausloeserHatVorgang(a);
  let kiAnzahl = 0;
  const gehe = (liste: readonly Schritt[], tiefe: number, freigabeDavor: boolean, wo: string): void => {
    if (tiefe > GRENZEN.tiefe) { fehler.push(`Zu tief verschachtelt (höchstens ${GRENZEN.tiefe} Wenn-Ebenen).`); return; }
    let freigabe = freigabeDavor;
    liste.forEach((s, i) => {
      anzahl++;
      const nr = `${wo}${i + 1}`;
      if (!s || typeof s !== 'object' || !s.id) { fehler.push(`Schritt ${nr}: unvollständig.`); return; }
      if (ids.has(s.id)) fehler.push(`Schritt ${nr}: doppelte Kennung.`);
      ids.add(s.id);
      if (s.typ === 'warten') {
        const h = (s.tage ?? 0) * 24 + (s.stunden ?? 0);
        if (!(h > 0) || h > GRENZEN.wartenTage * 24) fehler.push(`Schritt ${nr}: Wartezeit zwischen 1 Stunde und ${GRENZEN.wartenTage} Tagen.`);
      } else if (s.typ === 'wenn') {
        if (!mitVorgang) fehler.push(`Schritt ${nr}: Wenn/Sonst braucht einen Vorgang — bei diesem Auslöser gibt es keinen.`);
        if (zaehleBedingungen(s.bedingung) === 0) fehler.push(`Schritt ${nr}: Wenn ohne Bedingung.`);
        if (zaehleBedingungen(s.bedingung) > GRENZEN.bedingungen) fehler.push(`Schritt ${nr}: höchstens ${GRENZEN.bedingungen} Bedingungen.`);
        gehe(s.dann ?? [], tiefe + 1, freigabe, `${nr}.dann.`);
        gehe(s.sonst ?? [], tiefe + 1, freigabe, `${nr}.sonst.`);
      } else if (s.typ === 'aktion') {
        const def = ablaufAktion(s.aktion);
        if (!def) { fehler.push(`Schritt ${nr}: unbekannte Aktion.`); return; }
        if (!def.imMotor) nochNichtImMotor = true;
        // Paket 158: Mahnstufe nur bei Rechnungen — passt die Aktion nicht zum Auslöser, gleich sagen.
        const zielTypen = aktionDef(def.key)?.zielTypen;
        const zielTyp = a?.art === 'datum' ? triggerDef(a.trigger)?.zielTyp : a?.art === 'ereignis' ? ereignisDef(a.ereignis)?.zielTyp
          : a?.art === 'knopf' && a.modul ? knopfModul(a.modul)?.zielTyp : undefined;
        if (zielTypen && zielTyp && !zielTypen.includes(zielTyp)) fehler.push(`Schritt ${nr} (${def.label}): passt nicht zu diesem Auslöser.`);
        if (def.key === 'notiz_anhaengen' && zielTyp === 'lead') fehler.push(`Schritt ${nr} (${def.label}): Anfragen haben kein Notizfeld — bitte „Aufgabe anlegen" nehmen.`);
        for (const p of def.pflicht) if (!String(s.config?.[p] ?? '').trim()) fehler.push(`Schritt ${nr} (${def.label}): „${p}" fehlt.`);
        if (def.key === 'freigabe_chef') freigabe = true;
        if (!mitVorgang && (VORGANG_AKTIONEN.includes(def.key) || (def.key === 'mail_senden' && s.config?.an !== 'feste_adresse'))) {
          fehler.push(`Schritt ${nr} (${def.label}): braucht einen Vorgang — bei diesem Auslöser gibt es keinen${def.key === 'mail_senden' ? ' (Mail nur an eine feste Adresse)' : ''}.`);
        }
        if (def.geld && !freigabe) fehler.push(`Schritt ${nr} (${def.label}): Geld-Aktionen nur nach einer „Freigabe durch den Chef" davor.`);
        // Paket 158: feste Adresse ohne gültige Adresse würde still übersprungen — lieber gleich sagen.
        if (def.key === 'mail_senden' && s.config?.an === 'feste_adresse' && !String(s.config?.adresse ?? '').includes('@')) {
          fehler.push(`Schritt ${nr} (${def.label}): feste Adresse fehlt.`);
        }
        if (def.kundenpost && werbung && s.config?.an !== 'feste_adresse') {
          hinweise.push(`Schritt ${nr}: Diese Mail gilt als Werbung — sie geht nur an Kunden mit Einwilligung und ohne Widerspruch.`);
        }
        if (def.extern) hinweise.push(`Schritt ${nr}: Daten gehen nach außen — nur an Adressen, mit denen ein Vertrag besteht (AVV).`);
        // ---- Paket 167: die neuen Bausteine ----
        const c = (s.config ?? {}) as Record<string, unknown>;
        if (def.key === 'glocke') {
          const an = String(c.an ?? 'chef');
          if (!GLOCKE_AN.includes(an)) fehler.push(`Schritt ${nr} (${def.label}): Empfänger bitte Geschäftsleitung, Team, Personen oder Abteilung.`);
          if (an === 'team') hinweise.push(`Schritt ${nr}: Die Meldung sehen alle Mitarbeiter mit Zugang — bitte keine Beträge oder vertraulichen Angaben in den Text.`);
          if (an === 'personen') {
            const p = glockePersonen(c.personen);
            if (p.length === 0) fehler.push(`Schritt ${nr} (${def.label}): Bitte mindestens eine Person wählen.`);
            if (p.length > GLOCKE_MAX_PERSONEN) fehler.push(`Schritt ${nr} (${def.label}): Höchstens ${GLOCKE_MAX_PERSONEN} Personen.`);
          }
          if (an === 'abteilung') {
            const ab = glockeAbteilung(c.abteilung);
            if (!ab) fehler.push(`Schritt ${nr} (${def.label}): Bitte eine Abteilung wählen.`);
            else hinweise.push(`Schritt ${nr}: Die Meldung sehen alle Mitarbeiter der Abteilung „${ab}" mit Zugang.`);
          }
        }
        if (def.key === 'termin_anlegen') {
          const t = Number(c.in_tagen ?? 0);
          if (!Number.isInteger(t) || t < 0 || t > GRENZEN.wartenTage) fehler.push(`Schritt ${nr} (${def.label}): „In ... Tagen" 0 bis ${GRENZEN.wartenTage}.`);
          if (String(c.uhrzeit ?? '').trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(c.uhrzeit).trim())) fehler.push(`Schritt ${nr} (${def.label}): Uhrzeit bitte als HH:MM.`);
          const d = Number(c.dauer_min ?? 60);
          if (!Number.isInteger(d) || d < 5 || d > 1440) fehler.push(`Schritt ${nr} (${def.label}): Dauer 5 bis 1440 Minuten.`);
          // Schleife: „Termin angelegt" -> „Termin anlegen" würde sich selbst immer wieder auslösen.
          if (a?.art === 'ereignis' && a.ereignis === 'termin_angelegt') fehler.push(`Schritt ${nr} (${def.label}): Bei „Termin angelegt" darf kein Termin angelegt werden — das würde sich endlos selbst auslösen.`);
        }
        if (def.key === 'pdf_erstellen') {
          const v = String(c.vorlage ?? '');
          if (!['schreiben', 'vorgangsblatt'].includes(v)) fehler.push(`Schritt ${nr} (${def.label}): Vorlage bitte „schreiben" oder „vorgangsblatt".`);
          if (v === 'schreiben' && !String(c.text ?? '').trim()) fehler.push(`Schritt ${nr} (${def.label}): Text für das Schreiben fehlt.`);
          if (v === 'vorgangsblatt' && !mitVorgang) fehler.push(`Schritt ${nr} (${def.label}): Das Vorgangsblatt braucht einen Vorgang — bei diesem Auslöser gibt es keinen.`);
        }
        if (def.key === 'ki_schritt') {
          kiAnzahl++;
          hinweise.push(`Schritt ${nr}: Der Auftrag samt eingesetzter Platzhalter geht an den KI-Dienst (AVV). Ergebnis ist nur ein Entwurf unter „Ergebnisse" — verschickt wird nichts.`);
        }
        if (def.key === 'webhook_senden') {
          const u = pruefeWebhookUrl(c.url);
          if (!u.erlaubt) fehler.push(`Schritt ${nr} (${def.label}): ${u.hinweis}`);
          for (const f of felderListe(c.felder)) {
            if (!/^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/i.test(f)) fehler.push(`Schritt ${nr} (${def.label}): Feldname „${f}" ungültig.`);
            else if (gesperrtesFeld(f)) fehler.push(`Schritt ${nr} (${def.label}): Feld „${f}" wird nie nach außen geschickt (Bank-, Steuer-, Gesundheits- oder Zugangsdaten).`);
          }
        }
        if (def.key === 'status_aendern' && s.config?.neuer_status === 'bezahlt') fehler.push(`Schritt ${nr}: „bezahlt" setzt nur der Zahlungseingang, nie ein Ablauf.`);
      } else if (s.typ !== 'stopp') fehler.push(`Schritt ${nr}: unbekannter Schritt.`);
    });
  };
  gehe(ablauf.schritte ?? [], 1, false, '');
  if (anzahl > GRENZEN.schritte) fehler.push(`Höchstens ${GRENZEN.schritte} Schritte.`);
  if (kiAnzahl > MAX_KI_SCHRITTE) fehler.push(`Höchstens ${MAX_KI_SCHRITTE} KI-Bausteine je Ablauf.`);
  if (nochNichtImMotor) hinweise.push('Enthält Bausteine, die der Motor noch nicht ausführt — speichern geht, einschalten noch nicht.');
  return { fehler, hinweise, aktivierbar: fehler.length === 0 && !nochNichtImMotor };
}

// ---------------------------------------------------------------------------
// 7) Übernahme einer alten Automations-Regel
// ---------------------------------------------------------------------------

/**
 * Alte Regel (Auslöser -> Bedingungen -> Wartezeit -> EINE Aktion) als Ablauf.
 * Gleiches Verhalten — mit einer Ausnahme nach Martins Schutzgeländer:
 * Geld-Aktionen (Mahnstufe) bekommen eine Chef-Freigabe davor.
 * Die neue Fassung startet AUSGESCHALTET; die alte Regel läuft weiter, bis
 * der Chef umschaltet (kein doppelter Versand, nichts fällt aus).
 */
export function regelZuAblauf(regel: Pick<AutomationRegel, 'id' | 'name' | 'beschreibung' | 'trigger_typ' | 'bedingung' | 'aktion_typ' | 'aktion_config' | 'wartezeit_tage'>): { ablauf: Ablauf; hinweise: string[] } {
  const hinweise: string[] = [];
  const bed = Array.isArray(regel.bedingung) ? regel.bedingung : [];
  const aktion: SchrittAktion = { id: 's1', typ: 'aktion', aktion: regel.aktion_typ, config: { ...(regel.aktion_config ?? {}) } };
  const schritte: Schritt[] = [];
  if (ablaufAktion(regel.aktion_typ)?.geld) {
    schritte.push({ id: 's0', typ: 'aktion', aktion: 'freigabe_chef', config: {} });
    hinweise.push('Geld-Aktion: vor dem Schritt steht jetzt eine Freigabe durch den Chef.');
  }
  if (!aktionDef(regel.aktion_typ)) hinweise.push(`Aktion „${regel.aktion_typ}" ist unbekannt — bitte prüfen.`);
  schritte.push(aktion);
  return {
    ablauf: {
      name: regel.name || 'Übernommene Automation',
      beschreibung: regel.beschreibung ?? null,
      ausloeser: {
        art: 'datum', trigger: regel.trigger_typ, tage: Math.max(0, Math.round(Number(regel.wartezeit_tage) || 0)),
        filter: bed.length > 0 ? { verknuepfung: 'und', regeln: bed } : null,
      },
      schritte,
      aktiv: false,
    },
    hinweise,
  };
}

// ---------------------------------------------------------------------------
// 8) In Worten (für Liste und Probelauf)
// ---------------------------------------------------------------------------

export function ausloeserText(a: Ausloeser): string {
  if (a.art === 'datum') {
    const t = triggerDef(a.trigger);
    return `${t?.label ?? a.trigger}${a.tage > 0 ? `, nach ${a.tage} Tag${a.tage === 1 ? '' : 'en'}` : ''}`;
  }
  if (a.art === 'ereignis') return EREIGNISSE.find((e) => e.key === a.ereignis)?.label ?? a.ereignis;
  if (a.art === 'zeitplan') {
    const r = { taeglich: 'Täglich', woechentlich: 'Wöchentlich', monatlich: 'Monatlich' }[a.rhythmus] ?? a.rhythmus;
    const wt = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'][a.wochentag ?? 0] ?? '';
    const wann = a.rhythmus === 'woechentlich' && wt ? ` am ${wt}` : a.rhythmus === 'monatlich' && a.tag ? ` am ${a.tag}.` : '';
    return `${r}${wann}${a.uhrzeit ? ` um ${a.uhrzeit} Uhr` : ''}`;
  }
  if (a.art === 'webhook') return 'Von außen (Webhook)';
  return a.modul ? `Per Knopf auf der Seite ${knopfModul(a.modul)?.einzahl ?? a.modul}` : 'Per Knopf auf der Seite Abläufe';
}

export function schrittText(s: Schritt): string {
  if (s.typ === 'warten') {
    const teile = [s.tage ? `${s.tage} Tag${s.tage === 1 ? '' : 'e'}` : '', s.stunden ? `${s.stunden} Std.` : ''].filter(Boolean);
    return `Warten: ${teile.join(' ') || '—'}`;
  }
  if (s.typ === 'wenn') return `Wenn … (${zaehleBedingungen(s.bedingung)} Bedingung${zaehleBedingungen(s.bedingung) === 1 ? '' : 'en'})`;
  if (s.typ === 'stopp') return 'Stopp';
  return ablaufAktion(s.aktion)?.label ?? s.aktion;
}

/** Datum des Auslösers eines Datensatzes (für „Datum erreicht"). */
export function ausloeserDatum(a: Ausloeser, datensatz: Datensatz): Date | null {
  if (a.art !== 'datum') return null;
  const t = triggerDef(a.trigger);
  return t ? alsDatum(datensatz[t.datumFeld]) : null;
}
