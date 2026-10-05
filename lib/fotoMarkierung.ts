// ============================================================================
// ARGONAUT OS · lib/fotoMarkierung.ts — Paket 213 (05.10.2026) · Stufe 3 B6b
// Foto-Markierung im Bautagebuch: Pfeil, Kreis, Rahmen, Freihand, Text
//
// Mitbewerber-Abgleich (B6): Baudoku mit Markierungen auf dem Foto gehört bei
// führenden Mitbewerbern dazu. Im Bautagebuch ließ sich ein Foto bisher nur
// hochladen und ansehen — ein Mangel war auf dem Bild nicht zu zeigen.
//
// GRUNDSATZ: Das Original bleibt unverändert (Beweisfoto). Die markierte
// Fassung wird ZUSÄTZLICH als eigenes Foto abgelegt.
//
// Diese Datei rechnet nur (Maßstab, Pfeilspitze, Strichstärke, Dateiname);
// das Zeichnen auf dem Canvas macht die Komponente. Node-testbar.
// ============================================================================

export type Punkt = { x: number; y: number };
export type Werkzeug = 'pfeil' | 'kreis' | 'rahmen' | 'stift' | 'text';
export type Farbe = 'rot' | 'gelb' | 'weiss' | 'schwarz';

export const FARBEN: Record<Farbe, string> = {
  rot: '#E53935', gelb: '#FFD600', weiss: '#FFFFFF', schwarz: '#111111',
};

export type Form =
  | { art: 'pfeil' | 'kreis' | 'rahmen'; farbe: Farbe; von: Punkt; bis: Punkt }
  | { art: 'stift'; farbe: Farbe; punkte: Punkt[] }
  | { art: 'text'; farbe: Farbe; bei: Punkt; text: string };

/** Größte Kantenlänge der gespeicherten Fassung (Handyfotos haben oft 4000 px). */
export const MAX_KANTE = 2400;
export const MAX_TEXT = 80;
export const MAX_FORMEN = 200;

/** Zielgröße: nie größer als das Original, längste Kante höchstens MAX_KANTE. */
export function zielGroesse(breite: number, hoehe: number, max = MAX_KANTE): { breite: number; hoehe: number; faktor: number } {
  const b = Math.max(1, Math.round(breite || 0));
  const h = Math.max(1, Math.round(hoehe || 0));
  const faktor = Math.min(1, max / Math.max(b, h));
  return { breite: Math.max(1, Math.round(b * faktor)), hoehe: Math.max(1, Math.round(h * faktor)), faktor };
}

/** Strichstärke abhängig von der Bildgröße, damit sie auf jedem Foto gleich wirkt. */
export function strichstaerke(breite: number, hoehe: number): number {
  const kante = Math.max(breite, hoehe);
  return Math.max(3, Math.round(kante / 220));
}

/** Schriftgröße für Text-Markierungen. */
export function schriftgroesse(breite: number, hoehe: number): number {
  return Math.max(16, Math.round(Math.max(breite, hoehe) / 28));
}

/** Bildschirm-Koordinate (CSS-Pixel im angezeigten Canvas) → Bild-Koordinate. */
export function aufBild(p: Punkt, anzeige: { breite: number; hoehe: number }, bild: { breite: number; hoehe: number }): Punkt {
  const sx = anzeige.breite > 0 ? bild.breite / anzeige.breite : 1;
  const sy = anzeige.hoehe > 0 ? bild.hoehe / anzeige.hoehe : 1;
  return {
    x: Math.min(bild.breite, Math.max(0, Math.round(p.x * sx))),
    y: Math.min(bild.hoehe, Math.max(0, Math.round(p.y * sy))),
  };
}

/** Die zwei Eckpunkte der Pfeilspitze am Ziel „bis“. */
export function pfeilspitze(von: Punkt, bis: Punkt, laenge: number, winkelGrad = 28): [Punkt, Punkt] {
  const w = Math.atan2(bis.y - von.y, bis.x - von.x);
  const a = (winkelGrad * Math.PI) / 180;
  const r = (n: number) => Math.round(n * 100) / 100;
  return [
    { x: r(bis.x - laenge * Math.cos(w - a)), y: r(bis.y - laenge * Math.sin(w - a)) },
    { x: r(bis.x - laenge * Math.cos(w + a)), y: r(bis.y - laenge * Math.sin(w + a)) },
  ];
}

/** Ellipse aus zwei Ecken (Mittelpunkt + Radien). */
export function ellipse(von: Punkt, bis: Punkt): { cx: number; cy: number; rx: number; ry: number } {
  return {
    cx: (von.x + bis.x) / 2, cy: (von.y + bis.y) / 2,
    rx: Math.abs(bis.x - von.x) / 2, ry: Math.abs(bis.y - von.y) / 2,
  };
}

/** Zu kleine Formen (versehentliches Tippen) werden verworfen. */
export function formGueltig(f: Form, mindest = 6): boolean {
  if (f.art === 'stift') return Array.isArray(f.punkte) && f.punkte.length >= 2;
  if (f.art === 'text') return textSaeubern(f.text).length > 0;
  return Math.hypot(f.bis.x - f.von.x, f.bis.y - f.von.y) >= mindest;
}

export function textSaeubern(t: unknown): string {
  return String(t ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

/** Dateiname der markierten Fassung: „Foto.jpg“ → „Foto-markiert.jpg“. */
export function markiertName(original: string | null | undefined): string {
  const roh = String(original ?? '').trim() || 'foto';
  const ohneEndung = roh.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/-markiert(-\d+)?$/i, '');
  const sauber = ohneEndung.replace(/[^\p{L}\p{N}._ -]/gu, '_').slice(0, 80) || 'foto';
  return `${sauber}-markiert.jpg`;
}

/** Speicherpfad der markierten Fassung im selben Ordner wie das Original. */
export function markiertPfad(originalPfad: string, jetztMs: number): string | null {
  const p = String(originalPfad ?? '');
  const teile = p.split('/');
  if (teile.length < 3 || teile.some((t) => !t || t === '..')) return null;
  teile[teile.length - 1] = `${jetztMs}-markiert.jpg`;
  return teile.join('/');
}
