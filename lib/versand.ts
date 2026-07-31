// lib/versand.ts
// Versand-Center · Fundament (Stufe 4a): Anbieter, Services, Status, Tracking-
// Links und Sendungs-Validierung. Reine Daten/Formeln — KEINE Supabase-/React-
// Abhängigkeit, KEINE echten Carrier-APIs (die kommen anschlussfertig in 4b).
// Node-getestet (versand.test.ts).

export interface CarrierInfo {
  key: string;
  name: string;
  icon: string;
  spedition?: boolean;      // Stückgut/Palette statt Paket
  /** Baut den öffentlichen Sendungsverfolgungs-Link. Leerer String = kein Link. */
  tracking: (nr: string) => string;
}

export const CARRIER: CarrierInfo[] = [
  { key: 'dhl',        name: 'DHL Paket',        icon: '📦', tracking: (n) => `https://www.dhl.de/de/privatkunden/pakete-empfangen/verfolgen.html?piececode=${encodeURIComponent(n)}` },
  { key: 'dpd',        name: 'DPD',              icon: '📦', tracking: (n) => `https://tracking.dpd.de/status/de_DE/parcel/${encodeURIComponent(n)}` },
  { key: 'gls',        name: 'GLS',              icon: '📦', tracking: (n) => `https://gls-group.eu/DE/de/paketverfolgung?match=${encodeURIComponent(n)}` },
  { key: 'hermes',     name: 'Hermes',           icon: '📦', tracking: (n) => `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#${encodeURIComponent(n)}` },
  { key: 'ups',        name: 'UPS',              icon: '📦', tracking: (n) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}` },
  { key: 'dpost',      name: 'Deutsche Post',    icon: '✉️', tracking: (n) => `https://www.deutschepost.de/sendung/simpleQuery.html?form.sendungsnummer=${encodeURIComponent(n)}` },
  { key: 'spedition',  name: 'Spedition (Palette)', icon: '🚛', spedition: true, tracking: () => '' },
];

export function carrierInfo(key: string | null | undefined): CarrierInfo | undefined {
  return CARRIER.find((c) => c.key === key);
}
export function carrierName(key: string | null | undefined): string {
  return carrierInfo(key)?.name ?? '—';
}
export function trackingLink(key: string | null | undefined, nr: string | null | undefined): string {
  const c = carrierInfo(key);
  const n = (nr ?? '').trim();
  if (!c || !n) return '';
  return c.tracking(n);
}

/** Versandarten (anbieterübergreifend, als Text gespeichert). */
export const SERVICES = ['Paket', 'Päckchen / Warenpost', 'Express', 'Palette / Spedition'] as const;

/** Versandrichtung: ausgehend (an Kunden) oder Retoure (Rücksendung an den Betrieb). */
export const RICHTUNGEN = [
  { key: 'ausgehend', label: 'Ausgehend', icon: '📤' },
  { key: 'retoure',   label: 'Retoure',   icon: '↩️' },
] as const;
export function istRetoure(richtung: string | null | undefined): boolean { return richtung === 'retoure'; }
export const RETOURE_GRUENDE = ['Widerruf', 'Defekt / Reklamation', 'Falsch geliefert', 'Gefällt nicht', 'Sonstiges'] as const;

export interface StatusInfo { key: string; label: string; farbe: string; }
export const VERSAND_STATUS: StatusInfo[] = [
  { key: 'entwurf',    label: 'Entwurf',     farbe: '#8FA3BE' },
  { key: 'gebucht',    label: 'Gebucht',     farbe: '#00e5ff' },
  { key: 'unterwegs',  label: 'Unterwegs',   farbe: '#C9A84C' },
  { key: 'zugestellt', label: 'Zugestellt',  farbe: '#4CAF7D' },
  { key: 'retoure',    label: 'Retoure',     farbe: '#E0A24C' },
];
export function statusInfo(key: string | null | undefined): StatusInfo {
  return VERSAND_STATUS.find((s) => s.key === key) ?? VERSAND_STATUS[0];
}

export interface SendungEingabe {
  empfaenger_name?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
  land?: string | null;
  gewicht_kg?: number | string | null;
  carrier?: string | null;
}

function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') { const n = Number(x.replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
}

/** Was fehlt, damit die Sendung buchbar ist? Leeres Array = vollständig. */
export function sendungProbleme(s: SendungEingabe): string[] {
  const p: string[] = [];
  if (!(s.empfaenger_name ?? '').trim()) p.push('Empfänger-Name fehlt');
  if (!(s.strasse ?? '').trim()) p.push('Straße/Hausnummer fehlt');
  if (!(s.plz ?? '').trim()) p.push('PLZ fehlt');
  if (!(s.ort ?? '').trim()) p.push('Ort fehlt');
  if (z(s.gewicht_kg) <= 0) p.push('Gewicht fehlt');
  if (!carrierInfo(s.carrier)) p.push('Versanddienstleister wählen');
  return p;
}
export function sendungVollstaendig(s: SendungEingabe): boolean {
  return sendungProbleme(s).length === 0;
}

/** Adresse einzeilig für Label/Liste. */
export function adresseEinzeilig(s: SendungEingabe): string {
  const teile = [
    (s.empfaenger_name ?? '').trim(),
    (s.strasse ?? '').trim(),
    [(s.plz ?? '').trim(), (s.ort ?? '').trim()].filter(Boolean).join(' '),
    (s.land ?? '').trim() && (s.land ?? '').trim().toUpperCase() !== 'DE' ? (s.land ?? '').trim() : '',
  ].filter(Boolean);
  return teile.join(', ');
}

export function formatGewicht(kg: unknown): string {
  const n = z(kg);
  return n > 0 ? `${n.toLocaleString('de-DE', { maximumFractionDigits: 2 })} kg` : '—';
}
export function formatEuro(n: unknown): string {
  return z(n).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/** Kennzahlen für Liste/Auge. */
export function zaehleSendungen(sendungen: Array<{ status?: string | null; kosten?: number | string | null }>): {
  gesamt: number; offen: number; unterwegs: number; zugestellt: number; kostenGesamt: number;
} {
  const list = sendungen || [];
  return {
    gesamt: list.length,
    offen: list.filter((s) => s.status === 'entwurf' || s.status === 'gebucht').length,
    unterwegs: list.filter((s) => s.status === 'unterwegs').length,
    zugestellt: list.filter((s) => s.status === 'zugestellt').length,
    kostenGesamt: Math.round(list.reduce((a, s) => a + z(s.kosten), 0) * 100) / 100,
  };
}
