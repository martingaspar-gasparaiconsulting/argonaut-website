// ============================================================================
// ARGONAUT OS · lib/nachtragAbrechnen.ts — HW-15 Nachtrag abrechnen (15.10.2026)
//
// ▄▄▄ DIE LÜCKEN (Claude-Befund aus dem Handwerk-Durchgang) ▄▄▄
//  1. „Ins LV übernehmen" schrieb jede Nachtragsposition fest mit 19 % ins LV
//     (bau-lv/ablaeufe) — auch wenn das LV mit 7 % oder 0 % lief.
//  2. Menge und Preis wurden mit Number(x) || 0 gelesen: „2,5" wurde still 0.
//  3. Ist das LV schon abgerechnet, hieß es „den Nachtrag bitte gesondert
//     abrechnen" — aber es gab keinen Weg, aus dem Nachtrag eine Rechnung zu
//     machen. Er wurde nur von Hand auf „abgerechnet" gesetzt.
//
// ▄▄▄ DIE LÖSUNG ▄▄▄
//  · satzVorschlag(): häufigster Steuersatz im LV, sonst 19 — die Seite fragt
//    nach und übernimmt nur 0, 7 oder 19 (steuersatz()).
//  · nachtragZeilen(): Positionen mit leseZahl; fehlt Menge/Preis -> Fehler.
//  · nachtragAbrechenbar(): nur beauftragt, nicht im LV, noch keine (gültige)
//    Rechnung, alle Positionen vollständig.  Ein Nachtrag wird ENTWEDER über
//    das LV ODER mit eigener Rechnung abgerechnet — nie beides.
//  · nachtragZuRechnung(): Posten + Kopfsummen (kopfSummen).
//
// Reine Funktionen. Node-getestet: tests/nachtragAbrechnenHW15.test.mjs
// ============================================================================

import { leseZahl, centRunden } from './zahlen';
import { steuersatz } from './steuersatz';
import { kopfSummen, type KopfSummen } from './rechnungKopf';

export type NachtragPos = { kurztext?: unknown; menge?: unknown; einheit?: unknown; einzelpreis?: unknown };

export type NachtragKopf = {
  nummer?: string | null;
  titel?: string | null;
  status?: string | null;
  in_lv_uebernommen?: boolean | null;
  rechnung_id?: string | null;
  positionen?: readonly NachtragPos[] | null;
};

export type NachtragZeile = { kurztext: string; menge: number; einheit: string; einzelpreis: number; gesamt_netto: number };

/** Erlaubte Sätze im Bau-Alltag. */
export const SAETZE = [19, 7, 0] as const;

/** Häufigster Steuersatz der vorhandenen LV-Positionen; bei Gleichstand der höhere; leer -> 19. */
export function satzVorschlag(lvSaetze: readonly unknown[] | null | undefined): number {
  const zaehler = new Map<number, number>();
  for (const s of lvSaetze ?? []) {
    const satz = steuersatz(s);
    zaehler.set(satz, (zaehler.get(satz) ?? 0) + 1);
  }
  let best = 19;
  let anzahl = 0;
  for (const [satz, n] of zaehler) {
    if (n > anzahl || (n === anzahl && satz > best)) { best = satz; anzahl = n; }
  }
  return best;
}

/** Eingabe aus der Rückfrage lesen: nur 0, 7 oder 19 — sonst null (= abbrechen). */
export function satzAusEingabe(eingabe: unknown): number | null {
  const t = String(eingabe ?? '').replace('%', '').trim();
  if (!t) return null;
  const z = leseZahl(t);
  return z !== null && (SAETZE as readonly number[]).includes(z) ? z : null;
}

/** Positionen lesen — nichts wird still zu 0. */
export function nachtragZeilen(positionen: readonly NachtragPos[] | null | undefined): { ok: true; zeilen: NachtragZeile[] } | { ok: false; fehler: string } {
  const liste = (positionen ?? []).filter((p) => p && String(p.kurztext ?? '').trim());
  if (!liste.length) return { ok: false, fehler: 'Der Nachtrag hat keine Positionen.' };
  const zeilen: NachtragZeile[] = [];
  for (const p of liste) {
    const kurztext = String(p.kurztext).trim();
    const menge = leseZahl(p.menge);
    const einzelpreis = leseZahl(p.einzelpreis);
    if (menge === null || einzelpreis === null) return { ok: false, fehler: `Bei „${kurztext}" fehlt Menge oder Preis.` };
    if (menge <= 0) return { ok: false, fehler: `Bei „${kurztext}" muss die Menge größer als 0 sein.` };
    zeilen.push({ kurztext, menge, einheit: String(p.einheit ?? '').trim() || 'Stk', einzelpreis, gesamt_netto: centRunden(menge * einzelpreis) });
  }
  return { ok: true, zeilen };
}

/**
 * Darf aus dem Nachtrag eine eigene Rechnung werden?
 * rechnungGueltig: gibt es zur gespeicherten rechnung_id eine NICHT stornierte Rechnung?
 */
export function nachtragAbrechenbar(n: NachtragKopf, rechnungGueltig: boolean): { ok: true } | { ok: false; fehler: string; bereitsVorhanden?: boolean } {
  if (n.rechnung_id && rechnungGueltig) return { ok: false, fehler: 'Zu diesem Nachtrag gibt es bereits eine Rechnung.', bereitsVorhanden: true };
  if (n.status !== 'beauftragt') return { ok: false, fehler: 'Nur beauftragte Nachträge können abgerechnet werden.' };
  if (n.in_lv_uebernommen) return { ok: false, fehler: 'Der Nachtrag steht schon im LV und wird mit der Rechnung aus dem LV abgerechnet.' };
  const z = nachtragZeilen(n.positionen);
  if (!z.ok) return { ok: false, fehler: z.fehler };
  return { ok: true };
}

/** Darf der Nachtrag ins LV? Zusätzlich zu lvUebernahmeMoeglich: nicht, wenn er schon eine eigene Rechnung hat. */
export function insLvErlaubt(n: NachtragKopf, rechnungGueltig: boolean): { ok: true } | { ok: false; fehler: string } {
  if (n.rechnung_id && rechnungGueltig) return { ok: false, fehler: 'Der Nachtrag ist schon mit eigener Rechnung abgerechnet — nicht noch einmal ins LV.' };
  return { ok: true };
}

export function nachtragTitel(n: NachtragKopf): string {
  const t = String(n.titel ?? '').trim() || 'Nachtrag';
  return (n.nummer ? `Nachtrag ${n.nummer} – ${t}` : `Nachtrag – ${t}`).slice(0, 200);
}

export type NachtragPosten = { position: number; bezeichnung: string; menge: number; einheit: string; einzelpreis: number; mwst_satz: number; gesamt_netto: number };

/** Rechnungsposten + Kopfsummen; ein Satz für den ganzen Nachtrag. */
export function nachtragZuRechnung(zeilen: readonly NachtragZeile[], satz: unknown, nummer?: string | null): { posten: NachtragPosten[]; summen: KopfSummen } {
  const s = steuersatz(satz);
  const posten = zeilen.map((z, i) => ({
    position: i + 1,
    bezeichnung: `[Nachtrag${nummer ? ` ${nummer}` : ''}] ${z.kurztext}`.slice(0, 500),
    menge: z.menge, einheit: z.einheit, einzelpreis: z.einzelpreis, mwst_satz: s, gesamt_netto: z.gesamt_netto,
  }));
  return { posten, summen: kopfSummen(posten.map((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })), {}) };
}
