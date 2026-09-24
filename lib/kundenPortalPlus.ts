// ============================================================================
// ARGONAUT OS · lib/kundenPortalPlus.ts — Kunden-Portal plus (Paket PN, B26)
//
// Reine Logik, node-getestet (tests/kundenPortalPlusP88.test.mjs).
// Keine Imports aus Next oder Supabase, keine Uhrzeit von selbst.
//
// Das bestehende Portal (/portal/<token>) zeigt Rechnungen, Termine, Angebote,
// Sendungen. PN ergänzt — in einem EIGENEN Endpunkt, damit das alte Portal
// unberührt bleibt:
//   Baufortschritt   freigegebene Projekte mit Fortschritt aus den Aufgaben,
//                    Kunden-Meldungen des Betriebs, ausgewählte Baustellen-Fotos
//   Dokumente        vom Betrieb für diesen Kunden hochgeladene Dateien
//   Freigaben        der Kunde gibt frei oder lehnt ab (mit Namen, Zeitpunkt)
//   Monteur-Status   „Ihr Monteur ist unterwegs / vor Ort" — nur heute,
//                    NIE mit Standort oder Namen des Mitarbeiters
//
// ANDOCKPUNKTE: SMS/WhatsApp „Monteur unterwegs" (P03, externer Partner),
// Nachtrag aus PI direkt als Freigabe, Abnahme-Formular (PL) als Dokument.
// ============================================================================

export const FREIGABE_STATUS = ['offen', 'freigegeben', 'abgelehnt', 'zurueckgezogen'] as const;
export type FreigabeStatus = (typeof FREIGABE_STATUS)[number];

export function freigabeStatusFuer(s: unknown): FreigabeStatus {
  return (FREIGABE_STATUS as readonly string[]).includes(String(s)) ? (s as FreigabeStatus) : 'offen';
}

export const FREIGABE_LABEL: Record<FreigabeStatus, string> = {
  offen: 'Wartet auf Ihre Entscheidung',
  freigegeben: 'Freigegeben',
  abgelehnt: 'Abgelehnt',
  zurueckgezogen: 'Zurückgezogen',
};

/**
 * Antwort des Kunden prüfen. Name ist Pflicht (wer hat entschieden?), bei
 * Ablehnung auch ein Grund — sonst weiß der Betrieb nicht, was er ändern soll.
 */
export function pruefeFreigabeAntwort(roh: {
  entscheidung?: unknown; name?: unknown; kommentar?: unknown;
}): { fehler: string | null; entscheidung: 'freigegeben' | 'abgelehnt' | null; name: string; kommentar: string } {
  const e = roh.entscheidung === 'freigegeben' || roh.entscheidung === 'abgelehnt' ? roh.entscheidung : null;
  const name = String(roh.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const kommentar = String(roh.kommentar ?? '').replace(/\r\n?/g, '\n').trim().slice(0, 1000);
  if (!e) return { fehler: 'Bitte „Freigeben" oder „Ablehnen" wählen.', entscheidung: null, name, kommentar };
  if (name.length < 2) return { fehler: 'Bitte Ihren Namen angeben.', entscheidung: e, name, kommentar };
  if (e === 'abgelehnt' && kommentar.length < 3) return { fehler: 'Bitte kurz den Grund für die Ablehnung nennen.', entscheidung: e, name, kommentar };
  return { fehler: null, entscheidung: e, name, kommentar };
}

/** Beantwortbar ist nur eine offene Freigabe. Eine abgelaufene Frist sperrt nicht, sie wird angezeigt. */
export function istBeantwortbar(f: { status?: unknown }): boolean {
  return freigabeStatusFuer(f.status) === 'offen';
}

export function fristAbgelaufen(frist: string | null | undefined, heute: string): boolean {
  return !!frist && /^\d{4}-\d{2}-\d{2}$/.test(frist.slice(0, 10)) && frist.slice(0, 10) < heute;
}

/** Neue Freigabe prüfen (Betrieb). */
export function pruefeNeueFreigabe(roh: { titel?: unknown; text?: unknown; frist?: unknown }, heute: string): {
  fehler: string | null; titel: string; text: string; frist: string | null;
} {
  const titel = String(roh.titel ?? '').trim().slice(0, 160);
  const text = String(roh.text ?? '').trim().slice(0, 4000);
  const f = String(roh.frist ?? '').trim();
  const frist = /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null;
  if (!titel) return { fehler: 'Bitte einen Titel angeben.', titel, text, frist };
  if (text.length < 10) return { fehler: 'Bitte beschreiben, was der Kunde freigeben soll.', titel, text, frist };
  if (frist && frist < heute) return { fehler: 'Die Frist liegt in der Vergangenheit.', titel, text, frist };
  return { fehler: null, titel, text, frist };
}

// ---------------------------------------------------------------------------
// Baufortschritt
// ---------------------------------------------------------------------------

/** Fortschritt aus den Projekt-Aufgaben. Ohne Aufgaben: null (nicht 0 %). */
export function fortschrittAus(aufgaben: { erledigt?: unknown; status?: unknown }[] | null | undefined): {
  erledigt: number; gesamt: number; pct: number | null;
} {
  const liste = Array.isArray(aufgaben) ? aufgaben : [];
  const gesamt = liste.length;
  const erledigt = liste.filter((a) => a.erledigt === true || String(a.status ?? '').toLowerCase() === 'erledigt').length;
  return { erledigt, gesamt, pct: gesamt ? Math.round((erledigt / gesamt) * 100) : null };
}

/** Manueller Fortschritt aus einer Meldung (0–100, ganzzahlig) oder null. */
export function leseProzent(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(',', '.').replace('%', '').trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n);
}

/**
 * Was der Kunde als Fortschritt sieht: die neueste Meldung mit Prozentangabe
 * hat Vorrang (der Betrieb weiß es besser als die Aufgabenliste), sonst die
 * Aufgaben, sonst nichts.
 */
export function angezeigterFortschritt(
  meldungen: { fortschritt?: number | null; erstellt_am: string }[],
  ausAufgaben: number | null,
): { pct: number | null; quelle: 'meldung' | 'aufgaben' | null } {
  const mitWert = [...meldungen]
    .filter((m) => typeof m.fortschritt === 'number')
    .sort((a, b) => b.erstellt_am.localeCompare(a.erstellt_am));
  if (mitWert.length) return { pct: mitWert[0].fortschritt as number, quelle: 'meldung' };
  if (ausAufgaben !== null) return { pct: ausAufgaben, quelle: 'aufgaben' };
  return { pct: null, quelle: null };
}

// ---------------------------------------------------------------------------
// Monteur-Status
// ---------------------------------------------------------------------------

/** Kalendertag in Deutschland (YYYY-MM-DD) für einen Zeitpunkt. */
export function tagInBerlin(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const teile = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return teile;
}

export function uhrzeitInBerlin(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).format(d);
}

export type EinsatzRoh = {
  titel?: string | null; beginn_am?: string | null; ende_am?: string | null; status?: string | null;
  unterwegs_am?: string | null; vor_ort_am?: string | null; erledigt_am?: string | null;
};

export type MonteurStatus =
  | { art: 'unterwegs'; seit: string | null; titel: string }
  | { art: 'vor_ort'; seit: string | null; titel: string }
  | { art: 'heute'; beginn: string | null; ende: string | null; titel: string }
  | { art: 'erledigt'; am: string | null; titel: string };

/**
 * Der eine Status, den der Kunde HEUTE sehen soll — Vorrang: unterwegs >
 * vor Ort > nächster geplanter Einsatz heute > heute erledigt. Nur Uhrzeiten,
 * keine Koordinaten, keine Namen.
 */
export function monteurStatus(einsaetze: EinsatzRoh[] | null | undefined, heute: string): MonteurStatus | null {
  const liste = (Array.isArray(einsaetze) ? einsaetze : []).filter((e) => (e.status ?? '') !== 'abgesagt');
  const titel = (e: EinsatzRoh) => String(e.titel || 'Einsatz').slice(0, 120);
  const vonHeute = (iso: string | null | undefined) => tagInBerlin(iso) === heute;

  const unterwegs = liste.find((e) => e.status === 'unterwegs' && (vonHeute(e.unterwegs_am) || vonHeute(e.beginn_am)));
  if (unterwegs) return { art: 'unterwegs', seit: uhrzeitInBerlin(unterwegs.unterwegs_am), titel: titel(unterwegs) };
  const vorOrt = liste.find((e) => e.status === 'vor_ort' && (vonHeute(e.vor_ort_am) || vonHeute(e.beginn_am)));
  if (vorOrt) return { art: 'vor_ort', seit: uhrzeitInBerlin(vorOrt.vor_ort_am), titel: titel(vorOrt) };
  const geplant = liste
    .filter((e) => (e.status ?? 'geplant') === 'geplant' && vonHeute(e.beginn_am))
    .sort((a, b) => String(a.beginn_am).localeCompare(String(b.beginn_am)))[0];
  if (geplant) return { art: 'heute', beginn: uhrzeitInBerlin(geplant.beginn_am), ende: uhrzeitInBerlin(geplant.ende_am), titel: titel(geplant) };
  const erledigt = liste
    .filter((e) => e.status === 'erledigt' && vonHeute(e.erledigt_am))
    .sort((a, b) => String(b.erledigt_am).localeCompare(String(a.erledigt_am)))[0];
  if (erledigt) return { art: 'erledigt', am: uhrzeitInBerlin(erledigt.erledigt_am), titel: titel(erledigt) };
  return null;
}

export function monteurSatz(s: MonteurStatus | null): string | null {
  if (!s) return null;
  switch (s.art) {
    case 'unterwegs': return `Ihr Monteur ist unterwegs zu Ihnen${s.seit ? ` (losgefahren um ${s.seit} Uhr)` : ''}.`;
    case 'vor_ort': return `Ihr Monteur ist vor Ort${s.seit ? ` (seit ${s.seit} Uhr)` : ''}.`;
    case 'heute': return `Heute geplant: ${s.titel}${s.beginn ? `, ab ${s.beginn} Uhr` : ''}${s.ende ? ` bis ${s.ende} Uhr` : ''}.`;
    case 'erledigt': return `Der heutige Einsatz ist abgeschlossen${s.am ? ` (${s.am} Uhr)` : ''}.`;
  }
}

// ---------------------------------------------------------------------------
// Dokumente
// ---------------------------------------------------------------------------

export const DOK_BUCKET = 'portal-dokumente';
export const DOK_MAX_BYTES = 20 * 1024 * 1024;
export const DOK_TYPEN: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Datei prüfen: erlaubte Endung, Größe. */
export function pruefeDokument(name: string, groesse: number): string | null {
  const endung = (name.split('.').pop() || '').toLowerCase();
  if (!DOK_TYPEN[endung]) return 'Erlaubt sind PDF, Bilder (JPG, PNG, WebP), Word und Excel.';
  if (!Number.isFinite(groesse) || groesse <= 0) return 'Die Datei ist leer.';
  if (groesse > DOK_MAX_BYTES) return 'Die Datei ist größer als 20 MB.';
  return null;
}

/** Speicherpfad: <Betrieb>/<Kontakt>/<id>.<endung> — der Originalname steht nur in der Tabelle. */
export function dokPfad(betrieb: string, kontaktId: string, id: string, dateiname: string): string {
  const endung = (dateiname.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const sauber = (s: string) => s.replace(/[^0-9a-zA-Z-]/g, '');
  return `${sauber(betrieb)}/${sauber(kontaktId)}/${sauber(id)}.${endung}`;
}

/** Ein Pfad gehört nur dann zum Kunden, wenn er mit <Betrieb>/<Kontakt>/ beginnt. */
export function pfadGehoertZu(pfad: string, betrieb: string, kontaktId: string): boolean {
  return typeof pfad === 'string' && pfad.startsWith(`${betrieb}/${kontaktId}/`) && !pfad.includes('..');
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function istUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}
