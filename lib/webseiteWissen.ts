// ============================================================================
// ARGONAUT OS · lib/webseiteWissen.ts  (Stufe 3 · B3 Website-Texte aus Firmenwissen, Paket 207)
//
// Reine Logik (ohne Datenbank) für „Komplett mit KI" im Website-Bauer.
//
// Claude-Befunde 05.10.2026 (vorher):
//   1. Die KI schrieb nur aus Firmenname, Slogan, Über-uns, Kernsätzen und der
//      Story — Leistungskatalog und Firmen-Dokumente blieben ungenutzt, die
//      Leistungen auf der Seite waren deshalb oft geraten.
//   2. Die KI erzeugte IMMER einen Baustein „Kundenstimmen" mit ausgedachten
//      Bewertungen (Name „Zufriedener Kunde", Zusatz „Beispiel-Bewertung"), die
//      so auf die öffentliche Seite gingen. Erfundene Bewertungen sind
//      unlauter. Jetzt: an dieser Stelle der Baustein „Live-Bewertungen", der
//      nur echte, freigegebene Bewertungen zeigt.
//
// Geländer: Firmen-Dokumente mit vertraulich klingendem Namen (Vertrag, Lohn,
// Personal, Bank, Steuer, Zugangsdaten …) gehen NIE in einen Website-Text —
// die Seite ist öffentlich. Preise aus dem Leistungskatalog gehen nicht mit.
// ============================================================================

import { sensiblerName } from './firmenWissen';

export const MAX_LEISTUNGEN = 30;
export const MAX_WISSEN_ZEICHEN = 6000;
export const MAX_AUSZUG_ZEICHEN = 1200;

const s = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Suchtext für die Firmen-Dokumente (Leistungen, Über uns, Stärken). */
export function wissensSuche(zweck: unknown, branche: unknown): string {
  return [s(branche), s(zweck), 'Leistungen Angebot Über uns Stärken Erfahrung Region Kunden Vorteile'].filter(Boolean).join(' ');
}

export type LeistungZeile = { bezeichnung?: string | null; kategorie?: string | null; aktiv?: boolean | null };

/** Leistungen als Liste, nach Kategorie gruppiert, ohne Preise, ohne Doppelte. */
export function leistungenText(rows: LeistungZeile[] | null | undefined, max = MAX_LEISTUNGEN): { text: string; anzahl: number } {
  const gruppen = new Map<string, string[]>();
  const gesehen = new Set<string>();
  let n = 0;
  for (const r of rows ?? []) {
    if (!r || r.aktiv === false) continue;
    const b = s(r.bezeichnung).slice(0, 120);
    if (!b) continue;
    const key = b.toLowerCase();
    if (gesehen.has(key)) continue;
    if (n >= max) break;
    gesehen.add(key);
    n++;
    const k = s(r.kategorie) || 'Allgemein';
    gruppen.set(k, [...(gruppen.get(k) ?? []), b]);
  }
  const text = Array.from(gruppen.entries()).map(([k, l]) => `${k}: ${l.join('; ')}`).join('\n');
  return { text, anzahl: n };
}

export type Treffer = { document_id: string; content: string };

export type WissensAuszug = {
  text: string;
  /** Verwendete Dokumente (Dateinamen). */
  quellen: string[];
  /** Bewusst ausgelassene, vertraulich klingende Dokumente (Dateinamen). */
  ausgelassen: string[];
};

/** Treffer aus den Firmen-Dokumenten: vertrauliche raus, gekürzt, mit Quelle. */
export function wissensAuszug(
  treffer: Treffer[] | null | undefined,
  namen: Record<string, string>,
  maxGesamt = MAX_WISSEN_ZEICHEN,
): WissensAuszug {
  const quellen: string[] = [];
  const ausgelassen: string[] = [];
  const teile: string[] = [];
  let laenge = 0;
  const gesehen = new Set<string>();
  for (const t of treffer ?? []) {
    if (!t || !t.document_id) continue;
    const name = s(namen[t.document_id]) || 'Dokument';
    if (sensiblerName(name)) {
      if (!ausgelassen.includes(name)) ausgelassen.push(name);
      continue;
    }
    const inhalt = s(t.content).slice(0, MAX_AUSZUG_ZEICHEN);
    if (!inhalt || gesehen.has(inhalt)) continue;
    const stueck = `[${name}]\n${inhalt}`;
    if (laenge + stueck.length > maxGesamt) break;
    gesehen.add(inhalt);
    teile.push(stueck);
    laenge += stueck.length + 2;
    if (!quellen.includes(name)) quellen.push(name);
  }
  return { text: teile.join('\n\n'), quellen, ausgelassen };
}

/** Rückmeldung an den Betrieb: woraus die Texte geschrieben wurden. */
export function quellenHinweis(o: { leistungen: number; quellen: string[]; ausgelassen: string[]; wissenGenutzt: boolean }): string {
  const teile = ['Ihre Firmendaten'];
  if (o.leistungen > 0) teile.push(`${o.leistungen} ${o.leistungen === 1 ? 'Leistung' : 'Leistungen'} aus dem Leistungskatalog`);
  if (o.quellen.length) teile.push(`${o.quellen.length} ${o.quellen.length === 1 ? 'Firmen-Dokument' : 'Firmen-Dokumente'} (${o.quellen.slice(0, 3).join(', ')}${o.quellen.length > 3 ? ' …' : ''})`);
  let t = `Fertig — geschrieben aus: ${teile.join(', ')}.`;
  if (o.ausgelassen.length) t += ` ${o.ausgelassen.length} vertraulich klingende${o.ausgelassen.length === 1 ? 's Dokument wurde' : ' Dokumente wurden'} bewusst nicht verwendet.`;
  if (!o.wissenGenutzt) t += ' Firmenwissen war ausgeschaltet.';
  t += ' Bitte lesen Sie die Texte vor dem Veröffentlichen.';
  return t;
}

type J = Record<string, unknown>;

/**
 * Nach der KI: ausgedachte Kundenstimmen durch den Baustein „Live-Bewertungen"
 * ersetzen (zeigt nur echte, freigegebene Bewertungen). Höchstens einer.
 */
export function ohneErfundeneBewertungen(bloecke: J[]): J[] {
  const aus: J[] = [];
  let hatLive = false;
  for (const b of bloecke ?? []) {
    if (b?.typ === 'testimonials' || b?.typ === 'bewertungen') {
      if (hatLive) continue;
      hatLive = true;
      aus.push({ typ: 'bewertungen', eyebrow: s(b.eyebrow) || 'Bewertungen', titel: s(b.titel) || 'Das sagen unsere Kunden' });
      continue;
    }
    aus.push(b);
  }
  return aus;
}
