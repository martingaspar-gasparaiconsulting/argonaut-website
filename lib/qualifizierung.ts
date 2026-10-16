// ============================================================================
// ARGONAUT OS · lib/qualifizierung.ts — Paket VK2 (16.10.2026)
// Qualifizierung und Übergabe Setter → Closer.
//
//   · Qualifizierungsbogen je Angebot: Standard (Budget, Entscheider, Bedarf,
//     Zeitpunkt) plus eigene Fragen des Betriebs (vk_bogen.fragen).
//   · Ergebnis je Lead: offen · passt (→ Übergabe an den Closer mit Notiz und
//     Glocke) · passt nicht (mit Grund → Lead „verloren", zählt in der Auswertung).
//   · Spickzettel: alles fürs Gespräch auf einer Seite.
//
// Gleiche Regeln wie supabase-sql/p408-qualifizierung.sql.
// Node-testbar (tests/qualifizierungVK2.test.mjs); Zahlen nur über lib/zahlen.ts.
// ============================================================================

import { leseZahl } from './zahlen';

export type FrageTyp = 'auswahl' | 'text' | 'zahl' | 'janein';
export type Frage = { key: string; frage: string; typ: FrageTyp; optionen?: string[]; pflicht?: boolean };

export const STANDARD_FRAGEN: readonly Frage[] = Object.freeze([
  { key: 'bedarf', frage: 'Was genau braucht der Kunde?', typ: 'text', pflicht: true },
  { key: 'budget', frage: 'Budget', typ: 'auswahl', optionen: ['unter 1.000 €', '1.000–5.000 €', '5.000–20.000 €', 'über 20.000 €', 'noch offen'], pflicht: true },
  { key: 'entscheider', frage: 'Entscheidet der Gesprächspartner selbst?', typ: 'auswahl', optionen: ['ja, allein', 'gemeinsam mit Partner/Familie', 'nein, jemand anderes', 'unklar'], pflicht: true },
  { key: 'zeitpunkt', frage: 'Wann soll es losgehen?', typ: 'auswahl', optionen: ['sofort', 'in 1–3 Monaten', 'in 3–6 Monaten', 'später / unklar'], pflicht: true },
] as Frage[]);

export const GRUENDE = Object.freeze([
  { key: 'kein_budget', text: 'Kein Budget / zu teuer' },
  { key: 'kein_bedarf', text: 'Kein echter Bedarf' },
  { key: 'nicht_entscheider', text: 'Kein Entscheider erreichbar' },
  { key: 'zeitpunkt', text: 'Zeitpunkt zu weit weg' },
  { key: 'gebiet', text: 'Außerhalb unseres Einzugsgebiets' },
  { key: 'leistung', text: 'Leistung bieten wir nicht an' },
  { key: 'versorgt', text: 'Hat schon einen Anbieter' },
  { key: 'nicht_erreichbar', text: 'Nicht erreichbar' },
  { key: 'sonstiges', text: 'Sonstiges' },
] as const);
export type GrundKey = (typeof GRUENDE)[number]['key'];
const GRUND_KEYS: readonly string[] = GRUENDE.map((g) => g.key);
export function istGrund(x: unknown): x is GrundKey { return typeof x === 'string' && GRUND_KEYS.includes(x); }
export function grundText(k: string | null | undefined): string { return GRUENDE.find((g) => g.key === k)?.text ?? '—'; }

export type Ergebnis = 'offen' | 'passt' | 'passt_nicht';
export const ERGEBNIS_TEXT: Record<Ergebnis, string> = { offen: 'Noch offen', passt: '✓ Passt', passt_nicht: '✗ Passt nicht' };

const TYPEN: readonly string[] = ['auswahl', 'text', 'zahl', 'janein'];
const KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** Schlüssel aus einem Fragetext (für eigene Fragen). */
export function frageKey(text: string, vergeben: Iterable<string> = []): string {
  const belegt = new Set(vergeben);
  let k = (text || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
  if (!k || !/^[a-z]/.test(k)) k = 'frage' + (k ? '_' + k : '');
  k = k.slice(0, 36);
  let n = k; let i = 2;
  while (belegt.has(n)) n = k + '_' + i++;
  return n;
}

/** Fragen eines Bogens bereinigen; unbrauchbare fallen weg, Schlüssel eindeutig. */
export function fragenBereinigen(roh: unknown): Frage[] {
  if (!Array.isArray(roh)) return [];
  const out: Frage[] = [];
  const keys = new Set<string>();
  for (const f of roh.slice(0, 40)) {
    if (!f || typeof f !== 'object') continue;
    const o = f as Record<string, unknown>;
    const text = typeof o.frage === 'string' ? o.frage.trim().slice(0, 200) : '';
    if (!text) continue;
    const typ = TYPEN.includes(String(o.typ)) ? (o.typ as FrageTyp) : 'text';
    let key = typeof o.key === 'string' && KEY.test(o.key) && !keys.has(o.key) ? o.key : frageKey(text, keys);
    if (keys.has(key)) key = frageKey(text, keys);
    keys.add(key);
    const frage: Frage = { key, frage: text, typ, pflicht: o.pflicht === true };
    if (typ === 'auswahl') {
      const opt = Array.isArray(o.optionen) ? o.optionen.map((x) => String(x ?? '').trim().slice(0, 80)).filter(Boolean) : [];
      const eindeutig = [...new Set(opt)].slice(0, 12);
      if (eindeutig.length < 2) continue; // Auswahl braucht mindestens zwei Möglichkeiten
      frage.optionen = eindeutig;
    }
    out.push(frage);
  }
  return out;
}

/** Fragen, die im Gespräch gestellt werden: Standard + eigene des Bogens (gleicher Schlüssel = eigene gewinnt). */
export function bogenFragen(eigene: unknown, mitStandard = true): Frage[] {
  const e = fragenBereinigen(eigene);
  if (!mitStandard) return e;
  const eKeys = new Set(e.map((f) => f.key));
  return [...STANDARD_FRAGEN.filter((f) => !eKeys.has(f.key)), ...e];
}

export type Antworten = Record<string, string>;

/** Antworten auf die Fragen zuschneiden (nur bekannte Schlüssel, nur gültige Werte). */
export function antwortenBereinigen(fragen: readonly Frage[], roh: unknown): Antworten {
  const o = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  const out: Antworten = {};
  for (const f of fragen) {
    const v = o[f.key];
    if (v === null || v === undefined) continue;
    let s = String(v).trim().slice(0, 1000);
    if (!s) continue;
    if (f.typ === 'auswahl' && !(f.optionen ?? []).includes(s)) continue;
    if (f.typ === 'janein') { if (s !== 'ja' && s !== 'nein') continue; }
    if (f.typ === 'zahl' && leseZahl(s) === null) continue; // einziger Zahlenleser: lib/zahlen.ts
    out[f.key] = s;
  }
  return out;
}

/** Pflichtfragen ohne Antwort (Texte). */
export function fehlendePflicht(fragen: readonly Frage[], antworten: Antworten): string[] {
  return fragen.filter((f) => f.pflicht && !(antworten[f.key] ?? '').trim()).map((f) => f.frage);
}

export type ErgebnisEingang = { ergebnis: Ergebnis; grund?: string | null; grundText?: string | null; anUser?: string | null; notiz?: string | null };

/**
 * Prüft das Ergebnis vor dem Speichern. Fehlertexte (gesiezt).
 * „passt" braucht alle Pflichtantworten und einen Closer aus dem Team;
 * „passt nicht" einen Grund, bei „Sonstiges" eine kurze Begründung.
 */
export function ergebnisPruefen(e: ErgebnisEingang, fragen: readonly Frage[], antworten: Antworten, closerIds: readonly string[]): string[] {
  const f: string[] = [];
  if (e.ergebnis === 'passt') {
    const fehlt = fehlendePflicht(fragen, antworten);
    if (fehlt.length) f.push('Bitte noch beantworten: ' + fehlt.join(', ') + '.');
    if (!e.anUser) f.push('Bitte einen Closer für die Übergabe wählen.');
    else if (!closerIds.includes(e.anUser)) f.push('Der gewählte Closer gehört nicht zu Ihrem Team.');
  } else if (e.ergebnis === 'passt_nicht') {
    if (!istGrund(e.grund)) f.push('Bitte einen Grund wählen.');
    else if (e.grund === 'sonstiges' && !(e.grundText ?? '').trim()) f.push('Bitte bei „Sonstiges" kurz den Grund nennen.');
  }
  return f;
}

/** Spickzettel: Frage und Antwort in Reihenfolge; Unbeantwortetes als „—". */
export function spickzettel(fragen: readonly Frage[], antworten: Antworten): { frage: string; antwort: string; offen: boolean }[] {
  return fragen.map((f) => {
    const a = (antworten[f.key] ?? '').trim();
    return { frage: f.frage, antwort: a || '—', offen: !a };
  });
}

/** Auswertung „Passt nicht": Anzahl je Grund, häufigster zuerst. */
export function gruendeZaehlen(zeilen: readonly { ergebnis?: string | null; grund?: string | null }[]): { key: string; text: string; anzahl: number }[] {
  const n = new Map<string, number>();
  for (const z of zeilen) {
    if (z?.ergebnis !== 'passt_nicht') continue;
    const k = istGrund(z.grund) ? z.grund : 'sonstiges';
    n.set(k, (n.get(k) ?? 0) + 1);
  }
  return [...n.entries()].map(([key, anzahl]) => ({ key, text: grundText(key), anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl || a.text.localeCompare(b.text, 'de'));
}

/** Quote „passt" an allen entschiedenen Qualifizierungen (ganze Prozent). */
export function passtQuote(zeilen: readonly { ergebnis?: string | null }[]): { passt: number; passtNicht: number; offen: number; quote: number | null } {
  let passt = 0, passtNicht = 0, offen = 0;
  for (const z of zeilen) {
    if (z?.ergebnis === 'passt') passt++;
    else if (z?.ergebnis === 'passt_nicht') passtNicht++;
    else offen++;
  }
  const ent = passt + passtNicht;
  return { passt, passtNicht, offen, quote: ent ? Math.round((passt / ent) * 100) : null };
}
