// ============================================================================
// lib/provision.ts
// Provisionsverwaltung: rechnet Verkaufsprovisionen aus GEWONNENEN Deals,
// gruppiert nach Empfänger und trennt offen / ausgezahlt.
// Reine Formeln — KEINE Supabase-Aufrufe, KEINE React-Hooks (Client + Node).
//
// ▄▄▄ REPARATUR PUNKT 25 (18.09.2026) ▄▄▄
// Im Kopf stand „Node-getestet (provision.test.ts)". Diese Datei gibt es im
// Repo NICHT — die dritte falsche Zusage dieser Art nach bankAbgleich.ts
// (Punkt 18) und fristen.ts (Punkt 21).
//
// 1. DIE VORSCHAU UND DER GESPEICHERTE WERT WIDERSPRACHEN SICH.
//    app/dashboard/provisionen/page.tsx gibt beim Tippen den ROHTEXT aus dem
//    Prozentfeld an provisionBetrag weiter (Z. 159), speichert aber mit
//    parseFloat (Z. 82). Der alte Leser hier konnte nur ein Komma ersetzen:
//    GEMESSEN — „7,5 %" ergab NaN und damit 0, in der Zeile stand also
//    0,00 EUR Provision, während beim Speichern 7,5 % in der Datenbank
//    landeten. Wer sich auf die Anzeige verlassen hat, hat falsch entschieden.
//    Ebenso: ein Deal-Wert „12.500,00" ergab 0 EUR Provision, „12.500" ergab
//    0,63 EUR statt 625 EUR. Jetzt liest lib/zahlen.ts.
//
// 2. DIE PROVISIONSSPALTE ZEIGTE GANZE EURO. formatEuro stand auf
//    maximumFractionDigits: 0 — eine Provision über 1.234,56 EUR erschien als
//    „1.235 €". Auf dieser Zahl wird ausgezahlt; die Cents standen nirgends.
//    Jetzt zwei Nachkommastellen. Das ist eine sichtbare Änderung an der
//    Provisionsseite, aber nur an der DARSTELLUNG — es wird nichts anders
//    gerechnet und nichts anders gespeichert.
//
// 3. ASYMMETRISCHE RUNDUNG. r2 machte aus −2,345 die −2,34 statt −2,35.
//    Betrifft Storni und Rückbelastungen (negativer Deal-Wert).
//
// 4. KEIN WORT BEI UNPLAUSIBLEN SÄTZEN. GEMESSEN: 150 % auf 1.000 EUR ergaben
//    klaglos 1.500 EUR Provision. Der Satz wird NICHT gedeckelt — was
//    vereinbart ist, weiß der Betrieb, nicht diese Datei — aber
//    provisionHinweise() sagt es jetzt im Klartext.
// ============================================================================

import { leseZahl, leseZahlOder, centRunden } from './zahlen';

export interface ProvisionDeal {
  id?: string;
  titel?: string | null;
  wert_netto?: number | string | null;
  stufe?: string | null;
  provision_prozent?: number | string | null;
  provision_empfaenger?: string | null;
  provision_ausgezahlt?: boolean | null;
}

/** Zahl aus Datenbank oder Eingabefeld — auch „12.500,00" und „7,5 %". */
function z(x: unknown): number {
  return leseZahlOder(x, 0);
}
/** Auf Cent runden, symmetrisch um Null. */
function r2(n: number): number { return centRunden(n); }

/** Ist die Eingabe überhaupt als Zahl lesbar? Für die Hinweise. */
function lesbar(x: unknown): boolean {
  if (x === null || x === undefined || x === '') return false;
  return leseZahl(x) !== null;
}

/** Nur gewonnene Deals mit einem Provisionssatz erzeugen eine Provision. */
export function istProvisionsfaehig(d: ProvisionDeal): boolean {
  return d.stufe === 'gewonnen' && z(d.provision_prozent) > 0;
}

/** Provisionsbetrag eines Deals = Wert netto × Satz. 0, wenn nicht fällig. */
export function provisionBetrag(d: ProvisionDeal): number {
  if (!istProvisionsfaehig(d)) return 0;
  return r2(z(d.wert_netto) * (z(d.provision_prozent) / 100));
}

export function empfaengerName(d: ProvisionDeal): string {
  const n = (d.provision_empfaenger ?? '').trim();
  return n || 'Ohne Empfänger';
}

export interface EmpfaengerZeile {
  empfaenger: string;
  anzahl: number;
  gesamt: number;
  offen: number;
  ausgezahlt: number;
}

/** Gruppiert provisionsfähige Deals nach Empfänger (alphabetisch). */
export function proEmpfaenger(deals: ProvisionDeal[]): EmpfaengerZeile[] {
  const map = new Map<string, EmpfaengerZeile>();
  for (const d of deals || []) {
    if (!istProvisionsfaehig(d)) continue;
    const name = empfaengerName(d);
    const betrag = provisionBetrag(d);
    const row = map.get(name) ?? { empfaenger: name, anzahl: 0, gesamt: 0, offen: 0, ausgezahlt: 0 };
    row.anzahl += 1;
    row.gesamt = r2(row.gesamt + betrag);
    if (d.provision_ausgezahlt) row.ausgezahlt = r2(row.ausgezahlt + betrag);
    else row.offen = r2(row.offen + betrag);
    map.set(name, row);
  }
  return [...map.values()].sort((a, b) => a.empfaenger.localeCompare(b.empfaenger, 'de'));
}

export interface ProvisionSummen {
  gesamt: number;
  offen: number;
  ausgezahlt: number;
  anzahlDeals: number;
  anzahlEmpfaenger: number;
}

export function provisionSummen(deals: ProvisionDeal[]): ProvisionSummen {
  let gesamt = 0, offen = 0, ausgezahlt = 0, anzahl = 0;
  const namen = new Set<string>();
  for (const d of deals || []) {
    if (!istProvisionsfaehig(d)) continue;
    const b = provisionBetrag(d);
    gesamt += b; anzahl += 1; namen.add(empfaengerName(d));
    if (d.provision_ausgezahlt) ausgezahlt += b; else offen += b;
  }
  return { gesamt: r2(gesamt), offen: r2(offen), ausgezahlt: r2(ausgezahlt), anzahlDeals: anzahl, anzahlEmpfaenger: namen.size };
}

/**
 * Euro-Anzeige MIT Cent. Stand vorher auf maximumFractionDigits: 0 — eine
 * Provision über 1.234,56 EUR erschien als „1.235 €", und genau auf dieser
 * Zahl wurde „Als ausgezahlt" geklickt.
 */
export function formatEuro(n: unknown): string {
  return centRunden(z(n)).toLocaleString('de-DE', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Klartext vor dem Auszahlen (Punkt 25). Ändert nichts, rechnet nichts um.
// NOCH NICHT auf der Seite angezeigt — Andockpunkt, gebündelt mit
// staffelUnstimmigkeiten / extfHinweise / ustvaHinweise / bankHinweise /
// wiederkehrHinweise / datevHinweise / fristenHinweise / fixpreisHinweise.
// ────────────────────────────────────────────────────────────────────────────

/** Ein Satz zwischen 0 und 100 Prozent ist plausibel — alles andere gehört angesehen. */
export function satzPlausibel(prozent: unknown): boolean {
  const n = leseZahl(prozent);
  return n !== null && n > 0 && n <= 100;
}

export function provisionHinweise(deals: ProvisionDeal[]): string[] {
  const h: string[] = [];
  const liste = deals || [];
  const name = (d: ProvisionDeal) => (d.titel && String(d.titel).trim()) || d.id || 'ohne Titel';

  const unlesbarWert = liste.filter((d) => d.stufe === 'gewonnen' && d.wert_netto != null && d.wert_netto !== '' && !lesbar(d.wert_netto));
  if (unlesbarWert.length > 0) {
    h.push(`${unlesbarWert.length} gewonnene${unlesbarWert.length === 1 ? 'r Deal' : ' Deals'} mit nicht lesbarem Wert — dort wird mit 0 EUR gerechnet: ${unlesbarWert.map(name).join(', ')}.`);
  }

  const unlesbarSatz = liste.filter((d) => d.provision_prozent != null && d.provision_prozent !== '' && !lesbar(d.provision_prozent));
  if (unlesbarSatz.length > 0) {
    h.push(`${unlesbarSatz.length} Deal${unlesbarSatz.length === 1 ? '' : 's'} mit nicht lesbarem Provisionssatz: ${unlesbarSatz.map(name).join(', ')}.`);
  }

  const unplausibel = liste.filter((d) => istProvisionsfaehig(d) && !satzPlausibel(d.provision_prozent));
  if (unplausibel.length > 0) {
    h.push(`${unplausibel.length} Deal${unplausibel.length === 1 ? '' : 's'} mit einem Provisionssatz über 100 %: ${unplausibel.map((d) => `${name(d)} (${d.provision_prozent} %)`).join(', ')}. Der Satz wird NICHT gedeckelt — bitte prüfen.`);
  }

  const ohneEmpfaenger = liste.filter((d) => istProvisionsfaehig(d) && !(d.provision_empfaenger ?? '').trim());
  if (ohneEmpfaenger.length > 0) {
    h.push(`${ohneEmpfaenger.length} fällige Provision${ohneEmpfaenger.length === 1 ? '' : 'en'} ohne Empfänger — sie laufen unter „Ohne Empfänger" zusammen: ${ohneEmpfaenger.map(name).join(', ')}.`);
  }

  const negativ = liste.filter((d) => istProvisionsfaehig(d) && z(d.wert_netto) < 0);
  if (negativ.length > 0) {
    h.push(`${negativ.length} gewonnene${negativ.length === 1 ? 'r Deal' : ' Deals'} mit negativem Wert (Storno oder Rückbelastung) — die Provision ist entsprechend negativ: ${negativ.map(name).join(', ')}.`);
  }

  const gewonnenOhneSatz = liste.filter((d) => d.stufe === 'gewonnen' && (d.provision_prozent == null || d.provision_prozent === '' || z(d.provision_prozent) === 0));
  if (gewonnenOhneSatz.length > 0) {
    h.push(`${gewonnenOhneSatz.length} gewonnene${gewonnenOhneSatz.length === 1 ? 'r Deal' : ' Deals'} ohne Provisionssatz — dort entsteht keine Provision.`);
  }
  return h;
}
