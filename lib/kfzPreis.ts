// ============================================================================
// ARGONAUT OS · lib/kfzPreis.ts — Paket 275 (08.10.2026) · K12a Markt und Preis (eigene Daten)
//
// Preis-Cockpit je Bestandsfahrzeug — NUR aus den Daten des Betriebs:
// Standtage, Einkauf, Kosten, Standkosten, Preisverlauf, Aufrufe der eigenen
// Fahrzeugbörse, Anfragen, Inserats-Ampel.
//
// GRUNDSÄTZE
// - Keine KI-Schätzung, keine fremden Marktdaten (Anwalt R45: Marktdaten nur
//   lizenziert). Der Preisvorschlag folgt ausschließlich der Preis-Treppe, die
//   der Betrieb selbst einstellt. Die Marktposition (Vergleichspreise) kommt in
//   K12b über eigene Einträge bzw. einen lizenzierten Partner.
// - Nichts wird erfunden: ohne Verkaufspreis kein Vorschlag, ohne Einkauf keine
//   Untergrenze (dann sagt die Ansicht das).
// - Vorschlag ist ein VORSCHLAG: übernommen wird nur per Knopf; der Preisverlauf
//   (Auslöser aus Paket 259) protokolliert jede Änderung.
//
// Nur Import der zentralen Rundung, KEINE Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

import { centRunden } from './zahlen';

export const PREIS_MODUL = 'kfz-preis';
const UST = 19;
const TAG = 86400000;

export type PreisStufe = { ab: number; prozent: number };
export type PreisRegeln = {
  stufen: PreisStufe[];        // ab X Standtagen um Y % senken (höchste passende Stufe gilt)
  abstandTage: number;         // frühestens so viele Tage nach der letzten Preisänderung erneut senken
  mindestRohertrag: number;    // € netto, die mindestens bleiben sollen (Untergrenze)
  aufrufeViel: number;         // ab so vielen Aufrufen in 30 Tagen ohne Anfrage: „viel gesehen, keine Anfrage"
};

/** Vorbelegung aus der Standzeit-Ampel der Branchen-Vorlage (gelb ab gruenBis, rot ab gelbBis). */
export function standardRegeln(ampel?: { gruenBis: number; gelbBis: number } | null): PreisRegeln {
  const g = ampel && ampel.gruenBis > 0 ? Math.round(ampel.gruenBis) : 60;
  const r = ampel && ampel.gelbBis > g ? Math.round(ampel.gelbBis) : Math.max(g + 30, 90);
  return {
    stufen: [{ ab: Math.max(1, g - 15), prozent: 2 }, { ab: g, prozent: 3 }, { ab: r, prozent: 4 }],
    abstandTage: 14,
    mindestRohertrag: 500,
    aufrufeViel: 50,
  };
}

function zahl(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Gespeicherte Regeln des Betriebs bereinigen. Kaputte oder fehlende Werte fallen
 * auf die Vorbelegung zurück; Stufen: höchstens 6, ab 1–999 Tage, 0,5–20 %,
 * je Tag nur eine Stufe, aufsteigend sortiert.
 */
export function regelnLesen(roh: unknown, standard: PreisRegeln = standardRegeln()): PreisRegeln {
  const o = roh && typeof roh === 'object' ? (roh as Record<string, unknown>) : {};
  const stufenRoh = Array.isArray(o.stufen) ? o.stufen : null;
  let stufen: PreisStufe[] = standard.stufen;
  if (stufenRoh) {
    const gesehen = new Set<number>();
    stufen = stufenRoh
      .map((s) => {
        const x = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
        const ab = zahl(x.ab), p = zahl(x.prozent);
        if (ab === null || p === null) return null;
        const abR = Math.round(ab);
        if (abR < 1 || abR > 999 || p < 0.5 || p > 20) return null;
        return { ab: abR, prozent: Math.round(p * 10) / 10 };
      })
      .filter((x): x is PreisStufe => x !== null)
      .sort((a, b) => a.ab - b.ab)
      .filter((x) => (gesehen.has(x.ab) ? false : (gesehen.add(x.ab), true)))
      .slice(0, 6);
  }
  const abstand = zahl(o.abstandTage);
  const mindest = zahl(o.mindestRohertrag);
  const viel = zahl(o.aufrufeViel);
  return {
    stufen,
    abstandTage: abstand !== null && abstand >= 0 && abstand <= 90 ? Math.round(abstand) : standard.abstandTage,
    mindestRohertrag: mindest !== null && mindest >= 0 && mindest <= 100000 ? centRunden(mindest) : standard.mindestRohertrag,
    aufrufeViel: viel !== null && viel >= 5 && viel <= 100000 ? Math.round(viel) : standard.aufrufeViel,
  };
}

/** Auf volle 10 € AUFrunden (Untergrenze darf nie unterschritten werden). */
function auf10(n: number): number {
  return Math.ceil(centRunden(n) / 10) * 10;   // erst auf Cent, damit 0,1-Reste nicht 10 € mehr ergeben
}
/** Auf volle 10 € kaufmännisch runden (Preisschild). */
function rund10(n: number): number {
  return Math.round(n / 10) * 10;
}

export type GrenzEingabe = {
  besteuerung: string | null;    // '25a' | 'regel' | null (offen: wie § 25a, wie in K5)
  ek: number | null;
  kosten: number;                // Kosten netto (Plan, wie K5)
  standkosten: number;           // bis heute aufgelaufen, netto
  mindestRohertrag: number;
};

/**
 * Untergrenze Verkaufspreis brutto: der kleinste Preis (auf volle 10 € aufgerundet),
 * bei dem Erlös netto − Einkauf − Kosten − Standkosten ≥ Mindest-Rohertrag bleibt.
 * Regelsteuer: VK = Bedarf × 1,19. § 25a: Steuer nur auf die Differenz VK − EK,
 * also VK = (119 × Bedarf − 19 × EK) / 100 (für Bedarf ≥ EK).
 * Ohne Einkauf: null — eine Untergrenze wird nie geraten.
 */
export function untergrenze(e: GrenzEingabe): number | null {
  if (e.ek === null || !Number.isFinite(e.ek) || e.ek < 0) return null;
  const pos = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  const bedarf = e.ek + pos(e.kosten) + pos(e.standkosten) + pos(e.mindestRohertrag);
  if (e.besteuerung === 'regel') return auf10(bedarf * (1 + UST / 100));
  const vk = bedarf <= e.ek ? e.ek : ((100 + UST) * bedarf - UST * e.ek) / 100;
  return auf10(vk);
}

/** Tage seit der letzten Preisänderung (Preisverlauf); ohne Eintrag null. */
export function tageSeitPreis(geaendert: string[], heuteIso: string): number | null {
  const h = Date.parse(heuteIso.slice(0, 10) + 'T00:00:00Z');
  const ts = geaendert.map((g) => Date.parse(String(g).slice(0, 10) + 'T00:00:00Z')).filter((x) => Number.isFinite(x));
  if (!ts.length || !Number.isFinite(h)) return null;
  return Math.max(0, Math.round((h - Math.max(...ts)) / TAG));
}

export type VorschlagArt = 'halten' | 'senken' | 'warten' | 'grenze' | 'unter_grenze' | 'kein_preis' | 'zulauf';
export type Vorschlag = { art: VorschlagArt; neu: number | null; prozent: number | null; stufe: PreisStufe | null; grund: string };

export type VorschlagEingabe = {
  vk: number | null;
  standtage: number | null;
  seitPreis: number | null;      // Tage seit letzter Preisänderung
  untergrenze: number | null;
  regeln: PreisRegeln;
};

/** Höchste Stufe, deren Schwelle erreicht ist; sonst null. */
export function stufeFuer(standtage: number | null, stufen: PreisStufe[]): PreisStufe | null {
  if (standtage === null) return null;
  let s: PreisStufe | null = null;
  for (const x of stufen) if (standtage >= x.ab && (!s || x.ab > s.ab)) s = x;
  return s;
}

/**
 * Regelbasierter Preisvorschlag (Preis-Treppe des Betriebs).
 * Reihenfolge: kein Preis → Zulauf → schon unter Untergrenze → keine Stufe →
 * zu früh nach der letzten Änderung → senken (höchstens bis zur Untergrenze) →
 * Untergrenze erreicht.
 */
export function vorschlag(e: VorschlagEingabe): Vorschlag {
  const leer = { neu: null, prozent: null, stufe: null };
  if (e.vk === null || !Number.isFinite(e.vk) || e.vk <= 0) return { art: 'kein_preis', ...leer, grund: 'Noch kein Verkaufspreis eingetragen.' };
  if (e.standtage === null) return { art: 'zulauf', ...leer, grund: 'Im Zulauf — die Standzeit beginnt mit dem Eingang.' };
  if (e.untergrenze !== null && e.vk < e.untergrenze) {
    return { art: 'unter_grenze', ...leer, grund: `Der Preis liegt schon unter der Untergrenze (${e.untergrenze.toLocaleString('de-DE')} €). Bitte Kalkulation prüfen.` };
  }
  const stufe = stufeFuer(e.standtage, e.regeln.stufen);
  if (!stufe) return { art: 'halten', ...leer, grund: `Standzeit ${e.standtage} Tage — noch keine Stufe der Preis-Treppe erreicht.` };
  if (e.seitPreis !== null && e.seitPreis < e.regeln.abstandTage) {
    const rest = e.regeln.abstandTage - e.seitPreis;
    return { art: 'warten', neu: null, prozent: null, stufe, grund: `Letzte Preisänderung vor ${e.seitPreis} Tagen — nächste Prüfung in ${rest} ${rest === 1 ? 'Tag' : 'Tagen'}.` };
  }
  let neu = rund10(e.vk * (1 - stufe.prozent / 100));
  let begrenzt = false;
  if (e.untergrenze !== null && neu < e.untergrenze) { neu = e.untergrenze; begrenzt = true; }
  if (neu >= e.vk) {
    return { art: 'grenze', neu: null, prozent: null, stufe, grund: 'Untergrenze erreicht — eine weitere Senkung würde den Mindest-Rohertrag unterschreiten. Alternativen: Inserat verbessern, Händlerverkauf oder Export prüfen.' };
  }
  const prozent = Math.round(((e.vk - neu) / e.vk) * 1000) / 10;
  return {
    art: 'senken', neu, prozent, stufe,
    grund: begrenzt
      ? `Stufe ab ${stufe.ab} Tagen (−${stufe.prozent} %), begrenzt auf die Untergrenze.`
      : `Stufe ab ${stufe.ab} Tagen: −${stufe.prozent} %.`,
  };
}

export type Aufruf = { bestand_id: string; tag: string; anzahl: number };
export type AnfrageMini = { bestand_id: string | null; erstellt_am: string };

/** Summe der Aufrufe je Fahrzeug in den letzten `tage` Tagen (einschließlich heute). */
export function aufrufeJe(liste: Aufruf[], heuteIso: string, tage = 30): Record<string, number> {
  const ab = new Date(Date.parse(heuteIso.slice(0, 10) + 'T00:00:00Z') - (tage - 1) * TAG).toISOString().slice(0, 10);
  const aus: Record<string, number> = {};
  for (const a of liste) {
    if (!a.bestand_id || String(a.tag).slice(0, 10) < ab) continue;
    const n = Number(a.anzahl);
    if (Number.isFinite(n) && n > 0) aus[a.bestand_id] = (aus[a.bestand_id] ?? 0) + Math.round(n);
  }
  return aus;
}

/** Anfragen je Fahrzeug in den letzten `tage` Tagen (nach Berliner Kalendertag egal — Tagesgrenze UTC reicht für 30 Tage). */
export function anfragenJe(liste: AnfrageMini[], heuteIso: string, tage = 30): Record<string, number> {
  const ab = new Date(Date.parse(heuteIso.slice(0, 10) + 'T00:00:00Z') - (tage - 1) * TAG).toISOString().slice(0, 10);
  const aus: Record<string, number> = {};
  for (const a of liste) {
    if (!a.bestand_id || String(a.erstellt_am).slice(0, 10) < ab) continue;
    aus[a.bestand_id] = (aus[a.bestand_id] ?? 0) + 1;
  }
  return aus;
}

export type Diagnose = { stufe: 'ok' | 'warn' | 'bad' | 'dim'; text: string };

/**
 * Nachfrage-Diagnose in Klartext (nur Regeln, kein Raten):
 * - Inserat unter 55 % → zuerst das Inserat verbessern
 * - nicht in der Börse → Aufrufe sind nicht messbar
 * - viele Aufrufe, keine Anfrage → Preis oder Inserat schreckt ab
 * - kaum Aufrufe nach 14 Tagen → wird kaum gesehen (Fotos, Titel, Börsen)
 * - Anfragen da → Nachfrage vorhanden, Preis halten oder nachfassen
 */
export function diagnose(e: { inseriert: boolean; ampel: number | null; aufrufe: number; anfragen: number; standtage: number | null; aufrufeViel: number }): Diagnose {
  if (e.anfragen > 0) return { stufe: 'ok', text: `${e.anfragen} ${e.anfragen === 1 ? 'Anfrage' : 'Anfragen'} in 30 Tagen — Nachfrage vorhanden, nachfassen statt senken.` };
  if (e.ampel !== null && e.ampel < 55) return { stufe: 'bad', text: `Inserat erst zu ${e.ampel} % fertig — zuerst Fotos, Pflichtangaben und Beschreibung ergänzen.` };
  if (!e.inseriert) return { stufe: 'dim', text: 'Nicht in der eigenen Fahrzeugbörse — Aufrufe sind nicht messbar.' };
  if (e.aufrufe >= e.aufrufeViel) return { stufe: 'warn', text: `${e.aufrufe} Aufrufe, aber keine Anfrage — Preis oder Inserat schreckt ab.` };
  if (e.standtage !== null && e.standtage > 14 && e.aufrufe < 10) return { stufe: 'warn', text: `Nur ${e.aufrufe} Aufrufe in 30 Tagen — wird kaum gesehen: Titelfoto, Titel und Börsen prüfen.` };
  return { stufe: 'dim', text: `${e.aufrufe} Aufrufe in 30 Tagen, noch keine Anfrage.` };
}

export const STANDZEIT_KLASSEN: { key: string; name: string; bis: number }[] = [
  { key: 'k30', name: 'bis 30 Tage', bis: 30 },
  { key: 'k60', name: '31–60', bis: 60 },
  { key: 'k90', name: '61–90', bis: 90 },
  { key: 'k120', name: '91–120', bis: 120 },
  { key: 'kmehr', name: 'über 120', bis: Infinity },
];

/** Verteilung der Standzeiten (nur Fahrzeuge mit Standtagen) inkl. gebundenem Einkauf je Klasse. */
export function standzeitVerteilung(liste: { standtage: number | null; ek: number | null }[]): { key: string; name: string; anzahl: number; ek: number }[] {
  const aus = STANDZEIT_KLASSEN.map((k) => ({ key: k.key, name: k.name, anzahl: 0, ek: 0 }));
  for (const f of liste) {
    if (f.standtage === null) continue;
    const i = STANDZEIT_KLASSEN.findIndex((k) => f.standtage! <= k.bis);
    aus[i].anzahl += 1;
    if (f.ek !== null && Number.isFinite(f.ek) && f.ek > 0) aus[i].ek += f.ek;
  }
  return aus.map((x) => ({ ...x, ek: centRunden(x.ek) }));
}

/**
 * Massen-Übernahme: nur Fahrzeuge mit Vorschlag „senken" und einem neuen Preis,
 * der wirklich niedriger ist als der aktuelle. Liefert die Änderungen.
 */
export function uebernahmeListe(z: { id: string; vk: number | null; v: Vorschlag }[]): { id: string; alt: number; neu: number }[] {
  return z
    .filter((x) => x.v.art === 'senken' && x.v.neu !== null && x.vk !== null && x.v.neu < x.vk && x.v.neu > 0)
    .map((x) => ({ id: x.id, alt: x.vk as number, neu: x.v.neu as number }));
}

/** Bot oder Vorschau-Abruf? Solche Aufrufe werden nicht gezählt. */
export function istBot(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent ?? '');
  if (!ua.trim()) return true;
  return /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|lighthouse|headless|curl|wget|python|java\/|httpclient|monitor|uptime/i.test(ua);
}
