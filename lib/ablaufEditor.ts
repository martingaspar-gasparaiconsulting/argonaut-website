// ============================================================================
// ARGONAUT OS · lib/ablaufEditor.ts — Karten-Kette bearbeiten (Paket 158, 28.09.2026)
//
// Reine Baum-Operationen für den Ablauf-Baukasten: einen Schritt an einer
// Stelle einfügen („+" zwischen zwei Karten), ändern, entfernen, verschieben —
// auch in den Dann-/Sonst-Zweigen eines Wenn. Alles unveränderlich (neue
// Liste statt Umbau), damit React sauber neu zeichnet und nichts verrutscht.
// Dazu: neue Schritte mit Standardwerten, Bedingungsgruppen bearbeiten,
// Fassungen (Versionen) vergleichen.
// Rein, node-getestet.
// ============================================================================

import { aktionDef, triggerDef, type Bedingung } from './automation';
import {
  ablaufAktion, ABLAUF_AKTIONEN, GRENZEN, istGruppe, ausloeserHatVorgang, VORGANG_AKTIONEN,
  type Ablauf, type Ausloeser, type Schritt, type SchrittAktion, type BedingungsGruppe,
} from './ablauf';

// ---------------------------------------------------------------------------
// 1) Adressen: Liste „" (oben) oder „2.dann" / „2.dann.0.sonst"
// ---------------------------------------------------------------------------

/** Die Liste an einer Listen-Adresse (null = gibt es nicht). */
export function listeAn(schritte: readonly Schritt[], listePfad: string): readonly Schritt[] | null {
  if (!listePfad) return schritte;
  const teile = listePfad.split('.');
  let liste: readonly Schritt[] = schritte;
  for (let i = 0; i < teile.length; i += 2) {
    const idx = Number(teile[i]);
    const zweig = teile[i + 1];
    if (!Number.isInteger(idx) || idx < 0 || idx >= liste.length) return null;
    const s = liste[idx];
    if (s.typ !== 'wenn' || (zweig !== 'dann' && zweig !== 'sonst')) return null;
    liste = s[zweig];
  }
  return liste;
}

/** Eine Liste an einer Adresse durch eine neue ersetzen (Rest bleibt unberührt). */
function mitListe(schritte: readonly Schritt[], listePfad: string, neu: Schritt[]): Schritt[] {
  if (!listePfad) return neu;
  const teile = listePfad.split('.');
  const idx = Number(teile[0]);
  const zweig = teile[1] as 'dann' | 'sonst';
  const rest = teile.slice(2).join('.');
  return schritte.map((s, i) => {
    if (i !== idx || s.typ !== 'wenn') return s;
    return { ...s, [zweig]: mitListe(s[zweig], rest, neu) };
  });
}

/** Pfad „2.dann.1" -> Liste „2.dann", Index 1. */
export function zerlegePfad(pfad: string): { listePfad: string; index: number } {
  const teile = pfad.split('.');
  return { listePfad: teile.slice(0, -1).join('.'), index: Number(teile[teile.length - 1]) };
}

// ---------------------------------------------------------------------------
// 2) Einfügen, ändern, entfernen, verschieben
// ---------------------------------------------------------------------------

export function einfuegen(schritte: readonly Schritt[], listePfad: string, index: number, schritt: Schritt): Schritt[] {
  const liste = listeAn(schritte, listePfad);
  if (!liste) return [...schritte];
  const i = Math.max(0, Math.min(liste.length, Math.trunc(index)));
  return mitListe(schritte, listePfad, [...liste.slice(0, i), schritt, ...liste.slice(i)]);
}

export function ersetzen(schritte: readonly Schritt[], pfad: string, schritt: Schritt): Schritt[] {
  const { listePfad, index } = zerlegePfad(pfad);
  const liste = listeAn(schritte, listePfad);
  if (!liste) return [...schritte];
  return mitListe(schritte, listePfad, liste.map((s, i) => (i === index ? schritt : s)));
}

export function entfernen(schritte: readonly Schritt[], pfad: string): Schritt[] {
  const { listePfad, index } = zerlegePfad(pfad);
  const liste = listeAn(schritte, listePfad);
  if (!liste || index < 0 || index >= liste.length) return [...schritte];
  return mitListe(schritte, listePfad, liste.filter((_, i) => i !== index));
}

/** Innerhalb derselben Liste nach oben (-1) oder unten (+1). Am Rand: nichts. */
export function verschieben(schritte: readonly Schritt[], pfad: string, richtung: -1 | 1): Schritt[] {
  const { listePfad, index } = zerlegePfad(pfad);
  const liste = listeAn(schritte, listePfad);
  const ziel = index + richtung;
  if (!liste || index < 0 || index >= liste.length || ziel < 0 || ziel >= liste.length) return [...schritte];
  const neu = [...liste];
  [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
  return mitListe(schritte, listePfad, neu);
}

// ---------------------------------------------------------------------------
// 3) Neue Schritte mit Standardwerten
// ---------------------------------------------------------------------------

export function alleIds(schritte: readonly Schritt[]): string[] {
  const ids: string[] = [];
  const gehe = (l: readonly Schritt[]) => l.forEach((s) => { ids.push(s.id); if (s.typ === 'wenn') { gehe(s.dann); gehe(s.sonst); } });
  gehe(schritte);
  return ids;
}

/** Eine Kennung, die es in diesem Ablauf noch nicht gibt. */
export function neueId(schritte: readonly Schritt[]): string {
  const vorhanden = new Set(alleIds(schritte));
  let n = vorhanden.size + 1;
  while (vorhanden.has(`s${n}`)) n++;
  return `s${n}`;
}

/** Standard-Einstellungen einer Aktion (aus dem Automations-Katalog). */
export function standardConfig(aktion: string): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};
  for (const f of aktionDef(aktion)?.felder ?? []) if (f.standard !== undefined) cfg[f.key] = f.standard;
  return cfg;
}

export type NeuArt = 'aktion' | 'warten' | 'wenn' | 'stopp';

export function neuerSchritt(schritte: readonly Schritt[], art: NeuArt, aktion = 'aufgabe_anlegen', ersteFeld = 'titel'): Schritt {
  const id = neueId(schritte);
  if (art === 'warten') return { id, typ: 'warten', tage: 3 };
  if (art === 'stopp') return { id, typ: 'stopp' };
  if (art === 'wenn') return { id, typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [{ feld: ersteFeld, operator: 'nicht_leer' }] }, dann: [], sonst: [] };
  return { id, typ: 'aktion', aktion, config: standardConfig(aktion) };
}

/** Wie viele Schritte hat der Ablauf (alle Zweige)? Für die Grenze beim „+". */
export function anzahlSchritte(schritte: readonly Schritt[]): number {
  return alleIds(schritte).length;
}

/** Darf hier noch ein Schritt dazu? (Grenze Schritte, Tiefe bei Wenn) */
export function plusErlaubt(schritte: readonly Schritt[], listePfad: string, art: NeuArt): boolean {
  if (anzahlSchritte(schritte) >= GRENZEN.schritte) return false;
  const tiefe = listePfad ? listePfad.split('.').length / 2 + 1 : 1;
  return !(art === 'wenn' && tiefe >= GRENZEN.tiefe);
}

/**
 * Aktionen, die zum Auslöser passen — mit Kennzeichen „im Motor".
 * Mahnstufe nur bei Rechnungen; ohne Vorgang (Zeitplan, Knopf) keine
 * Aktionen, die einen Vorgang ändern (Paket 159).
 */
export function aktionenFuer(a: Ausloeser): { key: string; label: string; imMotor: boolean }[] {
  const t = a.art === 'datum' ? triggerDef(a.trigger) : undefined;
  const mitVorgang = ausloeserHatVorgang(a);
  return ABLAUF_AKTIONEN
    .filter((x) => {
      if (!mitVorgang && VORGANG_AKTIONEN.includes(x.key)) return false;
      const z = aktionDef(x.key)?.zielTypen;
      return !z || !t || z.includes(t.zielTyp);
    })
    .map((x) => ({ key: x.key, label: x.label, imMotor: x.imMotor }));
}

/** Neuer Auslöser beim Umschalten der Art — mit sinnvollen Startwerten. */
export function neuerAusloeser(art: 'datum' | 'zeitplan' | 'knopf'): Ausloeser {
  if (art === 'zeitplan') return { art: 'zeitplan', rhythmus: 'woechentlich', uhrzeit: '07:00', wochentag: 1, tag: 1 };
  if (art === 'knopf') return { art: 'knopf' };
  return { art: 'datum', trigger: 'rechnung_ueberfaellig', tage: 3, filter: null };
}

// ---------------------------------------------------------------------------
// 4) Bedingungsgruppen bearbeiten (Pfad „" = Gruppe selbst, „1" = Regel 1, „1.0" = verschachtelt)
// ---------------------------------------------------------------------------

type Eintrag = Bedingung | BedingungsGruppe;

function gruppeMit(g: BedingungsGruppe, pfad: string, tu: (x: BedingungsGruppe) => BedingungsGruppe): BedingungsGruppe {
  if (!pfad) return tu(g);
  const [kopf, ...rest] = pfad.split('.');
  const i = Number(kopf);
  return {
    ...g,
    regeln: g.regeln.map((r, j) => (j === i && istGruppe(r) ? gruppeMit(r, rest.join('.'), tu) : r)),
  };
}

export function bedingungDazu(g: BedingungsGruppe, gruppenPfad: string, b: Eintrag): BedingungsGruppe {
  return gruppeMit(g, gruppenPfad, (x) => ({ ...x, regeln: [...x.regeln, b] }));
}

export function bedingungAendern(g: BedingungsGruppe, gruppenPfad: string, index: number, b: Eintrag): BedingungsGruppe {
  return gruppeMit(g, gruppenPfad, (x) => ({ ...x, regeln: x.regeln.map((r, j) => (j === index ? b : r)) }));
}

export function bedingungWeg(g: BedingungsGruppe, gruppenPfad: string, index: number): BedingungsGruppe {
  return gruppeMit(g, gruppenPfad, (x) => ({ ...x, regeln: x.regeln.filter((_, j) => j !== index) }));
}

export function verknuepfungSetzen(g: BedingungsGruppe, gruppenPfad: string, v: 'und' | 'oder'): BedingungsGruppe {
  return gruppeMit(g, gruppenPfad, (x) => ({ ...x, verknuepfung: v }));
}

// ---------------------------------------------------------------------------
// 5) Fassungen (Versionen)
// ---------------------------------------------------------------------------

/** Was eine Fassung ausmacht — Name, Auslöser, Schritte (nicht: an/aus). */
export function fassung(a: Pick<Ablauf, 'name' | 'ausloeser' | 'schritte'>): string {
  return JSON.stringify({ name: String(a.name ?? '').trim(), ausloeser: a.ausloeser, schritte: a.schritte });
}

/** Neue Fassung nötig? Nur wenn sich Inhalt geändert hat (Beschreibung zählt nicht). */
export function neueFassungNoetig(alt: Pick<Ablauf, 'name' | 'ausloeser' | 'schritte'>, neu: Pick<Ablauf, 'name' | 'ausloeser' | 'schritte'>): boolean {
  return fassung(alt) !== fassung(neu);
}

/** Tiefe Kopie (für Vorlagen und Wiederherstellen — nie das Original bearbeiten). */
export function kopie<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** Für die Anzeige: Aktions-Einstellungen, die fehlen (Pflichtfelder). */
export function fehlendeFelder(s: SchrittAktion): string[] {
  const d = ablaufAktion(s.aktion);
  return (d?.pflicht ?? []).filter((p) => !String(s.config?.[p] ?? '').trim());
}
