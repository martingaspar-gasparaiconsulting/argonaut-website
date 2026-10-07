// ============================================================================
// ARGONAUT OS · lib/branchenVorlage.ts — Paket 259 (07.10.2026) · Branchen-Vorlage (Kern)
//
// Martins Vorgabe (07.10.2026): Jede Branche startet fertig eingerichtet —
// eigene Status, Spalten, Ampeln, gespeicherte Suchen und Begriffe —, und der
// Kunde darf IMMER mehr: Spalten ein-/ausblenden, Status umbenennen oder
// ergänzen, Ampelgrenzen ändern, eigene Suchen speichern. Was der Kunde
// anlegt, geht bei einem Update der Vorlage nie verloren.
//
// Aufbau in drei Schichten:
//   1. Grund-Vorlage je Modul (z. B. 'kfz-bestand')
//   2. Feinschliff je Branche (passt über profiles.branche, Anzeigename)
//   3. Einstellungen des Kunden (Tabelle modul_einstellung, jsonb) — gewinnen
//
// Reine Logik, KEINE Imports, KEINE Hooks, kein Date.now(). Node-testbar.
// Andockpunkt BV2: weitere Module/Bereiche einfach in VORLAGEN ergänzen.
// ============================================================================

export type VorlageStatus = { key: string; label: string; farbe: 'ok' | 'warn' | 'bad' | 'info' | 'gold' | 'dim'; aktiv?: boolean };
export type VorlageSpalte = { key: string; label: string; sichtbar: boolean };
export type VorlageAmpel = { gruenBis: number; gelbBis: number };
export type VorlageSuche = { key: string; name: string; regel: string };

export type Vorlage = {
  modul: string;
  titel: string;
  einheit: string;          // „Fahrzeug" / „Boot" — Wort für einen Eintrag
  einheitPlural: string;
  status: VorlageStatus[];
  sparten: string[];
  spalten: VorlageSpalte[];
  ampel: VorlageAmpel;
  suchen: VorlageSuche[];
  standkostenTag: number;   // € je Standtag (Planwert, Kunde stellt ein)
};

/** Was der Kunde je Modul speichern darf (alles optional). */
export type KundenEinstellung = {
  statusLabels?: Record<string, string>;
  statusExtra?: VorlageStatus[];
  sparten?: string[];
  spaltenSichtbar?: Record<string, boolean>;
  ampel?: Partial<VorlageAmpel>;
  suchen?: VorlageSuche[];
  standkostenTag?: number;
};

type Feinschliff = { name: string; passt: (branche: string) => boolean; aenderung: Partial<Vorlage> };

// --- Grund-Vorlage: Kfz-Handelsbestand (K1) --------------------------------
const KFZ_BESTAND: Vorlage = {
  modul: 'kfz-bestand',
  titel: 'Fahrzeugbestand',
  einheit: 'Fahrzeug',
  einheitPlural: 'Fahrzeuge',
  status: [
    { key: 'zulauf', label: 'Im Zulauf', farbe: 'info' },
    { key: 'aufbereitung', label: 'In Aufbereitung', farbe: 'warn' },
    { key: 'bestand', label: 'Im Bestand', farbe: 'ok' },
    { key: 'reserviert', label: 'Reserviert', farbe: 'gold' },
    { key: 'verkauft', label: 'Verkauft', farbe: 'dim' },
    { key: 'archiv', label: 'Archiv', farbe: 'dim' },
  ],
  sparten: ['Pkw', 'Nutzfahrzeug', 'Wohnmobil', 'Motorrad'],
  spalten: [
    { key: 'fahrzeug', label: 'Fahrzeug', sichtbar: true },
    { key: 'status', label: 'Status', sichtbar: true },
    { key: 'ez_km', label: 'EZ · km', sichtbar: true },
    { key: 'kennzeichen', label: 'Kennzeichen', sichtbar: true },
    { key: 'standort', label: 'Standort', sichtbar: true },
    { key: 'vk', label: 'Verkaufspreis', sichtbar: true },
    { key: 'ek', label: 'Einkaufspreis', sichtbar: false },
    { key: 'standtage', label: 'Standtage', sichtbar: true },
    { key: 'fin', label: 'FIN', sichtbar: false },
    { key: 'farbe', label: 'Farbe', sichtbar: false },
    { key: 'besteuerung', label: 'Besteuerung', sichtbar: false },
  ],
  ampel: { gruenBis: 60, gelbBis: 90 },
  suchen: [
    { key: 'ueber90', name: 'Über 90 Standtage', regel: 'standtage>90' },
    { key: 'ab80', name: 'Ab 80.000 €', regel: 'vk>=80000' },
    { key: 'ohneInserat', name: 'Ohne Inserat', regel: 'inseriert=nein' },
    { key: 'reserviert', name: 'Reserviert', regel: 'status=reserviert' },
    { key: 'diff', name: 'Differenzbesteuert', regel: 'besteuerung=25a' },
  ],
  standkostenTag: 9,
};

const KFZ_FEINSCHLIFF: Feinschliff[] = [
  { name: 'Motorradhandel', passt: (b) => /motorrad|roller|zweirad/i.test(b),
    aenderung: { sparten: ['Motorrad', 'Roller', 'Quad', 'Leichtkraftrad'], standkostenTag: 4,
      suchen: [{ key: 'ueber90', name: 'Über 90 Standtage', regel: 'standtage>90' }, { key: 'ab15', name: 'Ab 15.000 €', regel: 'vk>=15000' }, { key: 'ohneInserat', name: 'Ohne Inserat', regel: 'inseriert=nein' }, { key: 'reserviert', name: 'Reserviert', regel: 'status=reserviert' }] } },
  { name: 'Nutzfahrzeughandel', passt: (b) => /nutzfahrzeug|transporter|lkw/i.test(b),
    aenderung: { sparten: ['Transporter', 'Lkw bis 7,5 t', 'Lkw über 7,5 t', 'Anhänger', 'Pkw'], standkostenTag: 12 } },
  { name: 'Caravan und Wohnmobil', passt: (b) => /caravan|wohnmobil|wohnwagen/i.test(b),
    aenderung: { sparten: ['Wohnmobil', 'Kastenwagen', 'Wohnwagen', 'Alkoven'], standkostenTag: 12, ampel: { gruenBis: 90, gelbBis: 150 } } },
  { name: 'Oldtimer', passt: (b) => /oldtimer|klassik/i.test(b),
    aenderung: { sparten: ['Oldtimer (H-Kennzeichen)', 'Youngtimer', 'Pkw'], ampel: { gruenBis: 120, gelbBis: 240 } } },
  { name: 'Boote', passt: (b) => /boot|yacht/i.test(b),
    aenderung: { einheit: 'Boot', einheitPlural: 'Boote', titel: 'Bootsbestand', sparten: ['Motorboot', 'Segelboot', 'Schlauchboot', 'Trailer'], standkostenTag: 6, ampel: { gruenBis: 90, gelbBis: 180 } } },
  { name: 'Luxus und Premium', passt: (b) => /luxus|premium|sportwagen/i.test(b),
    aenderung: { ampel: { gruenBis: 90, gelbBis: 150 }, standkostenTag: 18 } },
];

const VORLAGEN: Record<string, { grund: Vorlage; fein: Feinschliff[] }> = {
  'kfz-bestand': { grund: KFZ_BESTAND, fein: KFZ_FEINSCHLIFF },
};

export function bekannteModule(): string[] {
  return Object.keys(VORLAGEN);
}

function kopie<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** Vorlage für ein Modul, mit Feinschliff der Branche (erster Treffer gewinnt). */
export function vorlageFuer(modul: string, branche?: string | null): Vorlage | null {
  const v = VORLAGEN[modul];
  if (!v) return null;
  const basis = kopie(v.grund);
  const b = (branche || '').trim();
  const f = b ? v.fein.find((x) => x.passt(b)) : undefined;
  return f ? { ...basis, ...kopie(f.aenderung) } : basis;
}

/** Name des Feinschliffs für die Anzeige („Vorlage: Motorradhandel"), sonst null. */
export function feinschliffName(modul: string, branche?: string | null): string | null {
  const v = VORLAGEN[modul];
  const b = (branche || '').trim();
  if (!v || !b) return null;
  return v.fein.find((x) => x.passt(b))?.name ?? null;
}

function zahlOder(x: unknown, sonst: number): number {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : sonst;
}

/**
 * Vorlage + Kunde. Regeln:
 *  · Status der Vorlage bleiben immer erhalten (nur umbenennbar); eigene kommen dazu.
 *  · Spalten: Kunde schaltet sichtbar/unsichtbar; unbekannte Schlüssel werden ignoriert.
 *  · Ampel: gelb liegt nie unter grün.
 *  · Suchen: eigene Suchen ergänzen die Vorlage, gleicher Schlüssel ersetzt.
 */
export function mitKunde(v: Vorlage, k?: KundenEinstellung | null): Vorlage {
  const e = kopie(v);
  if (!k || typeof k !== 'object') return e;
  if (k.statusLabels) {
    for (const s of e.status) {
      const neu = k.statusLabels[s.key];
      if (typeof neu === 'string' && neu.trim()) s.label = neu.trim().slice(0, 40);
    }
  }
  if (Array.isArray(k.statusExtra)) {
    for (const s of k.statusExtra) {
      if (!s || typeof s.key !== 'string' || !s.key.trim() || typeof s.label !== 'string' || !s.label.trim()) continue;
      if (e.status.some((x) => x.key === s.key)) continue;
      e.status.push({ key: s.key.trim(), label: s.label.trim().slice(0, 40), farbe: s.farbe ?? 'info' });
    }
  }
  if (Array.isArray(k.sparten)) {
    const s = k.sparten.map((x) => String(x || '').trim()).filter(Boolean);
    if (s.length) e.sparten = Array.from(new Set(s));
  }
  if (k.spaltenSichtbar) {
    for (const sp of e.spalten) if (typeof k.spaltenSichtbar[sp.key] === 'boolean') sp.sichtbar = k.spaltenSichtbar[sp.key];
  }
  if (k.ampel) {
    const g = zahlOder(k.ampel.gruenBis, e.ampel.gruenBis);
    const y = zahlOder(k.ampel.gelbBis, e.ampel.gelbBis);
    e.ampel = { gruenBis: g, gelbBis: Math.max(g, y) };
  }
  if (Array.isArray(k.suchen)) {
    for (const s of k.suchen) {
      if (!s || typeof s.key !== 'string' || typeof s.name !== 'string' || typeof s.regel !== 'string' || !s.name.trim()) continue;
      const i = e.suchen.findIndex((x) => x.key === s.key);
      const neu = { key: s.key, name: s.name.trim().slice(0, 40), regel: s.regel };
      if (i >= 0) e.suchen[i] = neu; else e.suchen.push(neu);
    }
  }
  if (k.standkostenTag !== undefined) e.standkostenTag = zahlOder(k.standkostenTag, e.standkostenTag);
  return e;
}

/** Ampel nach Standtagen: grün bis gruenBis, gelb bis gelbBis, danach rot. */
export function standtageAmpel(tage: number | null, a: VorlageAmpel): 'ok' | 'warn' | 'bad' | 'dim' {
  if (tage === null || !Number.isFinite(tage)) return 'dim';
  if (tage <= a.gruenBis) return 'ok';
  if (tage <= a.gelbBis) return 'warn';
  return 'bad';
}
