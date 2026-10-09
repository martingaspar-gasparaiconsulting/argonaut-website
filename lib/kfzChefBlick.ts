// ============================================================================
// ARGONAUT OS · lib/kfzChefBlick.ts — Paket 280 (09.10.2026) · K14 Chef-Blick Fahrzeughandel
//
// Reine Logik für die Zahlen der Geschäftsleitung im Fahrzeughandel:
//   zeitraum / vorjahrTag     laufender Monat, Quartal oder Jahr bis heute + gleicher Zeitraum im Vorjahr
//   verkaufsZeilen            je verkauftem Fahrzeug: erzielter Preis, Standtage, Nachkalkulation (K5)
//   kennzahlen / veraenderung Kacheln mit Vorjahr
//   gruppen                   Ertrag je Marke und je Preisklasse
//   rangliste                 Verkäufer (NUR Chef, abschaltbar — Leistungskontrolle, § 87 BetrVG)
//   monatsReihe               12 Monate laufendes Jahr gegen Vorjahr (Balken)
//   zulaufLage                Zulauf, gebundener Einkauf, Langsteher, Hereinnahmen
//   summenWaechter            jede Teilsumme muss die Gesamtsumme ergeben, sonst rot
//
// GRUNDSÄTZE
// - Nichts wird erfunden: ohne Einkauf oder ohne Preis kein Ertrag. Solche
//   Fahrzeuge zählen als Verkauf, aber nicht in Geld-Summen — der Wächter sagt es.
// - Erlös-Quelle in dieser Reihenfolge: erzielter Preis (Kalkulation) ->
//   Preis aus dem Kaufvertrag -> Listenpreis (dann ausdrücklich markiert).
// - Gerechnet wird mit lib/kfzKalkulation (Ist-Kosten inkl. übernommener
//   Partner-Rechnungen), summiert in ganzen Cent — so stimmen Teilsummen exakt.
//
// Nur Importe reiner Logik, KEINE Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

import { kalkulation, kostenSummen, provAus, type Kosten, type KalkErgebnis } from './kfzKalkulation';

export const CHEF_MODUL = 'kfz-chef';

export type ZeitraumArt = 'monat' | 'quartal' | 'jahr';
export const ZEITRAUM_ARTEN: { key: ZeitraumArt; name: string }[] = [
  { key: 'monat', name: 'Laufender Monat' },
  { key: 'quartal', name: 'Laufendes Quartal' },
  { key: 'jahr', name: 'Laufendes Jahr' },
];

export type Zeitraum = { art: ZeitraumArt; von: string; bis: string; vjVon: string; vjBis: string; label: string; vjLabel: string };

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONATE_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function istTag(t: unknown): t is string {
  return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}/.test(t);
}
function tag10(t: string): string { return t.slice(0, 10); }
function zwei(n: number): string { return String(n).padStart(2, '0'); }
function deKurz(t: string): string { return `${t.slice(8, 10)}.${t.slice(5, 7)}.`; }

/** Gleicher Kalendertag im Vorjahr; der 29. Februar wird zum 28. */
export function vorjahrTag(t: string): string {
  const j = +t.slice(0, 4) - 1;
  const md = t.slice(5, 10) === '02-29' ? '02-28' : t.slice(5, 10);
  return `${j}-${md}`;
}

/** Laufender Zeitraum bis heute und derselbe Abschnitt im Vorjahr. */
export function zeitraum(art: ZeitraumArt, heute: string): Zeitraum {
  const j = +heute.slice(0, 4), m = +heute.slice(5, 7);
  let von: string, label: string;
  if (art === 'monat') { von = `${j}-${zwei(m)}-01`; label = `${MONATE[m - 1]} ${j}`; }
  else if (art === 'quartal') { const q = Math.floor((m - 1) / 3); von = `${j}-${zwei(q * 3 + 1)}-01`; label = `${q + 1}. Quartal ${j}`; }
  else { von = `${j}-01-01`; label = `Jahr ${j}`; }
  const bis = tag10(heute);
  const vjVon = vorjahrTag(von), vjBis = vorjahrTag(bis);
  const bisText = `bis ${deKurz(bis)}`;
  return {
    art, von, bis, vjVon, vjBis,
    label: `${label} (${bisText})`,
    vjLabel: `${label.replace(String(j), String(j - 1))} (bis ${deKurz(vjBis)})`,
  };
}

export function imZeitraum(t: string | null | undefined, von: string, bis: string): boolean {
  if (!istTag(t)) return false;
  const x = tag10(t);
  return x >= von && x <= bis;
}

// ---------------------------------------------------------------------------
// Verkaufs-Zeilen
// ---------------------------------------------------------------------------

export type ChefFz = {
  id: string; interne_nr: string | null; marke: string | null; modell: string | null; status: string;
  eingang_am: string | null; verkauft_am: string | null; ek_netto: number | null; vk_brutto: number | null; besteuerung: string | null;
};
export type ChefKalk = {
  bestand_id: string; vk_erzielt: number | null; verkaeufer: string | null;
  prov_v_art: string | null; prov_v_wert: number | null; prov_h_art: string | null; prov_h_wert: number | null;
};
export type ChefVerkauf = { bestand_id: string; status: string; preis_brutto: number | null };
export type ChefEinstellung = { standkostenTag: number; gemeinkostenProzent: number };

export type VkQuelle = 'erzielt' | 'vertrag' | 'liste' | null;
export type VerkaufsZeile = {
  id: string; nr: string | null; name: string; marke: string; verkauftAm: string;
  vk: number | null; vkQuelle: VkQuelle; standtage: number | null; verkaeufer: string | null; k: KalkErgebnis;
};

function zahl(x: unknown): number | null {
  if (x === null || x === undefined || x === '') return null;
  const n = typeof x === 'number' ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}
function positiv(x: unknown): number | null {
  const n = zahl(x);
  return n !== null && n > 0 ? n : null;
}

function standtageBis(eingang: string | null, verkauft: string): number | null {
  if (!istTag(eingang)) return null;
  const a = Date.parse(tag10(eingang) + 'T00:00:00Z'), b = Date.parse(tag10(verkauft) + 'T00:00:00Z');
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Marke vereinheitlicht: „vw", „VW " und „Vw" landen in einer Gruppe. */
export function markeSchluessel(m: string | null | undefined): string {
  const t = String(m ?? '').trim().replace(/\s+/g, ' ');
  return t ? t.toLocaleLowerCase('de-DE') : '';
}

/** Je verkauftem Fahrzeug (Status „verkauft" mit Verkaufsdatum) die Nachkalkulation. */
export function verkaufsZeilen(o: {
  fahrzeuge: ChefFz[]; kalk: ChefKalk[]; verkaeufe: ChefVerkauf[]; kosten: (Kosten & { bestand_id: string })[]; einst: ChefEinstellung;
}): VerkaufsZeile[] {
  const kalkJe = new Map(o.kalk.map((k) => [k.bestand_id, k]));
  const vertragJe = new Map<string, number>();
  for (const v of o.verkaeufe) {
    const p = positiv(v.preis_brutto);
    if ((v.status === 'vertrag' || v.status === 'uebergeben') && p !== null) vertragJe.set(v.bestand_id, p);
  }
  const kostenJe = new Map<string, Kosten[]>();
  for (const k of o.kosten) { const l = kostenJe.get(k.bestand_id) ?? []; l.push(k); kostenJe.set(k.bestand_id, l); }
  const aus: VerkaufsZeile[] = [];
  for (const f of o.fahrzeuge) {
    if (f.status !== 'verkauft' || !istTag(f.verkauft_am)) continue;
    const kc = kalkJe.get(f.id);
    const erzielt = positiv(kc?.vk_erzielt);
    const vertrag = vertragJe.get(f.id) ?? null;
    const liste = positiv(f.vk_brutto);
    const vk = erzielt ?? vertrag ?? liste;
    const vkQuelle: VkQuelle = erzielt !== null ? 'erzielt' : vertrag !== null ? 'vertrag' : liste !== null ? 'liste' : null;
    const tage = standtageBis(f.eingang_am, f.verkauft_am);
    const k = kalkulation({
      besteuerung: f.besteuerung, ek: zahl(f.ek_netto), vk, kosten: kostenSummen(kostenJe.get(f.id) ?? []).ist,
      standtage: tage, standkostenTag: o.einst.standkostenTag, gemeinkostenProzent: o.einst.gemeinkostenProzent,
      provV: provAus(kc?.prov_v_art, kc?.prov_v_wert), provH: provAus(kc?.prov_h_art, kc?.prov_h_wert),
    });
    const marke = String(f.marke ?? '').trim().replace(/\s+/g, ' ');
    aus.push({
      id: f.id, nr: f.interne_nr, name: [marke, f.modell].filter(Boolean).join(' ') || 'Fahrzeug', marke,
      verkauftAm: tag10(f.verkauft_am), vk, vkQuelle, standtage: tage,
      verkaeufer: String(kc?.verkaeufer ?? '').trim() || null, k,
    });
  }
  return aus.sort((a, b) => (a.verkauftAm < b.verkauftAm ? 1 : a.verkauftAm > b.verkauftAm ? -1 : 0));
}

// ---------------------------------------------------------------------------
// Kennzahlen (in ganzen Cent summiert)
// ---------------------------------------------------------------------------

export type Kennzahlen = {
  anzahl: number;          // verkaufte Fahrzeuge
  eingerechnet: number;    // davon mit vollständiger Kalkulation (Geld-Summen)
  erloesNetto: number; rohertrag: number; deckungsbeitrag: number;
  rohertragSchnitt: number | null; standtageSchnitt: number | null; margeProzent: number | null;
};

const cent = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? 0 : Math.round(n * 100));

export function kennzahlen(zeilen: VerkaufsZeile[]): Kennzahlen {
  let e = 0, r = 0, d = 0, n = 0, tSum = 0, tN = 0;
  for (const z of zeilen) {
    if (z.standtage !== null) { tSum += z.standtage; tN += 1; }
    if (!z.k.vollstaendig) continue;
    n += 1; e += cent(z.k.erloesNetto); r += cent(z.k.rohertrag); d += cent(z.k.deckungsbeitrag);
  }
  return {
    anzahl: zeilen.length, eingerechnet: n, erloesNetto: e / 100, rohertrag: r / 100, deckungsbeitrag: d / 100,
    rohertragSchnitt: n ? Math.round(r / n) / 100 : null,
    standtageSchnitt: tN ? Math.round(tSum / tN) : null,
    margeProzent: e > 0 ? Math.round((d / e) * 1000) / 10 : null,
  };
}

/** Veränderung gegen Vorjahr in Prozent (1 Nachkommastelle); ohne Vorjahreswert null. */
export function veraenderung(jetzt: number | null, vorjahr: number | null): number | null {
  if (jetzt === null || vorjahr === null || !Number.isFinite(jetzt) || !Number.isFinite(vorjahr) || vorjahr === 0) return null;
  return Math.round(((jetzt - vorjahr) / Math.abs(vorjahr)) * 1000) / 10;
}

export function filterZeitraum(zeilen: VerkaufsZeile[], von: string, bis: string): VerkaufsZeile[] {
  return zeilen.filter((z) => imZeitraum(z.verkauftAm, von, bis));
}

// ---------------------------------------------------------------------------
// Gruppen: Marke und Preisklasse
// ---------------------------------------------------------------------------

export const PREISKLASSEN: { key: string; name: string; bis: number | null }[] = [
  { key: 'k1', name: 'bis 10.000 €', bis: 10000 },
  { key: 'k2', name: '10.000 bis 20.000 €', bis: 20000 },
  { key: 'k3', name: '20.000 bis 30.000 €', bis: 30000 },
  { key: 'k4', name: '30.000 bis 50.000 €', bis: 50000 },
  { key: 'k5', name: 'über 50.000 €', bis: null },
];

/** Preisklasse nach dem Brutto-Verkaufspreis (Grenze gehört zur nächsthöheren Klasse). */
export function preisklasse(vk: number | null): { key: string; name: string } {
  if (vk === null || !Number.isFinite(vk) || vk <= 0) return { key: 'k0', name: 'ohne Preis' };
  const k = PREISKLASSEN.find((p) => p.bis === null || vk < p.bis) as { key: string; name: string };
  return { key: k.key, name: k.name };
}

export type Gruppe = { key: string; name: string } & Kennzahlen;

export function gruppen(zeilen: VerkaufsZeile[], nach: 'marke' | 'preisklasse'): Gruppe[] {
  const je = new Map<string, { name: string; zeilen: VerkaufsZeile[] }>();
  for (const z of zeilen) {
    let key: string, name: string;
    if (nach === 'marke') { key = markeSchluessel(z.marke) || '~ohne'; name = z.marke || 'Ohne Marke'; }
    else ({ key, name } = preisklasse(z.vk));
    const g = je.get(key) ?? { name, zeilen: [] };
    g.zeilen.push(z);
    je.set(key, g);
  }
  const liste = [...je.entries()].map(([key, g]) => ({ key, name: g.name, ...kennzahlen(g.zeilen) }));
  if (nach === 'preisklasse') {
    const reihe = ['k0', ...PREISKLASSEN.map((p) => p.key)];
    return liste.sort((a, b) => reihe.indexOf(a.key) - reihe.indexOf(b.key));
  }
  return liste.sort((a, b) => b.rohertrag - a.rohertrag || b.anzahl - a.anzahl || a.name.localeCompare(b.name, 'de'));
}

/**
 * Verkäufer-Rangliste. Leistungs- und Verhaltenskontrolle — nur der Chef sieht
 * sie, und nur wenn er sie eingeschaltet hat (Betriebsrat: § 87 Abs. 1 Nr. 6 BetrVG).
 * Fahrzeuge ohne eingetragenen Verkäufer stehen als „Nicht zugeordnet" am Ende.
 */
export function rangliste(zeilen: VerkaufsZeile[]): (Gruppe & { platz: number | null })[] {
  const je = new Map<string, { name: string; zeilen: VerkaufsZeile[] }>();
  for (const z of zeilen) {
    const key = z.verkaeufer ? z.verkaeufer.toLocaleLowerCase('de-DE').replace(/\s+/g, ' ') : '~ohne';
    const g = je.get(key) ?? { name: z.verkaeufer ?? 'Nicht zugeordnet', zeilen: [] };
    g.zeilen.push(z);
    je.set(key, g);
  }
  const mit = [...je.entries()].filter(([k]) => k !== '~ohne').map(([key, g]) => ({ key, name: g.name, ...kennzahlen(g.zeilen) }))
    .sort((a, b) => b.rohertrag - a.rohertrag || b.anzahl - a.anzahl || a.name.localeCompare(b.name, 'de'))
    .map((g, i) => ({ ...g, platz: i + 1 as number | null }));
  const ohne = je.get('~ohne');
  return ohne ? [...mit, { key: '~ohne', name: ohne.name, ...kennzahlen(ohne.zeilen), platz: null }] : mit;
}

export function ranglisteAn(einstellung: unknown): boolean {
  return !!einstellung && typeof einstellung === 'object' && (einstellung as { rangliste?: unknown }).rangliste === true;
}

// ---------------------------------------------------------------------------
// Monatsreihe laufendes Jahr gegen Vorjahr
// ---------------------------------------------------------------------------

export type Monat = { monat: string; name: string; zukunft: boolean; anzahl: number; rohertrag: number; vjAnzahl: number; vjRohertrag: number };

export function monatsReihe(zeilen: VerkaufsZeile[], heute: string): Monat[] {
  const j = +heute.slice(0, 4), mHeute = +heute.slice(5, 7);
  const aus: Monat[] = [];
  for (let m = 1; m <= 12; m++) {
    const p = `${j}-${zwei(m)}`, vp = `${j - 1}-${zwei(m)}`;
    const jetzt = zeilen.filter((z) => z.verkauftAm.slice(0, 7) === p && z.verkauftAm <= heute);
    // Vorjahr: ganzer Monat, im laufenden Monat nur bis zum gleichen Tag (fairer Vergleich)
    const vjBis = m === mHeute ? vorjahrTag(heute) : `${vp}-31`;
    const vj = zeilen.filter((z) => z.verkauftAm.slice(0, 7) === vp && z.verkauftAm <= vjBis);
    const kj = kennzahlen(jetzt), kv = kennzahlen(vj);
    aus.push({ monat: p, name: MONATE_KURZ[m - 1], zukunft: m > mHeute, anzahl: kj.anzahl, rohertrag: kj.rohertrag, vjAnzahl: kv.anzahl, vjRohertrag: kv.rohertrag });
  }
  return aus;
}

// ---------------------------------------------------------------------------
// Zulauf und Bestand
// ---------------------------------------------------------------------------

export type ZulaufLage = {
  zulaufAnzahl: number; zulaufEk: number | null; zulaufVk: number | null;
  bestandAnzahl: number; bestandEk: number | null; ohneEk: number; langsteher: number; standtageSchnitt: number | null;
  hereinJetzt: number; hereinVj: number;
};

export function zulaufLage(fahrzeuge: ChefFz[], heute: string, langstehAb: number, z: Pick<Zeitraum, 'von' | 'bis' | 'vjVon' | 'vjBis'>): ZulaufLage {
  const summe = (l: ChefFz[], feld: 'ek_netto' | 'vk_brutto') => {
    const w = l.map((f) => zahl(f[feld])).filter((x): x is number => x !== null && x >= 0);
    return w.length ? w.reduce((s, x) => s + cent(x), 0) / 100 : null;
  };
  const zulauf = fahrzeuge.filter((f) => f.status === 'zulauf');
  const bestand = fahrzeuge.filter((f) => f.status !== 'zulauf' && f.status !== 'verkauft' && f.status !== 'archiv');
  const tage = bestand.map((f) => (istTag(f.eingang_am) ? standtageBis(f.eingang_am, heute) : null)).filter((x): x is number => x !== null);
  // Hereingenommen: Eingang im Zeitraum (Zulauf zählt erst mit Eingang)
  const herein = (von: string, bis: string) => fahrzeuge.filter((f) => f.status !== 'zulauf' && imZeitraum(f.eingang_am, von, bis)).length;
  return {
    zulaufAnzahl: zulauf.length, zulaufEk: summe(zulauf, 'ek_netto'), zulaufVk: summe(zulauf, 'vk_brutto'),
    bestandAnzahl: bestand.length, bestandEk: summe(bestand, 'ek_netto'), ohneEk: bestand.filter((f) => zahl(f.ek_netto) === null).length,
    langsteher: tage.filter((t) => t > langstehAb).length,
    standtageSchnitt: tage.length ? Math.round(tage.reduce((s, x) => s + x, 0) / tage.length) : null,
    hereinJetzt: herein(z.von, z.bis), hereinVj: herein(z.vjVon, z.vjBis),
  };
}

// ---------------------------------------------------------------------------
// Summen-Wächter
// ---------------------------------------------------------------------------

export type Pruefung = { text: string; ok: boolean };
export type Waechter = { ok: boolean; pruefungen: Pruefung[]; hinweise: string[] };

function gleich(teile: Kennzahlen[], ganz: Kennzahlen): boolean {
  const s = (f: (k: Kennzahlen) => number) => teile.reduce((a, k) => a + cent(f(k)), 0);
  return teile.reduce((a, k) => a + k.anzahl, 0) === ganz.anzahl
    && teile.reduce((a, k) => a + k.eingerechnet, 0) === ganz.eingerechnet
    && s((k) => k.erloesNetto) === cent(ganz.erloesNetto)
    && s((k) => k.rohertrag) === cent(ganz.rohertrag)
    && s((k) => k.deckungsbeitrag) === cent(ganz.deckungsbeitrag);
}

/**
 * Prüft, dass jede Aufteilung exakt die Gesamtsumme ergibt, und sagt in Klartext,
 * was NICHT eingerechnet ist. Rot heißt: eine Zahl auf dieser Seite stimmt nicht.
 */
export function summenWaechter(o: {
  gesamt: Kennzahlen; marken: Gruppe[]; klassen: Gruppe[]; verkaeufer: Gruppe[];
  monate?: Monat[]; jahr?: Kennzahlen;
  zeilen: VerkaufsZeile[]; fahrzeuge: ChefFz[]; verkaeufe: ChefVerkauf[];
}): Waechter {
  const p: Pruefung[] = [
    { text: 'Summe der Marken = Gesamt', ok: gleich(o.marken, o.gesamt) },
    { text: 'Summe der Preisklassen = Gesamt', ok: gleich(o.klassen, o.gesamt) },
    { text: 'Summe der Verkäufer (inkl. „Nicht zugeordnet") = Gesamt', ok: gleich(o.verkaeufer, o.gesamt) },
  ];
  if (o.monate && o.jahr) {
    const a = o.monate.reduce((s, m) => s + m.anzahl, 0), r = o.monate.reduce((s, m) => s + cent(m.rohertrag), 0);
    p.push({ text: 'Summe der Monate = laufendes Jahr', ok: a === o.jahr.anzahl && r === cent(o.jahr.rohertrag) });
  }
  const h: string[] = [];
  const fehlEk = o.zeilen.filter((z) => !z.k.vollstaendig && z.k.fehlt.includes('Einkaufspreis')).length;
  const fehlVk = o.zeilen.filter((z) => !z.k.vollstaendig && z.k.fehlt.includes('Verkaufspreis')).length;
  if (fehlEk) h.push(`${fehlEk} verkaufte${fehlEk === 1 ? 's Fahrzeug hat' : ' Fahrzeuge haben'} keinen Einkaufspreis — gezählt, aber nicht im Ertrag.`);
  if (fehlVk) h.push(`${fehlVk} verkaufte${fehlVk === 1 ? 's Fahrzeug hat' : ' Fahrzeuge haben'} keinen Preis — gezählt, aber nicht im Ertrag.`);
  const liste = o.zeilen.filter((z) => z.vkQuelle === 'liste').length;
  if (liste) h.push(`${liste} Fahrzeug${liste === 1 ? '' : 'e'} mit Listenpreis gerechnet (kein erzielter Preis und kein Kaufvertrag erfasst).`);
  const verkauftIds = new Set(o.fahrzeuge.filter((f) => f.status === 'verkauft').map((f) => f.id));
  const offen = new Set(o.verkaeufe.filter((v) => (v.status === 'vertrag' || v.status === 'uebergeben') && !verkauftIds.has(v.bestand_id)).map((v) => v.bestand_id)).size;
  if (offen) h.push(`${offen} Kaufvertr${offen === 1 ? 'ag ist' : 'äge sind'} erfasst, das Fahrzeug steht aber nicht auf „verkauft" — fehlt in diesen Zahlen.`);
  const ohneDatum = o.fahrzeuge.filter((f) => f.status === 'verkauft' && !istTag(f.verkauft_am)).length;
  if (ohneDatum) h.push(`${ohneDatum} Fahrzeug${ohneDatum === 1 ? '' : 'e'} „verkauft" ohne Verkaufsdatum — keinem Zeitraum zuzuordnen.`);
  return { ok: p.every((x) => x.ok), pruefungen: p, hinweise: h };
}
