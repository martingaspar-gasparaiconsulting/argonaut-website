// ============================================================================
// ARGONAUT OS · lib/kfzMedien.ts — Paket 262 (07.10.2026) · K3 Fotos und Medien
//
// Reine Logik für Fahrzeugfotos und -videos im Handelsbestand: Aufnahme-
// Schablone (welche Ansichten fehlen noch?), Datei-Prüfung, Ablagepfad,
// Reihenfolge per Ziehen oder Pfeilen. Speicherordner „fahrzeug-medien",
// Pfad immer <Betrieb>/<Fahrzeug>/<Datei> — der Speicher-Wächter (P258) zählt
// damit automatisch zum Betrieb.
// KEINE Imports, KEINE Hooks, kein Date.now() (Zeit als Parameter).
// ============================================================================

export const MEDIEN_BUCKET = 'fahrzeug-medien';
export const FOTO_MAX_MB = 25;     // vor dem Verkleinern im Browser
export const VIDEO_MAX_MB = 50;    // = Grenze des Speicherordners
export const FOTO_TYPEN = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
export const VIDEO_TYPEN = ['video/mp4', 'video/quicktime', 'video/webm'];

/** Aufnahme-Schablone: die Ansichten, die ein gutes Fahrzeuginserat braucht (Reihenfolge = Inserat). */
export const SCHABLONE: { key: string; name: string; tipp: string }[] = [
  { key: 'front_links', name: 'Front schräg links', tipp: 'Titelbild: ganzes Fahrzeug, leicht von vorn links, auf Scheinwerferhöhe' },
  { key: 'seite_links', name: 'Seite links', tipp: 'Genau von der Seite, ganzes Fahrzeug im Bild' },
  { key: 'heck_links', name: 'Heck schräg links', tipp: 'Von hinten links, gleiche Höhe wie das Titelbild' },
  { key: 'heck', name: 'Heck', tipp: 'Gerade von hinten' },
  { key: 'heck_rechts', name: 'Heck schräg rechts', tipp: 'Von hinten rechts' },
  { key: 'seite_rechts', name: 'Seite rechts', tipp: 'Genau von der Seite' },
  { key: 'front', name: 'Front', tipp: 'Gerade von vorn' },
  { key: 'cockpit', name: 'Cockpit', tipp: 'Von der Rückbank zwischen den Sitzen, Lenkrad und Mittelkonsole' },
  { key: 'tacho', name: 'Tacho mit km-Stand', tipp: 'Zündung an, km-Stand gut lesbar' },
  { key: 'sitze_vorn', name: 'Sitze vorn', tipp: 'Durch die offene Fahrertür' },
  { key: 'sitze_hinten', name: 'Rücksitze', tipp: 'Durch die offene hintere Tür' },
  { key: 'kofferraum', name: 'Kofferraum', tipp: 'Klappe offen, Ladefläche leer' },
  { key: 'motor', name: 'Motorraum', tipp: 'Haube offen, von vorn' },
  { key: 'felge', name: 'Felge und Reifen', tipp: 'Ein Rad von nah, Profil sichtbar' },
];

export type Medium = { id: string; art: string; schablone: string | null; position: number };

/** Welche Schablonen-Ansichten sind belegt, welche fehlen? */
export function schabloneStand(medien: Pick<Medium, 'art' | 'schablone'>[]): { belegt: string[]; fehlt: string[]; prozent: number } {
  const da = new Set(medien.filter((m) => m.art === 'foto' && m.schablone).map((m) => m.schablone as string));
  const belegt = SCHABLONE.filter((s) => da.has(s.key)).map((s) => s.key);
  const fehlt = SCHABLONE.filter((s) => !da.has(s.key)).map((s) => s.key);
  return { belegt, fehlt, prozent: Math.round((belegt.length / SCHABLONE.length) * 100) };
}

/** Datei prüfen, bevor sie hochgeladen wird. Leerer Typ (HEIC unter Windows) zählt über die Endung. */
export function pruefeMedium(art: 'foto' | 'video', name: string, typ: string, groesse: number): { ok: true } | { ok: false; fehler: string } {
  const endung = (String(name).split('.').pop() || '').toLowerCase();
  const t = String(typ || '').toLowerCase();
  if (art === 'foto') {
    const passt = FOTO_TYPEN.includes(t) || (!t && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(endung));
    if (!passt) return { ok: false, fehler: 'Bitte ein Foto als JPG, PNG, WebP oder HEIC.' };
    if (groesse > FOTO_MAX_MB * 1024 * 1024) return { ok: false, fehler: `Das Foto ist größer als ${FOTO_MAX_MB} MB.` };
    return { ok: true };
  }
  const passt = VIDEO_TYPEN.includes(t) || (!t && ['mp4', 'mov', 'webm'].includes(endung));
  if (!passt) return { ok: false, fehler: 'Bitte ein Video als MP4, MOV oder WebM.' };
  if (groesse > VIDEO_MAX_MB * 1024 * 1024) return { ok: false, fehler: `Das Video ist größer als ${VIDEO_MAX_MB} MB. Bitte kürzen oder in geringerer Auflösung aufnehmen.` };
  return { ok: true };
}

/** Ablagepfad: <betrieb>/<bestand>/<zeit>-<zufall>.<endung>. Ohne Betrieb oder Fahrzeug: null. */
export function medienPfad(betrieb: string, bestandId: string, endung: string, jetztMs: number, zufall: string): string | null {
  const sauber = (x: string) => String(x || '').replace(/[^A-Za-z0-9-]/g, '');
  const b = sauber(betrieb), f = sauber(bestandId);
  const e = String(endung || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  if (!b || !f) return null;
  return `${b}/${f}/${Math.max(0, Math.floor(jetztMs))}-${sauber(zufall).slice(0, 8) || 'x'}.${e}`;
}

/** Endung für den Upload: verkleinerte Fotos sind WebP, sonst aus Typ bzw. Name. */
export function endungFuer(typ: string, name: string): string {
  const t = String(typ || '').toLowerCase();
  if (t === 'image/webp') return 'webp';
  if (t === 'image/jpeg') return 'jpg';
  if (t === 'image/png') return 'png';
  if (t === 'video/mp4') return 'mp4';
  if (t === 'video/quicktime') return 'mov';
  if (t === 'video/webm') return 'webm';
  return (String(name).split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
}

/** Ein Element von Platz „von" nach „nach" schieben; liefert neue Positionen 1..n. Ungültige Indizes ändern nichts. */
export function verschieben<T extends { id: string }>(liste: T[], von: number, nach: number): { id: string; position: number }[] {
  const l = [...liste];
  if (von >= 0 && von < l.length && nach >= 0 && nach < l.length && von !== nach) {
    const [x] = l.splice(von, 1);
    l.splice(nach, 0, x);
  }
  return l.map((m, i) => ({ id: m.id, position: i + 1 }));
}

/** Fotos in Inseratsreihenfolge: Position, dann Schablonen-Reihenfolge, dann Rest. */
export function sortiert<T extends Medium>(medien: T[]): T[] {
  const rang = (m: T) => { const i = SCHABLONE.findIndex((s) => s.key === m.schablone); return i < 0 ? 999 : i; };
  return [...medien].sort((a, b) => (a.position - b.position) || (rang(a) - rang(b)) || a.id.localeCompare(b.id));
}
