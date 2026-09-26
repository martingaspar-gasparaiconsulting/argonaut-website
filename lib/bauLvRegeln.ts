// ============================================================================
// ARGONAUT OS · lib/bauLvRegeln.ts — Paket G, Punkt G12 (26.09.2026)
//
// ▄▄▄ DIE ZWEI FEHLER ▄▄▄
//  1. Nach „Aus LV eine Rechnung erstellen" liessen sich die Positionen des
//     LV weiter löschen und neue anlegen. LV und Rechnung liefen auseinander:
//     Die Rechnung blieb, wie sie war, das LV zeigte etwas anderes.
//  2. Menge und Einzelpreis wurden mit leseZahlOder(..., 0) gelesen. Eine
//     Eingabe wie „12 m" oder „ca. 40" wurde still zu 0 — die Position stand
//     mit 0,00 EUR im LV, ohne dass es jemand merkte.
//
// ▄▄▄ DIE LÖSUNG ▄▄▄
//  · Ein abgerechnetes LV (rechnung_id gesetzt oder Status „abgerechnet") ist
//    gesperrt — in der Seite UND in der Datenbank (Trigger, siehe
//    supabase-sql/g-paket-g9-g14.sql). Nachträge danach gehören auf eine
//    eigene Rechnung (so sagt es schon lvUebernahmeMoeglich()).
//  · Unlesbare Menge oder fehlender Einzelpreis -> klare Meldung, kein Speichern.
//
// Reine Funktionen. Node-getestet: tests/gPaketG9G14.test.mjs
// ============================================================================

import { leseZahl } from './zahlen';

/** Ist das LV abgerechnet und damit gesperrt? */
export function lvGesperrt(lv: { rechnung_id?: string | null; status?: string | null } | null | undefined): boolean {
  if (!lv) return false;
  return !!lv.rechnung_id || String(lv.status ?? '').trim().toLowerCase() === 'abgerechnet';
}

export type PositionsPruefung =
  | { ok: true; menge: number; einzelpreis: number; gesamt: number }
  | { ok: false; fehler: string };

/** Menge und Einzelpreis lesen — nichts wird still zu 0. */
export function pruefePosition(mengeText: string, preisText: string): PositionsPruefung {
  const menge = leseZahl(mengeText);
  if (menge == null) return { ok: false, fehler: `Die Menge „${String(mengeText ?? '').trim() || '(leer)'}" ist keine Zahl — bitte nur die Zahl eintragen, z. B. 12,5.` };
  if (menge <= 0) return { ok: false, fehler: 'Die Menge muss größer als 0 sein.' };
  if (!String(preisText ?? '').trim()) return { ok: false, fehler: 'Bitte einen Einzelpreis eintragen (auch 0 ist möglich, dann ausdrücklich „0").' };
  const einzelpreis = leseZahl(preisText);
  if (einzelpreis == null) return { ok: false, fehler: `Der Einzelpreis „${String(preisText).trim()}" ist keine Zahl — bitte z. B. 48,90 eintragen.` };
  if (einzelpreis < 0) return { ok: false, fehler: 'Der Einzelpreis darf nicht negativ sein.' };
  return { ok: true, menge, einzelpreis, gesamt: Math.round(menge * einzelpreis * 100) / 100 };
}
