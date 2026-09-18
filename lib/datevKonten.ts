// ============================================================================
// ARGONAUT OS · lib/datevKonten.ts — Regel-Ebene: Beleg-Kategorie -> DATEV-Konto
//
// KEINE KI. Eine reine, nachvollziehbare Zuordnung von Stichworten (aus
// Kategorie und Lieferant) auf das passende Aufwands-Sachkonto — jeweils fuer
// SKR03 UND SKR04, die beiden gaengigen Kontenrahmen im Mittelstand.
//
// Wichtig: Das Ergebnis ist ein VORSCHLAG zur Bestaetigung. Die endgueltige
// Kontierung entscheidet der Betrieb bzw. der Steuerberater.
//
// Reine Funktionen, keine Hooks/keine Supabase-Aufrufe — ueberall importierbar.
//
// ▄▄▄ REPARATUR PUNKT 22 (18.09.2026) ▄▄▄
//
// 1. DIE STICHWORTSUCHE WAR EINE REINE TEILZEICHENKETTEN-SUCHE.
//    `heu.includes(k)` traf mitten im Wort. GEMESSEN am echten Code:
//      Metabo Werkzeug GmbH   -> WERBEKOSTEN   ("Meta" steckt in "Metabo")
//      Espressomaschine       -> KRAFTSTOFF    ("Esso" steckt in "Espresso")
//      Parallelanlagen Bau    -> KRAFTSTOFF    ("Aral" steckt in "Parallel")
//      Cloud-Backups          -> PORTO         ("UPS" steckt in "Backups")
//      Poster Druckerei       -> PORTO         ("Post" steckt in "Poster")
//      Kompostierung          -> PORTO         ("Post" steckt in "Kompost")
//      Flugblatt Verteilung   -> REISEKOSTEN   ("Flug" steckt in "Flugblatt")
//      Schreinerwerkstatt     -> KFZ-REPARATUR ("Werkstatt")
//    Ein Werkzeugeinkauf als Werbung, eine Kaffeemaschine als Diesel: das
//    landet so im DATEV-Export und damit beim Steuerberater.
//
//    JETZT: Sachbegriffe treffen nur am WORTANFANG (damit deutsche Komposita
//    wie "Bürobedarf" oder "Tankstellenrechnung" weiter greifen), MARKENNAMEN
//    nur als GANZES WORT (eine Marke ist kein Wortbestandteil), und einzelne
//    bekannte Ausreisser stehen in einer Ausnahmeliste.
//
// 2. DER KOMMENTAR VERSPRACH ETWAS, DAS DER CODE NICHT TAT.
//    "Sucht Stichworte zuerst in der Kategorie, dann im Lieferantennamen" —
//    tatsaechlich wurden beide in EINEN Text geworfen und einmal durchsucht.
//    GEMESSEN: Kategorie "Material" + Lieferant "Shell Deutschland" ergab
//    KRAFTSTOFF. Die vom Betrieb gesetzte Kategorie verlor gegen einen
//    Lieferantennamen. Jetzt gilt, was der Kommentar immer behauptet hat:
//    erst die Kategorie, und nur wenn dort nichts trifft, der Lieferant.
//
// 3. NICHT GERATEN: Bewirtung. SKR03 4650 ist der abziehbare Anteil; nach
//    § 4 Abs. 5 Nr. 2 EStG sind 30 % nicht abziehbar und gehoeren auf ein
//    eigenes Konto. Welcher Beleg wie aufzuteilen ist, kann der Code nicht
//    wissen — das Konto bleibt, und datevHinweise() sagt es im Klartext.
//    Gleiches Muster wie beim SKR-Feld (Punkt 15) und der Kennziffer fuer
//    steuerfreie Umsaetze (Punkt 17).
// ============================================================================

export type KontoRegel = {
  /** Sachbegriffe. Treffer, wenn ein Wort DAMIT BEGINNT ("büro" trifft "Bürobedarf"). */
  keywords: string[];
  /** Eigennamen. Treffer nur als GANZES Wort ("meta" trifft nicht "Metabo"). */
  marken?: string[];
  /**
   * Stichworte, die AUCH am Wortende treffen duerfen — deutsche Komposita
   * haben ihr Hauptwort hinten ("Projekt|material"). Nur fuer Woerter, die
   * ausschliesslich als Kompositum-Kopf vorkommen; jeder Eintrag muss auch
   * in `keywords` stehen, ist also eine Erweiterung, kein neues Stichwort.
   * NICHT fuer kurze oder mehrdeutige Woerter: "reifen" stuende sonst auch in
   * "Streifen" und "Greifen", "ware" in "Software" und "Hardware".
   */
  endungen?: string[];
  /**
   * Bekannte Ausreisser: beginnt ein Wort damit, scheidet die Regel aus.
   * Hier steht NUR, was nachweislich entscheidet — jeder Eintrag wurde mit
   * und ohne Ausnahmeliste gemessen. Was die Reihenfolge der Regeln ohnehin
   * schon regelt ("Mietwagen" vor "Miete"), gehoert nicht hierher, sonst
   * glaubt der naechste Leser, hier haenge etwas dran.
   */
  nie?: string[];
  skr03: string;
  skr04: string;
  bezeichnung: string;
};

// Reihenfolge = Prioritaet: SPEZIFISCH vor ALLGEMEIN.
export const DATEV_REGELN: KontoRegel[] = [
  { keywords: ['kraftstoff', 'tanken', 'tankstelle', 'diesel', 'benzin', 'adblue'], marken: ['aral', 'shell', 'esso', 'jet', 'agip'], skr03: '4530', skr04: '6530', bezeichnung: 'Laufende Kfz-Betriebskosten (Kraftstoff)' },
  { keywords: ['kfz-reparatur', 'kfz reparatur', 'kfz werkstatt', 'autowerkstatt', 'reifen', 'inspektion', 'tuev', 'tüv', 'auspuff', 'bremsen', 'hauptuntersuchung'], nie: ['reifenglaettung'], skr03: '4540', skr04: '6540', bezeichnung: 'Kfz-Reparaturen' },
  { keywords: ['bewirtung', 'restaurant', 'gaststaette', 'gaststätte', 'gasthaus', 'gasthof', 'wirtshaus', 'brauhaus', 'pizzeria', 'bistro', 'imbiss', 'cafe', 'café', 'kantine', 'catering'], skr03: '4650', skr04: '6640', bezeichnung: 'Bewirtungskosten' },
  { keywords: ['reisekosten', 'dienstreise', 'hotel', 'uebernachtung', 'übernachtung', 'bahnfahrt', 'bahnticket', 'flugticket', 'mietwagen', 'taxi'], marken: ['db', 'lufthansa', 'eurowings', 'flixbus'], skr03: '4670', skr04: '6670', bezeichnung: 'Reisekosten' },
  { keywords: ['buero', 'büro', 'bürobedarf', 'buerobedarf', 'papier', 'toner', 'druckerpatrone', 'tinte', 'ordner', 'schreibwaren'], nie: ['buerozins', 'bürozins', 'bueromiete', 'büromiete'], skr03: '4930', skr04: '6815', bezeichnung: 'Bürobedarf' },
  { keywords: ['porto', 'postgebuehr', 'postgebühr', 'frankier', 'paketversand', 'versandkosten', 'paketdienst'], marken: ['post', 'dhl', 'dpd', 'hermes', 'ups', 'gls', 'fedex'], skr03: '4910', skr04: '6800', bezeichnung: 'Porto' },
  { keywords: ['telefon', 'mobilfunk', 'internet', 'handy', 'dsl', 'telekommunikation', 'glasfaser'], endungen: ['telefon'], marken: ['telekom', 'vodafone', 'o2', '1&1', 'congstar'], skr03: '4920', skr04: '6805', bezeichnung: 'Telefon / Telekommunikation' },
  { keywords: ['werbung', 'werbe', 'marketing', 'anzeige', 'google ads', 'flyer', 'plakat', 'poster', 'flugblatt', 'prospekt'], endungen: ['werbung'], marken: ['meta', 'facebook', 'instagram', 'linkedin', 'tiktok'], skr03: '4600', skr04: '6600', bezeichnung: 'Werbekosten' },
  { keywords: ['miete', 'raummiete', 'pacht', 'buerozins', 'bürozins', 'gewerbemiete', 'hallenmiete', 'lagermiete'], endungen: ['miete', 'pacht'], skr03: '4210', skr04: '6310', bezeichnung: 'Raumkosten (Miete/Pacht)' },
  { keywords: ['strom', 'gas', 'wasser', 'heizung', 'energie', 'stadtwerke', 'fernwaerme', 'fernwärme', 'abwasser'], marken: ['eon', 'e.on', 'enbw', 'vattenfall', 'rwe'], nie: ['stromberg'], skr03: '4240', skr04: '6325', bezeichnung: 'Gas, Strom, Wasser' },
  { keywords: ['reinigung', 'gebaeudereinigung', 'gebäudereinigung', 'putzdienst', 'unterhaltsreinigung'], endungen: ['reinigung'], skr03: '4250', skr04: '6330', bezeichnung: 'Reinigung' },
  { keywords: ['versicherung', 'haftpflicht', 'police'], endungen: ['versicherung', 'haftpflicht'], marken: ['allianz', 'axa', 'gothaer', 'ergo', 'hdi'], skr03: '4360', skr04: '6400', bezeichnung: 'Betriebliche Versicherungen' },
  { keywords: ['mitgliedsbeitrag', 'kammerbeitrag', 'innungsbeitrag', 'jahresbeitrag', 'beitrag', 'kammer', 'innung'], endungen: ['beitrag'], marken: ['ihk', 'hwk'], skr03: '4380', skr04: '6420', bezeichnung: 'Beiträge' },
  { keywords: ['fortbildung', 'schulung', 'seminar', 'weiterbildung', 'lehrgang', 'kursgebuehr', 'kursgebühr'], endungen: ['fortbildung', 'schulung', 'seminar'], skr03: '4945', skr04: '6821', bezeichnung: 'Fortbildungskosten' },
  { keywords: ['steuerberater', 'buchfuehrung', 'buchführung', 'buchhaltung', 'jahresabschluss', 'lohnabrechnung', 'steuerkanzlei', 'steuerberatung'], endungen: ['buchfuehrung', 'buchführung', 'buchhaltung'], skr03: '4957', skr04: '6827', bezeichnung: 'Buchführungs- / Abschlusskosten' },
  { keywords: ['rechtsanwalt', 'anwalt', 'notar', 'rechtsberatung', 'kanzlei', 'beratung', 'unternehmensberatung'], endungen: ['beratung'], skr03: '4950', skr04: '6825', bezeichnung: 'Rechts- und Beratungskosten' },
  { keywords: ['software', 'lizenz', 'saas', 'hosting', 'cloud', 'wartung edv', 'edv', 'server', 'domain', 'webhosting'], marken: ['microsoft', 'adobe', 'atlassian', 'hetzner', 'ionos'], skr03: '4806', skr04: '6495', bezeichnung: 'Wartung / Software (EDV)' },
  { keywords: ['bankgebuehr', 'bankgebühr', 'kontofuehrung', 'kontoführung', 'kontogebuehr', 'kontogebühr', 'geldverkehr', 'zahlungsverkehr'], skr03: '4970', skr04: '6855', bezeichnung: 'Nebenkosten des Geldverkehrs' },
  { keywords: ['fremdleistung', 'subunternehmer', 'nachunternehmer', 'fremdarbeit', 'subunternehmen'], skr03: '3100', skr04: '5900', bezeichnung: 'Fremdleistungen' },
  { keywords: ['werkzeug', 'kleingeraet', 'kleingerät', 'maschine klein', 'geraete', 'geräte', 'bohrmaschine'], skr03: '4985', skr04: '6845', bezeichnung: 'Werkzeuge und Kleingeräte' },
  { keywords: ['material', 'werkstoff', 'baustoff', 'rohstoff', 'ware', 'wareneinkauf', 'handelsware', 'einkauf'], endungen: ['material', 'werkstoff', 'baustoff', 'rohstoff'], nie: ['warenwirtschaft', 'einkaufsgutschein'], skr03: '3400', skr04: '5400', bezeichnung: 'Wareneingang / Material (19% VSt)' },
  { keywords: ['reparatur', 'instandhaltung', 'wartung', 'instandsetzung'], endungen: ['reparatur', 'instandhaltung', 'wartung'], skr03: '4805', skr04: '6460', bezeichnung: 'Reparatur / Instandhaltung' },
];

export const DATEV_FALLBACK = { skr03: '4980', skr04: '6850', bezeichnung: 'Sonstiger Betriebsbedarf' } as const;

/** Woher der Treffer kam. 'kategorie' ist der starke Fall, 'lieferant' der schwache. */
export type VorschlagQuelle = 'kategorie' | 'lieferant' | 'fallback';

export type DatevVorschlag = {
  skr03: string;
  skr04: string;
  bezeichnung: string;
  treffer: boolean;
  /** Ab Punkt 22, additiv. */
  quelle: VorschlagQuelle;
  /** Das Stichwort, das entschieden hat — damit nachvollziehbar ist, warum. */
  stichwort: string | null;
};

/**
 * Text in vergleichbare Woerter zerlegen. Umlaute bleiben stehen, weil die
 * Regeln beide Schreibweisen fuehren. & und . bleiben, damit "1&1" und "e.on"
 * ein Wort bleiben.
 */
function woerter(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9äöüß&.]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** Ein Treffer, und welches Stichwort ihn ausgeloest hat. */
function regelTrifft(text: string, r: KontoRegel): string | null {
  const w = woerter(text);
  if (w.length === 0) return null;

  // Ausnahmen zuerst: bekannte Ausreisser schalten die ganze Regel ab.
  if (r.nie && r.nie.some((x) => w.some((wort) => wort.startsWith(x)))) return null;

  // Markennamen: nur als ganzes Wort. "meta" trifft nicht "metabo".
  for (const m of r.marken ?? []) {
    if (w.includes(m)) return m;
  }

  const ganz = w.join(' ');
  for (const k of r.keywords) {
    if (k.includes(' ')) {
      // Mehrwortiges Stichwort ("google ads"): an einer Wortgrenze im Text.
      if (ganz === k || ganz.startsWith(k + ' ') || ganz.includes(' ' + k + ' ') || ganz.endsWith(' ' + k)) return k;
      continue;
    }
    // Sachbegriff: am WORTANFANG, damit deutsche Komposita greifen
    // ("büro" -> "bürobedarf"), ein Wortinneres aber nicht ("jet" -/-> "projekt").
    if (w.some((wort) => wort.startsWith(k))) return k;
    // Und am WORTENDE, wo das Stichwort der Kopf des Kompositums ist
    // ("Projekt|material") — aber nur fuer die ausdruecklich erlaubten.
    if ((r.endungen ?? []).includes(k) && w.some((wort) => wort.endsWith(k))) return k;
  }
  return null;
}

function sucheIn(text: string): { regel: KontoRegel; stichwort: string } | null {
  if (!String(text || '').trim()) return null;
  for (const r of DATEV_REGELN) {
    const k = regelTrifft(text, r);
    if (k) return { regel: r, stichwort: k };
  }
  return null;
}

/**
 * Liefert den Konto-Vorschlag fuer einen Beleg.
 * Sucht Stichworte ZUERST in der Kategorie, und nur wenn dort nichts trifft,
 * im Lieferantennamen — so, wie es hier immer schon stand und bis heute
 * nicht stimmte.
 * @returns immer ein Ergebnis; treffer=false bedeutet: Fallback-Konto benutzt.
 */
export function datevVorschlag(kategorie?: string | null, lieferant?: string | null): DatevVorschlag {
  const ausKategorie = sucheIn(kategorie || '');
  if (ausKategorie) {
    const { regel, stichwort } = ausKategorie;
    return { skr03: regel.skr03, skr04: regel.skr04, bezeichnung: regel.bezeichnung, treffer: true, quelle: 'kategorie', stichwort };
  }
  const ausLieferant = sucheIn(lieferant || '');
  if (ausLieferant) {
    const { regel, stichwort } = ausLieferant;
    return { skr03: regel.skr03, skr04: regel.skr04, bezeichnung: regel.bezeichnung, treffer: true, quelle: 'lieferant', stichwort };
  }
  return { ...DATEV_FALLBACK, treffer: false, quelle: 'fallback', stichwort: null };
}

/** Flache Liste aller Konten fuer ein manuelles Auswahl-Dropdown. */
export function datevKontenListe(rahmen: 'skr03' | 'skr04'): { konto: string; bezeichnung: string }[] {
  const raus = DATEV_REGELN.map((r) => ({ konto: r[rahmen], bezeichnung: r.bezeichnung }));
  raus.push({ konto: DATEV_FALLBACK[rahmen], bezeichnung: DATEV_FALLBACK.bezeichnung });
  return raus;
}

/**
 * Klartext zu einem Vorschlag. Aendert nichts, kontiert nichts um.
 * NOCH NICHT auf der Seite angezeigt — Andockpunkt, gebuendelt mit
 * staffelUnstimmigkeiten / extfHinweise / ustvaHinweise / bankHinweise /
 * wiederkehrHinweise / fristenHinweise.
 */
export function datevHinweise(v: DatevVorschlag, kategorie?: string | null, lieferant?: string | null): string[] {
  const h: string[] = [];

  if (!v.treffer) {
    h.push(`Keine Regel hat gegriffen — der Beleg landet auf dem Sammelkonto ${v.skr03} (SKR03) / ${v.skr04} (SKR04). Bitte von Hand kontieren.`);
  } else if (v.quelle === 'lieferant') {
    h.push(`Zugeordnet ueber den Lieferantennamen ("${v.stichwort}"), nicht ueber die Kategorie. Eine gepflegte Kategorie ist verlaesslicher — bitte kurz pruefen.`);
  }

  if (v.skr03 === '4650') {
    h.push('Bewirtung: nach § 4 Abs. 5 Nr. 2 EStG sind 30 % nicht abziehbar und gehoeren auf ein eigenes Konto. Die Aufteilung nimmt ARGONAUT NICHT vor — bitte mit dem Steuerberater klaeren.');
  }
  if (v.skr03 === '3400') {
    h.push('Wareneingang ist mit 19 % Vorsteuer hinterlegt. Bei 7 % oder steuerfreiem Einkauf gehoert der Beleg auf ein anderes Konto.');
  }
  if (v.skr03 === '4985') {
    h.push('Werkzeuge und Kleingeraete: ab der Grenze fuer geringwertige Wirtschaftsgueter ist zu aktivieren statt sofort abzusetzen. Die Grenze prueft ARGONAUT nicht.');
  }

  // Wenn Kategorie und Lieferant auf VERSCHIEDENE Konten zeigen, ist das einen
  // Blick wert — genau hier hat der alte Code still den Lieferanten gewinnen lassen.
  const k = sucheIn(kategorie || '');
  const l = sucheIn(lieferant || '');
  if (k && l && k.regel.skr03 !== l.regel.skr03) {
    h.push(`Kategorie und Lieferant zeigen auf verschiedene Konten: "${k.stichwort}" -> ${k.regel.bezeichnung}, "${l.stichwort}" -> ${l.regel.bezeichnung}. Die Kategorie hat entschieden.`);
  }
  return h;
}
