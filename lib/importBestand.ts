// ============================================================================
// ARGONAUT OS · lib/importBestand.ts — Bestand je Filiale uebernehmen
// (Umzug Schritt 4 Rest, Paket 136, 27.09.2026)
//
// Eine Bestandsliste aus dem Altsystem sagt: „Von Artikel X liegen in Filiale
// Y so viele Stueck." Das ist KEIN neuer Datensatz, sondern ein ZAEHLSTAND.
// Deshalb wird hier nichts angelegt, sondern je Artikel und Filiale eine
// KORREKTUR geplant — genau wie eine Inventur in der Lager-Matrix
// (/dashboard/erp/lager). Die Seite bucht jede Korrektur ueber die
// Datenbank-Funktion lager_buchen: Bewegung im Verlauf, Filialbestand und
// Gesamtsumme am Artikel in EINEM Vorgang (lib/lagerBuchung.ts).
//
// Nichts wird verschluckt, nichts geraten:
//   · Artikel ueber Artikelnummer, sonst EAN, sonst genaue Bezeichnung.
//     Mehrdeutig (zwei Artikel mit derselben Nummer/Bezeichnung) -> die Zeile
//     faellt mit Grund heraus. Eine Nummer, die es nicht gibt, wird NICHT
//     ueber die Bezeichnung „gerettet" — sonst landet Ware beim falschen Artikel.
//   · Filiale ueber Namen, sonst Ort, sonst „Hauptsitz/Zentrale". Filialen
//     werden nie angelegt (sie haengen am Preis und an der Kasse). Fehlt die
//     Spalte: bei genau einer Filiale diese, bei keiner der Gesamtbestand,
//     bei mehreren die Zeile mit Grund heraus (lagerBuchung Regel 1).
//   · Dieselbe Kombination mehrfach mit GLEICHER Zahl -> einmal gebucht, der
//     Rest als doppelt gezaehlt; mit VERSCHIEDENEN Zahlen -> alle Zeilen
//     dieser Kombination heraus (welche Zahl stimmt, weiss nur der Betrieb).
//   · Negativer Bestand -> heraus: eine Korrektur setzt einen Zaehlstand, und
//     lager_buchen rechnet mit dem Betrag — aus -5 wuerde still +5.
//   · Bestand schon genau so -> nicht gebucht (kein leerer Eintrag im Verlauf).
//   · Der alte Stand je Buchung wird zurueckgegeben, damit „Rueckgaengig"
//     ihn wiederherstellen kann — aber nur dort, wo seitdem niemand gebucht hat.
//
// Reine Funktionen, keine Netzwerk-Aufrufe — node-testbar.
// ============================================================================

import { normal } from './importParser';

export type ArtikelRoh = {
  id: string; artikelnummer?: string | null; bezeichnung?: string | null; ean?: string | null;
  aktueller_bestand?: number | string | null; aktiv?: boolean | null;
};
export type StandortRoh = { id: string; name?: string | null; ort?: string | null; ist_hauptsitz?: boolean | null; aktiv?: boolean | null };
export type BestandRoh = { artikel_id: string; standort_id: string; bestand: number | string | null };

/** Menge wie in der Lager-Matrix: drei Nachkommastellen (Meter, kg). */
export function mengeRunden(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function schluessel(v: unknown): string {
  return normal(String(v ?? ''));
}
/** Nummern vergleichen: Gross/Klein und Leerzeichen egal, Bindestriche zaehlen. */
function nummer(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');
}
function dazu(m: Map<string, string[]>, k: string, id: string) {
  if (!k) return;
  const l = m.get(k);
  if (!l) m.set(k, [id]); else if (!l.includes(id)) l.push(id);
}

// ---------------------------------------------------------------------------
// 1) Artikel finden
// ---------------------------------------------------------------------------

export type ArtikelSuche = {
  nachNummer: Map<string, string[]>;
  nachEan: Map<string, string[]>;
  nachName: Map<string, string[]>;
  gesamt: Map<string, number>;
};

export function baueArtikelSuche(artikel: readonly ArtikelRoh[]): ArtikelSuche {
  const s: ArtikelSuche = { nachNummer: new Map(), nachEan: new Map(), nachName: new Map(), gesamt: new Map() };
  for (const a of artikel) {
    const id = String(a.id);
    dazu(s.nachNummer, nummer(a.artikelnummer), id);
    dazu(s.nachEan, nummer(a.ean), id);
    dazu(s.nachName, schluessel(a.bezeichnung), id);
    const b = Number(a.aktueller_bestand);
    s.gesamt.set(id, Number.isFinite(b) ? b : 0);
  }
  return s;
}

export type Treffer =
  | { art: 'gefunden'; id: string }
  | { art: 'fehler'; grund: string };

export function findeArtikel(satz: Record<string, unknown>, s: ArtikelSuche): Treffer {
  const nr = String(satz.artikelnummer ?? '').trim();
  const ean = String(satz.ean ?? '').trim();
  const name = String(satz.bezeichnung ?? '').trim();
  const eins = (liste: string[] | undefined, was: string): Treffer | null => {
    if (!liste || liste.length === 0) return null;
    if (liste.length > 1) return { art: 'fehler', grund: `${was} passt zu ${liste.length} Artikeln — nicht zugeordnet, damit der Bestand nicht beim falschen landet.` };
    return { art: 'gefunden', id: liste[0] };
  };
  if (nr) {
    return eins(s.nachNummer.get(nummer(nr)), `Artikelnummer „${nr}"`)
      ?? { art: 'fehler', grund: `Artikelnummer „${nr}" gibt es in ARGONAUT noch nicht — bitte zuerst den Artikel-Import laufen lassen.` };
  }
  if (ean) {
    return eins(s.nachEan.get(nummer(ean)), `EAN „${ean}"`)
      ?? { art: 'fehler', grund: `EAN „${ean}" gibt es in ARGONAUT noch nicht — bitte zuerst den Artikel-Import laufen lassen.` };
  }
  if (name) {
    return eins(s.nachName.get(schluessel(name)), `Bezeichnung „${name}"`)
      ?? { art: 'fehler', grund: `Artikel „${name}" gibt es in ARGONAUT noch nicht — bitte zuerst den Artikel-Import laufen lassen.` };
  }
  return { art: 'fehler', grund: 'Weder Artikelnummer noch EAN noch Bezeichnung angegeben.' };
}

// ---------------------------------------------------------------------------
// 2) Filiale finden
// ---------------------------------------------------------------------------

const HAUPTSITZ = new Set(['hauptsitz', 'zentrale', 'hauptlager', 'zentrallager', 'hauptgeschaeft', 'hauptfiliale', 'stammhaus', 'hq', 'main']);

export type StandortSuche = {
  aktive: StandortRoh[];
  nachName: Map<string, string[]>;
  nachOrt: Map<string, string[]>;
  stillgelegt: Map<string, string>;
};

export function baueStandortSuche(standorte: readonly StandortRoh[]): StandortSuche {
  const aktive = standorte.filter((s) => s.aktiv !== false);
  const s: StandortSuche = { aktive, nachName: new Map(), nachOrt: new Map(), stillgelegt: new Map() };
  for (const st of aktive) {
    dazu(s.nachName, schluessel(st.name), String(st.id));
    dazu(s.nachOrt, schluessel(st.ort), String(st.id));
  }
  for (const st of standorte) if (st.aktiv === false && st.name) s.stillgelegt.set(schluessel(st.name), String(st.name));
  return s;
}

/** Ergebnis: id der Filiale, null = Gesamtbestand (Betrieb ohne Filialen). */
export type StandortTreffer = { art: 'gefunden'; id: string | null } | { art: 'fehler'; grund: string };

export function findeStandort(wert: unknown, s: StandortSuche): StandortTreffer {
  const roh = String(wert ?? '').trim();
  const n = s.aktive.length;
  if (!roh) {
    if (n === 0) return { art: 'gefunden', id: null };
    if (n === 1) return { art: 'gefunden', id: String(s.aktive[0].id) };
    return { art: 'fehler', grund: `Keine Filiale angegeben — Ihr Betrieb hat ${n} Filialen. Ohne Angabe weiß niemand, wo die Ware liegt.` };
  }
  if (n === 0) return { art: 'gefunden', id: null };     // Betrieb ohne Filialen: Gesamtbestand (siehe planeBestand)
  const k = schluessel(roh);
  const liste = (m: Map<string, string[]>): StandortTreffer | null => {
    const l = m.get(k);
    if (!l || l.length === 0) return null;
    if (l.length > 1) return { art: 'fehler', grund: `„${roh}" passt zu ${l.length} Filialen — nicht zugeordnet.` };
    return { art: 'gefunden', id: l[0] };
  };
  const t = liste(s.nachName) ?? liste(s.nachOrt);
  if (t) return t;
  if (HAUPTSITZ.has(k)) {
    const h = s.aktive.filter((x) => x.ist_hauptsitz);
    if (h.length === 1) return { art: 'gefunden', id: String(h[0].id) };
  }
  if (s.stillgelegt.has(k)) return { art: 'fehler', grund: `Die Filiale „${s.stillgelegt.get(k)}" ist stillgelegt — dorthin wird kein Bestand gebucht.` };
  return { art: 'fehler', grund: `Die Filiale „${roh}" gibt es in ARGONAUT noch nicht — bitte zuerst unter Standorte anlegen und dann diese Datei noch einmal importieren.` };
}

// ---------------------------------------------------------------------------
// 3) Planen
// ---------------------------------------------------------------------------

export type BestandBuchung = {
  artikelId: string;
  /** null = Gesamtbestand am Artikel (Betrieb ohne Filialen). */
  standortId: string | null;
  alt: number;
  neu: number;
  /** Datei-Zeilen dieser Kombination (erste = die gebuchte). */
  zeilen: number[];
  notiz: string | null;
};

export type BestandPlan = {
  buchungen: BestandBuchung[];
  abgelehnt: { zeile: number; feld: string; grund: string }[];
  /** Zeilen, deren Bestand schon genau so in ARGONAUT steht. */
  unveraendert: number[];
  /** Zeilen, die dieselbe Kombination mit derselben Zahl wiederholen. */
  doppelt: number[];
  hinweise: string[];
};

const k2 = (a: string, s: string | null) => `${a}|${s ?? ''}`;

export function planeBestand(
  saetze: readonly Record<string, unknown>[],
  zeilenNummern: readonly number[],
  artikel: ArtikelSuche,
  standorte: StandortSuche,
  vorhanden: readonly BestandRoh[],
): BestandPlan {
  const plan: BestandPlan = { buchungen: [], abgelehnt: [], unveraendert: [], doppelt: [], hinweise: [] };
  const filialBestand = new Map(vorhanden.map((v) => [k2(String(v.artikel_id), String(v.standort_id)), Number(v.bestand)]));

  // Betrieb ohne Filialen: mehrere verschiedene Filial-Namen in der Datei
  // wuerden sich gegenseitig ueberschreiben (jede Korrektur SETZT den
  // Gesamtbestand). Dann lieber gar nicht als falsch.
  const ohneFilialen = standorte.aktive.length === 0;
  const namenInDatei = [...new Set(saetze.map((s) => String(s.standort ?? '').trim()).filter(Boolean))];
  const zuVieleNamen = ohneFilialen && namenInDatei.length > 1;
  if (ohneFilialen && namenInDatei.length === 1) {
    plan.hinweise.push(`Ihr Betrieb führt keine Filialen — der Bestand aus „${namenInDatei[0]}" wird als Gesamtbestand am Artikel gebucht.`);
  }

  type Gruppe = { artikelId: string; standortId: string | null; eintraege: { zeile: number; neu: number; notiz: string | null }[] };
  const gruppen = new Map<string, Gruppe>();

  saetze.forEach((satz, i) => {
    const zeile = zeilenNummern[i] ?? i + 2;
    const n = Number(satz.bestand);
    if (!Number.isFinite(n)) { plan.abgelehnt.push({ zeile, feld: 'Bestand', grund: 'Kein lesbarer Bestand.' }); return; }
    if (n < 0) {
      plan.abgelehnt.push({ zeile, feld: 'Bestand', grund: `Negativer Bestand (${n.toLocaleString('de-DE')}) wird nicht als Zählstand gesetzt — bitte im Altsystem prüfen.` });
      return;
    }
    if (zuVieleNamen) {
      plan.abgelehnt.push({ zeile, feld: 'Filiale', grund: `Die Datei enthält ${namenInDatei.length} Filialen (${namenInDatei.slice(0, 4).join(', ')}${namenInDatei.length > 4 ? ' …' : ''}), Ihr Betrieb hat noch keine angelegt. Bitte zuerst unter Standorte anlegen.` });
      return;
    }
    const a = findeArtikel(satz, artikel);
    if (a.art === 'fehler') { plan.abgelehnt.push({ zeile, feld: 'Artikel', grund: a.grund }); return; }
    const s = findeStandort(satz.standort, standorte);
    if (s.art === 'fehler') { plan.abgelehnt.push({ zeile, feld: 'Filiale', grund: s.grund }); return; }
    const key = k2(a.id, s.id);
    const g = gruppen.get(key) ?? { artikelId: a.id, standortId: s.id, eintraege: [] };
    const notiz = String(satz.notiz ?? '').trim() || null;
    g.eintraege.push({ zeile, neu: mengeRunden(n), notiz });
    gruppen.set(key, g);
  });

  for (const g of gruppen.values()) {
    const zahlen = [...new Set(g.eintraege.map((e) => e.neu))];
    if (zahlen.length > 1) {
      const liste = g.eintraege.map((e) => `Zeile ${e.zeile}: ${e.neu.toLocaleString('de-DE')}`).join(', ');
      for (const e of g.eintraege) {
        plan.abgelehnt.push({ zeile: e.zeile, feld: 'Bestand', grund: `Derselbe Artikel steht für dieselbe Filiale mehrfach mit verschiedenen Beständen (${liste}) — bitte in der Datei klären.` });
      }
      continue;
    }
    const [erster, ...rest] = g.eintraege;
    plan.doppelt.push(...rest.map((e) => e.zeile));
    const alt = g.standortId === null
      ? (artikel.gesamt.get(g.artikelId) ?? 0)
      : (filialBestand.get(k2(g.artikelId, g.standortId)) ?? 0);
    const altR = mengeRunden(Number.isFinite(alt) ? alt : 0);
    if (altR === erster.neu) { plan.unveraendert.push(erster.zeile); continue; }
    const notizen = [...new Set(g.eintraege.map((e) => e.notiz).filter(Boolean))] as string[];
    plan.buchungen.push({
      artikelId: g.artikelId, standortId: g.standortId, alt: altR, neu: erster.neu,
      zeilen: g.eintraege.map((e) => e.zeile), notiz: notizen.join(' · ') || null,
    });
  }
  plan.abgelehnt.sort((x, y) => x.zeile - y.zeile);
  return plan;
}

/** Summen fuer die Rueckfrage und das Ergebnis. */
export function bestandSumme(plan: BestandPlan) {
  return {
    buchungen: plan.buchungen.length,
    filialen: new Set(plan.buchungen.map((b) => b.standortId ?? '')).size,
    artikel: new Set(plan.buchungen.map((b) => b.artikelId)).size,
    unveraendert: plan.unveraendert.length,
    doppelt: plan.doppelt.length,
    abgelehnt: plan.abgelehnt.length,
  };
}

// ---------------------------------------------------------------------------
// 4) Grund im Lager-Verlauf
// ---------------------------------------------------------------------------

/**
 * Der Text, der in der Bewegung steht. Er sagt, woher die Zahl kommt, was
 * vorher da war, und traegt die Spalten, fuer die es kein Feld gibt
 * („Lagerplatz: R3") — so ist nichts verschluckt.
 */
export function bestandGrund(
  dateiname: string,
  b: Pick<BestandBuchung, 'alt' | 'notiz'>,
  weitere: readonly { spalte: string; wert: string }[] = [],
): string {
  const teile = [
    `Übernommen aus dem Altsystem (Import „${String(dateiname || 'Datei').slice(0, 80)}")`,
    `vorher ${b.alt.toLocaleString('de-DE')}`,
  ];
  if (b.notiz) teile.push(b.notiz);
  if (weitere.length > 0) teile.push('Weitere Angaben: ' + weitere.map((w) => `${w.spalte}: ${w.wert}`).join(', '));
  const t = teile.join(' · ');
  return t.length > 500 ? t.slice(0, 499) + '…' : t;
}

// ---------------------------------------------------------------------------
// 5) Rueckgaengig
// ---------------------------------------------------------------------------

/** Kurzform je Buchung fuer import_jobs.rueck_daten (a = Artikel, s = Filiale). */
export type RueckEintrag = { a: string; s: string | null; alt: number; neu: number };

export function rueckDaten(gebucht: readonly Pick<BestandBuchung, 'artikelId' | 'standortId' | 'alt' | 'neu'>[]): RueckEintrag[] {
  return gebucht.map((b) => ({ a: b.artikelId, s: b.standortId, alt: b.alt, neu: b.neu }));
}

/** Liest rueck_daten aus der Datenbank vorsichtig ein (jsonb kann alles sein). */
export function leseRueckDaten(roh: unknown): RueckEintrag[] {
  if (!Array.isArray(roh)) return [];
  const raus: RueckEintrag[] = [];
  for (const x of roh) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const a = typeof o.a === 'string' ? o.a : '';
    const s = typeof o.s === 'string' && o.s ? o.s : null;
    const alt = Number(o.alt); const neu = Number(o.neu);
    if (!a || !Number.isFinite(alt) || !Number.isFinite(neu) || alt < 0) continue;
    raus.push({ a, s, alt, neu });
  }
  return raus;
}

/**
 * Was „Rueckgaengig" tun darf: nur dort den alten Stand zuruecksetzen, wo
 * heute noch genau die importierte Zahl steht. Hat seitdem jemand verkauft
 * oder gezaehlt, bleibt der heutige Stand — sonst wuerde eine echte
 * Buchung still ueberschrieben.
 */
export function planeRueckgaengig(
  rueck: readonly RueckEintrag[],
  heuteFiliale: ReadonlyMap<string, number>,
  heuteGesamt: ReadonlyMap<string, number>,
): { zurueck: RueckEintrag[]; geaendert: RueckEintrag[] } {
  const zurueck: RueckEintrag[] = []; const geaendert: RueckEintrag[] = [];
  for (const r of rueck) {
    const jetzt = r.s === null ? (heuteGesamt.get(r.a) ?? 0) : (heuteFiliale.get(k2(r.a, r.s)) ?? 0);
    if (mengeRunden(jetzt) === mengeRunden(r.neu)) zurueck.push(r); else geaendert.push(r);
  }
  return { zurueck, geaendert };
}

/** Schluessel fuer heuteFiliale in planeRueckgaengig. */
export function bestandSchluessel(artikelId: string, standortId: string | null): string {
  return k2(artikelId, standortId);
}
