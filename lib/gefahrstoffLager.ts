// ============================================================================
// ARGONAUT OS · lib/gefahrstoffLager.ts — Gefahrstoffverzeichnis 2.0 (Paket 318 · G2a)
//
// Ergänzt das Verzeichnis (lib/qualitaet.ts, § 6 GefStoffV) um:
//   · Lagerklasse nach TRGS 510 — nur als Feld. Die Zusammenlagerungs-Ampel
//     ist ein eigener Baustein (G2c) und kommt erst nach der Rechtsprüfung.
//   · Verknüpfung mit dem Artikel: Menge aus dem Lager, Vorschlag für den
//     Mengenbereich, Sicherheitsdatenblatt aus den Produkt-Dokumenten (P315)
//   · eigene SDB-Datei für Stoffe ohne Artikel (Speicher „gefahrstoff-sdb")
//   · Erinnerung, wenn das Sicherheitsdatenblatt alt ist
//   · Lagerplatz (für den QR-Aushang, Teil 2)
//
// Ehrlich: ARGONAUT stuft nichts ein. Lagerklasse, H-Sätze und Fassung kommen
// aus dem Sicherheitsdatenblatt (Abschnitt 2 und 7) — der Betrieb trägt ein.
//
// Rein, ohne Supabase — node-getestet (tests/gefahrstoffP318.test.mjs).
// ============================================================================

import { sichererName, dateiPruefen, MAX_BYTES } from './produktDokumente';
import { leseZahl } from './zahlen';

export { dateiPruefen, MAX_BYTES };

export type Lagerklasse = { key: string; label: string };

/** Lagerklassen nach TRGS 510 (Anlage 4) — gleiche Liste wie der Datenbank-Wächter (SQL p318). */
export const LAGERKLASSEN: Lagerklasse[] = [
  { key: '1', label: 'Explosive Gefahrstoffe' },
  { key: '2A', label: 'Gase (außer Aerosole und Feuerzeuge)' },
  { key: '2B', label: 'Aerosolpackungen und Feuerzeuge' },
  { key: '3', label: 'Entzündbare Flüssigkeiten' },
  { key: '4.1A', label: 'Sonstige explosionsgefährliche Gefahrstoffe' },
  { key: '4.1B', label: 'Entzündbare feste Gefahrstoffe' },
  { key: '4.2', label: 'Pyrophore oder selbsterhitzungsfähige Gefahrstoffe' },
  { key: '4.3', label: 'Gefahrstoffe, die mit Wasser entzündbare Gase entwickeln' },
  { key: '5.1A', label: 'Stark oxidierende Gefahrstoffe' },
  { key: '5.1B', label: 'Oxidierende Gefahrstoffe' },
  { key: '5.1C', label: 'Ammoniumnitrat und ammoniumnitrathaltige Zubereitungen' },
  { key: '5.2', label: 'Organische Peroxide und selbstzersetzliche Gefahrstoffe' },
  { key: '6.1A', label: 'Brennbare, akut toxische Gefahrstoffe Kat. 1 und 2' },
  { key: '6.1B', label: 'Nicht brennbare, akut toxische Gefahrstoffe Kat. 1 und 2' },
  { key: '6.1C', label: 'Brennbare, akut toxische Kat. 3 bzw. chronisch wirkende Gefahrstoffe' },
  { key: '6.1D', label: 'Nicht brennbare, akut toxische Kat. 3 bzw. chronisch wirkende Gefahrstoffe' },
  { key: '6.2', label: 'Ansteckungsgefährliche Stoffe' },
  { key: '7', label: 'Radioaktive Stoffe' },
  { key: '8A', label: 'Brennbare ätzende Gefahrstoffe' },
  { key: '8B', label: 'Nicht brennbare ätzende Gefahrstoffe' },
  { key: '10', label: 'Brennbare Flüssigkeiten (soweit nicht LGK 3)' },
  { key: '11', label: 'Brennbare Feststoffe' },
  { key: '12', label: 'Nicht brennbare Flüssigkeiten' },
  { key: '13', label: 'Nicht brennbare Feststoffe' },
];

export function istLagerklasse(k: unknown): k is string {
  return typeof k === 'string' && LAGERKLASSEN.some((l) => l.key === k);
}

export function lagerklasseText(k: unknown): string {
  const l = LAGERKLASSEN.find((x) => x.key === k);
  return l ? `LGK ${l.key} · ${l.label}` : '—';
}

// ---------------------------------------------------------------------------
// Menge aus dem Lager
// ---------------------------------------------------------------------------

/** Einheit → Faktor auf kg bzw. l. Andere Einheiten (Stk, Gebinde, Karton …) lassen sich nicht umrechnen. */
const FAKTOR: Record<string, number> = {
  kg: 1, g: 0.001, mg: 0.000001, t: 1000, to: 1000,
  l: 1, ltr: 1, liter: 1, ml: 0.001, cl: 0.01, hl: 100, m3: 1000, 'm³': 1000,
};

/** Bestand aus der Datenbank (numeric kommt als Zahl) — sonst über den zentralen Leser lib/zahlen. */
export function bestandZahl(bestand: unknown): number | null {
  if (typeof bestand === 'number') return Number.isFinite(bestand) ? bestand : null;
  if (bestand === null || bestand === undefined || bestand === '') return null;
  return leseZahl(bestand);
}

/** Bestand in kg bzw. l — null, wenn die Einheit kein Gewicht/Volumen ist oder der Bestand fehlt. */
export function mengeKgL(bestand: unknown, einheit: unknown): number | null {
  const e = String(einheit ?? '').trim().toLowerCase().replace(/\.$/, '');
  const f = FAKTOR[e];
  if (f === undefined) return null;
  const n = bestandZahl(bestand);
  if (n === null) return null;
  return Math.max(0, n) * f;
}

/** Mengenbereich (wie lib/qualitaet MENGENBEREICHE) passend zur Menge in kg/l. Grenzen: bis 1 · bis 10 · bis 100 · bis 1.000 · darüber. */
export function mengenbereichAus(kgL: number | null): string | null {
  if (kgL === null || !Number.isFinite(kgL)) return null;
  if (kgL <= 1) return 'bis 1 kg/l';
  if (kgL <= 10) return '1–10 kg/l';
  if (kgL <= 100) return '10–100 kg/l';
  if (kgL <= 1000) return '100–1.000 kg/l';
  return 'über 1.000 kg/l';
}

export type LagerInfo = { text: string; vorschlag: string | null; abweichung: boolean };

/**
 * Was das Lager zum Stoff sagt. Der Mengenbereich wird nie automatisch
 * überschrieben — nur vorgeschlagen; weicht der eingetragene ab, gibt es
 * einen Hinweis (gelb), keinen Fehler: Der Bestand schwankt.
 */
export function lagerInfo(bestand: unknown, einheit: unknown, eingetragen: unknown): LagerInfo {
  const e = String(einheit ?? '').trim();
  const n = bestandZahl(bestand);
  if (n === null) {
    return { text: 'Bestand im Lager nicht gepflegt', vorschlag: null, abweichung: false };
  }
  const menge = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(n);
  const kgl = mengeKgL(n, e);
  const vorschlag = mengenbereichAus(kgl);
  const text = vorschlag
    ? `Bestand laut Lager: ${menge} ${e || ''}`.trim()
    : `Bestand laut Lager: ${menge} ${e || ''} — Einheit lässt sich nicht in kg/l umrechnen, Mengenbereich bitte selbst schätzen`.replace(/\s+—/, ' —');
  const ein = String(eingetragen ?? '').trim();
  return { text, vorschlag, abweichung: !!vorschlag && !!ein && ein !== vorschlag };
}

// ---------------------------------------------------------------------------
// Sicherheitsdatenblatt: eigene Datei oder aus dem verknüpften Artikel
// ---------------------------------------------------------------------------

/** Speicher-Pfad der eigenen SDB-Datei: <Betrieb>/<Stoff>/<zufall>-<name>.pdf (wie der Wächter in SQL p318). */
export function sdbPfad(betrieb: string, stoffId: string, dateiname: string, zufall: string): string {
  const z = String(zufall ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'x';
  return `${betrieb}/${stoffId}/${z}-${sichererName(dateiname)}`;
}

export function sdbPfadPasst(pfad: unknown, betrieb: string, stoffId: string): boolean {
  if (typeof pfad !== 'string' || !betrieb || !stoffId) return false;
  if (pfad.includes('..') || pfad.includes('\\') || pfad.includes('//')) return false;
  const t = pfad.split('/');
  return t.length === 3 && t[0] === betrieb && t[1] === stoffId && /^[A-Za-z0-9]+-[a-z0-9._-]+\.pdf$/.test(t[2]);
}

export type ArtikelSdb = { id: string; sprache?: string | null; ausgabe_am?: string | null; aktuell?: boolean | null; art?: string | null; gueltig_bis?: string | null; datei_pfad?: string | null };

/**
 * Das passende SDB des verknüpften Artikels: nur aktuelle Fassungen,
 * Deutsch vor allen anderen Sprachen, dann die neueste Ausgabe.
 */
export function besteArtikelSdb<T extends ArtikelSdb>(liste: T[] | null | undefined): T | null {
  const kandidaten = (liste ?? []).filter((d) => d && d.art === 'sdb' && d.aktuell !== false);
  if (kandidaten.length === 0) return null;
  return [...kandidaten].sort((a, b) =>
    (a.sprache === 'de' ? 0 : 1) - (b.sprache === 'de' ? 0 : 1)
    || String(b.ausgabe_am ?? '').localeCompare(String(a.ausgabe_am ?? ''))
    || String(a.id).localeCompare(String(b.id)))[0];
}

export type SdbQuelle = { art: 'datei' | 'artikel' | 'keine'; text: string };

/** Woher das SDB kommt — die eigene Datei geht vor (bewusst hochgeladen), sonst der Artikel. */
export function sdbQuelle(g: { sdb_pfad?: string | null; sdb_name?: string | null }, artikelSdb: ArtikelSdb | null): SdbQuelle {
  if (g.sdb_pfad) return { art: 'datei', text: `eigene Datei: ${String(g.sdb_name ?? 'Sicherheitsdatenblatt.pdf')}` };
  if (artikelSdb) return { art: 'artikel', text: `aus dem Artikel${artikelSdb.sprache && artikelSdb.sprache !== 'de' ? `, Sprache ${String(artikelSdb.sprache).toUpperCase()}` : ''}` };
  return { art: 'keine', text: 'keine Datei hinterlegt' };
}

// ---------------------------------------------------------------------------
// Erinnerung bei altem Sicherheitsdatenblatt
// ---------------------------------------------------------------------------

/** Nach so vielen Jahren nach der Fassung wird nach dem aktuellen SDB gefragt (Richtwert wie P315). */
export const SDB_ALTER_JAHRE = 3;

function istTag(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function jahrePlus(tag: string, jahre: number): string {
  const [j, m, t] = tag.split('-').map(Number);
  const d = new Date(Date.UTC(j + jahre, m - 1, t));
  if (d.getUTCMonth() !== m - 1) d.setUTCDate(0); // 29.02. -> 28.02.
  return d.toISOString().slice(0, 10);
}

/** Tag, an dem nach der neuen Fassung gefragt wird: Fassung + 3 Jahre, frühestens heute. Ohne Fassung: heute. */
export function sdbErinnerungsTag(sdbDatum: unknown, heute: string): string {
  if (!istTag(sdbDatum)) return heute;
  const t = jahrePlus(sdbDatum, SDB_ALTER_JAHRE);
  return t < heute ? heute : t;
}

export function sdbIstAlt(sdbDatum: unknown, heute: string): boolean {
  return istTag(sdbDatum) && jahrePlus(sdbDatum, SDB_ALTER_JAHRE) < heute;
}

export function erinnerungsTitel(bezeichnung: unknown, sdbDatum: unknown): string {
  const name = String(bezeichnung ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Gefahrstoff';
  if (!istTag(sdbDatum)) return `${name}: Sicherheitsdatenblatt anfordern`;
  const [j, m, t] = String(sdbDatum).split('-');
  return `${name}: aktuelles Sicherheitsdatenblatt anfordern (Fassung vom ${t}.${m}.${j})`.slice(0, 200);
}

// ---------------------------------------------------------------------------
// Zusatz-Hinweise fürs Verzeichnis (zu pruefeGefahrstoff aus lib/qualitaet)
// ---------------------------------------------------------------------------

export type Zusatz = {
  lagerklasse?: string | null;
  lagerplatz?: string | null;
  sdbVorhanden: boolean;
  lager?: LagerInfo | null;
};

/** Nur Hinweise (gelb), nie neue Pflichtfehler — die Pflichtangaben des § 6 bleiben in pruefeGefahrstoff. */
export function zusatzHinweise(z: Zusatz): string[] {
  const h: string[] = [];
  if (!z.sdbVorhanden) h.push('Sicherheitsdatenblatt als Datei hinterlegen — dann können es alle am Handy öffnen');
  if (!istLagerklasse(z.lagerklasse)) h.push('Lagerklasse fehlt (Abschnitt 7 des Sicherheitsdatenblatts)');
  if (!String(z.lagerplatz ?? '').trim()) h.push('Lagerplatz fehlt — wird für den QR-Aushang gebraucht');
  if (z.lager?.abweichung && z.lager.vorschlag) h.push(`Lagerbestand passt eher zu „${z.lager.vorschlag}" — Mengenbereich prüfen`);
  return h;
}

/** Lagerplatz säubern wie die Datenbank: Leerzeichen zusammenziehen, 80 Zeichen. */
export function lagerplatzSauber(s: unknown): string | null {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return t || null;
}
