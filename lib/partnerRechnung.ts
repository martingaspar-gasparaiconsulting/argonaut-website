// ============================================================================
// ARGONAUT OS · lib/partnerRechnung.ts — Paket 279 (08.10.2026) · K18b Partner-Netzwerk
//
// Reine Logik für Gast-Link und Partner-Rechnung (node-getestet, nur lib/zahlen):
// - Rechnung des Partners prüfen (Nummer, Datum, Netto, USt 0/7/19 %), Vorschau
//   brutto centgenau — gerechnet wird verbindlich in der Datenbank (p279_rechnung_anlegen).
// - Dateiart aus den ersten Bytes (PDF, JPEG, PNG, WebP) — nie aus Name/Angabe.
// - Gast-Link: Form des Links, Gültigkeit, Weitergabe-Text (Sie-Form, keine Werbung).
// - Kostenarten wie kfz_bestand_kosten (Paket 265), Vorschlag aus dem Auftragstitel.
// Die Sicherheit steckt in supabase-sql/p279-partner-gast-rechnung.sql.
// ============================================================================

import { leseZahl, centRunden } from './zahlen';

export const RECHNUNG_MAX_BYTES = 4 * 1024 * 1024;
export const UST_SAETZE = [19, 7, 0] as const;
export const GAST_TAGE_STANDARD = 14;
export const GAST_TAGE_MAX = 60;

export type DateiArt = 'pdf' | 'jpg' | 'png' | 'webp';
export const DATEI_MIME: Record<DateiArt, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Dateiart aus den Bytes. PDF: „%PDF-". */
export function dateiArt(b: Uint8Array): DateiArt | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'pdf';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
}

/** Pfad der Rechnungsdatei: <ziel>rechnung-<uuid>.<art>; Ziel „<uuid>/<uuid>/" aus der Datenbank. */
export function rechnungPfad(ziel: unknown, id: string, art: DateiArt): string | null {
  if (typeof ziel !== 'string' || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/$/i.test(ziel)) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return `${ziel}rechnung-${id.toLowerCase()}.${art}`;
}

export type RechnungEingabe = { nummer?: unknown; datum?: unknown; netto?: unknown; satz?: unknown };
export type RechnungFelder = { nummer: string; datum: string; netto: number; satz: number; ust: number; brutto: number };

function tagePlus(iso: string, tage: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Eingabe des Partners prüfen (gleiche Grenzen wie p279_rechnung_anlegen). */
export function rechnungPruefen(e: RechnungEingabe, heute: string): { ok: true; felder: RechnungFelder } | { ok: false; fehler: string } {
  const nummer = typeof e.nummer === 'string' ? e.nummer.trim() : '';
  if (!nummer) return { ok: false, fehler: 'Bitte die Rechnungsnummer angeben.' };
  if (nummer.length > 60) return { ok: false, fehler: 'Die Rechnungsnummer darf höchstens 60 Zeichen haben.' };
  const datum = typeof e.datum === 'string' ? e.datum.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || Number.isNaN(Date.parse(`${datum}T12:00:00Z`))) return { ok: false, fehler: 'Bitte das Rechnungsdatum angeben.' };
  if (datum > tagePlus(heute, 1)) return { ok: false, fehler: 'Das Rechnungsdatum liegt in der Zukunft.' };
  if (datum < tagePlus(heute, -400)) return { ok: false, fehler: 'Das Rechnungsdatum ist älter als 400 Tage.' };
  const netto = leseZahl(e.netto);
  if (netto === null || netto <= 0) return { ok: false, fehler: 'Bitte den Nettobetrag angeben.' };
  if (netto > 1000000) return { ok: false, fehler: 'Der Nettobetrag ist zu hoch.' };
  if (centRunden(netto) !== netto) return { ok: false, fehler: 'Der Nettobetrag hat mehr als zwei Nachkommastellen.' };
  const satz = typeof e.satz === 'number' ? e.satz : Number(e.satz);
  if (!(UST_SAETZE as readonly number[]).includes(satz)) return { ok: false, fehler: 'Umsatzsteuer: 19, 7 oder 0 %.' };
  const ust = centRunden((netto * satz) / 100);
  return { ok: true, felder: { nummer, datum, netto, satz, ust, brutto: centRunden(netto + ust) } };
}

export const RECHNUNG_STATUS: Record<string, { name: string; stufe: string }> = {
  eingereicht: { name: 'Eingereicht — wird geprüft', stufe: 'warn' },
  uebernommen: { name: 'Übernommen', stufe: 'ok' },
  abgelehnt: { name: 'Zurückgewiesen', stufe: 'bad' },
};
export function rechnungStatusName(s: unknown): string { return RECHNUNG_STATUS[String(s)]?.name ?? String(s ?? '—'); }

// --- Kostenarten (wie kfz_bestand_kosten, Paket 265) ------------------------------------------------
export const KOSTEN_ARTEN: { key: string; name: string; stichworte: string[] }[] = [
  { key: 'lack', name: 'Lack / Smart-Repair', stichworte: ['lack', 'smart', 'delle', 'spot', 'kratzer', 'stoßfänger', 'stossfaenger'] },
  { key: 'aufbereitung', name: 'Aufbereitung', stichworte: ['aufbereit', 'politur', 'innenraum', 'reinigung', 'versiegel'] },
  { key: 'reparatur', name: 'Reparatur', stichworte: ['reparatur', 'instand', 'mechanik', 'getriebe', 'motor'] },
  { key: 'teile', name: 'Teile', stichworte: ['teile', 'ersatzteil'] },
  { key: 'reifen', name: 'Reifen', stichworte: ['reifen', 'felge', 'rad'] },
  { key: 'hu', name: 'HU / AU', stichworte: ['hu', 'tüv', 'tuev', 'dekra', 'au '] },
  { key: 'transport', name: 'Transport', stichworte: ['transport', 'überführung', 'ueberfuehrung', 'abholung'] },
  { key: 'zulassung', name: 'Zulassung', stichworte: ['zulassung', 'ummeldung'] },
  { key: 'werbung', name: 'Werbung / Fotos', stichworte: ['foto', 'werbung', 'inserat'] },
  { key: 'fremd', name: 'Fremdleistung (sonstige)', stichworte: [] },
  { key: 'sonstiges', name: 'Sonstiges', stichworte: [] },
];

/** Kostenart-Vorschlag aus dem Auftragstitel (nur Vorschlag, im Dialog änderbar). */
export function kostenArtVorschlag(titel: unknown): string {
  const t = ` ${String(titel ?? '').toLowerCase()} `;
  for (const a of KOSTEN_ARTEN) if (a.stichworte.some((s) => t.includes(s))) return a.key;
  return 'fremd';
}
export function kostenArtGueltig(a: unknown): boolean { return KOSTEN_ARTEN.some((x) => x.key === a); }

// --- Gast-Link -----------------------------------------------------------------------------------------

/** Form des Links: 32 Zeichen Base64url (24 Zufallsbytes). */
export function tokenGueltig(t: unknown): t is string {
  return typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t);
}

export function gastTageLesen(x: unknown): number {
  const n = typeof x === 'number' ? x : Number(x);
  if (!Number.isInteger(n) || n < 1) return GAST_TAGE_STANDARD;
  return Math.min(n, GAST_TAGE_MAX);
}

/** Text zum Weitergeben an den Partner ohne ARGONAUT (Sie-Form, kein Werbetext). */
export function gastLinkText(firma: string, auftrag: string, link: string, bisIso: string): string {
  const d = bisIso.slice(0, 10).split('-');
  const bis = d.length === 3 ? `${d[2]}.${d[1]}.${d[0]}` : bisIso;
  return [
    `Guten Tag, ${firma.trim() || 'wir'} ${firma.trim() ? 'gibt' : 'geben'} Ihnen den Auftrag „${auftrag}".`,
    `Unter diesem Link sehen Sie das Fahrzeug, können den Auftrag annehmen, Fotos und Notizen hinterlegen, fertig melden und Ihre Rechnung hochladen (gültig bis ${bis}):`,
    link,
    'Bitte geben Sie den Link nicht weiter.',
  ].join('\n');
}

// --- Gast-Auftrag anlegen -----------------------------------------------------------------------------
export type GastAuftragFelder = {
  partner_betrieb: null; gast_name: string; gast_kontakt: string | null; titel: string; beschreibung: string | null; faellig_am: string | null;
  freigabe_fotos: boolean; freigabe_fin: boolean; freigabe_km: boolean;
};

/** Auftrag an einen Partner OHNE ARGONAUT (Gast-Link) prüfen — gleiche Grenzen wie der Betrieb-Auftrag. */
export function gastAuftragPruefen(e: {
  gast_name?: unknown; gast_kontakt?: unknown; titel?: unknown; beschreibung?: unknown; faellig_am?: unknown;
  freigabe_fotos?: unknown; freigabe_fin?: unknown; freigabe_km?: unknown;
}, heute: string): { ok: true; felder: GastAuftragFelder } | { ok: false; fehler: string } {
  const name = typeof e.gast_name === 'string' ? e.gast_name.trim() : '';
  if (!name) return { ok: false, fehler: 'Bitte den Namen des Partners angeben (Firma oder Person).' };
  if (name.length > 120) return { ok: false, fehler: 'Der Name darf höchstens 120 Zeichen haben.' };
  const kontakt = typeof e.gast_kontakt === 'string' ? e.gast_kontakt.trim() : '';
  if (kontakt.length > 200) return { ok: false, fehler: 'Der Kontakt darf höchstens 200 Zeichen haben.' };
  const titel = typeof e.titel === 'string' ? e.titel.trim() : '';
  if (!titel) return { ok: false, fehler: 'Bitte kurz sagen, was der Partner tun soll.' };
  if (titel.length > 120) return { ok: false, fehler: 'Der Titel darf höchstens 120 Zeichen haben.' };
  const b = typeof e.beschreibung === 'string' ? e.beschreibung.trim() : '';
  if (b.length > 1000) return { ok: false, fehler: 'Die Beschreibung darf höchstens 1.000 Zeichen haben.' };
  const f = typeof e.faellig_am === 'string' ? e.faellig_am.trim() : '';
  if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) return { ok: false, fehler: 'Das Datum ist ungültig.' };
  if (f && f < heute) return { ok: false, fehler: 'Der Termin liegt in der Vergangenheit.' };
  return {
    ok: true,
    felder: {
      partner_betrieb: null, gast_name: name, gast_kontakt: kontakt || null, titel, beschreibung: b || null, faellig_am: f || null,
      freigabe_fotos: e.freigabe_fotos === true, freigabe_fin: e.freigabe_fin === true, freigabe_km: e.freigabe_km !== false,
    },
  };
}

/** Lage des Gast-Links für die Anzeige beim Auftraggeber. */
export function gastLinkLage(a: { gast_bis: string | null; gast_gesperrt: boolean }, jetztIso: string): 'keiner' | 'aktiv' | 'abgelaufen' | 'gesperrt' {
  if (a.gast_gesperrt) return 'gesperrt';
  if (!a.gast_bis) return 'keiner';
  return a.gast_bis > jetztIso ? 'aktiv' : 'abgelaufen';
}
