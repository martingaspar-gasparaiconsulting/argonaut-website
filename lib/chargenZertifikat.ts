// ============================================================================
// ARGONAUT OS · lib/chargenZertifikat.ts — Prüfzertifikat je Charge (Paket 320 · Q1)
//
// Aus dem vorhandenen Prüfplan einer Charge (charge_pruefung + charge_merkmal)
// entsteht ein Zertifikat für den Kunden:
//   · Analysenzertifikat (Certificate of Analysis) — Chemie, Lebensmittel, Kosmetik
//   · Abnahmeprüfzeugnis 3.1 nach EN 10204 — Metall, Kunststoff, Bauteile
//     (bestätigt von einem vom Fertigungsbereich unabhängigen Abnahmebeauftragten)
// Anders als der interne „Nachweis" (lib/chargenPdf) zeigt das Zertifikat KEINE
// Lieferanten, Abnehmer oder Rohstoff-Chargen — nur Produkt, Charge, Prüfung.
//
// Ehrlich und streng (fail-closed): ein Zertifikat gibt es nur, wenn
//   · die Charge „freigegeben" ist,
//   · die gewählte Prüfung mindestens ein Merkmal hat,
//   · JEDES Merkmal Soll- und Istwert hat und in der Toleranz liegt.
// ARGONAUT prüft nichts selbst — es bescheinigt nur, was der Betrieb gemessen hat.
//
// Sperre für Rohstoffe: Chargen in Quarantäne oder gesperrt dürfen nicht
// verwendet werden (Datenbank-Wächter p320 auf charge_verwendung).
//
// Rein, ohne Importe — node-getestet (tests/chargenZertifikatP320.test.mjs).
// ============================================================================

export type ZertArt = 'coa' | 'abnahme31';

export const ZERT_ARTEN: { key: ZertArt; label: string; kurz: string; hinweis: string }[] = [
  { key: 'coa', label: 'Analysenzertifikat', kurz: 'CoA', hinweis: 'Für Chemie, Lebensmittel, Kosmetik: Prüfergebnisse der Charge gegen die Spezifikation.' },
  { key: 'abnahme31', label: 'Abnahmeprüfzeugnis 3.1 nach EN 10204', kurz: '3.1', hinweis: 'Für Metall, Kunststoff, Bauteile: spezifische Prüfung, bestätigt von einem Abnahmebeauftragten, der vom Fertigungsbereich unabhängig ist.' },
];

export function zertArt(k: unknown): ZertArt {
  return k === 'abnahme31' ? 'abnahme31' : 'coa';
}

export type MerkmalZ = {
  merkmal?: string | null;
  sollwert?: number | null;
  toleranz_minus?: number | null;
  toleranz_plus?: number | null;
  istwert?: number | null;
  einheit?: string | null;
};

export type PruefungZ = { id: string; art?: string | null; datum?: string | null; pruefer?: string | null };

function endlich(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Zahl deutsch, bis 6 Nachkommastellen, ohne Rundungsartefakte (0,1 + 0,2). */
export function zahlDe(x: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 6, useGrouping: true }).format(Number(x.toPrecision(12)));
}

/** Grenzen eines Merkmals [min, max] — Toleranzen zählen als Betrag (wie lib/chargen.merkmalStatus). */
export function grenzen(m: MerkmalZ): { min: number; max: number } | null {
  if (!endlich(m.sollwert)) return null;
  const minus = endlich(m.toleranz_minus) ? Math.abs(m.toleranz_minus) : 0;
  const plus = endlich(m.toleranz_plus) ? Math.abs(m.toleranz_plus) : 0;
  return { min: Number((m.sollwert - minus).toPrecision(12)), max: Number((m.sollwert + plus).toPrecision(12)) };
}

/** Spezifikation als Text: „98,5 – 101,5 %", ohne Toleranz „= 7 pH". */
export function spezText(m: MerkmalZ): string {
  const g = grenzen(m);
  const e = String(m.einheit ?? '').trim();
  if (!g) return '—';
  const t = g.min === g.max ? `= ${zahlDe(g.min)}` : `${zahlDe(g.min)} – ${zahlDe(g.max)}`;
  return e ? `${t} ${e}` : t;
}

export function istText(m: MerkmalZ): string {
  if (!endlich(m.istwert)) return '—';
  const e = String(m.einheit ?? '').trim();
  return e ? `${zahlDe(m.istwert)} ${e}` : zahlDe(m.istwert);
}

/** Merkmal in der Spezifikation? null = nicht bewertbar (Soll oder Ist fehlt). */
export function merkmalOk(m: MerkmalZ): boolean | null {
  const g = grenzen(m);
  if (!g || !endlich(m.istwert)) return null;
  const EPS = 1e-9;
  return m.istwert >= g.min - EPS && m.istwert <= g.max + EPS;
}

/** Darf für diese Charge und Prüfung ein Zertifikat entstehen? Gründe in Klartext. */
export function zertifikatPruefen(chargeStatus: unknown, pruefung: PruefungZ | null | undefined, merkmale: MerkmalZ[] | null | undefined): { ok: boolean; gruende: string[] } {
  const gruende: string[] = [];
  if (chargeStatus !== 'freigegeben') gruende.push('Die Charge ist nicht freigegeben — erst nach bestandener Prüfung freigeben.');
  if (!pruefung) gruende.push('Keine Prüfung gewählt.');
  const ms = merkmale ?? [];
  if (pruefung && ms.length === 0) gruende.push('Die Prüfung hat keine Merkmale.');
  ms.forEach((m) => {
    const name = String(m.merkmal ?? '').trim() || 'Merkmal';
    const ok = merkmalOk(m);
    if (ok === null) gruende.push(`${name}: Soll- oder Istwert fehlt.`);
    else if (!ok) gruende.push(`${name}: außerhalb der Spezifikation (${istText(m)} statt ${spezText(m)}).`);
  });
  if (pruefung && !/^\d{4}-\d{2}-\d{2}/.test(String(pruefung.datum ?? ''))) gruende.push('Das Prüfdatum fehlt.');
  return { ok: gruende.length === 0, gruende };
}

/**
 * Vorschlag: die jüngste Prüfung, die ein Zertifikat trägt — Endprüfung vor
 * Zwischenprüfung vor Wareneingang, bei gleicher Art die neueste.
 */
export function bestePruefung(pruefungen: PruefungZ[] | null | undefined, merkmaleJe: Record<string, MerkmalZ[]>): PruefungZ | null {
  const rang: Record<string, number> = { endpruefung: 0, zwischen: 1, wareneingang: 2 };
  const passend = (pruefungen ?? []).filter((p) => zertifikatPruefen('freigegeben', p, merkmaleJe[p.id] ?? []).ok);
  passend.sort((a, b) => (rang[String(a.art)] ?? 3) - (rang[String(b.art)] ?? 3) || String(b.datum ?? '').localeCompare(String(a.datum ?? '')));
  return passend[0] ?? null;
}

/** Freigabe ohne bestandene Prüfung? Dann muss die Geschäftsleitung bewusst bestätigen. */
export function freigabeOhnePruefung(pruefungen: PruefungZ[] | null | undefined, merkmaleJe: Record<string, MerkmalZ[]>): boolean {
  return bestePruefung(pruefungen, merkmaleJe) === null;
}

/** Status, in denen eine Charge nicht verwendet oder ausgeliefert werden darf (wie SQL p320). */
export const GESPERRTE_STATUS = ['quarantaene', 'gesperrt'] as const;

export function istGesperrt(status: unknown): boolean {
  return typeof status === 'string' && (GESPERRTE_STATUS as readonly string[]).includes(status);
}

/** Zertifikat-Nummer: Charge + Prüfdatum (stabil — zweimal gedruckt = dieselbe Nummer). */
export function zertNummer(chargeNr: unknown, pruefDatum: unknown, art: ZertArt): string {
  const c = String(chargeNr ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'CHARGE';
  const d = String(pruefDatum ?? '').slice(0, 10).replace(/-/g, '') || '00000000';
  return `${art === 'abnahme31' ? 'APZ' : 'COA'}-${c}-${d}`;
}

/** Freitext aus der Adresszeile kürzen und säubern (Kunde, Bestellnummer, Namen). */
export function feldText(x: unknown, max = 120): string {
  return String(Array.isArray(x) ? x[0] ?? '' : x ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Konformitätserklärung je Art — Claude-Formulierung, vor Gebrauch fachlich prüfen lassen (Kontrollgang). */
export function erklaerung(art: ZertArt): string {
  return art === 'abnahme31'
    ? 'Wir bestätigen, dass die gelieferten Erzeugnisse den Vereinbarungen bei der Bestellung entsprechen. Die angegebenen Prüfergebnisse wurden an der genannten Charge ermittelt (spezifische Prüfung).'
    : 'Die oben genannte Charge wurde geprüft. Alle angegebenen Merkmale liegen innerhalb der Spezifikation.';
}
