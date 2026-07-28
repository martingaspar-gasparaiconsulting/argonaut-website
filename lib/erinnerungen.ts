// lib/erinnerungen.ts
// B-III (Teil 2) · Erinnerungen / No-Show-Prävention. Reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Eine Erinnerung ist ein Arbeitslisten-Eintrag: „an X erinnern, fällig am T,
// per Kanal K". Kann lose an einen Termin/eine Reservierung gekoppelt sein
// (bezug_typ + bezug_id, ohne harte DB-Kopplung). Reduziert No-Shows.
// Node-getestet (erinnerungen.test.ts).

export type BezugTyp = 'termin' | 'reservierung' | 'frei';
export type Kanal = 'telefon' | 'email' | 'sms' | 'whatsapp' | 'brief' | 'persoenlich';

export const KANAELE: { key: Kanal; label: string; icon: string }[] = [
  { key: 'telefon',     label: 'Telefon',     icon: '📞' },
  { key: 'email',       label: 'E-Mail',      icon: '✉️' },
  { key: 'sms',         label: 'SMS',         icon: '💬' },
  { key: 'whatsapp',    label: 'WhatsApp',    icon: '🟢' },
  { key: 'brief',       label: 'Brief',       icon: '📮' },
  { key: 'persoenlich', label: 'Persönlich',  icon: '🤝' },
];
export function kanalInfo(k: Kanal): { key: Kanal; label: string; icon: string } {
  return KANAELE.find((x) => x.key === k) ?? KANAELE[0];
}

export const BEZUG_TYPEN: { key: BezugTyp; label: string }[] = [
  { key: 'frei',          label: 'Freie Erinnerung' },
  { key: 'reservierung',  label: 'Reservierung' },
  { key: 'termin',        label: 'Termin' },
];

export type ErinnerungStatus = 'offen' | 'erledigt' | 'entfallen';
export const STATUS_INFO: Record<ErinnerungStatus, { label: string; farbe: 'gold' | 'cyan' | 'green' | 'textDim' | 'danger' | 'warn' }> = {
  offen:     { label: 'offen',     farbe: 'gold' },
  erledigt:  { label: 'erinnert',  farbe: 'green' },
  entfallen: { label: 'entfallen', farbe: 'textDim' },
};

export const VORLAUF_STD_STD = 24; // Standard-Vorlauf: 24 Std vor dem Termin

// ---------------------------------------------------------------------------
// Zeit-Helfer
// ---------------------------------------------------------------------------
const MS_STD = 3600000;
const MS_TAG = 86400000;
function toDate(v: string | Date): Date { return v instanceof Date ? v : new Date(v); }
function tagUTC(v: string | Date): number {
  if (typeof v === 'string' && v.length >= 10) {
    const y = Number(v.slice(0, 4)), m = Number(v.slice(5, 7)), d = Number(v.slice(8, 10));
    if (y && m && d) return Date.UTC(y, m - 1, d);
  }
  const dt = toDate(v);
  return Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
function pad(n: number) { return String(n).padStart(2, '0'); }

/** Fälligkeit als Date: Termin minus Vorlauf-Stunden. */
export function faelligAusDate(terminAm: string | Date, vorlaufStunden: number = VORLAUF_STD_STD): Date {
  return new Date(toDate(terminAm).getTime() - (Number(vorlaufStunden) || 0) * MS_STD);
}

/** Fälligkeit als lokaler ISO-String (YYYY-MM-DDTHH:MM) für datetime-local. */
export function faelligAus(terminAm: string | Date, vorlaufStunden: number = VORLAUF_STD_STD): string {
  const d = faelligAusDate(terminAm, vorlaufStunden);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Fälligkeit / Einordnung
// ---------------------------------------------------------------------------
export interface ErinnerungLite {
  faellig_am?: string | Date | null;
  status?: string;
}

/** Offen UND fällig (fällig-Zeitpunkt erreicht/überschritten). */
export function istOffenFaellig(e: ErinnerungLite, jetzt: string | Date = new Date()): boolean {
  if ((e.status ?? 'offen') !== 'offen' || !e.faellig_am) return false;
  return toDate(e.faellig_am).getTime() <= toDate(jetzt).getTime();
}

/** Stunden bis zur Fälligkeit (negativ = überfällig), 1 Nachkommastelle. */
export function restStunden(faelligAmV: string | Date, jetzt: string | Date = new Date()): number {
  return Math.round(((toDate(faelligAmV).getTime() - toDate(jetzt).getTime()) / MS_STD) * 10) / 10;
}

export type Bucket = 'ueberfaellig' | 'heute' | 'diese_woche' | 'spaeter';

/** Einordnung einer OFFENEN Erinnerung nach Fälligkeitsdatum. */
export function bucket(faelligAmV: string | Date, jetzt: string | Date = new Date()): Bucket {
  const f = tagUTC(faelligAmV), j = tagUTC(jetzt);
  if (toDate(faelligAmV).getTime() < toDate(jetzt).getTime() && f <= j) return 'ueberfaellig';
  if (f === j) return 'heute';
  const tage = Math.round((f - j) / MS_TAG);
  if (tage <= 7) return 'diese_woche';
  return 'spaeter';
}

// ---------------------------------------------------------------------------
// KPI-Zähler (für die Seite + augeErinnerungen).
// ---------------------------------------------------------------------------
export interface ErinnerungKennzahlen {
  offen: number;
  faelligJetzt: number;   // offen & Fälligkeit erreicht -> jetzt abarbeiten
  heute: number;          // offen & heute fällig
  dieseWoche: number;     // offen & in den nächsten 7 Tagen fällig (ohne heute/überfällig)
  erledigt: number;
  entfallen: number;
}

export function zaehleErinnerungen(erinnerungen: ErinnerungLite[], jetzt: string | Date = new Date()): ErinnerungKennzahlen {
  let offen = 0, faelligJetzt = 0, heute = 0, dieseWoche = 0, erledigt = 0, entfallen = 0;
  for (const e of erinnerungen) {
    const st = (e.status ?? 'offen') as ErinnerungStatus;
    if (st === 'erledigt') { erledigt++; continue; }
    if (st === 'entfallen') { entfallen++; continue; }
    offen++;
    if (!e.faellig_am) continue;
    if (istOffenFaellig(e, jetzt)) faelligJetzt++;
    const b = bucket(e.faellig_am, jetzt);
    if (b === 'heute') heute++;
    else if (b === 'diese_woche') dieseWoche++;
  }
  return { offen, faelligJetzt, heute, dieseWoche, erledigt, entfallen };
}
