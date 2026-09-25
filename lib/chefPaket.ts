// ============================================================================
// ARGONAUT OS · lib/chefPaket.ts — Chef-Blick (Paket PP, B30)
//
// Reine Logik, node-getestet (tests/chefPaketP90.test.mjs). Kein KI-Aufruf:
// alles ist Rechnen und kostet 0 €.
//
//   wochenListe / isoWoche   die nächsten N Kalenderwochen (Mo–So, Berlin)
//   auslastung               Stunden je Monteur und Woche gegen das Soll
//   projektWarnungen         Frühwarnung je Projekt (überfällige Aufgaben,
//                            offene Mängel, unbeantwortete Nachträge, Stillstand)
//   morgenSatz               ein Morgen-Briefing als Satz zum Vorlesen
//   umsatzJeMonat, forderungen, zahlungsdauer   Zahlen für die Bank-Mappe
//
// B31 (Sprachbefehle) existiert bereits im Chef-Cockpit: Mikrofon ->
// /api/cockpit-chat -> Bestätigungskarte -> /api/cockpit-action.
// ANDOCKPUNKTE: Liquiditätsvorschau (lib/cashflow) in die Bank-Mappe, sobald
// ein Kontostand hinterlegt ist; Auslastung mit Urlaub/Krank aus dem Schichtplan.
// ============================================================================

import { leseZahlOder } from './zahlen';
const TAG = 86_400_000;

/** Kalendertag in Berlin (YYYY-MM-DD). */
export function berlinTag(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function tagMs(tag: string): number {
  return Date.UTC(+tag.slice(0, 4), +tag.slice(5, 7) - 1, +tag.slice(8, 10));
}
function tagAus(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO-Kalenderwoche eines Tages (YYYY-MM-DD). */
export function isoWoche(tag: string): { jahr: number; kw: number } {
  const d = new Date(tagMs(tag));
  const wt = (d.getUTCDay() + 6) % 7; // Mo = 0
  d.setUTCDate(d.getUTCDate() - wt + 3); // Donnerstag derselben Woche
  const jahr = d.getUTCFullYear();
  const ersterDo = new Date(Date.UTC(jahr, 0, 4));
  const kw = 1 + Math.round(((d.getTime() - ersterDo.getTime()) / TAG - 3 + ((ersterDo.getUTCDay() + 6) % 7)) / 7);
  return { jahr, kw };
}

export type Woche = { jahr: number; kw: number; montag: string; sonntag: string };

/** Die Woche von `heute` und die folgenden, insgesamt `anzahl`. */
export function wochenListe(heute: string, anzahl: number): Woche[] {
  const h = tagMs(heute);
  const wt = (new Date(h).getUTCDay() + 6) % 7;
  const montag = h - wt * TAG;
  const aus: Woche[] = [];
  for (let i = 0; i < anzahl; i++) {
    const mo = montag + i * 7 * TAG;
    const { jahr, kw } = isoWoche(tagAus(mo));
    aus.push({ jahr, kw, montag: tagAus(mo), sonntag: tagAus(mo + 6 * TAG) });
  }
  return aus;
}

// ---------------------------------------------------------------------------
// Auslastung
// ---------------------------------------------------------------------------

export type Einsatz = { mitarbeiter_id: string | null; beginn_am: string | null; ende_am: string | null; status?: string | null; inhaber_einsatz?: boolean | null };
export type Monteur = { id: string; name: string; wochenstunden: number | null };
export type Zelle = { stunden: number; soll: number | null; quote: number | null; ampel: 'leer' | 'gruen' | 'gelb' | 'rot' };

function stunden(e: Einsatz): number {
  const b = e.beginn_am ? new Date(e.beginn_am).getTime() : NaN;
  const en = e.ende_am ? new Date(e.ende_am).getTime() : NaN;
  if (Number.isNaN(b) || Number.isNaN(en) || en <= b) return 0;
  return (en - b) / 3_600_000;
}

export function ampelFuer(stundenWert: number, soll: number | null): Zelle['ampel'] {
  if (stundenWert <= 0) return 'leer';
  if (!soll) return 'gruen';
  const q = stundenWert / soll;
  if (q > 1) return 'rot';
  if (q >= 0.8) return 'gelb';
  return 'gruen';
}

/**
 * Stunden je Monteur und Woche. Abgesagte zählen nicht. Einsätze ohne
 * Monteur landen in `ohne` (Arbeit, die noch niemand hat).
 */
export function auslastung(monteure: Monteur[], einsaetze: Einsatz[], wochen: Woche[]): {
  zeilen: { monteur: Monteur; zellen: Zelle[] }[]; ohne: number[]; summe: Zelle[];
} {
  const idx = (tag: string) => wochen.findIndex((w) => tag >= w.montag && tag <= w.sonntag);
  const je = new Map<string, number[]>();
  const ohne = wochen.map(() => 0);
  for (const e of einsaetze) {
    if ((e.status ?? '') === 'abgesagt') continue;
    const tag = berlinTag(e.beginn_am);
    if (!tag) continue;
    const i = idx(tag);
    if (i < 0) continue;
    const h = stunden(e);
    if (!e.mitarbeiter_id) { if (!e.inhaber_einsatz) ohne[i] += h; continue; }
    const arr = je.get(e.mitarbeiter_id) ?? wochen.map(() => 0);
    arr[i] += h;
    je.set(e.mitarbeiter_id, arr);
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const zeilen = monteure.map((m) => {
    const arr = je.get(m.id) ?? wochen.map(() => 0);
    const soll = m.wochenstunden && m.wochenstunden > 0 ? m.wochenstunden : null;
    return {
      monteur: m,
      zellen: arr.map((h) => ({ stunden: r1(h), soll, quote: soll ? Math.round((h / soll) * 100) : null, ampel: ampelFuer(h, soll) })),
    };
  });
  const summe = wochen.map((_, i) => {
    const h = zeilen.reduce((s, z) => s + z.zellen[i].stunden, 0);
    const alleSoll = zeilen.every((z) => z.zellen[i].soll !== null);
    const soll = zeilen.length && alleSoll ? zeilen.reduce((s, z) => s + (z.zellen[i].soll as number), 0) : null;
    return { stunden: r1(h), soll, quote: soll ? Math.round((h / soll) * 100) : null, ampel: ampelFuer(h, soll) };
  });
  return { zeilen, ohne: ohne.map(r1), summe };
}

// ---------------------------------------------------------------------------
// Frühwarnung je Projekt
// ---------------------------------------------------------------------------

export type Projekt = { id: string; name: string | null };
export type Aufgabe = { projekt_id: string | null; titel?: string | null; erledigt?: boolean | null; status?: string | null; faellig_am?: string | null; erstellt_am?: string | null; aktualisiert_am?: string | null };
export type Mangel = { projekt_id: string | null; status?: string | null; frist?: string | null };
export type Nachtrag = { projekt_id: string | null; status?: string | null; angeboten_am?: string | null; antwort_bis?: string | null; betrag_netto?: number | string | null };
export type Signal = { text: string; schwere: 1 | 2 | 3 };
export type ProjektWarnung = { projekt: Projekt; signale: Signal[]; punkte: number };

function offen(a: Aufgabe): boolean {
  return !(a.erledigt === true || String(a.status ?? '').toLowerCase() === 'erledigt');
}

export function projektWarnungen(o: {
  projekte: Projekt[]; aufgaben: Aufgabe[]; maengel: Mangel[]; nachtraege: Nachtrag[]; heute: string; stillstandTage?: number;
}): ProjektWarnung[] {
  const still = o.stillstandTage ?? 14;
  const aus: ProjektWarnung[] = [];
  for (const p of o.projekte) {
    const s: Signal[] = [];
    const auf = o.aufgaben.filter((a) => a.projekt_id === p.id);
    const offene = auf.filter(offen);
    const ueber = offene.filter((a) => a.faellig_am && a.faellig_am.slice(0, 10) < o.heute);
    if (ueber.length) s.push({ text: `${ueber.length} Aufgabe${ueber.length > 1 ? 'n' : ''} überfällig`, schwere: ueber.length >= 3 ? 3 : 2 });
    const m = o.maengel.filter((x) => x.projekt_id === p.id && !['behoben', 'abgenommen'].includes(String(x.status ?? 'offen')));
    const mUeber = m.filter((x) => x.frist && x.frist.slice(0, 10) < o.heute);
    if (mUeber.length) s.push({ text: `${mUeber.length} Mangel/Mängel über der Frist`, schwere: 3 });
    else if (m.length) s.push({ text: `${m.length} offene${m.length > 1 ? '' : 'r'} Mangel${m.length > 1 ? '/Mängel' : ''}`, schwere: 1 });
    const n = o.nachtraege.filter((x) => x.projekt_id === p.id && x.status === 'angeboten');
    const nUeber = n.filter((x) => x.antwort_bis && x.antwort_bis.slice(0, 10) < o.heute);
    if (nUeber.length) s.push({ text: `${nUeber.length} Nachtrag/Nachträge ohne Antwort des Kunden (Frist vorbei)`, schwere: 3 });
    else if (n.length) s.push({ text: `${n.length} Nachtrag/Nachträge warten auf Beauftragung`, schwere: 1 });
    const n0 = o.nachtraege.filter((x) => x.projekt_id === p.id && (x.status === 'entdeckt' || x.status === 'angekuendigt'));
    if (n0.length) s.push({ text: `${n0.length} Mehraufwand gemeldet, noch nicht angeboten`, schwere: 2 });
    // Stillstand: offene Aufgaben, aber seit X Tagen nichts erledigt/angelegt
    if (offene.length) {
      const letzte = auf.map((a) => (a.aktualisiert_am || a.erstellt_am || '').slice(0, 10)).filter(Boolean).sort().pop();
      if (letzte && (tagMs(o.heute) - tagMs(letzte)) / TAG > still) s.push({ text: `seit über ${still} Tagen keine Bewegung bei den Aufgaben`, schwere: 1 });
    }
    if (s.length) aus.push({ projekt: p, signale: s.sort((a, b) => b.schwere - a.schwere), punkte: s.reduce((x, y) => x + y.schwere, 0) });
  }
  return aus.sort((a, b) => b.punkte - a.punkte || String(a.projekt.name).localeCompare(String(b.projekt.name), 'de'));
}

// ---------------------------------------------------------------------------
// Morgen-Briefing (ohne KI)
// ---------------------------------------------------------------------------

export function morgenSatz(z: {
  name?: string | null; einsaetzeHeute: number; ohneMonteurHeute: number; rechnungenUeberfaellig: number; ueberfaelligSumme: number;
  warnProjekte: string[]; wocheQuote: number | null;
}): string {
  const teile: string[] = [];
  teile.push(`Guten Morgen${z.name ? `, ${z.name}` : ''}.`);
  teile.push(z.einsaetzeHeute === 0 ? 'Heute sind keine Einsätze geplant.' : `Heute ${z.einsaetzeHeute === 1 ? 'ist ein Einsatz' : `sind ${z.einsaetzeHeute} Einsätze`} geplant.`);
  if (z.ohneMonteurHeute > 0) teile.push(`${z.ohneMonteurHeute === 1 ? 'Einer davon hat' : `${z.ohneMonteurHeute} davon haben`} noch keinen Monteur.`);
  if (z.rechnungenUeberfaellig > 0) {
    const eur = z.ueberfaelligSumme.toLocaleString('de-DE', { maximumFractionDigits: 0 });
    teile.push(`${z.rechnungenUeberfaellig === 1 ? 'Eine Rechnung ist' : `${z.rechnungenUeberfaellig} Rechnungen sind`} überfällig, zusammen ${eur} Euro.`);
  }
  if (z.warnProjekte.length) {
    const namen = z.warnProjekte.slice(0, 3).join(', ');
    teile.push(`Achtung bei ${z.warnProjekte.length === 1 ? 'Projekt' : 'den Projekten'} ${namen}${z.warnProjekte.length > 3 ? ' und weiteren' : ''}.`);
  }
  if (z.wocheQuote !== null) teile.push(`Die Woche ist zu ${z.wocheQuote} Prozent verplant.`);
  if (teile.length === 2 && z.einsaetzeHeute === 0) teile.push('Sonst liegt nichts Dringendes an.');
  return teile.join(' ');
}

// ---------------------------------------------------------------------------
// Bank-Mappe
// ---------------------------------------------------------------------------

export type Rechnung = {
  rechnungsdatum?: string | null; faelligkeitsdatum?: string | null; brutto_summe?: number | string | null;
  zahlungsstatus?: string | null; bezahlt_am?: string | null;
};

function betrag(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').trim();
  if (!s) return 0;
  const n = leseZahlOder(s, 0);
  return Number.isFinite(n) ? n : 0;
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Die letzten `monate` Kalendermonate bis einschließlich des Monats von `heute`. */
export function monatsListe(heute: string, monate: number): string[] {
  let j = +heute.slice(0, 4); let m = +heute.slice(5, 7);
  const aus: string[] = [];
  for (let i = 0; i < monate; i++) {
    aus.unshift(`${j}-${String(m).padStart(2, '0')}`);
    m -= 1; if (m === 0) { m = 12; j -= 1; }
  }
  return aus;
}

/** Rechnungsumsatz (brutto) je Monat nach Rechnungsdatum, ohne Stornos. */
export function umsatzJeMonat(rechnungen: Rechnung[], heute: string, monate = 12): { monat: string; summe: number; anzahl: number }[] {
  const liste = monatsListe(heute, monate);
  const map = new Map(liste.map((m) => [m, { summe: 0, anzahl: 0 }]));
  for (const r of rechnungen) {
    if (r.zahlungsstatus === 'storniert') continue;
    const m = (r.rechnungsdatum ?? '').slice(0, 7);
    const z = map.get(m);
    if (!z) continue;
    z.summe += betrag(r.brutto_summe); z.anzahl += 1;
  }
  return liste.map((m) => ({ monat: m, summe: r2(map.get(m)!.summe), anzahl: map.get(m)!.anzahl }));
}

export function forderungen(rechnungen: Rechnung[], heute: string): { offen: number; anzahlOffen: number; ueberfaellig: number; anzahlUeberfaellig: number; aelter90: number } {
  let offenS = 0; let aO = 0; let ueb = 0; let aU = 0; let alt = 0;
  for (const r of rechnungen) {
    if (r.zahlungsstatus === 'storniert' || r.zahlungsstatus === 'bezahlt' || r.bezahlt_am) continue;
    const b = betrag(r.brutto_summe);
    offenS += b; aO += 1;
    const f = (r.faelligkeitsdatum ?? '').slice(0, 10);
    if (f && f < heute) {
      ueb += b; aU += 1;
      if ((tagMs(heute) - tagMs(f)) / TAG > 90) alt += b;
    }
  }
  return { offen: r2(offenS), anzahlOffen: aO, ueberfaellig: r2(ueb), anzahlUeberfaellig: aU, aelter90: r2(alt) };
}

/** Durchschnittliche Tage von Rechnungsdatum bis Zahlung (bezahlte Rechnungen im Zeitraum), sonst null. */
export function zahlungsdauer(rechnungen: Rechnung[], heute: string, monate = 12): number | null {
  const ab = monatsListe(heute, monate)[0] + '-01';
  const tage: number[] = [];
  for (const r of rechnungen) {
    const rd = (r.rechnungsdatum ?? '').slice(0, 10);
    const bz = (r.bezahlt_am ?? '').slice(0, 10);
    if (!rd || !bz || rd < ab || bz < rd) continue;
    tage.push((tagMs(bz) - tagMs(rd)) / TAG);
  }
  if (!tage.length) return null;
  return Math.round(tage.reduce((a, b) => a + b, 0) / tage.length);
}
