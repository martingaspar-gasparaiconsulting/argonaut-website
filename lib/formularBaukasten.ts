// lib/formularBaukasten.ts
// ============================================================================
// ARGONAUT OS · Paket PL · Formular-Baukasten (B23) — Stand 24.09.2026
//
// ▄▄▄ WAS ES SCHON GAB ▄▄▄
// - lib/eigeneFelder.ts: zusaetzliche Spalten je Modul (Text, Zahl, Datum,
//   Auswahl, Ja/Nein). Gut fuer Stammdaten, aber kein Formular.
// - Pruefprotokolle: fester Norm-Katalog (DGUV/DIN/VDE) mit Pruefpunkten.
// Eigene Checklisten mit Foto und Unterschrift ("Uebergabe Wohnung",
// "Abnahme Bad", "Tagescheck Hebebuehne") gab es nicht.
//
// ▄▄▄ WAS HIER DAZUKOMMT ▄▄▄
// Vorlage = Liste von Feldern (12 Typen, inkl. i.O./n.i.O., Foto, Unterschrift).
// Ausfuellen speichert eine KOPIE der Felder mit — wird die Vorlage spaeter
// geaendert, bleibt jedes alte Protokoll genau so, wie es ausgefuellt wurde.
// Abgeschlossen = nicht mehr aenderbar.
//
// Reine Logik: keine Imports aus Next/Supabase/React, keine Uhr.
// Node-getestet: tests/formularBaukastenP85.test.mjs
// ============================================================================

import { leseZahlOder } from './zahlen';
export type FeldTyp =
  | 'ueberschrift' | 'text' | 'textlang' | 'zahl' | 'datum' | 'auswahl' | 'mehrfach'
  | 'ja_nein' | 'pruefpunkt' | 'foto' | 'unterschrift' | 'hinweis'
  // MO1 Teil 1 (P387, 16.10.2026): Zahl mit Einheit und Grenzen -> Ampel, zaehlt ins Ergebnis
  | 'messwert';

export const FELD_TYPEN: { key: FeldTyp; label: string; eingabe: boolean }[] = [
  { key: 'ueberschrift', label: 'Zwischenüberschrift', eingabe: false },
  { key: 'hinweis', label: 'Hinweistext', eingabe: false },
  { key: 'text', label: 'Text (kurz)', eingabe: true },
  { key: 'textlang', label: 'Text (lang)', eingabe: true },
  { key: 'zahl', label: 'Zahl', eingabe: true },
  { key: 'datum', label: 'Datum', eingabe: true },
  { key: 'auswahl', label: 'Auswahl (eins)', eingabe: true },
  { key: 'mehrfach', label: 'Auswahl (mehrere)', eingabe: true },
  { key: 'ja_nein', label: 'Ja / Nein', eingabe: true },
  { key: 'pruefpunkt', label: 'Prüfpunkt (i. O. / n. i. O. / entfällt)', eingabe: true },
  { key: 'messwert', label: 'Messwert (mit Einheit und Grenzen)', eingabe: true },
  { key: 'foto', label: 'Foto', eingabe: true },
  { key: 'unterschrift', label: 'Unterschrift', eingabe: true },
];

export function istFeldTyp(x: unknown): x is FeldTyp {
  return FELD_TYPEN.some((t) => t.key === x);
}
export function feldTyp(key: unknown) {
  return FELD_TYPEN.find((t) => t.key === key) ?? null;
}

export type Feld = {
  id: string;
  typ: FeldTyp;
  label: string;
  pflicht?: boolean;
  optionen?: string[];
  hilfe?: string;
  /** nur messwert: Einheit (z. B. „°C", „MΩ", „bar") */
  einheit?: string;
  /** nur messwert: untere Grenze (Wert muss ≥ sein) */
  min?: number;
  /** nur messwert: obere Grenze (Wert muss ≤ sein) */
  max?: number;
};

export type MessAmpel = 'ok' | 'mangel' | 'leer' | 'ohne_grenze';

function zahlOderNull(v: unknown): number | null {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
  const n = typeof v === 'number' ? v : leseZahlOder(String(v).trim(), NaN);
  return Number.isFinite(n) ? n : null;
}

/** Ampel eines Messwerts gegen die Grenzen des Feldes. */
export function messAmpel(feld: Feld, wert: unknown): MessAmpel {
  const w = zahlOderNull(wert);
  if (w === null) return 'leer';
  const lo = zahlOderNull(feld.min);
  const hi = zahlOderNull(feld.max);
  if (lo === null && hi === null) return 'ohne_grenze';
  if (lo !== null && w < lo) return 'mangel';
  if (hi !== null && w > hi) return 'mangel';
  return 'ok';
}

function zahlDeutsch(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

/** Grenze als Text: „2 – 7 °C", „≤ 0,3 Ω", „≥ 1 MΩ", leer ohne Grenze. */
export function grenzeText(feld: Feld): string {
  const e = feld.einheit ? ` ${feld.einheit}` : '';
  const lo = zahlOderNull(feld.min), hi = zahlOderNull(feld.max);
  if (lo !== null && hi !== null) return `${zahlDeutsch(lo)} – ${zahlDeutsch(hi)}${e}`;
  if (hi !== null) return `≤ ${zahlDeutsch(hi)}${e}`;
  if (lo !== null) return `≥ ${zahlDeutsch(lo)}${e}`;
  return '';
}

export const KATEGORIEN: { key: string; label: string }[] = [
  { key: 'abnahme', label: 'Abnahme' },
  { key: 'uebergabe', label: 'Übergabe' },
  { key: 'pruefung', label: 'Prüfung / Kontrolle' },
  { key: 'checkliste', label: 'Checkliste' },
  { key: 'bericht', label: 'Bericht' },
  { key: 'sonstiges', label: 'Sonstiges' },
];

export const MAX_FELDER = 80;
export const MAX_UNTERSCHRIFT_ZEICHEN = 200_000;

/** Kurze, stabile Feld-ID aus einem Zaehler (keine Zufallszahl -> testbar). */
export function neueFeldId(vorhandene: string[]): string {
  let n = vorhandene.length + 1;
  const set = new Set(vorhandene);
  while (set.has(`f${n}`)) n++;
  return `f${n}`;
}

/** Optionen aus Freitext: Komma, Semikolon oder Zeilenumbruch. Ohne Doppelte, max 30. */
export function leseOptionen(roh: unknown): string[] {
  const aus: string[] = [];
  for (const t of String(roh ?? '').split(/[,;\n]/)) {
    const s = t.trim().slice(0, 80);
    if (s && !aus.includes(s)) aus.push(s);
  }
  return aus.slice(0, 30);
}

/**
 * Vorlage pruefen und saeubern. Gibt die bereinigten Felder und die Fehler
 * zurueck; mit Fehlern darf nicht gespeichert werden.
 */
export function pruefeVorlage(titel: unknown, felder: unknown): { felder: Feld[]; fehler: string[] } {
  const fehler: string[] = [];
  if (!String(titel ?? '').trim()) fehler.push('Die Vorlage braucht einen Titel.');
  const roh = Array.isArray(felder) ? felder : [];
  if (!roh.length) fehler.push('Die Vorlage hat noch keine Felder.');
  if (roh.length > MAX_FELDER) fehler.push(`Höchstens ${MAX_FELDER} Felder je Vorlage.`);
  const ids = new Set<string>();
  const aus: Feld[] = [];
  roh.slice(0, MAX_FELDER).forEach((f, i) => {
    const r = (f ?? {}) as Record<string, unknown>;
    const typ = istFeldTyp(r.typ) ? r.typ : null;
    const label = String(r.label ?? '').trim().slice(0, 200);
    let id = String(r.id ?? '').trim().slice(0, 20);
    if (!typ) { fehler.push(`Feld ${i + 1}: unbekannter Typ.`); return; }
    if (!label) fehler.push(`Feld ${i + 1}: Beschriftung fehlt.`);
    if (!/^[a-z0-9_-]+$/i.test(id) || ids.has(id)) id = neueFeldId([...ids]);
    ids.add(id);
    const feld: Feld = { id, typ, label };
    if (feldTyp(typ)?.eingabe && r.pflicht === true) feld.pflicht = true;
    if (typ === 'auswahl' || typ === 'mehrfach') {
      const opt = Array.isArray(r.optionen) ? leseOptionen((r.optionen as unknown[]).join('\n')) : leseOptionen(r.optionen);
      if (opt.length < 2) fehler.push(`Feld „${label || i + 1}": mindestens zwei Auswahlmöglichkeiten.`);
      feld.optionen = opt;
    }
    if (typ === 'messwert') {
      const einheit = String(r.einheit ?? '').trim().slice(0, 20);
      if (einheit) feld.einheit = einheit;
      const lo = zahlOderNull(r.min), hi = zahlOderNull(r.max);
      const loKaputt = r.min != null && String(r.min).trim() !== '' && lo === null;
      const hiKaputt = r.max != null && String(r.max).trim() !== '' && hi === null;
      if (loKaputt || hiKaputt) fehler.push(`Feld „${label || i + 1}": Grenze ist keine gültige Zahl.`);
      if (lo !== null && hi !== null && lo > hi) fehler.push(`Feld „${label || i + 1}": untere Grenze liegt über der oberen.`);
      if (lo !== null) feld.min = lo;
      if (hi !== null) feld.max = hi;
    }
    const hilfe = String(r.hilfe ?? '').trim().slice(0, 300);
    if (hilfe) feld.hilfe = hilfe;
    aus.push(feld);
  });
  if (roh.length && !aus.some((f) => feldTyp(f.typ)?.eingabe)) fehler.push('Die Vorlage braucht mindestens ein Eingabefeld.');
  return { felder: aus, fehler };
}

export type Werte = Record<string, unknown>;

function leer(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  return String(v).trim() === '';
}

/**
 * Werte pruefen. `fuerAbschluss`: Pflichtfelder muessen gefuellt sein.
 * Zwischenspeichern (Entwurf) geht immer — nur kaputte Werte werden gemeldet.
 */
export function pruefeWerte(felder: Feld[], werte: Werte, fuerAbschluss: boolean): string[] {
  const f: string[] = [];
  for (const feld of felder) {
    const v = werte[feld.id];
    if (!feldTyp(feld.typ)?.eingabe) continue;
    if (leer(v)) {
      if (fuerAbschluss && feld.pflicht) f.push(`„${feld.label}" ist ein Pflichtfeld.`);
      continue;
    }
    switch (feld.typ) {
      case 'zahl':
      case 'messwert': {
        const t = String(v).trim();
        const n = leseZahlOder(t, NaN);
        if (!Number.isFinite(n)) f.push(`„${feld.label}": keine gültige Zahl.`);
        break;
      }
      case 'datum':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) f.push(`„${feld.label}": kein gültiges Datum.`);
        break;
      case 'auswahl':
        if (!(feld.optionen ?? []).includes(String(v))) f.push(`„${feld.label}": Auswahl nicht in der Liste.`);
        break;
      case 'mehrfach':
        if (!Array.isArray(v) || v.some((x) => !(feld.optionen ?? []).includes(String(x)))) f.push(`„${feld.label}": Auswahl nicht in der Liste.`);
        break;
      case 'ja_nein':
        if (v !== 'ja' && v !== 'nein') f.push(`„${feld.label}": bitte Ja oder Nein.`);
        break;
      case 'pruefpunkt':
        if (!['io', 'nio', 'entfaellt'].includes(String(v))) f.push(`„${feld.label}": bitte i. O., n. i. O. oder entfällt.`);
        break;
      case 'unterschrift': {
        const s = String(v);
        if (!s.startsWith('data:image/png;base64,') || s.length > MAX_UNTERSCHRIFT_ZEICHEN) f.push(`„${feld.label}": Unterschrift ungültig.`);
        break;
      }
      case 'foto':
        if (!Array.isArray(v) || v.some((p) => typeof p !== 'string' || !p.includes('/formulare/'))) f.push(`„${feld.label}": Foto ungültig.`);
        break;
    }
  }
  return f;
}

export type Ergebnis = { pruefpunkte: number; io: number; nio: number; entfaellt: number; offen: number; gesamt: 'io' | 'nio' | 'offen' | null };

/** Gesamtergebnis ueber alle Pruefpunkte und Messwerte mit Grenze. Ohne beides: gesamt = null. */
export function ergebnis(felder: Feld[], werte: Werte): Ergebnis {
  const e: Ergebnis = { pruefpunkte: 0, io: 0, nio: 0, entfaellt: 0, offen: 0, gesamt: null };
  for (const f of felder) {
    if (f.typ === 'messwert') {
      // Messwert mit Grenze zaehlt wie ein Pruefpunkt: innerhalb = i. O., ausserhalb = n. i. O.
      // MO1v-HW: ohne Grenze zaehlt der Messwert nie mit — auch nicht leer (vorher „offen")
      if (zahlOderNull(f.min) === null && zahlOderNull(f.max) === null) continue;
      const a = messAmpel(f, werte[f.id]);
      e.pruefpunkte++;
      if (a === 'ok') e.io++; else if (a === 'mangel') e.nio++; else e.offen++;
      continue;
    }
    if (f.typ !== 'pruefpunkt') continue;
    e.pruefpunkte++;
    const v = werte[f.id];
    if (v === 'io') e.io++;
    else if (v === 'nio') e.nio++;
    else if (v === 'entfaellt') e.entfaellt++;
    else e.offen++;
  }
  if (e.pruefpunkte) e.gesamt = e.nio ? 'nio' : e.offen ? 'offen' : 'io';
  return e;
}

/** Wert fuer Anzeige und PDF lesbar machen. Foto und Unterschrift nicht als Text. */
export function wertText(feld: Feld, v: unknown): string {
  if (leer(v)) return '—';
  switch (feld.typ) {
    case 'datum': { const p = String(v).split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(v); }
    case 'mehrfach': return Array.isArray(v) ? v.join(', ') : String(v);
    case 'ja_nein': return v === 'ja' ? 'Ja' : v === 'nein' ? 'Nein' : String(v);
    case 'pruefpunkt': return v === 'io' ? 'i. O.' : v === 'nio' ? 'n. i. O.' : v === 'entfaellt' ? 'entfällt' : String(v);
    case 'foto': return Array.isArray(v) ? `${v.length} Foto${v.length === 1 ? '' : 's'}` : '—';
    case 'unterschrift': return 'unterschrieben';
    case 'messwert': {
      const n = zahlOderNull(v);
      if (n === null) return String(v);
      const g = grenzeText(feld);
      const a = messAmpel(feld, v);
      return `${zahlDeutsch(n)}${feld.einheit ? ' ' + feld.einheit : ''}${g ? ` (Grenze ${g}) · ${a === 'ok' ? 'i. O.' : 'n. i. O.'}` : ''}`;
    }
    default: return String(v);
  }
}

/** Fuer jsPDF (Helvetica/WinAnsi): ≤ ≥ Ω kann die Schrift nicht — lesbar ersetzen. */
export function pdfText(t: string): string {
  return String(t).replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[ΩΩ]/g, 'Ohm');
}

/** Fortschritt: ausgefuellte Eingabefelder / alle Eingabefelder. */
export function fortschritt(felder: Feld[], werte: Werte): { gefuellt: number; gesamt: number; pflichtOffen: number } {
  let gefuellt = 0; let gesamt = 0; let pflichtOffen = 0;
  for (const f of felder) {
    if (!feldTyp(f.typ)?.eingabe) continue;
    gesamt++;
    if (!leer(werte[f.id])) gefuellt++;
    else if (f.pflicht) pflichtOffen++;
  }
  return { gefuellt, gesamt, pflichtOffen };
}

// ---------------------------------------------------------------------------
// Startvorlagen — zum Uebernehmen und Anpassen
// ---------------------------------------------------------------------------

type Roh = [FeldTyp, string, (boolean | string[])?];
function baue(liste: Roh[]): Feld[] {
  return liste.map(([typ, label, x], i) => {
    const f: Feld = { id: `f${i + 1}`, typ, label };
    if (x === true) f.pflicht = true;
    if (Array.isArray(x)) f.optionen = x;
    return f;
  });
}

export const STARTVORLAGEN: { titel: string; kategorie: string; beschreibung: string; felder: Feld[] }[] = [
  {
    titel: 'Übergabeprotokoll Wohnung / Objekt', kategorie: 'uebergabe', beschreibung: 'Zustand, Zählerstände, Schlüssel, Unterschriften beider Seiten.',
    felder: baue([
      ['text', 'Objekt / Adresse', true], ['datum', 'Datum der Übergabe', true], ['text', 'Übergeben an'],
      ['ueberschrift', 'Zählerstände'], ['zahl', 'Strom (kWh)'], ['zahl', 'Wasser (m³)'], ['zahl', 'Gas / Wärme'],
      ['ueberschrift', 'Zustand'], ['pruefpunkt', 'Wände und Decken'], ['pruefpunkt', 'Böden'], ['pruefpunkt', 'Fenster und Türen'], ['pruefpunkt', 'Sanitär'], ['pruefpunkt', 'Elektro'],
      ['textlang', 'Festgestellte Mängel'], ['foto', 'Fotos'], ['zahl', 'Anzahl Schlüssel'],
      ['unterschrift', 'Unterschrift Übergebender', true], ['unterschrift', 'Unterschrift Übernehmender', true],
    ]),
  },
  {
    titel: 'Abnahme Teilleistung (Handwerk)', kategorie: 'abnahme', beschreibung: 'Leistung, Prüfpunkte, Mängel mit Frist, Vorbehalt, Unterschriften.',
    felder: baue([
      ['text', 'Bauvorhaben', true], ['text', 'Abgenommene Leistung', true], ['datum', 'Datum', true],
      ['pruefpunkt', 'Leistung vollständig erbracht'], ['pruefpunkt', 'Ausführung fachgerecht'], ['pruefpunkt', 'Baustelle geräumt und sauber'],
      ['textlang', 'Mängel (mit Frist zur Beseitigung)'], ['auswahl', 'Abnahme', ['ohne Vorbehalt', 'unter Vorbehalt der Mängel', 'verweigert']], ['foto', 'Fotos'],
      ['hinweis', 'Muster — Formulierungen zur Abnahme bitte vom Anwalt prüfen lassen.'],
      ['unterschrift', 'Unterschrift Auftraggeber', true], ['unterschrift', 'Unterschrift Auftragnehmer', true],
    ]),
  },
  {
    titel: 'Fahrzeug-Übergabe', kategorie: 'uebergabe', beschreibung: 'km-Stand, Tank, Schäden rundum, Zubehör.',
    felder: baue([
      ['text', 'Fahrzeug / Kennzeichen', true], ['datum', 'Datum', true], ['text', 'Fahrer'], ['zahl', 'km-Stand', true],
      ['auswahl', 'Tankfüllung', ['voll', '3/4', '1/2', '1/4', 'Reserve']],
      ['pruefpunkt', 'Außen ohne neue Schäden'], ['pruefpunkt', 'Innenraum sauber'], ['pruefpunkt', 'Warnweste, Dreieck, Verbandskasten'],
      ['foto', 'Fotos rundum'], ['textlang', 'Bemerkungen'], ['unterschrift', 'Unterschrift Fahrer', true],
    ]),
  },
  {
    titel: 'Tagescheck Maschine / Arbeitsmittel', kategorie: 'pruefung', beschreibung: 'Sichtprüfung vor Arbeitsbeginn.',
    felder: baue([
      ['text', 'Maschine / Gerät', true], ['datum', 'Datum', true], ['text', 'Geprüft von', true],
      ['pruefpunkt', 'Schutzeinrichtungen vorhanden und wirksam'], ['pruefpunkt', 'Not-Aus funktioniert'], ['pruefpunkt', 'Leitungen und Stecker unbeschädigt'], ['pruefpunkt', 'Keine Leckagen'],
      ['textlang', 'Auffälligkeiten'], ['foto', 'Foto bei Mangel'],
      ['hinweis', 'Bei n. i. O.: Gerät nicht benutzen und sofort melden.'],
    ]),
  },
  {
    titel: 'Kundendienst-Bericht', kategorie: 'bericht', beschreibung: 'Einsatz beim Kunden mit Tätigkeit, Material, Unterschrift.',
    felder: baue([
      ['text', 'Kunde', true], ['datum', 'Datum', true], ['text', 'Anlage / Gerät'], ['textlang', 'Durchgeführte Arbeiten', true],
      ['textlang', 'Verwendetes Material'], ['mehrfach', 'Erledigt', ['Reparatur', 'Wartung', 'Einstellung', 'Beratung']],
      ['ja_nein', 'Anlage wieder in Betrieb'], ['foto', 'Fotos'], ['unterschrift', 'Unterschrift Kunde'],
    ]),
  },
  // Paket PS2 (24.09.2026): HACCP für Gastronomie & Lebensmittel — auch ohne das Lebensmittel-Modul nutzbar.
  {
    titel: 'HACCP Temperaturkontrolle (Kühlung)', kategorie: 'pruefung', beschreibung: 'Tägliche Kontrolle der Kühl- und Tiefkühlgeräte mit Maßnahme bei Abweichung.',
    felder: baue([
      ['datum', 'Datum', true], ['text', 'Geprüft von', true],
      ['hinweis', 'Sollwerte aus Ihrem HACCP-Konzept eintragen — übliche Richtwerte: Kühlung höchstens +7 °C (Hackfleisch +2 °C, Fisch +2 °C, Geflügel +4 °C), Tiefkühlung höchstens −18 °C.'],
      ['zahl', 'Kühlraum / Kühlschrank 1 (°C)', true], ['zahl', 'Kühlschrank 2 (°C)'], ['zahl', 'Tiefkühlung (°C)', true],
      ['pruefpunkt', 'Alle Werte im Sollbereich'], ['pruefpunkt', 'Türdichtungen sauber und dicht'],
      ['textlang', 'Abweichung und Korrekturmaßnahme (Ware geprüft/entsorgt, Gerät nachgeregelt, Techniker)'],
      ['unterschrift', 'Unterschrift', true],
    ]),
  },
  {
    titel: 'Wareneingangskontrolle Lebensmittel', kategorie: 'pruefung', beschreibung: 'Temperatur, Verpackung, MHD und Charge bei der Anlieferung.',
    felder: baue([
      ['datum', 'Datum', true], ['text', 'Lieferant', true], ['text', 'Ware / Charge', true], ['datum', 'MHD / Verbrauchsdatum'],
      ['zahl', 'Kerntemperatur bei Anlieferung (°C)'],
      ['pruefpunkt', 'Temperatur im Sollbereich'], ['pruefpunkt', 'Verpackung unbeschädigt und sauber'], ['pruefpunkt', 'Kennzeichnung vollständig (MHD, Charge, Allergene)'], ['pruefpunkt', 'Fahrzeug sauber, Kühlkette eingehalten'],
      ['auswahl', 'Entscheidung', ['angenommen', 'angenommen mit Vermerk', 'abgelehnt']], ['textlang', 'Bemerkung'], ['foto', 'Foto bei Abweichung'],
      ['unterschrift', 'Unterschrift', true],
    ]),
  },
];

/** Name fuer die PDF-Datei. */
export function pdfDateiname(titel: string, datum: string): string {
  const t = String(titel ?? '').replace(/[^\wäöüÄÖÜß -]/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'Formular';
  return `${t}_${String(datum ?? '').slice(0, 10)}.pdf`;
}
