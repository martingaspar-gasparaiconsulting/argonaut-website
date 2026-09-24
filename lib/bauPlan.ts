// lib/bauPlan.ts
// ============================================================================
// ARGONAUT OS · Paket PK · Baustelle: Plaene mit Maengel-Pins (B22) und
// Foto-KI (B27) — Stand 24.09.2026
//
// ▄▄▄ WAS ES SCHON GAB ▄▄▄
// Bautagebuch mit Fotos je Tageseintrag und einer Maengelliste je Projekt
// (Tabelle maengel) — aber ohne Ort: "Riss in der Wand" sagt nicht, welche
// Wand. Plaene gab es gar nicht.
//
// ▄▄▄ WAS HIER DAZUKOMMT ▄▄▄
// 1. Plaene je Projekt als Bild (JPG, PNG, WebP), mit Versionen. Eine neue
//    Version uebernimmt die offenen Pins mit Nummer und Lage.
// 2. Pins auf dem Plan: Nummer, Art, Gewerk, Frist, Zustaendig, Foto vorher
//    und nachher, Status offen -> in Arbeit -> behoben -> abgenommen.
// 3. Maengelliste als Text (fuer das PDF) — sortiert, mit Faelligkeit.
// 4. Foto-KI: Prompt und strenges Lesen der Antwort. Die KI schlaegt vor,
//    der Mensch entscheidet. Masse und Mengen liest sie NIE aus dem Bild —
//    die kommen aus dem Aufmass.
//
// Reine Logik: keine Imports aus Next/Supabase/React, keine Uhr.
// Node-getestet: tests/bauPlanP84.test.mjs
// ============================================================================

import { istIsoDatum, tageBis, datumDe } from './nachweisMotor';

export { datumDe };

export type PinArt = 'mangel' | 'hinweis' | 'aufmass' | 'schaden';
export type PinStatus = 'offen' | 'in_arbeit' | 'behoben' | 'abgenommen';

export const PIN_ARTEN: { key: PinArt; label: string; icon: string }[] = [
  { key: 'mangel', label: 'Mangel', icon: '⚠️' },
  { key: 'schaden', label: 'Schaden', icon: '💥' },
  { key: 'hinweis', label: 'Hinweis', icon: 'ℹ️' },
  { key: 'aufmass', label: 'Aufmaß-Stelle', icon: '📐' },
];

export const PIN_STATUS: { key: PinStatus; label: string; farbe: string }[] = [
  { key: 'offen', label: 'Offen', farbe: '#E06666' },
  { key: 'in_arbeit', label: 'In Arbeit', farbe: '#E0A24C' },
  { key: 'behoben', label: 'Behoben', farbe: '#00e5ff' },
  { key: 'abgenommen', label: 'Abgenommen', farbe: '#4CAF7D' },
];

export const GEWERKE = [
  'Rohbau', 'Maurer', 'Beton', 'Zimmerer', 'Dach', 'Fenster', 'Trockenbau', 'Putz', 'Estrich', 'Fliesen',
  'Maler', 'Boden', 'Tischler', 'Elektro', 'Sanitär', 'Heizung', 'Lüftung', 'Metallbau', 'Außenanlagen', 'Sonstiges',
];

export function pinArt(key: unknown) { return PIN_ARTEN.find((a) => a.key === key) ?? null; }
export function pinStatus(key: unknown) { return PIN_STATUS.find((s) => s.key === key) ?? null; }

/** Naechster Status fuer den Weiter-Knopf. Mitarbeiter kommen hoechstens bis "behoben". */
export function naechsterStatus(status: unknown, istMitarbeiter: boolean): PinStatus | null {
  const i = PIN_STATUS.findIndex((s) => s.key === status);
  if (i < 0 || i >= PIN_STATUS.length - 1) return null;
  const n = PIN_STATUS[i + 1].key;
  if (istMitarbeiter && n === 'abgenommen') return null;
  return n;
}

// ---------------------------------------------------------------------------
// Lage auf dem Plan — relativ (0..1), damit sie bei jeder Bildgroesse stimmt
// ---------------------------------------------------------------------------

function rund5(n: number): number { return Math.round(n * 100000) / 100000; }

/** Relative Lage aus einem Klick. Ausserhalb des Bildes: null. */
export function klickZuLage(
  clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: rund5(x), y: rund5(y) };
}

/** Gespeicherte Lage lesen; kaputte oder fehlende Werte -> null (Pin wird nicht gezeichnet). */
export function leseLage(x: unknown, y: unknown): { x: number; y: number } | null {
  const a = Number(x);
  const b = Number(y);
  if (x == null || y == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < 0 || a > 1 || b < 0 || b > 1) return null;
  return { x: a, y: b };
}

/** Naechste Pin-Nummer. Luecken bleiben (eine geloeschte Nr. 4 kommt nicht wieder). */
export function naechstePinNummer(nummern: unknown[]): number {
  let max = 0;
  for (const n of nummern) {
    const z = Number(n);
    if (Number.isInteger(z) && z > max) max = z;
  }
  return max + 1;
}

// ---------------------------------------------------------------------------
// Dateien
// ---------------------------------------------------------------------------

const ENDUNG: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const PLAN_BILDARTEN = Object.keys(ENDUNG);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Speicherpfad im privaten Bucket 'bau-plaene'. Erster Ordner = Betrieb
 * (Chef-ID) — daran haengen die Speicher-Regeln: Chef und Mitarbeiter
 * desselben Betriebs sehen dieselben Plaene. Nur Bilder; alles andere -> null.
 */
export function speicherPfad(betriebId: string, art: 'plan' | 'pin', id: string, mediaType: string, zusatz = ''): string | null {
  if (!UUID.test(betriebId) || !UUID.test(id)) return null;
  const endung = ENDUNG[mediaType];
  if (!endung) return null;
  const z = zusatz.replace(/[^a-z0-9-]/gi, '').slice(0, 20);
  return `${betriebId.toLowerCase()}/${art === 'plan' ? 'plaene' : 'pins'}/${id.toLowerCase()}${z ? '-' + z : ''}.${endung}`;
}

// ---------------------------------------------------------------------------
// Pins auswerten
// ---------------------------------------------------------------------------

export type PinZeile = {
  nummer?: number | null;
  titel?: string | null;
  art?: string | null;
  status: string;
  gewerk?: string | null;
  frist?: string | null;
  zustaendig?: string | null;
  beschreibung?: string | null;
  x?: number | string | null;
  y?: number | string | null;
};

export function istErledigt(p: PinZeile): boolean {
  return p.status === 'behoben' || p.status === 'abgenommen';
}

export function istUeberfaellig(p: PinZeile, heute: string): boolean {
  return !istErledigt(p) && istIsoDatum(p.frist) && tageBis(heute, p.frist as string) < 0;
}

export type PinZahlen = { gesamt: number; offen: number; inArbeit: number; wartetAufAbnahme: number; abgenommen: number; ueberfaellig: number; jeGewerk: { gewerk: string; offen: number }[] };

export function pinZahlen(pins: PinZeile[], heute: string): PinZahlen {
  const z: PinZahlen = { gesamt: pins.length, offen: 0, inArbeit: 0, wartetAufAbnahme: 0, abgenommen: 0, ueberfaellig: 0, jeGewerk: [] };
  const gw = new Map<string, number>();
  for (const p of pins) {
    if (p.status === 'offen') z.offen++;
    if (p.status === 'in_arbeit') z.inArbeit++;
    if (p.status === 'behoben') z.wartetAufAbnahme++;
    if (p.status === 'abgenommen') z.abgenommen++;
    if (istUeberfaellig(p, heute)) z.ueberfaellig++;
    if (!istErledigt(p)) {
      const g = String(p.gewerk ?? '').trim() || 'ohne Gewerk';
      gw.set(g, (gw.get(g) ?? 0) + 1);
    }
  }
  z.jeGewerk = [...gw.entries()].map(([gewerk, offen]) => ({ gewerk, offen })).sort((a, b) => b.offen - a.offen || a.gewerk.localeCompare(b.gewerk));
  return z;
}

/** Ueberfaellig zuerst, dann offen, in Arbeit, behoben, abgenommen; darin nach Nummer. */
export function sortierePins<T extends PinZeile>(pins: T[], heute: string): T[] {
  const rang = (p: T) => (istUeberfaellig(p, heute) ? 0 : 1 + Math.max(0, PIN_STATUS.findIndex((s) => s.key === p.status)));
  return [...pins].sort((a, b) => rang(a) - rang(b) || (Number(a.nummer) || 0) - (Number(b.nummer) || 0));
}

/**
 * Pins fuer eine neue Plan-Version: alle NICHT abgenommenen, mit Nummer und
 * Lage. Fotos und Verlauf bleiben am alten Pin (die alte Version wird nicht
 * geloescht). Die Lage muss auf dem neuen Plan nicht mehr stimmen — deshalb
 * der Hinweis im Ergebnis.
 */
export function pinsFuerNeueVersion<T extends PinZeile>(pins: T[]): { pins: PinZeile[]; hinweis: string | null } {
  const offen = pins.filter((p) => p.status !== 'abgenommen' && leseLage(p.x, p.y));
  return {
    pins: offen.map((p) => ({
      nummer: p.nummer ?? null, titel: p.titel ?? null, art: p.art ?? 'mangel', status: p.status, gewerk: p.gewerk ?? null,
      frist: p.frist ?? null, zustaendig: p.zustaendig ?? null, beschreibung: p.beschreibung ?? null, x: Number(p.x), y: Number(p.y),
    })),
    hinweis: offen.length ? `${offen.length} ${offen.length === 1 ? 'offener Pin wurde' : 'offene Pins wurden'} übernommen — bitte die Lage auf dem neuen Plan kurz prüfen.` : null,
  };
}

/** Maengelliste als Markdown fuer das PDF (lib/textMotor.dokumentHtml). */
export function maengelListeText(pins: PinZeile[], heute: string, nurOffene = true): string {
  const liste = sortierePins(pins.filter((p) => !nurOffene || !istErledigt(p)), heute);
  if (!liste.length) return nurOffene ? 'Keine offenen Punkte.' : 'Keine Punkte erfasst.';
  const z = pinZahlen(pins, heute);
  const kopf = `Stand ${datumDe(heute)} · ${z.offen} offen · ${z.inArbeit} in Arbeit · ${z.wartetAufAbnahme} warten auf Abnahme${z.ueberfaellig ? ` · ${z.ueberfaellig} überfällig` : ''}`;
  const zeilen = liste.map((p) => {
    const teile = [
      pinStatus(p.status)?.label ?? p.status,
      pinArt(p.art)?.label ?? null,
      String(p.gewerk ?? '').trim() || null,
      istIsoDatum(p.frist) ? `Frist ${datumDe(p.frist as string)}${istUeberfaellig(p, heute) ? ' (überfällig)' : ''}` : null,
      String(p.zustaendig ?? '').trim() ? `zuständig: ${String(p.zustaendig).trim()}` : null,
    ].filter(Boolean);
    const beschr = String(p.beschreibung ?? '').trim();
    return `## Nr. ${p.nummer ?? '–'} — ${String(p.titel ?? '').trim() || 'ohne Titel'}\n\n${teile.join(' · ')}${beschr ? `\n\n${beschr}` : ''}`;
  });
  return `${kopf}\n\n${zeilen.join('\n\n')}`;
}

// ===========================================================================
// FOTO-KI (B27)
// ===========================================================================

export type FotoVorschlag = {
  art: PinArt;
  titel: string;
  beschreibung: string;
  gewerk: string | null;
  schwere: 'gering' | 'mittel' | 'hoch' | null;
  massnahme: string | null;
  aufmass: { kurztext: string; einheit: string } | null;
  hinweise: string[];
};

export const FOTO_KI_MODELL = 'claude-haiku-4-5';

export function fotoKiSystem(): string {
  return [
    'Sie unterstützen einen Handwerks- oder Baubetrieb auf der Baustelle. Sie sehen EIN Foto.',
    'Beschreiben Sie sachlich, was zu sehen ist, und schlagen Sie eine Einordnung vor. Der Mensch entscheidet.',
    'Regeln:',
    '- Keine Maße, Mengen, Flächen oder Preise schätzen. Auch nicht ungefähr. Maße kommen aus dem Aufmaß.',
    '- Keine Schuldzuweisung (wer den Mangel verursacht hat), keine rechtliche Bewertung.',
    '- Wenn Sie etwas nicht sicher erkennen, sagen Sie das in "hinweise".',
    '- Deutsch, kurz, Fachbegriffe des Handwerks.',
    `- gewerk: eines von ${GEWERKE.join(', ')} oder null.`,
    'Antworten Sie NUR mit JSON in dieser Form:',
    '{"art":"mangel|schaden|hinweis|aufmass","titel":"max 60 Zeichen","beschreibung":"2-4 Sätze","gewerk":"…|null","schwere":"gering|mittel|hoch|null","massnahme":"Vorschlag, 1 Satz|null","aufmass":{"kurztext":"Leistung für eine Aufmaß-Position","einheit":"m|m²|m³|Stk|h|psch"}|null,"hinweise":["…"]}',
  ].join('\n');
}

export function fotoKiNutzer(kontext: { projekt?: string | null; plan?: string | null; notiz?: string | null }): string {
  const t: string[] = ['Bitte ordnen Sie dieses Baustellenfoto ein.'];
  if (kontext.projekt) t.push(`Baustelle: ${String(kontext.projekt).slice(0, 120)}`);
  if (kontext.plan) t.push(`Plan: ${String(kontext.plan).slice(0, 120)}`);
  if (kontext.notiz) t.push(`Notiz vom Monteur: ${String(kontext.notiz).slice(0, 500)}`);
  return t.join('\n');
}

const EINHEITEN = ['m', 'm²', 'm³', 'Stk', 'h', 'psch'];
const MASS_MUSTER = /\b\d+([.,]\d+)?\s?(mm|cm|m²|m³|qm|m|meter|stk|stück|%|€|euro)\b/i;

function kurz(x: unknown, max: number): string {
  return String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Antwort der KI streng lesen. Unbekannte Werte fallen auf sichere Vorgaben
 * zurueck. Enthaelt der Text trotz Verbot Masse oder Preise, wird das nicht
 * still geloescht, sondern als Hinweis gemeldet — der Mensch prueft.
 * Nicht lesbar: null.
 */
export function leseFotoVorschlag(roh: string): FotoVorschlag | null {
  const t = String(roh ?? '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j: Record<string, unknown>;
  try { j = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  if (!j || typeof j !== 'object') return null;

  const art = (PIN_ARTEN.some((x) => x.key === j.art) ? j.art : 'hinweis') as PinArt;
  const titel = kurz(j.titel, 60);
  const beschreibung = kurz(j.beschreibung, 800);
  if (!titel && !beschreibung) return null;
  const gw = kurz(j.gewerk, 40);
  const gewerk = GEWERKE.find((g) => g.toLowerCase() === gw.toLowerCase()) ?? null;
  const schwere = j.schwere === 'gering' || j.schwere === 'mittel' || j.schwere === 'hoch' ? j.schwere : null;
  const massnahme = kurz(j.massnahme, 300) || null;
  let aufmass: FotoVorschlag['aufmass'] = null;
  if (j.aufmass && typeof j.aufmass === 'object') {
    const am = j.aufmass as Record<string, unknown>;
    const kt = kurz(am.kurztext, 120);
    const eh = EINHEITEN.find((e) => e === kurz(am.einheit, 8)) ?? null;
    if (kt && eh) aufmass = { kurztext: kt, einheit: eh };
  }
  const hinweise = (Array.isArray(j.hinweise) ? j.hinweise : []).map((h) => kurz(h, 200)).filter(Boolean).slice(0, 5);
  if (MASS_MUSTER.test(`${titel} ${beschreibung} ${massnahme ?? ''} ${aufmass?.kurztext ?? ''}`)) {
    hinweise.unshift('Der Vorschlag enthält Maße oder Beträge — die stammen aus dem Foto geschätzt und sind nicht verlässlich. Bitte aus dem Aufmaß nehmen.');
  }
  return { art, titel: titel || beschreibung.slice(0, 60), beschreibung, gewerk, schwere, massnahme, aufmass, hinweise };
}
