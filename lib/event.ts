// lib/event.ts
// Teil C · Singleton #4 — Veranstaltungs-Management (Kultur/Verein).
// Reine Formeln & Logik: Events + Anmeldungen/Tickets, Auslastung, Warteliste,
// Einnahmen. KEINE Supabase-Aufrufe, KEINE React-Hooks (Client + Node).
// Node-getestet (event.test.ts).

export type EventArt = 'konzert' | 'workshop' | 'tagung' | 'fest' | 'vortrag' | 'kurs' | 'sonstige';
export type AnmeldeStatus = 'angemeldet' | 'bestaetigt' | 'teilgenommen' | 'warteliste' | 'storniert';

export const EVENT_ARTEN: { key: EventArt; label: string }[] = [
  { key: 'konzert',  label: 'Konzert / Aufführung' },
  { key: 'workshop', label: 'Workshop' },
  { key: 'tagung',   label: 'Tagung / Konferenz' },
  { key: 'fest',     label: 'Fest / Feier' },
  { key: 'vortrag',  label: 'Vortrag / Lesung' },
  { key: 'kurs',     label: 'Kurs' },
  { key: 'sonstige', label: 'Sonstige' },
];

export const ANMELDE_STATUS: { key: AnmeldeStatus; label: string }[] = [
  { key: 'angemeldet',   label: 'angemeldet' },
  { key: 'bestaetigt',   label: 'bestätigt' },
  { key: 'teilgenommen', label: 'teilgenommen' },
  { key: 'warteliste',   label: 'Warteliste' },
  { key: 'storniert',    label: 'storniert' },
];

export function eventArtLabel(k: string): string { return EVENT_ARTEN.find((a) => a.key === k)?.label ?? k; }
export function anmeldeStatusLabel(k: string): string { return ANMELDE_STATUS.find((a) => a.key === k)?.label ?? k; }

/** Status, die einen Platz belegen (zählen gegen die Kapazität). */
export function istBelegend(status: string): boolean {
  return status === 'angemeldet' || status === 'bestaetigt' || status === 'teilgenommen';
}

function r2(n: number): number { return Math.round((Number(n) || 0) * 100) / 100; }
function clamp01(n: number): number { return Math.min(Math.max(Number(n) || 0, 0), 1); }

export interface EventLite { id?: string; kapazitaet?: number; preis?: number; status?: string }
export interface AnmeldungLite {
  veranstaltung_id?: string;
  plaetze?: number;
  status?: string;
  bezahlt?: boolean;
  betrag?: number;
}

export function belegtePlaetze(anmeldungen: AnmeldungLite[]): number {
  return (anmeldungen || []).reduce((s, a) => s + (istBelegend(a.status ?? 'angemeldet') ? (Number(a.plaetze) || 0) : 0), 0);
}
export function wartelistePlaetze(anmeldungen: AnmeldungLite[]): number {
  return (anmeldungen || []).reduce((s, a) => s + (a.status === 'warteliste' ? (Number(a.plaetze) || 0) : 0), 0);
}
export function freiePlaetze(kapazitaet: number, belegt: number): number {
  return Math.max(0, (Number(kapazitaet) || 0) - (Number(belegt) || 0));
}
export function auslastung(belegt: number, kapazitaet: number): number {
  const k = Number(kapazitaet) || 0;
  if (k <= 0) return 0;
  return clamp01((Number(belegt) || 0) / k);
}
export function istAusverkauft(belegt: number, kapazitaet: number): boolean {
  const k = Number(kapazitaet) || 0;
  return k > 0 && (Number(belegt) || 0) >= k;
}

/** Neuer Anmelde-Status je nach freier Kapazität: passt nicht → Warteliste. */
export function naechsterStatus(kapazitaet: number, belegt: number, plaetze: number): AnmeldeStatus {
  const k = Number(kapazitaet) || 0;
  if (k <= 0) return 'angemeldet'; // keine Begrenzung
  return (Number(belegt) || 0) + (Number(plaetze) || 0) <= k ? 'angemeldet' : 'warteliste';
}

/** Betrag einer Anmeldung = Preis × Plätze. */
export function betrag(preis: number, plaetze: number): number {
  return r2((Number(preis) || 0) * (Number(plaetze) || 0));
}

/** Einnahmen einer Veranstaltung: erwartet (belegend) und bereits bezahlt. */
export function einnahmen(anmeldungen: AnmeldungLite[]): { erwartet: number; bezahlt: number; offen: number } {
  let erwartet = 0, bezahlt = 0;
  for (const a of anmeldungen || []) {
    if (!istBelegend(a.status ?? 'angemeldet')) continue;
    const b = Number(a.betrag) || 0;
    erwartet += b;
    if (a.bezahlt) bezahlt += b;
  }
  return { erwartet: r2(erwartet), bezahlt: r2(bezahlt), offen: r2(erwartet - bezahlt) };
}

export interface EventKennzahl {
  belegt: number; frei: number; auslastung: number; warteliste: number;
  ausverkauft: boolean;
  einnahmenErwartet: number; einnahmenBezahlt: number; einnahmenOffen: number;
  anmeldungen: number;
}

export function eventKennzahl(e: EventLite, anmeldungen: AnmeldungLite[]): EventKennzahl {
  const belegt = belegtePlaetze(anmeldungen);
  const kap = Number(e.kapazitaet) || 0;
  const ein = einnahmen(anmeldungen);
  return {
    belegt, frei: freiePlaetze(kap, belegt), auslastung: auslastung(belegt, kap), warteliste: wartelistePlaetze(anmeldungen),
    ausverkauft: istAusverkauft(belegt, kap),
    einnahmenErwartet: ein.erwartet, einnahmenBezahlt: ein.bezahlt, einnahmenOffen: ein.offen,
    anmeldungen: (anmeldungen || []).filter((a) => a.status !== 'storniert').length,
  };
}

// ---------------------------------------------------------------------------
// KPI-Zähler (Tiles + Regel-Auge)
// ---------------------------------------------------------------------------
export interface EventKpi {
  veranstaltungen: number;
  aktive: number;
  gesamtPlaetze: number;
  belegtePlaetze: number;
  auslastung: number;
  wartelisteGesamt: number;
  ausverkaufte: number;
  einnahmenBezahlt: number;
  einnahmenOffen: number;
}

export function zaehleEvents(
  veranstaltungen: (EventLite & { status?: string })[],
  anmeldungen: (AnmeldungLite & { veranstaltung_id?: string })[],
): EventKpi {
  const proEvent = new Map<string, AnmeldungLite[]>();
  for (const a of anmeldungen || []) {
    if (!a.veranstaltung_id) continue;
    const arr = proEvent.get(a.veranstaltung_id) || [];
    arr.push(a);
    proEvent.set(a.veranstaltung_id, arr);
  }
  let gesamtPlaetze = 0, belegt = 0, warteliste = 0, ausverkaufte = 0, bezahlt = 0, offen = 0;
  for (const e of veranstaltungen || []) {
    const abs = e.id ? (proEvent.get(e.id) || []) : [];
    const k = eventKennzahl(e, abs);
    gesamtPlaetze += Number(e.kapazitaet) || 0;
    belegt += k.belegt;
    warteliste += k.warteliste;
    if (k.ausverkauft) ausverkaufte++;
    bezahlt += k.einnahmenBezahlt;
    offen += k.einnahmenOffen;
  }
  return {
    veranstaltungen: (veranstaltungen || []).length,
    aktive: (veranstaltungen || []).filter((e) => (e.status ?? 'geplant') !== 'abgesagt' && (e.status ?? 'geplant') !== 'beendet').length,
    gesamtPlaetze,
    belegtePlaetze: belegt,
    auslastung: gesamtPlaetze > 0 ? clamp01(belegt / gesamtPlaetze) : 0,
    wartelisteGesamt: warteliste,
    ausverkaufte,
    einnahmenBezahlt: r2(bezahlt),
    einnahmenOffen: r2(offen),
  };
}
