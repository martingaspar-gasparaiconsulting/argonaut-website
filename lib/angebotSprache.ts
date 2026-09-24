// ============================================================================
// ARGONAUT OS · lib/angebotSprache.ts — Angebot per Sprache oder Foto (G01)
//
// GEMEINSAM gebaut und freigegeben am 24.09.2026 (Kern-Geld-Formular).
// Reine Logik, node-getestet in tests/angebotSpracheP73.test.mjs.
//
// Der Handwerker diktiert „Bad fliesen, 12 Quadratmeter, Silikonfugen neu,
// Anfahrt" oder fotografiert seinen Aufmaß-Zettel. Daraus werden Positionen
// für das bestehende Angebotsformular — als ENTWURF, nichts wird gespeichert
// oder verschickt.
//
// ▄▄▄ MARTINS ENTSCHEIDUNG ZU DEN PREISEN (24.09.2026) ▄▄▄
//   1. Leistungskatalog — die KI nennt nur die Katalog-ID, den PREIS setzt
//      diese Datei aus dem Katalog. Eine Zahl der KI wird dabei ignoriert.
//   2. Eigene Preislisten/Dokumente — ein Preis zählt nur, wenn die Quelle
//      unter den tatsächlich gefundenen Dokumenten ist UND genau dieser
//      Betrag im Text dieser Quelle steht. Sonst ist es kein Dokumentpreis.
//   3. Sonst: Preis LEER, Position rot. Das Angebot lässt sich erst
//      speichern, wenn jeder dieser Preise eingetragen ist.
//   Die KI schätzt NIE einen Preis.
//
// Summen rechnet weiterhin die Angebotsseite (Formel `rechne`, identisch mit
// lib/kalkulatorUebergabe.angebotsSummen). Diese Datei rechnet keine Summen.
// ============================================================================

import { leseZahl } from './zahlen';

export const EINHEITEN = ['Stk', 'Std', 'Tag', 'm', 'm²', 'm³', 'kg', 't', 'lfm', 'Psch'] as const;
export const MWST_SAETZE = [19, 7, 0] as const;

export type Quelle = 'katalog' | 'dokument' | 'fehlt';

export type SprachPosition = {
  bezeichnung: string;
  menge: number;
  einheit: string;
  /** null = kein belegbarer Preis gefunden -> rot, muss eingetragen werden */
  einzelpreis: number | null;
  mwst_satz: number;
  quelle: Quelle;
  /** Katalog-Bezeichnung oder Dateiname der Preisliste — nur zur Anzeige */
  herkunft: string | null;
};

// ---------------------------------------------------------------------------
// Leistungskatalog
// ---------------------------------------------------------------------------

export type KatalogZeile = {
  id: string;
  bezeichnung?: string | null;
  kuerzel?: string | null;
  erfassungsart?: string | null;
  standard_wert?: number | null;
  festpreis_netto?: number | string | null;
  einheit?: string | null;
  einheitspreis_netto?: number | string | null;
  stundensatz_netto?: number | string | null;
  mwst_satz?: number | string | null;
};

function istMenge(art: unknown): boolean {
  return art === 'stueck';
}

/**
 * Preis und Einheit eines Katalog-Eintrags für eine ANGEBOTSposition.
 *   Pauschale (festpreis > 0)  -> Einheit Psch, Preis = Pauschale
 *   Menge ('stueck')           -> Einheit des Katalogs, Preis je Einheit
 *   Zeit (Minuten/Std/AW)      -> Einheit Std, Preis = Stundensatz
 * Eine 0 als Pauschale zählt nicht (derselbe Fehler wie 16.09. in leistungLogik).
 * Kein Preis im Katalog -> null.
 */
export function katalogPreis(k: KatalogZeile): { einheit: string; einzelpreis: number | null; mwst_satz: number } {
  const mwst = leseZahl(k.mwst_satz);
  const satz = mwst !== null && (MWST_SAETZE as readonly number[]).includes(mwst) ? mwst : 19;
  const fest = leseZahl(k.festpreis_netto);
  if (fest !== null && fest > 0) return { einheit: 'Psch', einzelpreis: fest, mwst_satz: satz };
  if (istMenge(k.erfassungsart)) {
    const p = leseZahl(k.einheitspreis_netto);
    return { einheit: String(k.einheit || 'Stk').slice(0, 12), einzelpreis: p !== null && p > 0 ? p : null, mwst_satz: satz };
  }
  const std = leseZahl(k.stundensatz_netto);
  return { einheit: 'Std', einzelpreis: std !== null && std > 0 ? std : null, mwst_satz: satz };
}

/** Kurzliste für den Prompt: ID, Bezeichnung, Einheit. KEINE Preise — die setzt diese Datei. */
export function katalogFuerPrompt(katalog: KatalogZeile[], max = 150): string {
  return (katalog ?? [])
    .filter((k) => k && k.id && String(k.bezeichnung ?? '').trim())
    .slice(0, max)
    .map((k) => `${k.id} | ${String(k.bezeichnung).trim().slice(0, 100)} | ${katalogPreis(k).einheit}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Dokument-Preise nur mit Beleg
// ---------------------------------------------------------------------------

/** Alle Geldbeträge in einem Text als Cent (1.234,56 / 1234,56 / 1234.56 / 45 €). */
export function betraegeImText(text: unknown): Set<number> {
  const s = String(text ?? '');
  const funde = new Set<number>();
  const re = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
  for (const m of s.match(re) ?? []) {
    const n = leseZahl(m);
    if (n !== null && n > 0) funde.add(Math.round(n * 100));
  }
  return funde;
}

export type DokAuszug = { datei: string; text: string };

/** Steht genau dieser Preis in der genannten Quelle? */
export function preisBelegt(preis: number, datei: string, auszuege: DokAuszug[]): boolean {
  const cent = Math.round(preis * 100);
  const name = datei.trim().toLowerCase();
  if (!name || !(cent > 0)) return false;
  return (auszuege ?? []).some((a) => a.datei.trim().toLowerCase() === name && betraegeImText(a.text).has(cent));
}

// ---------------------------------------------------------------------------
// KI-Antwort in Positionen
// ---------------------------------------------------------------------------

export function leseJson(roh: unknown): Record<string, unknown> | null {
  const s = String(roh ?? '');
  const start = s.indexOf('{');
  if (start < 0) return null;
  for (let ende = s.lastIndexOf('}'); ende > start; ende = s.lastIndexOf('}', ende - 1)) {
    try {
      const o = JSON.parse(s.slice(start, ende + 1));
      if (o && typeof o === 'object' && !Array.isArray(o)) return o as Record<string, unknown>;
    } catch { /* weiter */ }
  }
  return null;
}

export const MAX_POSITIONEN = 40;

export type Auswertung = { positionen: SprachPosition[]; titel: string; hinweise: string[] };

/**
 * Prüft jede Position der KI. Preise kommen AUSSCHLIESSLICH aus dem Katalog
 * oder aus einem belegten Dokument — nie aus der Schätzung der KI.
 */
export function lesePositionen(roh: unknown, katalog: KatalogZeile[], auszuege: DokAuszug[]): Auswertung {
  const o = leseJson(roh);
  const hinweise: string[] = [];
  if (!o) return { positionen: [], titel: '', hinweise: ['Die Antwort war nicht lesbar — bitte noch einmal versuchen.'] };

  const katalogNach = new Map((katalog ?? []).map((k) => [String(k.id), k]));
  const liste = Array.isArray(o.positionen) ? o.positionen : [];
  const positionen: SprachPosition[] = [];

  for (const roheP of liste.slice(0, MAX_POSITIONEN)) {
    const p = (roheP ?? {}) as Record<string, unknown>;
    const bezeichnung = String(p.bezeichnung ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!bezeichnung) continue;

    let menge = leseZahl(p.menge);
    if (menge === null || !(menge > 0)) {
      hinweise.push(`„${bezeichnung}": Menge nicht lesbar — auf 1 gesetzt, bitte prüfen.`);
      menge = 1;
    }
    menge = Math.round(menge * 1000) / 1000;

    let einheit = String(p.einheit ?? '').trim();
    if (!(EINHEITEN as readonly string[]).includes(einheit)) einheit = 'Stk';

    let mwst = leseZahl(p.mwst_satz);
    if (mwst === null || !(MWST_SAETZE as readonly number[]).includes(mwst)) mwst = 19;

    let einzelpreis: number | null = null;
    let quelle: Quelle = 'fehlt';
    let herkunft: string | null = null;

    // 1. Katalog: nur die ID zählt, der Preis kommt aus dem Katalog.
    const kid = String(p.katalog_id ?? '').trim();
    const k = kid ? katalogNach.get(kid) : undefined;
    if (kid && !k) hinweise.push(`„${bezeichnung}": Die genannte Katalog-Leistung gibt es nicht — Preis bitte selbst eintragen.`);
    if (k) {
      const kp = katalogPreis(k);
      einheit = kp.einheit;
      mwst = kp.mwst_satz;
      if (kp.einzelpreis !== null) {
        einzelpreis = kp.einzelpreis;
        quelle = 'katalog';
        herkunft = String(k.bezeichnung ?? '').trim() || null;
      } else {
        hinweise.push(`„${bezeichnung}": Im Leistungskatalog steht für „${String(k.bezeichnung ?? '')}" kein Preis.`);
      }
    }

    // 2. Dokument: nur mit Beleg im gefundenen Text.
    if (quelle === 'fehlt') {
      const preis = leseZahl(p.einzelpreis);
      const datei = String(p.quelle_datei ?? '').trim();
      if (preis !== null && preis > 0 && datei && preisBelegt(preis, datei, auszuege)) {
        einzelpreis = Math.round(preis * 100) / 100;
        quelle = 'dokument';
        herkunft = datei;
      }
    }

    positionen.push({ bezeichnung, menge, einheit, einzelpreis, mwst_satz: mwst, quelle, herkunft });
  }

  if (positionen.length === 0) hinweise.push('Es wurden keine Positionen erkannt.');
  const fehlen = positionen.filter((x) => x.quelle === 'fehlt').length;
  if (fehlen > 0) hinweise.unshift(`${fehlen} Position${fehlen === 1 ? '' : 'en'} ohne belegten Preis — rot markiert, bitte eintragen.`);

  return { positionen, titel: String(o.titel ?? '').trim().slice(0, 120), hinweise };
}

// ---------------------------------------------------------------------------
// Übergabe ans Formular
// ---------------------------------------------------------------------------

/**
 * Zahl so, wie das Angebotsformular sie liest. ACHTUNG: `num()` in
 * angebote/page.tsx entfernt ALLE Punkte und liest das Komma als Dezimal-
 * zeichen. „12.5" würde dort zu 125 — deshalb IMMER mit Komma und ohne
 * Tausenderpunkt.
 */
export function formZahl(n: number): string {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n * 1000) / 1000;
  return String(r).replace('.', ',');
}

export type FormPos = {
  bezeichnung: string; menge: string; einheit: string; einzelpreis: string; mwst_satz: string;
  quelle?: Quelle; herkunft?: string | null;
};

export function alsFormPos(p: SprachPosition): FormPos {
  return {
    bezeichnung: p.bezeichnung,
    menge: formZahl(p.menge),
    einheit: p.einheit,
    einzelpreis: p.einzelpreis === null ? '' : formZahl(p.einzelpreis),
    mwst_satz: String(p.mwst_satz),
    quelle: p.quelle,
    herkunft: p.herkunft,
  };
}

/**
 * Speichern erlaubt? Blockiert NUR Positionen aus der Sprach-Übernahme, die
 * noch keinen Preis haben. Von Hand erfasste Positionen verhalten sich wie
 * bisher (Martins Freigabe betraf den neuen Weg, nicht das alte Formular).
 */
export function fehlendePreise(pos: Array<{ quelle?: Quelle; einzelpreis: string; bezeichnung: string }>, liesZahl: (s: string) => number): string[] {
  return (pos ?? [])
    .filter((p) => p.quelle === 'fehlt' && !(liesZahl(p.einzelpreis) > 0))
    .map((p) => p.bezeichnung || '(ohne Bezeichnung)');
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

export function systemPrompt(): string {
  return `Sie wandeln die Beschreibung eines Handwerkers (oft diktiert, umgangssprachlich) oder ein Foto seines Aufmaß-Zettels in Angebotspositionen um.

Antworten Sie AUSSCHLIESSLICH mit einem JSON-Objekt:
{"titel": string, "positionen": [{"bezeichnung": string, "menge": number, "einheit": string, "mwst_satz": number, "katalog_id": string, "einzelpreis": number|null, "quelle_datei": string}]}

Regeln:
- bezeichnung: klare, geschäftstaugliche Leistungsbeschreibung auf Deutsch — nicht der wörtliche Diktattext.
- menge: Zahl mit Punkt als Dezimaltrenner. Aus dem Foto nur ablesen, was eindeutig dasteht.
- einheit: GENAU eine aus [${EINHEITEN.join(', ')}]. Arbeitszeit = Std, Pauschale/Anfahrt = Psch.
- mwst_satz: 19, nur bei eindeutig ermäßigten Leistungen 7.
- katalog_id: Passt eine Leistung aus dem LEISTUNGSKATALOG eindeutig, die ID von dort übernehmen. Sonst leerer String.
- einzelpreis + quelle_datei: NUR wenn der Netto-Preis wörtlich in einem der DOKUMENT-AUSZÜGE steht — dann den Betrag und den Dateinamen der Quelle angeben. Sonst einzelpreis = null und quelle_datei = "".
- Schätzen Sie NIEMALS einen Preis. Ein fehlender Preis ist richtig, ein geschätzter falsch.
- Material, Arbeitszeit und Anfahrt als getrennte Positionen. Erfinden Sie keine Leistungen, die nicht genannt wurden.
- titel: kurzer Angebotstitel, z. B. „Badsanierung Obergeschoss".`;
}

export function nutzerPrompt(beschreibung: string, katalog: KatalogZeile[], auszuege: DokAuszug[]): string {
  const kat = katalogFuerPrompt(katalog);
  const dok = (auszuege ?? []).map((a, i) => `[Quelle ${i + 1}: ${a.datei}]\n${a.text.slice(0, 3000)}`).join('\n\n---\n\n');
  return [
    kat ? `LEISTUNGSKATALOG (ID | Bezeichnung | Einheit):\n${kat}` : 'LEISTUNGSKATALOG: leer.',
    dok ? `DOKUMENT-AUSZÜGE (eigene Preislisten):\n${dok}` : 'DOKUMENT-AUSZÜGE: keine.',
    `BESCHREIBUNG:\n${beschreibung.slice(0, 6000) || '(siehe Foto)'}`,
  ].join('\n\n====\n\n');
}
