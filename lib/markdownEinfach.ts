// ============================================================================
// ARGONAUT OS · lib/markdownEinfach.ts
//
// Ein sehr kleiner Markdown-Wandler fuer die Kapiteltexte der Handbuecher.
//
// WARUM KEINE FERTIGE BIBLIOTHEK
// Die Kapitel benutzen genau vier Dinge: Absaetze, Zwischenueberschriften,
// Aufzaehlungen und Fettdruck. Dafuer eine Bibliothek einzubinden hiesse,
// eine fremde Abhaengigkeit in den PDF-Weg zu setzen — mit allem, was sie
// sonst noch kann (Bilder, Links, eingebettetes HTML). In ein PDF, das an
// Kunden geht, gehoert nichts, was ich nicht selbst gelesen habe.
//
// SICHERHEIT: ES WIRD IMMER ZUERST MASKIERT, DANN FORMATIERT.
// Die Texte kommen aus einem Sprachmodell und aus Martins Redaktion. Weder
// das eine noch das andere ist boeswillig — aber ein Kapitel ueber die
// E-Rechnung enthaelt frueher oder spaeter ein <XML-Beispiel>, und das darf
// das Seitenlayout nicht zerlegen. Nach esc() bleiben nur noch die
// Markdown-Zeichen uebrig, die wir selbst zu Auszeichnungen machen.
//
// Keine Imports, keine Hooks, kein Netz. Node-testbar.
// ============================================================================

/** Die drei Zeichen, die in HTML gefaehrlich sind. Nichts sonst wird angefasst. */
export function esc(s: string): string {
  return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
}

/** Fettdruck **so** — erst nach dem Maskieren, sonst waere es angreifbar. */
function betonung(maskiert: string): string {
  return maskiert.replace(/\*\*([^*\n]{1,200})\*\*/g, '<strong>$1</strong>');
}

/** Ist die Zeile ein Aufzaehlungspunkt? Erlaubt sind ·, -, *, •. */
function istPunkt(zeile: string): boolean {
  return /^\s*[·•*-]\s+/.test(zeile);
}

function punktText(zeile: string): string {
  return zeile.replace(/^\s*[·•*-]\s+/, '').trim();
}

/** Ist die Zeile eine Zwischenueberschrift (# bis ######)? */
function istUeberschrift(zeile: string): boolean {
  return /^\s*#{1,6}\s+\S/.test(zeile);
}

function ueberschriftText(zeile: string): string {
  return zeile.replace(/^\s*#{1,6}\s+/, '').trim();
}

/**
 * Markdown zu HTML. Bewusst schmal:
 *   ## Text     -> <h3>
 *   · Punkt     -> <ul><li>
 *   **fett**    -> <strong>
 *   Leerzeile   -> neuer Absatz
 * Alles andere ist Text.
 *
 * `klasse` haengt an jedem Absatz eine CSS-Klasse — damit das E-Book seine
 * eigene Typografie setzen kann, ohne dass dieser Wandler das Design kennt.
 */
export function markdownZuHtml(roh: string, klasse = ''): string {
  const zeilen = String(roh ?? '').replace(/\r\n/g, '\n').split('\n');
  const raus: string[] = [];
  const pKlasse = klasse ? ` class="${klasse}"` : '';

  let absatz: string[] = [];
  let liste: string[] = [];

  const absatzSchliessen = () => {
    if (absatz.length === 0) return;
    raus.push(`<p${pKlasse}>${betonung(esc(absatz.join(' ')))}</p>`);
    absatz = [];
  };
  const listeSchliessen = () => {
    if (liste.length === 0) return;
    raus.push(`<ul class="kliste">${liste.map((t) => `<li>${betonung(esc(t))}</li>`).join('')}</ul>`);
    liste = [];
  };

  for (const zeile of zeilen) {
    const t = zeile.trim();

    if (t === '') { absatzSchliessen(); listeSchliessen(); continue; }

    if (istUeberschrift(zeile)) {
      absatzSchliessen(); listeSchliessen();
      const text = ueberschriftText(zeile);
      if (text) raus.push(`<h3 class="kh">${betonung(esc(text))}</h3>`);
      continue;
    }

    if (istPunkt(zeile)) {
      absatzSchliessen();
      const text = punktText(zeile);
      if (text) liste.push(text);
      continue;
    }

    listeSchliessen();
    absatz.push(t);
  }

  absatzSchliessen();
  listeSchliessen();
  return raus.join('\n');
}

/**
 * Wieviele Woerter hat ein Kapitel? Fuer die Seitenschaetzung im
 * Inhaltsverzeichnis — Markdown-Zeichen zaehlen nicht mit.
 */
export function woerter(roh: string): number {
  const t = String(roh ?? '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>·•]/g, ' ')
    .trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

/** Grobe Seitenzahl bei rund 480 Woertern je Seite. Immer mindestens 1. */
export function seiten(roh: string, jeSeite = 480): number {
  const w = woerter(roh);
  if (w === 0) return 1;
  return Math.max(1, Math.ceil(w / Math.max(1, jeSeite)));
}
