// lib/versandBuchung.ts
// Versand-Center 4b · Anschluss an den Aggregator „shipcloud" (ein Vertrag,
// alle Carrier). REINE Payload-Builder + Response-Parser — KEINE echten Netz-
// aufrufe hier (die macht die Route). Node-getestet. Gegen die Live-API erst
// mit echtem API-Key testbar; die Form ist nach shipcloud-Doku gebaut.

export const AGGREGATOR = { key: 'shipcloud', name: 'shipcloud', endpoint: 'https://api.shipcloud.io/v1/shipments' };

// ARGONAUT-Carrier -> shipcloud-Carrier-Schlüssel. Spedition wird vom
// Paket-Aggregator nicht abgedeckt -> null (bleibt manuell).
const CARRIER_MAP: Record<string, string | null> = {
  dhl: 'dhl', dpd: 'dpd', gls: 'gls', hermes: 'hermes', ups: 'ups', dpost: 'dhl', spedition: null,
};
export function carrierZuShipcloud(key: string | null | undefined): string | null {
  return CARRIER_MAP[(key ?? '') as string] ?? null;
}

// ARGONAUT-Versandart -> shipcloud-Service.
export function serviceZuShipcloud(service: string | null | undefined): string {
  return /express/i.test(service ?? '') ? 'one_day' : 'standard';
}

/** „Musterweg 12a" -> { street: 'Musterweg', street_no: '12a' }. */
export function splitStrasse(strasse: string | null | undefined): { street: string; street_no: string } {
  const s = (strasse ?? '').trim();
  const m = s.match(/^(.*?)[\s,]+(\d+\s*[a-zA-Z]?(?:[-/]\d+\s*[a-zA-Z]?)?)$/);
  if (m) return { street: m[1].trim(), street_no: m[2].replace(/\s+/g, '') };
  return { street: s, street_no: '' };
}

/** „Anna Maria Muster" -> { first_name: 'Anna Maria', last_name: 'Muster' }. */
export function splitName(name: string | null | undefined): { first_name: string; last_name: string } {
  const teile = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (teile.length === 0) return { first_name: '', last_name: '' };
  if (teile.length === 1) return { first_name: '', last_name: teile[0] };
  return { first_name: teile.slice(0, -1).join(' '), last_name: teile[teile.length - 1] };
}

function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') { const n = Number(x.replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
}

export interface BuchungSendung {
  empfaenger_name?: string | null; empfaenger_firma?: string | null;
  strasse?: string | null; plz?: string | null; ort?: string | null; land?: string | null;
  gewicht_kg?: number | string | null; laenge_cm?: number | string | null; breite_cm?: number | string | null; hoehe_cm?: number | string | null;
  carrier?: string | null; service?: string | null; referenz?: string | null;
}
export interface Adresse {
  company?: string; first_name?: string; last_name?: string;
  street?: string; street_no?: string; city?: string; zip_code?: string; country?: string;
}

/** shipcloud-Request-Body für POST /v1/shipments (mit Label). */
export function baueShipmentBody(s: BuchungSendung, absender?: Adresse | null): Record<string, unknown> {
  const { street, street_no } = splitStrasse(s.strasse);
  const { first_name, last_name } = splitName(s.empfaenger_name);
  const to: Adresse = {
    company: (s.empfaenger_firma ?? '').trim() || undefined,
    first_name: first_name || undefined,
    last_name: last_name || (s.empfaenger_firma ? undefined : 'Empfänger'),
    street, street_no,
    city: (s.ort ?? '').trim(),
    zip_code: (s.plz ?? '').trim(),
    country: ((s.land ?? 'DE').trim() || 'DE').toUpperCase(),
  };
  const paket: Record<string, number> = { weight: z(s.gewicht_kg) };
  if (z(s.laenge_cm) > 0) paket.length = z(s.laenge_cm);
  if (z(s.breite_cm) > 0) paket.width = z(s.breite_cm);
  if (z(s.hoehe_cm) > 0) paket.height = z(s.hoehe_cm);

  const body: Record<string, unknown> = {
    carrier: carrierZuShipcloud(s.carrier),
    service: serviceZuShipcloud(s.service),
    to,
    package: paket,
    create_shipping_label: true,
  };
  if (absender) body.from = absender;
  const ref = (s.referenz ?? '').trim();
  if (ref) body.reference_number = ref.slice(0, 30);
  return body;
}

export interface ShipcloudAntwort { trackingNr: string; trackingUrl: string; labelUrl: string; preis: number | null; }
/** Antwort von POST /v1/shipments auswerten. */
export function parseShipcloudAntwort(json: unknown): ShipcloudAntwort {
  const j = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
  return {
    trackingNr: String(j.carrier_tracking_no ?? '').trim(),
    trackingUrl: String(j.tracking_url ?? '').trim(),
    labelUrl: String(j.label_url ?? '').trim(),
    preis: j.price != null ? z(j.price) : null,
  };
}

/** Kann diese Sendung über den Aggregator gebucht werden? Leeres Array = ja. */
export function buchungProbleme(s: BuchungSendung): string[] {
  const p: string[] = [];
  if (!carrierZuShipcloud(s.carrier)) p.push('Dieser Dienstleister ist über den Aggregator nicht buchbar (z. B. Spedition) — bitte manuell.');
  if (!(s.empfaenger_name ?? '').trim() && !(s.empfaenger_firma ?? '').trim()) p.push('Empfänger fehlt');
  if (!(s.strasse ?? '').trim()) p.push('Straße fehlt');
  if (!(s.plz ?? '').trim() || !(s.ort ?? '').trim()) p.push('PLZ/Ort fehlt');
  if (z(s.gewicht_kg) <= 0) p.push('Gewicht fehlt');
  return p;
}
