// ============================================================================
// ARGONAUT OS · lib/fahrzeugMieteV2.ts — V2a Vermietung (Paket 293)
//
// 1. Bußgelder und Halteranfragen: Mieter zum Tatzeitpunkt finden (rechnet wie
//    die Datenbank: TATSÄCHLICHE Übergabe bis TATSÄCHLICHE Rückgabe, halb-
//    offen, unterwegs = bis jetzt), Fristen-Ampel, Fahrerbenennung als Text
//    mit dem eigenen Begleittext des Betriebs. ARGONAUT verschickt nichts an
//    Behörden; der Betrieb sendet selbst.
// 2. Bearbeitungsgebühr als eigener Rechnungsposten (Betrag und Steuersatz
//    vom Betrieb — klären Sie die Behandlung mit Ihrem Steuerberater).
// 3. Auslastung und Ertrag je Mietfahrzeug: tatsächlich vermietete Zeit /
//    Kalenderzeit im Zeitraum, Netto aus den verknüpften Rechnungen.
// 4. Fristen aus dem Fuhrpark (HU, Wartung, Versicherung): Ampel und
//    Buchungen, die über eine Frist hinausreichen.
//
// Geld immer in ganzen Cent. Rein (nur lib/zahlen, lib/fahrzeugMiete),
// node-getestet (tests/fahrzeugMieteP293).
// ============================================================================

import { leseZahl, inCent, rundeStellen } from './zahlen';
import { istUuid, istIso, zeit, berlinTag, euroInCent, TAG } from './fahrzeugMiete';

export const VORGANG_ARTEN = [
  { key: 'halteranfrage', label: 'Halteranfrage / Zeugenfragebogen' },
  { key: 'anhoerung', label: 'Anhörungsbogen' },
  { key: 'bussgeld', label: 'Bußgeldbescheid' },
  { key: 'verwarnung', label: 'Verwarnung' },
  { key: 'parkverstoss', label: 'Parkverstoß' },
  { key: 'maut', label: 'Maut' },
  { key: 'sonstiges', label: 'Sonstiges' },
] as const;
export type VorgangArt = typeof VORGANG_ARTEN[number]['key'];
export const VORGANG_STATUS: Record<string, string> = { offen: 'offen', benannt: 'Fahrer benannt', erledigt: 'erledigt' };
export const ZUORDNUNG: Record<string, string> = {
  mieter: 'vermietet', kein_mieter: 'nicht vermietet', mehrdeutig: 'nicht eindeutig',
};

function text(roh: unknown, max: number): string | null {
  const t = String(roh ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, max);
  return t || null;
}

// ---------------------------------------------------- Tatzeit → Mieter ---

export type MietZeit = { id: string; fahrzeug_id: string; status: string; uebergabe_am: string | null; rueckgabe_ist: string | null };
export type Treffer = { art: 'mieter'; buchung: MietZeit } | { art: 'kein_mieter' } | { art: 'mehrdeutig'; buchungen: MietZeit[] };

/**
 * Wer hatte das Fahrzeug zum Tatzeitpunkt? Wie die Datenbank
 * (p293_mieter_zur_tatzeit): nur übergebene oder zurückgegebene Verträge,
 * [Übergabe, Rückgabe) — noch unterwegs = offen bis heute. Vorschau im
 * Browser; endgültig ordnet die Datenbank zu.
 */
export function mieterZurTatzeit(buchungen: MietZeit[], fahrzeugId: string, tatzeit: unknown): Treffer {
  const t = zeit(tatzeit);
  if (t === null) return { art: 'kein_mieter' };
  const hits = buchungen.filter((b) => {
    if (b.fahrzeug_id !== fahrzeugId || (b.status !== 'uebergeben' && b.status !== 'zurueck')) return false;
    const von = zeit(b.uebergabe_am);
    if (von === null) return false;
    const bis = zeit(b.rueckgabe_ist);
    return t >= von && (bis === null ? b.status === 'uebergeben' : t < bis);
  });
  if (hits.length === 1) return { art: 'mieter', buchung: hits[0] };
  if (hits.length > 1) return { art: 'mehrdeutig', buchungen: hits };
  return { art: 'kein_mieter' };
}

// -------------------------------------------------------------- Fristen ---

/** Tage von heute bis zur Frist (Kalendertage, beide YYYY-MM-DD). Negativ = vorbei. */
export function tageBis(frist: string, heute: string): number {
  const [j1, m1, t1] = heute.split('-').map(Number);
  const [j2, m2, t2] = frist.split('-').map(Number);
  return Math.round((Date.UTC(j2, m2 - 1, t2) - Date.UTC(j1, m1 - 1, t1)) / 86_400_000);
}

export type Ampel = 'ueber' | 'rot' | 'gelb' | 'gruen' | 'keine';
/** Ampel: vorbei, rot (≤ 3 Tage), gelb (≤ gelbTage), grün. Leer = keine Frist. */
export function fristAmpel(frist: string | null | undefined, heute: string, gelbTage = 7): { ampel: Ampel; tage: number | null } {
  if (!frist || !istIso(frist)) return { ampel: 'keine', tage: null };
  const tage = tageBis(frist, heute);
  if (tage < 0) return { ampel: 'ueber', tage };
  if (tage <= 3) return { ampel: 'rot', tage };
  if (tage <= gelbTage) return { ampel: 'gelb', tage };
  return { ampel: 'gruen', tage };
}
export function fristText(tage: number | null): string {
  if (tage === null) return '—';
  if (tage < 0) return `${-tage} Tag${tage === -1 ? '' : 'e'} überschritten`;
  if (tage === 0) return 'heute';
  if (tage === 1) return 'morgen';
  return `noch ${tage} Tage`;
}

// -------------------------------------------------------- Vorgang prüfen ---

export type VorgangZeile = {
  fahrzeug_id: string; art: VorgangArt; behoerde: string; aktenzeichen: string; tatzeit: string;
  tatort: string | null; vorwurf: string | null; eingang_am: string; frist_am: string; notiz: string | null;
};

/** Neuer Vorgang aus dem Schreiben der Behörde. Tatzeit als ISO mit Zone. */
export function vorgangPruefen(o: {
  fahrzeugId: unknown; art: unknown; behoerde: unknown; aktenzeichen: unknown; tatzeit: unknown; tatort?: unknown;
  vorwurf?: unknown; eingangAm: unknown; fristAm: unknown; notiz?: unknown; jetzt: number; heute: string;
}): { ok: true; zeile: VorgangZeile } | { ok: false; grund: string } {
  if (!istUuid(o.fahrzeugId)) return { ok: false, grund: 'Bitte das Fahrzeug wählen.' };
  const art = VORGANG_ARTEN.find((a) => a.key === o.art)?.key;
  if (!art) return { ok: false, grund: 'Bitte wählen, was gekommen ist (Halteranfrage, Anhörungsbogen, Bußgeldbescheid …).' };
  const behoerde = text(o.behoerde, 160);
  if (!behoerde || behoerde.length < 2) return { ok: false, grund: 'Bitte die Behörde eintragen (z. B. „Stadt Böblingen, Bußgeldstelle“).' };
  const az = text(o.aktenzeichen, 60);
  if (!az || az.length < 2) return { ok: false, grund: 'Bitte das Aktenzeichen aus dem Schreiben eintragen.' };
  const t = zeit(o.tatzeit);
  if (t === null) return { ok: false, grund: 'Bitte Datum und Uhrzeit der Tat eintragen — daran erkennt ARGONAUT den Mieter.' };
  if (t > o.jetzt + 3_600_000) return { ok: false, grund: 'Die Tatzeit liegt in der Zukunft.' };
  if (!istIso(o.eingangAm) || o.eingangAm > o.heute) return { ok: false, grund: 'Bitte das Eingangsdatum des Schreibens eintragen.' };
  if (!istIso(o.fristAm)) return { ok: false, grund: 'Bitte die Frist aus dem Schreiben eintragen (bis wann geantwortet werden muss).' };
  if (tageBis(o.fristAm, o.eingangAm) < -1) return { ok: false, grund: 'Die Frist liegt vor dem Eingang des Schreibens.' };
  return {
    ok: true,
    zeile: {
      fahrzeug_id: o.fahrzeugId, art, behoerde, aktenzeichen: az, tatzeit: new Date(t).toISOString(),
      tatort: text(o.tatort, 200), vorwurf: text(o.vorwurf, 300), eingang_am: o.eingangAm, frist_am: o.fristAm, notiz: text(o.notiz, 1000),
    },
  };
}

/** Einstellung Bearbeitungsgebühr: Euro-Text → Cent (0 bis 1.000 €), Steuersatz 19 oder 0. */
export function gebuehrPruefen(o: { betrag: unknown; ust: unknown; text?: unknown }): { ok: true; cent: number; ust: 0 | 19; text: string | null } | { ok: false; grund: string } {
  const c = euroInCent(o.betrag) ?? 0;
  if (Number.isNaN(c) || c < 0 || c > 100_000) return { ok: false, grund: 'Bearbeitungsgebühr: Betrag in Euro von 0 bis 1.000 (0 = keine Gebühr).' };
  const u = typeof o.ust === 'number' ? o.ust : leseZahl(o.ust);
  if (u !== 0 && u !== 19) return { ok: false, grund: 'Steuersatz der Gebühr: 19 % oder 0 % — fragen Sie Ihren Steuerberater.' };
  const t = String(o.text ?? '').trim().slice(0, 4000);
  return { ok: true, cent: c, ust: u === 0 ? 0 : 19, text: t || null };
}

/** Rechnungsposten der Bearbeitungsgebühr (netto, Cent). */
export function gebuehrPosten(v: { gebuehr_cent: number; gebuehr_ust_satz: number; aktenzeichen: string; behoerde: string; art: string }, kennzeichen: string | null, tatzeitText: string): { bezeichnung: string; menge: number; einheit: string; einzelpreis_cent: number; summe_cent: number; mwst_satz: number } | null {
  const c = Math.floor(Number(v.gebuehr_cent) || 0);
  if (c <= 0) return null;
  const art = VORGANG_ARTEN.find((a) => a.key === v.art)?.label ?? 'Behördenanfrage';
  const bez = `Bearbeitungsgebühr ${art} · Az. ${v.aktenzeichen} (${v.behoerde})${kennzeichen ? ` · ${kennzeichen}` : ''} · Tatzeit ${tatzeitText}`;
  return { bezeichnung: bez.slice(0, 300), menge: 1, einheit: 'Stück', einzelpreis_cent: c, summe_cent: c, mwst_satz: v.gebuehr_ust_satz === 0 ? 0 : 19 };
}

// ------------------------------------------------------ Fahrerbenennung ---

export const PLATZHALTER = ['{behoerde}', '{aktenzeichen}', '{tatzeit}', '{tatort}', '{kennzeichen}', '{fahrzeug}', '{fahrer}', '{geburtsdatum}', '{anschrift}', '{mietzeit}', '{vertrag}', '{betrieb}'] as const;

/** Platzhalter {name} ersetzen; unbekannte bleiben stehen, fehlende Werte werden „—". */
export function platzhalterFuellen(vorlage: string, werte: Record<string, string | null | undefined>): string {
  return vorlage.replace(/\{([a-z_]+)\}/g, (ganz, k: string) => (k in werte ? (werte[k] && String(werte[k]).trim() ? String(werte[k]) : '—') : ganz));
}

function datumText(iso: string | null | undefined): string {
  if (!iso || !istIso(iso)) return '—';
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}
export function wannText(x: unknown): string {
  const t = zeit(x);
  return t === null ? '—' : new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
}

/**
 * Fahrerbenennung als Text zum Kopieren/Drucken. Die Anschrift liegt nur vom
 * Mieter vor (Vertragspartner) — bei einem Zusatzfahrer steht ein Hinweis.
 * Kein Mustertext von ARGONAUT: oben steht der eigene Begleittext des Betriebs.
 */
export function benennungText(o: {
  begleittext: string | null; betrieb: string;
  vorgang: { behoerde: string; aktenzeichen: string; tatzeit: string; tatort: string | null };
  fahrzeug: { bezeichnung: string; kennzeichen: string | null };
  buchung: { nummer: string | null; mieter_name: string; mieter_anschrift: string | null; uebergabe_am: string | null; rueckgabe_ist: string | null };
  fahrer: { name: string; geburtsdatum: string; rolle: string };
}): string {
  const istMieter = o.fahrer.rolle === 'haupt' && o.fahrer.name.trim().toLowerCase() === o.buchung.mieter_name.trim().toLowerCase();
  const anschrift = istMieter ? (o.buchung.mieter_anschrift ?? '').replace(/\n+/g, ', ') : '';
  const mietzeit = `${wannText(o.buchung.uebergabe_am)} bis ${o.buchung.rueckgabe_ist ? wannText(o.buchung.rueckgabe_ist) : 'noch unterwegs'}`;
  const werte: Record<string, string | null> = {
    behoerde: o.vorgang.behoerde, aktenzeichen: o.vorgang.aktenzeichen, tatzeit: wannText(o.vorgang.tatzeit), tatort: o.vorgang.tatort,
    kennzeichen: o.fahrzeug.kennzeichen, fahrzeug: o.fahrzeug.bezeichnung, fahrer: o.fahrer.name, geburtsdatum: datumText(o.fahrer.geburtsdatum),
    anschrift: anschrift || null, mietzeit, vertrag: o.buchung.nummer, betrieb: o.betrieb,
  };
  const zeilen: string[] = [];
  if (o.begleittext && o.begleittext.trim()) zeilen.push(platzhalterFuellen(o.begleittext.trim(), werte), '');
  zeilen.push(
    `Aktenzeichen: ${o.vorgang.aktenzeichen}`,
    `Behörde: ${o.vorgang.behoerde}`,
    `Fahrzeug: ${o.fahrzeug.bezeichnung}${o.fahrzeug.kennzeichen ? `, amtliches Kennzeichen ${o.fahrzeug.kennzeichen}` : ''}`,
    `Tatzeit: ${werte.tatzeit}${o.vorgang.tatort ? `, Tatort: ${o.vorgang.tatort}` : ''}`,
    `Vermietet an: ${o.buchung.mieter_name} (Mietvertrag ${o.buchung.nummer ?? '—'}, ${mietzeit})`,
    '',
    `Fahrzeugführer laut Mietvertrag: ${o.fahrer.name}, geboren am ${werte.geburtsdatum}`,
    istMieter
      ? `Anschrift: ${anschrift || '— (bitte ergänzen)'}`
      : `Anschrift: liegt dem Vermieter nur vom Mieter vor (${o.buchung.mieter_name}${o.buchung.mieter_anschrift ? `, ${o.buchung.mieter_anschrift.replace(/\n+/g, ', ')}` : ''}).`,
  );
  return zeilen.join('\n');
}

// --------------------------------------------------- Auslastung & Ertrag ---

/** Berliner Mitternacht eines Kalendertags in Millisekunden (beachtet Sommer-/Winterzeit). */
export function berlinMitternacht(tag: string): number {
  const [j, m, t] = tag.split('-').map(Number);
  const utc = Date.UTC(j, m - 1, t);
  // Berliner Uhrzeit um utc ablesen → Versatz; zweimal, damit der Wechseltag stimmt
  let ms = utc;
  for (let i = 0; i < 2; i++) {
    const teile = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    const w = (typ: string) => Number(teile.find((p) => p.type === typ)?.value);
    const lokalAlsUtc = Date.UTC(w('year'), w('month') - 1, w('day'), w('hour'), w('minute'));
    ms = utc - (lokalAlsUtc - ms);
  }
  return ms;
}

/** Folgetag (YYYY-MM-DD). */
export function naechsterTag(tag: string): string {
  const [j, m, t] = tag.split('-').map(Number);
  return new Date(Date.UTC(j, m - 1, t + 1)).toISOString().slice(0, 10);
}

/** Kalendertage von bis einschließlich (YYYY-MM-DD). */
export function tageImZeitraum(von: string, bis: string): number {
  return Math.max(0, tageBis(bis, von) + 1);
}

export type AuslastBuchung = MietZeit & { rechnung_id: string | null; abholung: string; rueckgabe_plan: string };
export type AuslastRechnung = { id: string; netto_summe: number | string | null; zahlungsstatus: string | null };
export type AuslastZeile = {
  fahrzeug_id: string; mieten: number; belegt_ms: number; belegt_tage: number; quote: number;
  netto_cent: number; ohne_rechnung: number; je_miettag_cent: number | null; vorgaenge: number; schaeden: number;
};

/**
 * Auslastung je Fahrzeug im Zeitraum [von 0:00, bis 24:00) Berliner Zeit:
 * tatsächlich vermietete Zeit (Übergabe bis Rückgabe, unterwegs bis jetzt),
 * auf den Zeitraum zugeschnitten, geteilt durch die Kalenderzeit. Reservierungen
 * zählen nicht (noch nicht gefahren). Ertrag: Netto der verknüpften, nicht
 * stornierten Rechnungen der Mieten, die im Zeitraum zurückgegeben wurden.
 */
export function auslastung(o: {
  fahrzeuge: { id: string }[]; buchungen: AuslastBuchung[]; rechnungen: AuslastRechnung[];
  vorgaenge?: { fahrzeug_id: string; tatzeit: string }[]; schaeden?: { fahrzeug_id: string; erfasst_am: string }[];
  von: string; bis: string; jetzt: number;
}): { zeilen: AuslastZeile[]; gesamt: { quote: number; netto_cent: number; belegt_tage: number; kalendertage: number } } {
  const start = berlinMitternacht(o.von);
  const ende = berlinMitternacht(naechsterTag(o.bis));
  const spanne = Math.max(1, ende - start);
  const rech = new Map(o.rechnungen.map((r) => [r.id, r]));
  const inZeitraum = (iso: string | null | undefined) => { const t = zeit(iso); return t !== null && t >= start && t < ende; };
  const zeilen: AuslastZeile[] = o.fahrzeuge.map((f) => {
    let belegt = 0, mieten = 0, netto = 0, ohne = 0, tageAbgerechnet = 0;
    for (const b of o.buchungen) {
      if (b.fahrzeug_id !== f.id || (b.status !== 'uebergeben' && b.status !== 'zurueck')) continue;
      const v = zeit(b.uebergabe_am);
      if (v === null) continue;
      const r = zeit(b.rueckgabe_ist) ?? (b.status === 'uebergeben' ? o.jetzt : null);
      if (r === null || r <= v) continue;
      const a = Math.max(v, start), e = Math.min(r, ende);
      if (e > a) { belegt += e - a; mieten++; }
      if (b.status === 'zurueck' && inZeitraum(b.rueckgabe_ist)) {
        const rr = b.rechnung_id ? rech.get(b.rechnung_id) : undefined;
        const n = rr && rr.zahlungsstatus !== 'storniert' ? leseZahl(rr.netto_summe) : null;
        if (n !== null) { netto += inCent(n); tageAbgerechnet += Math.max(1, Math.ceil((r - v) / TAG)); } else ohne++;
      }
    }
    const vorg = (o.vorgaenge ?? []).filter((x) => x.fahrzeug_id === f.id && inZeitraum(x.tatzeit)).length;
    const sch = (o.schaeden ?? []).filter((x) => x.fahrzeug_id === f.id && inZeitraum(x.erfasst_am)).length;
    return {
      fahrzeug_id: f.id, mieten, belegt_ms: belegt, belegt_tage: rundeStellen(belegt / TAG, 1), quote: Math.min(1, belegt / spanne),
      netto_cent: netto, ohne_rechnung: ohne, je_miettag_cent: tageAbgerechnet > 0 ? Math.round(netto / tageAbgerechnet) : null, vorgaenge: vorg, schaeden: sch,
    };
  });
  const summeBelegt = zeilen.reduce((s, z) => s + z.belegt_ms, 0);
  const kalendertage = tageImZeitraum(o.von, o.bis);
  return {
    zeilen,
    gesamt: {
      quote: zeilen.length ? Math.min(1, summeBelegt / (spanne * zeilen.length)) : 0,
      netto_cent: zeilen.reduce((s, z) => s + z.netto_cent, 0),
      belegt_tage: rundeStellen(summeBelegt / TAG, 1),
      kalendertage,
    },
  };
}

/** Prozent mit einer Nachkommastelle, deutsch („63,4 %"). */
export function prozentText(q: number): string {
  const p = Math.round(Math.max(0, Math.min(1, q)) * 1000) / 10;
  return `${p.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

// ------------------------------------------------- Fristen aus dem Fuhrpark ---

export type FuhrparkFristen = { tuev_bis: string | null; wartung_bis: string | null; versicherung_bis: string | null };
export const FRIST_NAMEN: [keyof FuhrparkFristen, string][] = [['tuev_bis', 'HU / TÜV'], ['wartung_bis', 'Wartung'], ['versicherung_bis', 'Versicherung']];

/**
 * Fristen eines Mietfahrzeugs (aus dem verknüpften Fuhrpark-Fahrzeug) mit Ampel
 * (gelb ab 30 Tagen) und den offenen Buchungen, deren Rückgabe NACH der Frist
 * liegt — die sollten Sie vorher klären (HU-Termin, Ersatzfahrzeug).
 */
export function fristenFahrzeug(f: FuhrparkFristen | null, buchungen: { id: string; nummer: string | null; status: string; rueckgabe_plan: string; abholung: string }[], heute: string): { name: string; frist: string; ampel: Ampel; tage: number | null; konflikte: string[] }[] {
  if (!f) return [];
  const r: { name: string; frist: string; ampel: Ampel; tage: number | null; konflikte: string[] }[] = [];
  for (const [k, name] of FRIST_NAMEN) {
    const frist = f[k];
    if (!frist || !istIso(frist)) continue;
    const a = fristAmpel(frist, heute, 30);
    const fristEnde = berlinMitternacht(frist) + TAG; // Frist gilt bis Ende des Tages
    const konflikte = buchungen
      .filter((b) => (b.status === 'reserviert' || b.status === 'uebergeben') && (zeit(b.rueckgabe_plan) ?? 0) > fristEnde)
      .map((b) => b.nummer ?? b.id.slice(0, 8));
    r.push({ name, frist, ampel: a.ampel, tage: a.tage, konflikte });
  }
  return r;
}

/** Schlechteste Ampel einer Liste (für die Kachel). */
export function schlechteste(ampeln: Ampel[]): Ampel {
  const rang: Ampel[] = ['ueber', 'rot', 'gelb', 'gruen', 'keine'];
  for (const a of rang) if (ampeln.includes(a)) return a;
  return 'keine';
}

/** Zeitraum-Vorgabe: letzte n Tage bis heute (einschließlich). */
export function zeitraumLetzte(n: number, heute: string): { von: string; bis: string } {
  const [j, m, t] = heute.split('-').map(Number);
  return { von: new Date(Date.UTC(j, m - 1, t - (n - 1))).toISOString().slice(0, 10), bis: heute };
}

export { berlinTag };
