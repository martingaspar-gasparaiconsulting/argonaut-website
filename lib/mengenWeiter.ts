// ============================================================================
// ARGONAUT OS · lib/mengenWeiter.ts — MO4 Teil 3 (16.10.2026)
//
// 1) Mengen direkt am Auftrag/Objekt/Projekt erfassen: Link mit Vorbelegung
//    (Kunde, Bezug) in die Mengen-Abrechnung. Nichts wird ohne Klick
//    gespeichert, Preise werden NIE vorbelegt.
// 2) Stornierte Sammelrechnung: die daran gebundenen Leistungen erkennen,
//    damit sie wieder freigegeben und neu abgerechnet werden können.
//
// Reine Logik, importfrei, getestet in tests/mengenWeiterMO4c.test.mjs.
// Spalten bezug_typ/bezug_id gibt es seit SQL p396 — kein neues SQL.
// ============================================================================

export const BEZUG_TYPEN = ['auftrag', 'objekt', 'projekt', 'kunde', 'sonstiges'] as const;
export type BezugTyp = (typeof BEZUG_TYPEN)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function istUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

function kurz(v: unknown, max: number): string {
  return String(v ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

export type MengenVorbelegung = {
  bezug_typ: BezugTyp | null;
  bezug_id: string | null;
  kontakt_id: string;
  empfaenger_name: string;
  bezug_label: string;
};

/** Link in die Mengen-Abrechnung, z. B. vom Auftrag. Nur eigene Adresse, nur echte IDs. */
export function mengenLink(v: { typ: BezugTyp; id: string; kontakt_id?: string | null; kunde?: string | null; label?: string | null }): string {
  const p = new URLSearchParams();
  if ((BEZUG_TYPEN as readonly string[]).includes(v.typ) && istUuid(v.id)) p.set('bezug', `${v.typ}:${v.id}`);
  if (istUuid(v.kontakt_id)) p.set('kontakt', String(v.kontakt_id));
  else if (kurz(v.kunde, 120)) p.set('kunde', kurz(v.kunde, 120));
  if (kurz(v.label, 120)) p.set('label', kurz(v.label, 120));
  const q = p.toString();
  return q ? `/dashboard/mengen?${q}` : '/dashboard/mengen';
}

/** Vorbelegung aus der Adresse lesen — alles Unbekannte fällt weg. */
export function leseVorbelegung(suche: string | URLSearchParams | null | undefined): MengenVorbelegung | null {
  const p = suche instanceof URLSearchParams ? suche : new URLSearchParams(String(suche ?? '').replace(/^\?/, ''));
  const roh = String(p.get('bezug') ?? '');
  const i = roh.indexOf(':');
  const typ = i > 0 ? roh.slice(0, i) : '';
  const id = i > 0 ? roh.slice(i + 1) : '';
  const bezugOk = (BEZUG_TYPEN as readonly string[]).includes(typ) && istUuid(id);
  const kontakt = istUuid(p.get('kontakt')) ? String(p.get('kontakt')) : '';
  const kunde = kontakt ? '' : kurz(p.get('kunde'), 120);
  if (!bezugOk && !kontakt && !kunde) return null;
  return {
    bezug_typ: bezugOk ? (typ as BezugTyp) : null,
    bezug_id: bezugOk ? id : null,
    kontakt_id: kontakt,
    empfaenger_name: kunde,
    bezug_label: bezugOk ? kurz(p.get('label'), 120) : '',
  };
}

/** Bezug für das Speichern — nur vollständig (Typ + echte ID), sonst beides leer. */
export function bezugFuerSpeichern(v: MengenVorbelegung | null | undefined): { bezug_typ: BezugTyp | null; bezug_id: string | null } {
  if (!v || !v.bezug_typ || !istUuid(v.bezug_id)) return { bezug_typ: null, bezug_id: null };
  return { bezug_typ: v.bezug_typ, bezug_id: v.bezug_id };
}

export type GebundeneZeile = { id: string; abgerechnet?: boolean | null; rechnung_id?: string | null };
export type RechnungKurz = { id: string; zahlungsstatus?: string | null; rechnungsnummer?: string | null };

/**
 * Leistungen, die an einer STORNIERTEN Rechnung hängen — je Rechnung gruppiert.
 * Nur „storniert" zählt; offene, bezahlte oder unbekannte Rechnungen nie.
 */
export function anStorniertenRechnungen(rows: GebundeneZeile[], rechnungen: RechnungKurz[]): { rechnung_id: string; nummer: string; ids: string[] }[] {
  const storniert = new Map<string, RechnungKurz>();
  for (const r of rechnungen ?? []) if (r?.id && r.zahlungsstatus === 'storniert') storniert.set(r.id, r);
  const m = new Map<string, { rechnung_id: string; nummer: string; ids: string[] }>();
  for (const z of rows ?? []) {
    if (!z?.id || !z.rechnung_id || !storniert.has(z.rechnung_id)) continue;
    const g = m.get(z.rechnung_id) ?? { rechnung_id: z.rechnung_id, nummer: String(storniert.get(z.rechnung_id)?.rechnungsnummer ?? '').trim(), ids: [] };
    g.ids.push(z.id);
    m.set(z.rechnung_id, g);
  }
  return [...m.values()];
}

/** Server-Prüfung vor dem Freigeben: nur eine stornierte Rechnung des eigenen Betriebs. */
export function freigabePruefen(r: { owner_user_id?: string | null; zahlungsstatus?: string | null } | null | undefined, betrieb: string): string | null {
  if (!r) return 'Rechnung nicht gefunden.';
  if (r.owner_user_id !== betrieb) return 'Rechnung nicht gefunden.';
  if (r.zahlungsstatus !== 'storniert') return 'Leistungen werden nur bei einer stornierten Rechnung wieder frei. Bitte die Rechnung zuerst stornieren.';
  return null;
}

// ============================================================================
// MO4 Teil 4 — Monatslauf: alle offenen Leistungen eines Monats je Kunde
// ============================================================================

/** Vormonat als JJJJ-MM (Monatslauf schlägt standardmäßig den abgelaufenen Monat vor). */
export function vormonat(heuteIso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(String(heuteIso ?? ''));
  if (!m) return '';
  let j = Number(m[1]), mo = Number(m[2]) - 1;
  if (mo < 1) { mo = 12; j -= 1; }
  return `${j}-${String(mo).padStart(2, '0')}`;
}

export function istMonat(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Nur offene Leistungen (nicht abgerechnet, ohne Rechnung) mit Datum im Monat — oder bis Monatsende, wenn „bisEnde". */
export function offeneImMonat<T extends { id?: string; datum: string; abgerechnet?: boolean | null; rechnung_id?: string | null }>(rows: T[], monat: string, bisEnde = false): T[] {
  if (!istMonat(monat)) return [];
  return (rows ?? []).filter((r) => {
    if (!r?.id || r.abgerechnet || r.rechnung_id) return false;
    const m = String(r.datum ?? '').slice(0, 7);
    return bisEnde ? m <= monat : m === monat;
  });
}

export type LaufErgebnis = { schluessel: string; name: string; ok: boolean; rechnungId?: string; fehler?: string };

/** Zusammenfassung nach dem Lauf — ehrlich: wie viele geklappt, wie viele nicht. */
export function laufText(erg: LaufErgebnis[]): string {
  const gut = erg.filter((e) => e.ok).length;
  const schlecht = erg.length - gut;
  if (!erg.length) return 'Keine Rechnungen erstellt.';
  return schlecht
    ? `${gut} von ${erg.length} Rechnungen erstellt — ${schlecht} nicht (siehe Liste).`
    : `${gut} ${gut === 1 ? 'Rechnung' : 'Rechnungen'} erstellt. Bitte prüfen und versenden.`;
}
