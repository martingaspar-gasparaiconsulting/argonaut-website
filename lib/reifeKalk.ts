// ============================================================================
// ARGONAUT OS · lib/reifeKalk.ts — Paket 340 (12.10.2026) · BV3a Manufaktur Teil 2
//
// Kalkulation mit Reifeverlust je Reife-Charge (Reife-Uhr, Paket 339):
//   Kosten gesamt   = Einkauf + Reifekosten je Tag × Tage + sonstige Kosten
//   verkaufsfähig   = Endmenge × (1 − Parierverlust)
//   Einstandspreis  = Kosten gesamt / verkaufsfähige Menge
//   Preis-Vorschlag = Einstandspreis / (1 − Wunsch-Marge)   (netto)
//   Plan: Endmenge aus dem erwarteten Reifeverlust, Tage = Ziel-Reifezeit.
//   Ist:  gewogene Endmenge (bei laufender Charge: letzte Wiegung, vorläufig),
//         Tage bis heute bzw. bis zum Abschluss.
//
// Regeln:
//   - Nur Rechnung aus den Zahlen des Betriebs — keine Marktpreise, kein
//     KI-Preis. Der Vorschlag ist ein Rechenergebnis, der Betrieb entscheidet.
//   - Geld über lib/zahlen (centRunden), Mengen über rundeStellen.
//   - „g" wird für Preise in kg umgerechnet (Preis je g liest niemand).
//   - Fehlt eine Zahl, die das Ergebnis braucht, gibt es KEIN Ergebnis
//     (null + Grund) — nie still mit 0 rechnen.
//
// Reine Logik, keine React-/Supabase-Imports.
// ============================================================================

import { centRunden, rundeStellen } from './zahlen';
import { vorlage, reifeTage } from './reife';

export const MWST_SAETZE = [0, 7, 19] as const;
export const EK_ARTEN = ['gesamt', 'je_einheit'] as const;
export type EkArt = (typeof EK_ARTEN)[number];

/** Gespeicherte Kalkulation einer Charge (Tabelle reife_kalk). */
export type ReifeKalk = {
  ek_art: string | null;
  ek_wert: number | null;          // netto
  kosten_tag: number | null;       // netto je Reifetag (Strom, Reifeschrank, Platz)
  kosten_sonst: number | null;     // netto gesamt (Arbeit, Verpackung, Etiketten …)
  parier_prozent: number | null;   // Abschnitt/Trim nach der Reifung
  erwarteter_verlust: number | null; // Reifeverlust laut Plan in %
  marge_prozent: number | null;    // Wunsch-Marge vom Netto-Verkaufspreis
  mwst_satz: number | null;
  vk_preis: number | null;         // gewählter Verkaufspreis brutto je Preis-Einheit
};

/** Die Charge, soweit die Kalkulation sie braucht. */
export type KalkCharge = {
  art: string;
  start_datum: string;
  ziel_tage: number | null;
  start_menge: number | null;
  einheit: string;
  status?: string | null;
  end_datum?: string | null;
  end_menge?: number | null;
};

/** Startwerte je Art (Lebensmittel 7 %, Wein 19 %; Verlust aus der Erfahrung des Betriebs). */
export function kalkStartwerte(art: string): ReifeKalk {
  const v = vorlage(art);
  const verlust: Record<string, number | null> = { dry_aged: 25, rohschinken: 30, rohwurst: 30, kaese: 10, wein: 0, confiserie: 0, sonstig: null };
  const parier: Record<string, number | null> = { dry_aged: 15, rohschinken: 10, rohwurst: 0, kaese: 3, wein: 0, confiserie: 0, sonstig: null };
  return {
    ek_art: 'je_einheit', ek_wert: null, kosten_tag: null, kosten_sonst: null,
    parier_prozent: parier[art] ?? null,
    erwarteter_verlust: v.verlust ? (verlust[art] ?? null) : 0,
    marge_prozent: null,
    mwst_satz: art === 'wein' ? 19 : 7,
    vk_preis: null,
  };
}

/** Preis-Einheit: g wird zu kg (Faktor = wie viele Mengen-Einheiten eine Preis-Einheit sind). */
export function preisEinheit(einheit: string): { einheit: string; faktor: number } {
  return einheit === 'g' ? { einheit: 'kg', faktor: 1000 } : { einheit, faktor: 1 };
}

// --- Eingaben prüfen ----------------------------------------------------------

export type KalkEingabe = {
  ek_art: string; ek_wert: number | null; kosten_tag: number | null; kosten_sonst: number | null;
  parier_prozent: number | null; erwarteter_verlust: number | null; marge_prozent: number | null;
  mwst_satz: number | null; vk_preis: number | null;
};

const geld = (x: number | null, hi: number) => x === null || (Number.isFinite(x) && x >= 0 && x <= hi);
const proz = (x: number | null, hi: number) => x === null || (Number.isFinite(x) && x >= 0 && x <= hi);

export function kalkPruefen(e: KalkEingabe): { ok: true; felder: ReifeKalk } | { ok: false; fehler: string } {
  if (!(EK_ARTEN as readonly string[]).includes(e.ek_art)) return { ok: false, fehler: 'Bitte wählen, ob der Einkauf gesamt oder je Einheit gilt.' };
  if (!geld(e.ek_wert, 10_000_000)) return { ok: false, fehler: 'Einkauf bitte als Betrag ab 0 eintragen.' };
  if (!geld(e.kosten_tag, 100_000)) return { ok: false, fehler: 'Reifekosten je Tag bitte als Betrag ab 0 eintragen.' };
  if (!geld(e.kosten_sonst, 10_000_000)) return { ok: false, fehler: 'Sonstige Kosten bitte als Betrag ab 0 eintragen.' };
  if (!proz(e.parier_prozent, 90)) return { ok: false, fehler: 'Parierverlust bitte zwischen 0 und 90 %.' };
  if (!proz(e.erwarteter_verlust, 90)) return { ok: false, fehler: 'Erwarteter Reifeverlust bitte zwischen 0 und 90 %.' };
  if (!proz(e.marge_prozent, 95)) return { ok: false, fehler: 'Marge bitte zwischen 0 und 95 % (Anteil am Netto-Verkaufspreis).' };
  if (e.mwst_satz === null || !(MWST_SAETZE as readonly number[]).includes(e.mwst_satz)) return { ok: false, fehler: 'Bitte den Umsatzsteuersatz wählen (0, 7 oder 19 %).' };
  if (!geld(e.vk_preis, 1_000_000)) return { ok: false, fehler: 'Verkaufspreis bitte als Betrag ab 0 eintragen.' };
  const c = (x: number | null) => (x === null ? null : centRunden(x));
  const p = (x: number | null) => (x === null ? null : rundeStellen(x, 2));
  return {
    ok: true,
    felder: {
      ek_art: e.ek_art,
      ek_wert: e.ek_wert === null ? null : rundeStellen(e.ek_wert, 4),
      kosten_tag: c(e.kosten_tag), kosten_sonst: c(e.kosten_sonst),
      parier_prozent: p(e.parier_prozent), erwarteter_verlust: p(e.erwarteter_verlust), marge_prozent: p(e.marge_prozent),
      mwst_satz: e.mwst_satz, vk_preis: c(e.vk_preis),
    },
  };
}

// --- Rechnen ------------------------------------------------------------------

export type KalkErgebnis = {
  tage: number;
  ekGesamt: number;
  reifekosten: number;
  kostenGesamt: number;
  endMenge: number;             // in Mengen-Einheit
  verkaufsMenge: number;        // in Preis-Einheit (g -> kg)
  ausbeuteProzent: number;      // verkaufsfähig / Start
  einstand: number;             // netto je Preis-Einheit
  vorschlagNetto: number | null;
  vorschlagBrutto: number | null;
  /** mit dem gewählten Verkaufspreis */
  vkNetto: number | null;
  rohertragJe: number | null;
  margeIst: number | null;      // % vom Netto-VK
  aufschlag: number | null;     // % auf den Einstand
  deckung: number | null;       // Rohertrag der ganzen Charge
};

export type KalkAntwort = { ok: true; e: KalkErgebnis } | { ok: false; grund: string };

function ekGesamt(k: ReifeKalk, startMenge: number): number | null {
  if (k.ek_wert === null || k.ek_wert === undefined) return null;
  return k.ek_art === 'gesamt' ? k.ek_wert : k.ek_wert * startMenge;
}

/** Kern: rechnet mit einer gegebenen Endmenge und Tagezahl. */
export function rechne(c: KalkCharge, k: ReifeKalk, endMenge: number, tage: number): KalkAntwort {
  const start = c.start_menge;
  if (!start || !(start > 0)) return { ok: false, grund: 'Ohne Startmenge lässt sich nicht rechnen — bitte an der Charge eintragen.' };
  const ek = ekGesamt(k, start);
  if (ek === null) return { ok: false, grund: 'Bitte den Einkaufspreis eintragen.' };
  if (!(endMenge > 0)) return { ok: false, grund: 'Die Endmenge fehlt.' };
  const pe = preisEinheit(c.einheit);
  const parier = k.parier_prozent ?? 0;
  const verkaufsMengeRoh = (endMenge * (1 - parier / 100)) / pe.faktor;
  if (!(verkaufsMengeRoh > 0)) return { ok: false, grund: 'Nach Parierverlust bleibt keine verkaufsfähige Menge.' };
  const reifekosten = (k.kosten_tag ?? 0) * Math.max(0, tage);
  const kostenGesamt = ek + reifekosten + (k.kosten_sonst ?? 0);
  const einstandRoh = kostenGesamt / verkaufsMengeRoh;
  const mwst = k.mwst_satz ?? 7;
  const marge = k.marge_prozent;
  const vorschlagNetto = marge === null || marge === undefined ? null : centRunden(einstandRoh / (1 - marge / 100));
  const vorschlagBrutto = vorschlagNetto === null ? null : centRunden(vorschlagNetto * (1 + mwst / 100));
  const vk = k.vk_preis;
  const vkNettoRoh = vk === null || vk === undefined ? null : vk / (1 + mwst / 100);
  const rohertragRoh = vkNettoRoh === null ? null : vkNettoRoh - einstandRoh;
  return {
    ok: true,
    e: {
      tage: Math.max(0, tage),
      ekGesamt: centRunden(ek),
      reifekosten: centRunden(reifekosten),
      kostenGesamt: centRunden(kostenGesamt),
      endMenge: rundeStellen(endMenge, 3),
      verkaufsMenge: rundeStellen(verkaufsMengeRoh, 3),
      ausbeuteProzent: rundeStellen(((verkaufsMengeRoh * pe.faktor) / start) * 100, 1),
      einstand: centRunden(einstandRoh),
      vorschlagNetto, vorschlagBrutto,
      vkNetto: vkNettoRoh === null ? null : centRunden(vkNettoRoh),
      rohertragJe: rohertragRoh === null ? null : centRunden(rohertragRoh),
      margeIst: rohertragRoh === null || !vkNettoRoh ? null : rundeStellen((rohertragRoh / vkNettoRoh) * 100, 1),
      aufschlag: rohertragRoh === null || !(einstandRoh > 0) ? null : rundeStellen((rohertragRoh / einstandRoh) * 100, 1),
      deckung: rohertragRoh === null ? null : centRunden(rohertragRoh * verkaufsMengeRoh),
    },
  };
}

/** Plan: Endmenge aus dem erwarteten Reifeverlust, Tage = Ziel. */
export function planKalk(c: KalkCharge, k: ReifeKalk): KalkAntwort {
  const start = c.start_menge;
  if (!start || !(start > 0)) return { ok: false, grund: 'Ohne Startmenge lässt sich nicht rechnen — bitte an der Charge eintragen.' };
  const v = k.erwarteter_verlust;
  if (v === null || v === undefined) return { ok: false, grund: 'Für den Plan bitte den erwarteten Reifeverlust eintragen.' };
  if (c.ziel_tage === null || c.ziel_tage === undefined) return { ok: false, grund: 'Für den Plan fehlt die Ziel-Reifezeit.' };
  return rechne(c, k, start * (1 - v / 100), c.ziel_tage);
}

/**
 * Ist: gewogene Endmenge. Abgeschlossen -> Endmenge beim Abschluss (endgültig).
 * Laufend -> letzte Wiegung (vorläufig, Parierverlust noch geschätzt).
 */
export function istKalk(c: KalkCharge, k: ReifeKalk, letzteMenge: number | null, heute: string): (KalkAntwort & { vorlaeufig: boolean }) {
  const fertig = c.status === 'abgeschlossen';
  if (c.status === 'verworfen') return { ok: false, grund: 'Charge verworfen — der Einkauf ist Verlust.', vorlaeufig: false };
  const menge = fertig ? (c.end_menge ?? null) : letzteMenge;
  if (menge === null || !(menge > 0)) {
    return { ok: false, grund: fertig ? 'Beim Abschluss wurde keine Endmenge gewogen.' : 'Noch keine Wiegung — die Ist-Rechnung folgt mit der ersten Messung.', vorlaeufig: !fertig };
  }
  const bis = fertig && c.end_datum ? c.end_datum : heute;
  const tage = reifeTage(c.start_datum, bis) ?? 0;
  return { ...rechne(c, k, menge, tage), vorlaeufig: !fertig };
}

/**
 * Bis zu welchem Gesamtverlust (Reife + Parieren) deckt der gewählte Preis
 * die Kosten? null ohne Preis/Startmenge/Einkauf. Negativ = Preis deckt nicht einmal ohne Verlust.
 */
export function verlustGrenze(c: KalkCharge, k: ReifeKalk, tage: number): number | null {
  const start = c.start_menge;
  if (!start || !(start > 0) || k.vk_preis === null || k.vk_preis === undefined || !(k.vk_preis > 0)) return null;
  const ek = ekGesamt(k, start);
  if (ek === null) return null;
  const pe = preisEinheit(c.einheit);
  const vkNetto = k.vk_preis / (1 + (k.mwst_satz ?? 7) / 100);
  const kosten = ek + (k.kosten_tag ?? 0) * Math.max(0, tage) + (k.kosten_sonst ?? 0);
  const noetigeMenge = (kosten / vkNetto) * pe.faktor;
  return rundeStellen((1 - noetigeMenge / start) * 100, 1);
}

/** Abweichung Ist gegen Plan beim Einstandspreis (in %, positiv = teurer als geplant). */
export function einstandAbweichung(plan: KalkAntwort, ist: KalkAntwort): number | null {
  if (!plan.ok || !ist.ok || !(plan.e.einstand > 0)) return null;
  return rundeStellen(((ist.e.einstand - plan.e.einstand) / plan.e.einstand) * 100, 1);
}

/** Ampel für die Marge mit dem gewählten Preis. */
export function margeAmpel(e: KalkErgebnis, wunsch: number | null): 'ok' | 'warn' | 'bad' | null {
  if (e.margeIst === null) return null;
  if (e.margeIst < 0) return 'bad';
  if (wunsch !== null && wunsch !== undefined && e.margeIst < wunsch) return 'warn';
  return 'ok';
}
