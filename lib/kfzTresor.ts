// ============================================================================
// ARGONAUT OS · lib/kfzTresor.ts — Paket 277 (08.10.2026) · K13 Brief-Tresor und Aufbereitung
//
// 1) Tresor: Wo liegen Zulassungsbescheinigung Teil II (Brief), Teil I, Schlüssel,
//    CoC, Serviceheft? Ausgabe mit Name und Rückgabedatum, Verlauf schreibt nur die
//    Datenbank (Auslöser). Der Brief geht nie an den Käufer, solange noch Geld offen ist.
// 2) Zulassungsauftrag: Zulassung, Ummeldung, Abmeldung, Ausfuhr, Kurzzeit mit
//    Unterlagen-Liste (Richtwerte — jede Zulassungsstelle kann mehr verlangen).
// 3) Aufbereitung als interner Auftrag im Werkstatt-Board (werkstatt_auftraege mit
//    kfz_bestand_id); Kosten danach per Knopf in die Kalkulation (K5) — nie doppelt.
//
// Reine Logik: nur Import der zentralen Rundung, KEINE Hooks, keine Systemuhr.
// ============================================================================

import { centRunden } from './zahlen';

export const TRESOR_ARTEN: { key: string; name: string; kurz: string }[] = [
  { key: 'zb2', name: 'Zulassungsbescheinigung Teil II (Fahrzeugbrief)', kurz: 'Brief (ZB II)' },
  { key: 'zb1', name: 'Zulassungsbescheinigung Teil I (Fahrzeugschein)', kurz: 'Schein (ZB I)' },
  { key: 'schluessel', name: 'Schlüssel', kurz: 'Schlüssel' },
  { key: 'coc', name: 'CoC-Papier (Übereinstimmungsbescheinigung)', kurz: 'CoC' },
  { key: 'serviceheft', name: 'Serviceheft / Wartungsnachweise', kurz: 'Serviceheft' },
  { key: 'hu', name: 'HU-Bericht', kurz: 'HU-Bericht' },
  { key: 'sonstiges', name: 'Sonstiges', kurz: 'Sonstiges' },
];

export const TRESOR_STATUS: { key: string; name: string; stufe: 'ok' | 'warn' | 'info' | 'dim' | 'bad' }[] = [
  { key: 'im_haus', name: 'Im Haus', stufe: 'ok' },
  { key: 'ausgegeben', name: 'Ausgegeben', stufe: 'warn' },
  { key: 'bei_zulassung', name: 'Bei der Zulassungsstelle', stufe: 'info' },
  { key: 'bei_bank', name: 'Bei der Bank (Finanzierung)', stufe: 'info' },
  { key: 'fehlt', name: 'Fehlt / noch beim Vorbesitzer', stufe: 'bad' },
  { key: 'beim_kaeufer', name: 'An den Käufer übergeben', stufe: 'dim' },
];

export function artName(key: string | null | undefined, kurz = false): string {
  const a = TRESOR_ARTEN.find((x) => x.key === key);
  return a ? (kurz ? a.kurz : a.name) : String(key ?? '—');
}
export function statusName(key: string | null | undefined): string {
  return TRESOR_STATUS.find((x) => x.key === key)?.name ?? String(key ?? '—');
}
export function statusStufe(key: string | null | undefined): 'ok' | 'warn' | 'info' | 'dim' | 'bad' {
  return TRESOR_STATUS.find((x) => x.key === key)?.stufe ?? 'dim';
}

export type TresorEintrag = {
  id?: string; art: string; bezeichnung: string | null; anzahl: number; ort: string | null;
  status: string; ausgegeben_an: string | null; ausgegeben_am: string | null; zurueck_bis: string | null;
};

const text = (v: unknown, max: number): string | null => {
  const t = String(v ?? '').trim().slice(0, max);
  return t || null;
};

/** Neuen Tresor-Eintrag prüfen. Anzahl 1–20, Ort optional (z. B. „Tresor Fach 3", „Schlüsselbrett 17"). */
export function eintragPruefen(e: { art: string; bezeichnung?: string | null; anzahl?: number | null; ort?: string | null; status?: string | null }):
  { ok: true; felder: { art: string; bezeichnung: string | null; anzahl: number; ort: string | null; status: string } } | { ok: false; fehler: string } {
  if (!TRESOR_ARTEN.some((a) => a.key === e.art)) return { ok: false, fehler: 'Bitte die Art wählen.' };
  const n = e.anzahl ?? 1;
  if (!Number.isFinite(n) || n < 1 || n > 20 || Math.round(n) !== n) return { ok: false, fehler: 'Anzahl bitte als ganze Zahl von 1 bis 20.' };
  const status = e.status && TRESOR_STATUS.some((s) => s.key === e.status) ? e.status : 'im_haus';
  if (status === 'ausgegeben' || status === 'beim_kaeufer') return { ok: false, fehler: 'Neu erfasste Unterlagen sind im Haus, fehlen oder liegen bei Bank bzw. Zulassungsstelle.' };
  if (e.art === 'sonstiges' && !text(e.bezeichnung, 120)) return { ok: false, fehler: 'Bei „Sonstiges" bitte eine Bezeichnung eintragen.' };
  return { ok: true, felder: { art: e.art, bezeichnung: text(e.bezeichnung, 120), anzahl: n, ort: text(e.ort, 80), status } };
}

/**
 * Statuswechsel prüfen. „Ausgegeben" braucht einen Namen (wer hat es?); Rückgabe-
 * datum optional, nie in der Vergangenheit. „An den Käufer" ist endgültig und beim
 * Brief gesperrt, solange noch Geld offen ist (restOffen > 0). Unbekannter Rest
 * (null) sperrt nicht, gibt aber einen Hinweis.
 */
export function statusWechsel(
  e: Pick<TresorEintrag, 'art' | 'status'>, nach: string,
  zusatz: { an?: string | null; bis?: string | null; restOffen?: number | null }, heuteIso: string, jetztIso: string,
): { ok: true; felder: Record<string, unknown>; hinweis: string | null } | { ok: false; fehler: string } {
  if (!TRESOR_STATUS.some((s) => s.key === nach)) return { ok: false, fehler: 'Unbekannter Status.' };
  if (nach === e.status) return { ok: false, fehler: 'Der Status ist schon so gesetzt.' };
  if (e.status === 'beim_kaeufer') return { ok: false, fehler: 'An den Käufer übergeben ist abgeschlossen und lässt sich nicht mehr ändern.' };
  let hinweis: string | null = null;
  if (nach === 'beim_kaeufer' && e.art === 'zb2') {
    if (zusatz.restOffen !== null && zusatz.restOffen !== undefined && zusatz.restOffen > 0) {
      return { ok: false, fehler: `Es sind noch ${zusatz.restOffen.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € offen. Den Brief erst nach vollständiger Zahlung übergeben.` };
    }
    if (zusatz.restOffen === null || zusatz.restOffen === undefined) hinweis = 'Zum Fahrzeug ist kein Verkauf mit Zahlungsstand erfasst — bitte prüfen Sie, ob der Kaufpreis vollständig bezahlt ist.';
  }
  if (nach === 'ausgegeben') {
    const an = text(zusatz.an, 120);
    if (!an) return { ok: false, fehler: 'Bitte eintragen, wer die Unterlagen bzw. den Schlüssel bekommt.' };
    const bis = zusatz.bis && /^\d{4}-\d{2}-\d{2}$/.test(zusatz.bis) ? zusatz.bis : null;
    if (bis && bis < heuteIso) return { ok: false, fehler: 'Das Rückgabedatum liegt in der Vergangenheit.' };
    return { ok: true, hinweis, felder: { status: nach, ausgegeben_an: an, ausgegeben_am: jetztIso, zurueck_bis: bis } };
  }
  return { ok: true, hinweis, felder: { status: nach, ausgegeben_an: nach === 'beim_kaeufer' ? text(zusatz.an, 120) : null, ausgegeben_am: nach === 'beim_kaeufer' ? jetztIso : null, zurueck_bis: null } };
}

/** Ausgegeben und Rückgabedatum überschritten? */
export function ueberfaellig(e: Pick<TresorEintrag, 'status' | 'zurueck_bis'>, heuteIso: string): boolean {
  return e.status === 'ausgegeben' && !!e.zurueck_bis && e.zurueck_bis < heuteIso;
}

/**
 * Brief-Wächter je Fahrzeug: Solange es im Bestand ist (nicht verkauft/archiviert),
 * sollte der Brief im Haus oder bei der Bank liegen.
 */
export function briefLage(fzStatus: string, eintraege: Pick<TresorEintrag, 'art' | 'status'>[]): { stufe: 'ok' | 'warn' | 'bad' | 'dim'; text: string } {
  if (fzStatus === 'verkauft' || fzStatus === 'archiv') return { stufe: 'dim', text: 'Fahrzeug verkauft bzw. archiviert.' };
  const briefe = eintraege.filter((e) => e.art === 'zb2');
  if (!briefe.length) return { stufe: fzStatus === 'zulauf' ? 'dim' : 'warn', text: 'Brief (ZB II) ist noch nicht im Tresor erfasst.' };
  if (briefe.some((b) => b.status === 'im_haus')) return { stufe: 'ok', text: 'Brief liegt im Haus.' };
  if (briefe.some((b) => b.status === 'bei_bank')) return { stufe: 'ok', text: 'Brief liegt bei der Bank (Finanzierung).' };
  if (briefe.some((b) => b.status === 'fehlt')) return { stufe: 'bad', text: 'Brief fehlt — Fahrzeug so nicht verkaufsfähig.' };
  const b = briefe[0];
  return { stufe: 'warn', text: `Brief nicht im Haus: ${statusName(b.status)}.` };
}

// --- Zulassungsauftrag ----------------------------------------------------------------

export type Unterlage = { key: string; name: string; pflicht: boolean };

const U: Record<string, Unterlage> = {
  zb1: { key: 'zb1', name: 'Zulassungsbescheinigung Teil I', pflicht: true },
  zb2: { key: 'zb2', name: 'Zulassungsbescheinigung Teil II', pflicht: true },
  evb: { key: 'evb', name: 'eVB-Nummer der Versicherung', pflicht: true },
  ausweis: { key: 'ausweis', name: 'Ausweis des Halters (bzw. Registerauszug)', pflicht: true },
  vollmacht: { key: 'vollmacht', name: 'Vollmacht des Halters (wenn nicht selbst vor Ort)', pflicht: false },
  sepa: { key: 'sepa', name: 'SEPA-Mandat Kfz-Steuer', pflicht: true },
  hu: { key: 'hu', name: 'Nachweis gültige HU', pflicht: true },
  coc: { key: 'coc', name: 'CoC-Papier (Neufahrzeug/Import)', pflicht: false },
  schilder: { key: 'schilder', name: 'Kennzeichenschilder (bei Abmeldung)', pflicht: true },
  wunsch: { key: 'wunsch', name: 'Wunschkennzeichen reserviert', pflicht: false },
};

export const ZULASSUNG_ARTEN: { key: string; name: string; unterlagen: Unterlage[] }[] = [
  { key: 'zulassung', name: 'Zulassung', unterlagen: [U.zb1, U.zb2, U.evb, U.ausweis, U.sepa, U.hu, U.vollmacht, U.coc, U.wunsch] },
  { key: 'ummeldung', name: 'Ummeldung (Halterwechsel)', unterlagen: [U.zb1, U.zb2, U.evb, U.ausweis, U.sepa, U.hu, U.vollmacht, U.wunsch] },
  { key: 'abmeldung', name: 'Abmeldung (Außerbetriebsetzung)', unterlagen: [U.zb1, U.schilder, { ...U.ausweis, pflicht: false }, U.vollmacht] },
  { key: 'ausfuhr', name: 'Ausfuhrkennzeichen', unterlagen: [U.zb1, U.zb2, { ...U.evb, name: 'eVB-Nummer der Ausfuhrversicherung' }, U.ausweis, U.hu, U.vollmacht] },
  { key: 'kurzzeit', name: 'Kurzzeitkennzeichen', unterlagen: [{ ...U.evb, name: 'eVB-Nummer für Kurzzeitkennzeichen' }, U.ausweis, U.sepa, { ...U.hu, pflicht: false }, U.vollmacht] },
];

export const ZULASSUNG_STATUS: { key: string; name: string }[] = [
  { key: 'offen', name: 'Unterlagen sammeln' },
  { key: 'beim_amt', name: 'Bei der Zulassungsstelle' },
  { key: 'erledigt', name: 'Erledigt' },
  { key: 'storniert', name: 'Storniert' },
];

export function zulassungArt(key: string | null | undefined) {
  return ZULASSUNG_ARTEN.find((a) => a.key === key) ?? null;
}

/** Fortschritt der Unterlagen: erledigt/gesamt nur über Pflicht-Unterlagen; fehlende Pflicht-Unterlagen als Liste. */
export function zulassungFortschritt(art: string, abgehakt: Record<string, boolean> | null | undefined): { erledigt: number; gesamt: number; fehlt: string[]; vollstaendig: boolean } {
  const a = zulassungArt(art);
  if (!a) return { erledigt: 0, gesamt: 0, fehlt: [], vollstaendig: false };
  const pflicht = a.unterlagen.filter((u) => u.pflicht);
  const fehlt = pflicht.filter((u) => !(abgehakt && abgehakt[u.key] === true)).map((u) => u.name);
  return { erledigt: pflicht.length - fehlt.length, gesamt: pflicht.length, fehlt, vollstaendig: fehlt.length === 0 };
}

/** Haken bereinigen: nur bekannte Unterlagen der Art, nur true/false. */
export function unterlagenBereinigen(art: string, roh: unknown): Record<string, boolean> {
  const a = zulassungArt(art);
  const o = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  const aus: Record<string, boolean> = {};
  for (const u of a?.unterlagen ?? []) aus[u.key] = o[u.key] === true;
  return aus;
}

/** eVB-Nummer: 7 Zeichen, Buchstaben und Ziffern (Großschreibung). Leer erlaubt. */
export function evbPruefen(roh: string | null | undefined): { ok: true; evb: string | null } | { ok: false; fehler: string } {
  const e = String(roh ?? '').replace(/\s/g, '').toUpperCase();
  if (!e) return { ok: true, evb: null };
  if (!/^[A-Z0-9]{7}$/.test(e)) return { ok: false, fehler: 'Eine eVB-Nummer hat 7 Zeichen (Buchstaben und Ziffern).' };
  return { ok: true, evb: e };
}

/** Statuswechsel Zulassung: „Bei der Zulassungsstelle" erst mit allen Pflicht-Unterlagen; erledigt/storniert sind endgültig. */
export function zulassungStatusPruefen(alt: string, nach: string, art: string, abgehakt: Record<string, boolean> | null): { ok: true } | { ok: false; fehler: string } {
  if (!ZULASSUNG_STATUS.some((s) => s.key === nach)) return { ok: false, fehler: 'Unbekannter Status.' };
  if (alt === 'erledigt' || alt === 'storniert') return { ok: false, fehler: 'Der Auftrag ist abgeschlossen.' };
  if ((nach === 'beim_amt' || nach === 'erledigt') && !zulassungFortschritt(art, abgehakt).vollstaendig) {
    return { ok: false, fehler: `Es fehlen noch: ${zulassungFortschritt(art, abgehakt).fehlt.join(', ')}.` };
  }
  return { ok: true };
}

/** Kennzeichen vereinheitlichen (Großbuchstaben, ein Leerzeichen bzw. Bindestrich bleibt). */
export function kzNorm(roh: string | null | undefined): string | null {
  const k = String(roh ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  return k ? k.slice(0, 15) : null;
}

// --- Aufbereitung als interner Werkstattauftrag ----------------------------------------

export const INTERN_KUNDE = 'Intern · Fahrzeughandel';

/** Felder für den internen Werkstattauftrag „Aufbereitung" zum Bestandsfahrzeug. */
export function aufbereitungAuftrag(fz: { id: string; interne_nr: string | null; marke: string | null; modell: string | null; kennzeichen: string | null; fin: string | null; km_stand: number | null }, wunsch: string | null, bis: string | null) {
  const name = [fz.marke, fz.modell].filter(Boolean).join(' ') || 'Fahrzeug';
  return {
    titel: `Aufbereitung ${fz.interne_nr ?? ''} ${name}`.replace(/\s+/g, ' ').trim().slice(0, 140),
    kunde_name: INTERN_KUNDE,
    kennzeichen: fz.kennzeichen,
    kfz_bestand_id: fz.id,
    prioritaet: 'normal',
    zugesagt_am: bis && /^\d{4}-\d{2}-\d{2}$/.test(bis) ? bis : null,
    kilometerstand: fz.km_stand,
    beschreibung: [`Interner Auftrag aus dem Fahrzeugbestand${fz.fin ? ` (FIN ${fz.fin})` : ''}. Keine Kundenrechnung — die Kosten gehen in die Kalkulation des Fahrzeugs.`, text(wunsch, 1000)].filter(Boolean).join('\n\n'),
  };
}

/** Ist der Werkstattauftrag ein interner Auftrag des Fahrzeughandels? (dann nie eine Kundenrechnung) */
export function istInternerAuftrag(a: { kfz_bestand_id?: string | null } | null | undefined): boolean {
  return !!a && typeof a.kfz_bestand_id === 'string' && a.kfz_bestand_id.length > 0;
}

/** Bezeichnung des Kostenpostens — daran erkennt die Übernahme, dass sie schon erfolgt ist. */
export function kostenBezeichnung(auftrag: { id: string; nummer: string | null }): string {
  return `Werkstattauftrag ${auftrag.nummer ?? auftrag.id.slice(0, 8)}`;
}

/**
 * Kosten der Aufbereitung in die Kalkulation übernehmen: nur wenn der Auftrag fertig
 * ist, noch nicht übernommen wurde und der Betrag > 0 ist. Der Betrag ist änderbar,
 * weil der interne Verrechnungssatz oft unter dem Kundenpreis liegt.
 */
export function kostenUebernahme(
  auftrag: { id: string; nummer: string | null; status: string }, betragNetto: number | null,
  vorhandeneBezeichnungen: (string | null)[],
): { ok: true; felder: { art: string; bezeichnung: string; betrag_netto: number; plan: boolean } } | { ok: false; fehler: string } {
  if (auftrag.status !== 'fertig' && auftrag.status !== 'abgeholt') return { ok: false, fehler: 'Die Aufbereitung ist noch nicht fertig.' };
  const bez = kostenBezeichnung(auftrag);
  if (vorhandeneBezeichnungen.some((b) => String(b ?? '').includes(bez))) return { ok: false, fehler: 'Diese Kosten sind schon in der Kalkulation.' };
  if (betragNetto === null || !Number.isFinite(betragNetto) || betragNetto <= 0) return { ok: false, fehler: 'Bitte einen Betrag (netto) größer 0 eintragen.' };
  return { ok: true, felder: { art: 'aufbereitung', bezeichnung: bez, betrag_netto: centRunden(betragNetto), plan: false } };
}

/**
 * Offener Betrag aus dem Verkauf (K6/K7) für die Brief-Sperre:
 * kein (gültiger) Verkauf -> null (unbekannt); Rechnung „bezahlt" -> 0;
 * sonst der Rest nach Anzahlung und Inzahlungnahme (nie negativ).
 */
export function restOffenAus(verkauf: { status: string; rest: number } | null, rechnung: { zahlungsstatus: string | null } | null): number | null {
  if (!verkauf || verkauf.status === 'storniert') return null;
  if (rechnung && rechnung.zahlungsstatus === 'bezahlt') return 0;
  return verkauf.rest > 0 ? centRunden(verkauf.rest) : 0;
}
