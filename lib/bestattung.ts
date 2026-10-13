// ============================================================================
// ARGONAUT OS · lib/bestattung.ts — Paket 352 (13.10.2026) · A4a Fachpaket Bestatter
//
// Reine Logik (kein Supabase, kein React) für die Sterbefall-Akte:
//   · Auswahl-Listen (Bestattungsart, Status, Partner-Rollen, Posten-Arten)
//   · Checkliste je Sterbefall — aus der EIGENEN Checkliste des Betriebs mit
//     eigenen Fristen, sonst aus den ARGONAUT-Stationen OHNE Fristen
//     (Fristen sind Landesrecht — die trägt der Betrieb selbst ein)
//   · Kostenvoranschlag: Leistung aus dem Leistungskatalog übernehmen,
//     Summen je Steuersatz, Auslagen für Dritte getrennt ohne Umsatzsteuer
//   · Druck-Seiten Kostenvoranschlag und Vollmacht (HTML, alles maskiert).
//     Die Vollmacht kommt NUR mit dem eigenen Text des Betriebs aus
//     „Meine Rechtstexte" (bestattung.vollmacht) — nie mit ARGONAUT-Wortlaut.
//
// Datenbank: supabase-sql/p352-bestattung.sql (Betrag je Zeile und
// 0 % bei Auslagen setzt dort der Wächter — hier nur der Spiegel für die Anzeige).
// Tests: tests/bestattungP352.test.mjs
// ============================================================================

import { centRunden } from './zahlen';
import { euro } from './geld';

// --- Auswahl-Listen ----------------------------------------------------------

export const BESTATTUNGSARTEN = [
  { key: 'erd', name: 'Erdbestattung' },
  { key: 'feuer', name: 'Feuerbestattung' },
  { key: 'see', name: 'Seebestattung' },
  { key: 'baum', name: 'Baum- oder Waldbestattung' },
  { key: 'anonym', name: 'Anonyme Bestattung' },
  { key: 'sonstige', name: 'Andere Bestattungsart' },
] as const;
export type Bestattungsart = (typeof BESTATTUNGSARTEN)[number]['key'];

export const STATUS = [
  { key: 'aufgenommen', name: 'Aufgenommen', stufe: 'info' },
  { key: 'vorbereitung', name: 'In Vorbereitung', stufe: 'warn' },
  { key: 'feier_geplant', name: 'Trauerfeier geplant', stufe: 'warn' },
  { key: 'beigesetzt', name: 'Beigesetzt', stufe: 'ok' },
  { key: 'abgeschlossen', name: 'Abgeschlossen', stufe: 'dim' },
  { key: 'storniert', name: 'Storniert', stufe: 'dim' },
] as const;
export type FallStatus = (typeof STATUS)[number]['key'];
export const LAUFEND: readonly FallStatus[] = ['aufgenommen', 'vorbereitung', 'feier_geplant', 'beigesetzt'];

export const FAMILIENSTAND = [
  { key: 'ledig', name: 'ledig' },
  { key: 'verheiratet', name: 'verheiratet' },
  { key: 'verwitwet', name: 'verwitwet' },
  { key: 'geschieden', name: 'geschieden' },
  { key: 'partnerschaft', name: 'eingetragene Lebenspartnerschaft' },
  { key: 'unbekannt', name: 'unbekannt' },
] as const;

export const PARTNER_ROLLEN = [
  { key: 'steinmetz', name: 'Steinmetz', icon: '🪨' },
  { key: 'florist', name: 'Florist', icon: '💐' },
  { key: 'trauerredner', name: 'Trauerredner', icon: '🎙️' },
  { key: 'pfarramt', name: 'Pfarramt', icon: '⛪' },
  { key: 'musik', name: 'Musik', icon: '🎵' },
  { key: 'friedhof', name: 'Friedhofsverwaltung', icon: '🌳' },
  { key: 'krematorium', name: 'Krematorium', icon: '🏛️' },
  { key: 'gaststaette', name: 'Gaststätte (Trauerkaffee)', icon: '☕' },
  { key: 'druckerei', name: 'Druckerei (Trauerdrucksachen)', icon: '🖨️' },
  { key: 'sonstige', name: 'Sonstige', icon: '🤝' },
] as const;
export type PartnerRolle = (typeof PARTNER_ROLLEN)[number]['key'];

export const PARTNER_STATUS = [
  { key: 'angefragt', name: 'angefragt' },
  { key: 'bestaetigt', name: 'bestätigt' },
  { key: 'erledigt', name: 'erledigt' },
  { key: 'abgesagt', name: 'abgesagt' },
] as const;

export const POSTEN_ARTEN = [
  { key: 'leistung', name: 'Eigene Leistung' },
  { key: 'ware', name: 'Ware (z. B. Sarg, Urne, Wäsche)' },
  { key: 'fremd', name: 'Fremdleistung, weiterberechnet' },
  { key: 'auslage', name: 'Auslage für Dritte (ohne USt)' },
] as const;
export type PostenArt = (typeof POSTEN_ARTEN)[number]['key'];

export const MWST_SAETZE = [19, 7, 0] as const;

function nameAus<T extends { key: string; name: string }>(liste: readonly T[], key: unknown): string {
  return liste.find((x) => x.key === key)?.name ?? String(key ?? '—');
}
export const artName = (k: unknown) => nameAus(BESTATTUNGSARTEN, k);
export const statusName = (k: unknown) => nameAus(STATUS, k);
export const rolleName = (k: unknown) => nameAus(PARTNER_ROLLEN, k);
export const postenArtName = (k: unknown) => nameAus(POSTEN_ARTEN, k);
export function statusStufe(k: unknown): string {
  return STATUS.find((x) => x.key === k)?.stufe ?? 'dim';
}
export function istArt(k: unknown): k is Bestattungsart {
  return BESTATTUNGSARTEN.some((x) => x.key === k);
}

// --- Branchen-Zuordnung --------------------------------------------------------

/**
 * Bekommt diese Branche das Fachpaket Bestattung? Bestattungsunternehmen ja,
 * Tierbestattung (Kategorie Tiere) nicht — die Akte ist für Menschen gebaut
 * (Standesamt, Rente, Krankenkasse).
 */
export function bestattungZusatz(branche: string | null | undefined): boolean {
  const b = String(branche ?? '');
  return /bestatt/i.test(b) && !/tier/i.test(b);
}
/** Module, die ein Bestatter zusätzlich bekommt: die Akte und der Leistungskatalog (Kostenvoranschlag). */
export const BESTATTUNG_MODULE = ['bestattung', 'leistungskatalog'] as const;

// --- Datum -----------------------------------------------------------------------

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export function istIsoTag(x: unknown): x is string {
  if (typeof x !== 'string' || !ISO.test(x)) return false;
  const d = new Date(x + 'T12:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x;
}
export function plusTage(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** „13.10.2026" — aus „2026-10-13" (oder dem Datumsteil eines Zeitstempels). */
export function datumDe(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = String(iso).slice(0, 10);
  return istIsoTag(t) ? t.split('-').reverse().join('.') : '—';
}
/** „13.10.2026, 14:30 Uhr" in Berliner Zeit. */
export function zeitDe(ts: string | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) + ' Uhr';
}

// --- Die Akte ----------------------------------------------------------------------

export type AkteEingabe = {
  verstorben_vorname?: string | null; verstorben_nachname: string; geburtsname?: string | null;
  geburtsdatum?: string | null; sterbedatum?: string | null; sterbeort?: string | null; letzte_anschrift?: string | null;
  bestattungsart: string; auftraggeber_name: string; auftraggeber_mail?: string | null; auftraggeber_tel?: string | null;
  auftraggeber_anschrift?: string | null; auftraggeber_verhaeltnis?: string | null; feier?: string | null;
  friedhof?: string | null; grabart?: string | null; notiz?: string | null;
};

const LAENGEN: [keyof AkteEingabe, number, string][] = [
  ['verstorben_vorname', 80, 'Vorname'], ['verstorben_nachname', 80, 'Nachname'], ['geburtsname', 80, 'Geburtsname'],
  ['sterbeort', 160, 'Sterbeort'], ['letzte_anschrift', 300, 'Letzte Anschrift'], ['auftraggeber_name', 120, 'Auftraggeber'],
  ['auftraggeber_mail', 160, 'E-Mail'], ['auftraggeber_tel', 40, 'Telefon'], ['auftraggeber_anschrift', 300, 'Anschrift des Auftraggebers'],
  ['auftraggeber_verhaeltnis', 60, 'Verhältnis'], ['feier', 120, 'Art der Feier'], ['friedhof', 160, 'Friedhof'],
  ['grabart', 120, 'Grabart'], ['notiz', 1000, 'Notiz'],
];

/** Prüfung vor dem Speichern — dieselben Grenzen wie die Datenbank. */
export function aktePruefen(e: AkteEingabe, heute: string): { ok: true } | { ok: false; fehler: string[] } {
  const f: string[] = [];
  if (!String(e.verstorben_nachname ?? '').trim()) f.push('Bitte den Nachnamen der verstorbenen Person eintragen.');
  if (!String(e.auftraggeber_name ?? '').trim()) f.push('Bitte den Auftraggeber eintragen (wer die Bestattung beauftragt).');
  if (!istArt(e.bestattungsart)) f.push('Bitte eine Bestattungsart wählen.');
  for (const [k, max, label] of LAENGEN) {
    const v = e[k];
    if (typeof v === 'string' && v.trim().length > max) f.push(`${label}: höchstens ${max} Zeichen.`);
  }
  for (const [k, label] of [['geburtsdatum', 'Geburtsdatum'], ['sterbedatum', 'Sterbedatum']] as const) {
    const v = e[k];
    if (v && !istIsoTag(v)) f.push(`${label}: bitte ein gültiges Datum wählen.`);
  }
  if (e.sterbedatum && istIsoTag(e.sterbedatum) && e.sterbedatum > heute) f.push('Das Sterbedatum liegt in der Zukunft.');
  if (e.geburtsdatum && e.sterbedatum && istIsoTag(e.geburtsdatum) && istIsoTag(e.sterbedatum) && e.sterbedatum < e.geburtsdatum) {
    f.push('Das Sterbedatum liegt vor dem Geburtsdatum.');
  }
  const mail = String(e.auftraggeber_mail ?? '').trim();
  if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) f.push('Die E-Mail-Adresse sieht nicht gültig aus.');
  return f.length ? { ok: false, fehler: f } : { ok: true };
}

export function verstorbenName(f: { verstorben_vorname?: string | null; verstorben_nachname?: string | null; geburtsname?: string | null }): string {
  const n = [f.verstorben_vorname, f.verstorben_nachname].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
  const g = String(f.geburtsname ?? '').trim();
  return (n || 'Ohne Namen') + (g ? ` geb. ${g}` : '');
}

// --- Checkliste --------------------------------------------------------------------

export type AufgabeVorlage = { titel: string; stelle: string | null; tage_nach_tod: number | null; nur_bei: string[] | null; position: number; aktiv?: boolean };

/**
 * ARGONAUT-Stationen — bewusst OHNE Fristen. Wann was zu erledigen ist,
 * regeln Bundes- und Landesrecht unterschiedlich; Fristen trägt der Betrieb in
 * seiner eigenen Checkliste ein.
 */
export const STANDARD_AUFGABEN: readonly AufgabeVorlage[] = Object.freeze([
  { titel: 'Todesbescheinigung liegt vor', stelle: 'Arzt', tage_nach_tod: null, nur_bei: null, position: 1 },
  { titel: 'Sterbefall beim Standesamt anzeigen, Sterbeurkunden beantragen', stelle: 'Standesamt', tage_nach_tod: null, nur_bei: null, position: 2 },
  { titel: 'Grabstelle und Grabart klären', stelle: 'Friedhofsverwaltung', tage_nach_tod: null, nur_bei: ['erd', 'feuer', 'anonym', 'sonstige'], position: 3 },
  { titel: 'Termin für Trauerfeier und Beisetzung abstimmen', stelle: 'Friedhofsverwaltung', tage_nach_tod: null, nur_bei: null, position: 4 },
  { titel: 'Einäscherung anmelden', stelle: 'Krematorium', tage_nach_tod: null, nur_bei: ['feuer', 'see', 'baum'], position: 5 },
  { titel: 'Bestattungsplatz bzw. Reederei für die Beisetzung anfragen', stelle: 'Bestattungswald / Reederei', tage_nach_tod: null, nur_bei: ['see', 'baum'], position: 6 },
  { titel: 'Rentenversicherung informieren', stelle: 'Rentenversicherung', tage_nach_tod: null, nur_bei: null, position: 7 },
  { titel: 'Krankenkasse informieren', stelle: 'Krankenkasse', tage_nach_tod: null, nur_bei: null, position: 8 },
  { titel: 'Pfarramt oder Trauerredner anfragen', stelle: 'Pfarramt / Trauerredner', tage_nach_tod: null, nur_bei: null, position: 9 },
  { titel: 'Traueranzeige und Trauerdrucksachen', stelle: 'Zeitung / Druckerei', tage_nach_tod: null, nur_bei: null, position: 10 },
  { titel: 'Versicherungen melden (z. B. Sterbegeld- oder Lebensversicherung)', stelle: 'Versicherung', tage_nach_tod: null, nur_bei: null, position: 11 },
]);

export type AufgabeNeu = { titel: string; stelle: string | null; faellig_am: string | null; position: number };

/**
 * Checkliste für einen neuen Sterbefall: die eigene (aktive) Checkliste des
 * Betriebs, sonst die ARGONAUT-Stationen; nur Aufgaben, die zur
 * Bestattungsart passen. Fällig = Sterbetag + eigene Frist (ohne Sterbetag
 * oder ohne Frist: kein Datum).
 */
export function aufgabenFuerFall(eigene: readonly AufgabeVorlage[] | null | undefined, art: string, sterbedatum: string | null | undefined): { quelle: 'eigen' | 'standard'; aufgaben: AufgabeNeu[] } {
  const aktiv = (eigene ?? []).filter((v) => v.aktiv !== false);
  const quelle = aktiv.length ? 'eigen' : 'standard';
  const liste = (aktiv.length ? aktiv : STANDARD_AUFGABEN).slice().sort((a, b) => a.position - b.position);
  const tod = sterbedatum && istIsoTag(sterbedatum) ? sterbedatum : null;
  const aufgaben = liste
    .filter((v) => !v.nur_bei || v.nur_bei.length === 0 || v.nur_bei.includes(art))
    .map((v, i) => ({
      titel: v.titel, stelle: v.stelle ?? null,
      faellig_am: tod && typeof v.tage_nach_tod === 'number' ? plusTage(tod, v.tage_nach_tod) : null,
      position: i + 1,
    }));
  return { quelle, aufgaben };
}

export type Aufgabe = { id?: string; sterbefall_id?: string; titel: string; faellig_am: string | null; erledigt_am: string | null };

export function aufgabeLage(a: Aufgabe, heute: string): 'erledigt' | 'ueberfaellig' | 'heute' | 'offen' {
  if (a.erledigt_am) return 'erledigt';
  if (a.faellig_am && a.faellig_am < heute) return 'ueberfaellig';
  if (a.faellig_am === heute) return 'heute';
  return 'offen';
}

export function aufgabenStand(liste: readonly Aufgabe[], heute: string): { gesamt: number; erledigt: number; offen: number; ueberfaellig: number } {
  let erledigt = 0, ueberfaellig = 0;
  for (const a of liste) {
    const l = aufgabeLage(a, heute);
    if (l === 'erledigt') erledigt++;
    else if (l === 'ueberfaellig') ueberfaellig++;
  }
  return { gesamt: liste.length, erledigt, offen: liste.length - erledigt, ueberfaellig };
}

export function vorlagePruefen(v: { titel: string; stelle?: string | null; tage_nach_tod?: number | null; nur_bei?: string[] | null }): { ok: true } | { ok: false; fehler: string[] } {
  const f: string[] = [];
  const t = String(v.titel ?? '').trim();
  if (!t) f.push('Bitte die Aufgabe benennen.');
  if (t.length > 160) f.push('Aufgabe: höchstens 160 Zeichen.');
  if (String(v.stelle ?? '').trim().length > 80) f.push('Stelle: höchstens 80 Zeichen.');
  if (v.tage_nach_tod !== null && v.tage_nach_tod !== undefined && (!Number.isInteger(v.tage_nach_tod) || v.tage_nach_tod < 0 || v.tage_nach_tod > 365)) {
    f.push('Frist: ganze Tage von 0 bis 365 (leer = ohne Frist).');
  }
  if (v.nur_bei && v.nur_bei.some((x) => !istArt(x))) f.push('Unbekannte Bestattungsart.');
  return f.length ? { ok: false, fehler: f } : { ok: true };
}

// --- Kostenvoranschlag -------------------------------------------------------------

export type KatalogLeistung = {
  id: string; bezeichnung: string | null; erfassungsart: string | null; standard_wert: number | null; aw_minuten: number | null;
  stundensatz_netto: number | null; festpreis_netto: number | null; einheit: string | null; einheitspreis_netto: number | null; mwst_satz: number | null;
};
export type PostenNeu = { art: PostenArt; leistung_id: string | null; bezeichnung: string; menge: number; einheit: string; einzelpreis_netto: number; mwst_satz: number };

/**
 * Leistung aus dem Leistungskatalog → Zeile im Kostenvoranschlag.
 * Pauschale gewinnt; Menge/Einheit mit Preis je Einheit; sonst Zeit in Stunden
 * mit Stundensatz (Minuten und AW umgerechnet). Ohne Preis: null (nie 0,00 €).
 */
export function postenAusKatalog(k: KatalogLeistung): PostenNeu | null {
  const satz = MWST_SAETZE.includes(Number(k.mwst_satz) as 19) ? Number(k.mwst_satz) : 19;
  const basis = { art: 'leistung' as const, leistung_id: k.id, bezeichnung: String(k.bezeichnung ?? '').trim().slice(0, 200) || 'Leistung', mwst_satz: satz };
  if (k.festpreis_netto && k.festpreis_netto > 0) return { ...basis, menge: 1, einheit: 'pauschal', einzelpreis_netto: centRunden(k.festpreis_netto) };
  const wert = k.standard_wert && k.standard_wert > 0 ? k.standard_wert : 1;
  if (k.erfassungsart === 'stueck') {
    if (k.einheitspreis_netto === null || k.einheitspreis_netto === undefined || k.einheitspreis_netto < 0) return null;
    return { ...basis, menge: centRunden(wert), einheit: String(k.einheit ?? '').trim().slice(0, 20) || 'Stk', einzelpreis_netto: centRunden(k.einheitspreis_netto) };
  }
  if (k.stundensatz_netto === null || k.stundensatz_netto === undefined || k.stundensatz_netto < 0) return null;
  const minuten = k.erfassungsart === 'minuten' ? wert : k.erfassungsart === 'aw' ? wert * (k.aw_minuten && k.aw_minuten > 0 ? k.aw_minuten : 6) : wert * 60;
  const stunden = centRunden(minuten / 60);
  return { ...basis, menge: stunden > 0 ? stunden : 0.01, einheit: 'Std.', einzelpreis_netto: centRunden(k.stundensatz_netto) };
}

export function postenPruefen(p: { art: string; bezeichnung: string; menge: number | null; einheit: string; einzelpreis_netto: number | null; mwst_satz: number }): { ok: true } | { ok: false; fehler: string[] } {
  const f: string[] = [];
  if (!POSTEN_ARTEN.some((x) => x.key === p.art)) f.push('Bitte die Art der Zeile wählen.');
  const b = String(p.bezeichnung ?? '').trim();
  if (!b) f.push('Bitte eine Bezeichnung eintragen.');
  if (b.length > 200) f.push('Bezeichnung: höchstens 200 Zeichen.');
  if (p.menge === null || !Number.isFinite(p.menge) || p.menge <= 0 || p.menge > 10000) f.push('Menge: bitte eine Zahl größer 0 eintragen.');
  const e = String(p.einheit ?? '').trim();
  if (!e || e.length > 20) f.push('Einheit: 1 bis 20 Zeichen (z. B. Stk, pauschal, Std.).');
  if (p.einzelpreis_netto === null || !Number.isFinite(p.einzelpreis_netto) || p.einzelpreis_netto < 0 || p.einzelpreis_netto > 1000000) f.push('Preis: bitte einen Betrag eintragen (0 bis 1.000.000 €).');
  if (!MWST_SAETZE.includes(p.mwst_satz as 19)) f.push('Umsatzsteuer: 19, 7 oder 0 %.');
  return f.length ? { ok: false, fehler: f } : { ok: true };
}

export type Posten = { art: string; bezeichnung: string; menge: number; einheit: string; einzelpreis_netto: number; mwst_satz: number; position?: number };

/**
 * Betrag einer Zeile wie in der Datenbank: round(Menge × Preis, 2), kaufmännisch.
 * Ganzzahlig gerechnet (Menge und Preis haben je 2 Nachkommastellen) — sonst
 * wird z. B. 2,5 × 120,33 = 300,825 als Kommazahl zu 300,82 statt 300,83.
 */
export function zeilenBetrag(p: Pick<Posten, 'menge' | 'einzelpreis_netto'>): number {
  const m = Math.round(Number(p.menge) * 100), e = Math.round(Number(p.einzelpreis_netto) * 100);
  if (!Number.isFinite(m) || !Number.isFinite(e)) return 0;
  const prod = m * e; // Zehntausendstel Euro
  const cent = prod >= 0 ? Math.floor((prod + 50) / 100) : -Math.floor((-prod + 50) / 100);
  return cent / 100;
}

export type KvSumme = {
  gruppen: { satz: number; netto: number; steuer: number }[];
  netto: number; steuer: number; brutto: number;
  auslagen: number; gesamt: number; anzahlAuslagen: number;
};

/**
 * Summen des Kostenvoranschlags. Eigene Leistungen, Ware und Fremdleistungen
 * je Steuersatz zusammengefasst (Steuer auf die Gruppensumme, wie bei der
 * Rechnung); Auslagen für Dritte getrennt und immer ohne Umsatzsteuer.
 * Gerechnet in Cent — keine Rundungsdrift.
 */
export function kvSumme(posten: readonly Posten[]): KvSumme {
  const je = new Map<number, number>();
  let auslagenCent = 0, anzahlAuslagen = 0;
  for (const p of posten) {
    const c = Math.round(zeilenBetrag(p) * 100);
    if (p.art === 'auslage') { auslagenCent += c; anzahlAuslagen++; continue; }
    const s = Number(p.mwst_satz);
    je.set(s, (je.get(s) ?? 0) + c);
  }
  const gruppen = [...je.entries()].sort((a, b) => b[0] - a[0]).map(([satz, c]) => ({ satz, nettoC: c, steuerC: Math.round((c * satz) / 100) }));
  const nettoC = gruppen.reduce((s, g) => s + g.nettoC, 0);
  const steuerC = gruppen.reduce((s, g) => s + g.steuerC, 0);
  return {
    gruppen: gruppen.map((g) => ({ satz: g.satz, netto: g.nettoC / 100, steuer: g.steuerC / 100 })),
    netto: nettoC / 100, steuer: steuerC / 100, brutto: (nettoC + steuerC) / 100,
    auslagen: auslagenCent / 100, gesamt: (nettoC + steuerC + auslagenCent) / 100, anzahlAuslagen,
  };
}

// --- Übersicht ---------------------------------------------------------------------

export type FallKurz = { id: string; status: string; beisetzung_am: string | null; trauerfeier_am: string | null };

export function fallUebersicht(faelle: readonly FallKurz[], aufgaben: readonly (Aufgabe & { sterbefall_id?: string })[], heute: string): {
  laufend: number; termineWoche: number; aufgabenUeberfaellig: number; aufgabenOffen: number;
} {
  const laufendIds = new Set(faelle.filter((f) => (LAUFEND as readonly string[]).includes(f.status)).map((f) => f.id));
  const bis = plusTage(heute, 7);
  let termineWoche = 0;
  for (const f of faelle) {
    if (!laufendIds.has(f.id)) continue;
    for (const t of [f.trauerfeier_am, f.beisetzung_am]) {
      const tag = t ? berlinTag(t) : null;
      if (tag && tag >= heute && tag < bis) termineWoche++;
    }
  }
  const relevant = aufgaben.filter((a) => !a.sterbefall_id || laufendIds.has(a.sterbefall_id));
  const st = aufgabenStand(relevant, heute);
  return { laufend: laufendIds.size, termineWoche, aufgabenUeberfaellig: st.ueberfaellig, aufgabenOffen: st.offen };
}

/** Berliner Kalendertag eines Zeitstempels. */
export function berlinTag(ts: string): string | null {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
}

// --- Druck-Seiten ------------------------------------------------------------------

export function esc(x: unknown): string {
  return String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const absatz = (t: string) => esc(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');

export type Firmenkopf = { name: string | null; strasse: string | null; plz: string | null; ort: string | null; telefon: string | null; email: string | null };
export type FallDruck = {
  nummer: string | null; verstorben_vorname: string | null; verstorben_nachname: string; geburtsname: string | null;
  geburtsdatum: string | null; sterbedatum: string | null; sterbeort: string | null; bestattungsart: string;
  auftraggeber_name: string; auftraggeber_anschrift: string | null;
};
export type EigenerText = { eigen: true; text: string; stand: string } | { eigen: false; hinweis: string };

function kopfHtml(firma: Firmenkopf | null): string {
  if (!firma?.name) return '<div class="kopf">[Firmendaten fehlen — Einstellungen → Firmendaten]</div>';
  const z = [firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(' '), firma.telefon, firma.email].filter((x) => x && String(x).trim());
  return `<div class="kopf"><b>${esc(firma.name)}</b><br>${z.map(esc).join(' · ')}</div>`;
}
const STIL = '<style>body{font-family:Arial,Helvetica,sans-serif;max-width:760px;margin:32px auto;color:#111;line-height:1.5;font-size:13.5px}'
  + '.kopf{font-size:12px;color:#444;border-bottom:1px solid #999;padding-bottom:8px;margin-bottom:18px}h1{font-size:20px;margin:0 0 4px}'
  + 'table{width:100%;border-collapse:collapse;margin:8px 0}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #ddd;vertical-align:top}'
  + 'th{font-size:12px;color:#555}.r{text-align:right;white-space:nowrap}.summe td{border:none;padding:3px 6px}.fett{font-weight:700}'
  + '.klein{font-size:11.5px;color:#555}.unterschrift{display:flex;gap:40px;margin-top:56px}.unterschrift div{flex:1;border-top:1px solid #333;padding-top:4px;font-size:12px}'
  + '@media print{body{margin:12mm}}</style>';

function fallZeile(f: FallDruck): string {
  const daten = [f.geburtsdatum ? `geb. ${datumDe(f.geburtsdatum)}` : '', f.sterbedatum ? `verstorben am ${datumDe(f.sterbedatum)}` : '', f.sterbeort ? `in ${f.sterbeort}` : '']
    .filter(Boolean).join(', ');
  return `${esc(verstorbenName(f))}${daten ? ` (${esc(daten)})` : ''}`;
}

/** Der Kostenvoranschlag als druckbare Seite. Bedingungen nur mit eigenem Text des Betriebs. */
export function kvHtml(f: FallDruck, posten: readonly Posten[], firma: Firmenkopf | null, heute: string, bedingungen: EigenerText | null): string {
  const s = kvSumme(posten);
  const sortiert = posten.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const eigen = sortiert.filter((p) => p.art !== 'auslage');
  const auslagen = sortiert.filter((p) => p.art === 'auslage');
  const zeile = (p: Posten, i: number, mitSteuer: boolean) => `<tr><td>${i + 1}</td><td>${esc(p.bezeichnung)}</td><td class="r">${esc(String(p.menge).replace('.', ','))} ${esc(p.einheit)}</td>`
    + `<td class="r">${esc(euro(p.einzelpreis_netto))}</td>${mitSteuer ? `<td class="r">${esc(p.mwst_satz)} %</td>` : ''}<td class="r">${esc(euro(zeilenBetrag(p)))}</td></tr>`;
  const teile: string[] = [];
  teile.push(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Kostenvoranschlag ${esc(f.nummer ?? '')}</title>${STIL}</head><body>`);
  teile.push(kopfHtml(firma));
  teile.push(`<p>${esc(f.auftraggeber_name)}${f.auftraggeber_anschrift ? `<br>${esc(f.auftraggeber_anschrift).replace(/\n/g, '<br>')}` : ''}</p>`);
  teile.push(`<h1>Kostenvoranschlag${f.nummer ? ` Nr. ${esc(f.nummer)}` : ''}</h1><p class="klein">Datum: ${esc(datumDe(heute))}</p>`);
  teile.push(`<p>Bestattung von ${fallZeile(f)} · ${esc(artName(f.bestattungsart))}</p>`);
  if (eigen.length) {
    teile.push('<table><thead><tr><th>Pos.</th><th>Leistung</th><th class="r">Menge</th><th class="r">Einzelpreis netto</th><th class="r">USt</th><th class="r">Betrag netto</th></tr></thead><tbody>');
    teile.push(eigen.map((p, i) => zeile(p, i, true)).join(''));
    teile.push('</tbody></table><table class="summe"><tbody>');
    teile.push(`<tr><td class="r" style="width:75%">Summe netto</td><td class="r">${esc(euro(s.netto))}</td></tr>`);
    for (const g of s.gruppen) teile.push(`<tr><td class="r">Umsatzsteuer ${esc(g.satz)} % auf ${esc(euro(g.netto))}</td><td class="r">${esc(euro(g.steuer))}</td></tr>`);
    teile.push(`<tr class="fett"><td class="r">Summe Leistungen brutto</td><td class="r">${esc(euro(s.brutto))}</td></tr></tbody></table>`);
  }
  if (auslagen.length) {
    teile.push('<h3 style="font-size:14px;margin:18px 0 0">Auslagen für Dritte (ohne Umsatzsteuer)</h3>');
    teile.push('<p class="klein">Beträge, die für Sie an Dritte gezahlt werden, z. B. Friedhofs- oder Standesamtsgebühren.</p>');
    teile.push('<table><thead><tr><th>Pos.</th><th>Auslage</th><th class="r">Menge</th><th class="r">Einzelbetrag</th><th class="r">Betrag</th></tr></thead><tbody>');
    teile.push(auslagen.map((p, i) => zeile(p, i, false)).join(''));
    teile.push(`</tbody></table><table class="summe"><tbody><tr class="fett"><td class="r" style="width:75%">Summe Auslagen</td><td class="r">${esc(euro(s.auslagen))}</td></tr></tbody></table>`);
  }
  if (!eigen.length && !auslagen.length) teile.push('<p>Noch keine Positionen.</p>');
  teile.push(`<table class="summe"><tbody><tr class="fett" style="font-size:15px"><td class="r" style="width:75%">Voraussichtlicher Gesamtbetrag</td><td class="r">${esc(euro(s.gesamt))}</td></tr></tbody></table>`);
  if (bedingungen?.eigen) teile.push(`<h3 style="font-size:14px;margin:22px 0 4px">Bedingungen</h3>${absatz(bedingungen.text)}<p class="klein">${esc(bedingungen.stand)}</p>`);
  teile.push('<script>window.onload=function(){window.print()}<\/script></body></html>');
  return teile.join('');
}

/**
 * Die Vollmacht der Angehörigen als druckbare Seite — NUR mit dem eigenen
 * Text des Betriebs. Ohne eigenen Text: kein Dokument, nur der Hinweis.
 */
export function vollmachtHtml(f: FallDruck, firma: Firmenkopf | null, heute: string, text: EigenerText): { ok: true; html: string } | { ok: false; hinweis: string } {
  if (!text.eigen) return { ok: false, hinweis: text.hinweis };
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Vollmacht ${esc(f.nummer ?? '')}</title>${STIL}</head><body>`
    + kopfHtml(firma)
    + `<h1>Vollmacht</h1><p class="klein">${f.nummer ? `Sterbefall Nr. ${esc(f.nummer)} · ` : ''}${esc(datumDe(heute))}</p>`
    + `<table><tbody><tr><th style="width:32%">Vollmachtgeber/in</th><td>${esc(f.auftraggeber_name)}${f.auftraggeber_anschrift ? `<br>${esc(f.auftraggeber_anschrift).replace(/\n/g, '<br>')}` : ''}</td></tr>`
    + `<tr><th>Bevollmächtigt</th><td>${esc(firma?.name ?? '[Firmendaten fehlen]')}</td></tr>`
    + `<tr><th>Verstorbene Person</th><td>${fallZeile(f)}</td></tr></tbody></table>`
    + absatz(text.text)
    + `<p class="klein">${esc(text.stand)}</p>`
    + '<div class="unterschrift"><div>Ort, Datum</div><div>Unterschrift Vollmachtgeber/in</div></div>'
    + '<script>window.onload=function(){window.print()}<\/script></body></html>';
  return { ok: true, html };
}

/** Werte für die Platzhalter der Bestattungs-Rechtstexte. */
export function platzhalterWerte(f: FallDruck, firma: Firmenkopf | null, heute: string): Record<string, string> {
  return { betrieb: firma?.name ?? '', kunde: f.auftraggeber_name, datum: datumDe(heute), verstorben: verstorbenName(f) };
}

/** Kurztext für Listen: „2026-003 · Erika Muster · Feuerbestattung". */
export function fallTitel(f: { nummer: string | null; verstorben_vorname?: string | null; verstorben_nachname: string; bestattungsart: string }): string {
  return [f.nummer, verstorbenName(f), artName(f.bestattungsart)].filter(Boolean).join(' · ');
}
