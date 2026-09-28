// ============================================================
// ARGONAUT OS · lib/umzugPlan.ts — Umzug Schritt 6: alles auf einmal
// (Paket 147, 28.09.2026)
//
// Der Betrieb zieht mit einem Stapel Dateien um. Diese Logik
//   1. erkennt je Datei, wohin sie gehoert (Import-Ziel) — an den Spalten
//      (derselbe Vorschlag wie im Import-Center) und am Dateinamen,
//   2. erkennt Sonderfaelle, die einen eigenen Weg haben (Kontoauszug ->
//      Bankabgleich, E-Rechnung -> Eingangsrechnungen, GAEB -> Bau & LV),
//   3. legt die Reihenfolge fest: erst, worauf andere verweisen (Kunden vor
//      Auftraegen, Artikel vor Bestand, Mietvertraege vor Kautionen …).
// Importiert wird danach Datei fuer Datei im normalen Import-Center — mit
// Zuordnung, Pruefung und Rueckgaengig je Datei. Reine Logik, node-getestet.
// ============================================================

import { ZIELE, zielDef, fehlendePflichtfelder, normal, type ImportZiel } from './importParser';
import { katalogFuerZiel, vorschlagMapping, EIGEN, leseDatev, datevZaehlen, DATEV_KATEGORIEN, type KatalogSpalte } from './importMotor';

export type SonderWeg = { art: 'bank' | 'erechnung' | 'gaeb' | 'datev_buchungen' | 'datev_andere'; titel: string; href: string; grund: string };

export type ZielTreffer = { ziel: string; label: string; punkte: number; erkannt: number; spalten: number; pflichtFehlt: string[] };

export type DateiErkennung = {
  datei: string;
  /** bester Vorschlag (null = unsicher oder Sonderweg) */
  ziel: string | null;
  sicher: boolean;
  kandidaten: ZielTreffer[];
  sonder: SonderWeg | null;
};

const SONDER: Record<SonderWeg['art'], Omit<SonderWeg, 'art'>> = {
  bank: { titel: 'Kontoauszug', href: '/dashboard/bank', grund: 'Kontoauszüge gehören in den Bankabgleich — dort werden die Zahlungen den offenen Rechnungen zugeordnet.' },
  erechnung: { titel: 'E-Rechnung (XRechnung/ZUGFeRD)', href: '/dashboard/eingangsrechnungen', grund: 'E-Rechnungen liest ARGONAUT unter Eingangsrechnungen mit allen Positionen ein.' },
  gaeb: { titel: 'GAEB-Leistungsverzeichnis', href: '/dashboard/bau-lv', grund: 'GAEB-Dateien liest ARGONAUT unter Bau & LV ein.' },
  datev_buchungen: { titel: 'DATEV-Buchungsstapel', href: '/dashboard/import', grund: 'Buchungsstapel bleiben beim Steuerberater — ARGONAUT übernimmt Debitoren/Kreditoren (Stammdaten), keine Buchungen.' },
  datev_andere: { titel: 'DATEV-Datei', href: '/dashboard/import', grund: 'Übernommen werden aus DATEV nur Debitoren/Kreditoren (Stammdaten).' },
};

/**
 * Paket 152: Die uebrigen DATEV-Formatkategorien — jede mit ihrem Grund.
 * 16 (Debitoren/Kreditoren) ist KEIN Sonderweg, sondern wird aufgeteilt (datevStapel).
 */
const DATEV_GRUND: Record<number, { art: SonderWeg['art']; grund: string }> = {
  21: { art: 'datev_buchungen', grund: SONDER.datev_buchungen.grund },
  65: { art: 'datev_buchungen', grund: 'Wiederkehrende Buchungen bleiben beim Steuerberater — ARGONAUT übernimmt keine Buchungen.' },
  20: { art: 'datev_andere', grund: 'Der Kontenplan (Sachkonten-Beschriftungen) bleibt beim Steuerberater — in ARGONAUT wählen Sie nur Ihren Kontenrahmen.' },
  46: { art: 'datev_andere', grund: 'Zahlungsbedingungen aus DATEV werden nicht übernommen — in ARGONAUT gibt es dafür keine Liste je Kunde. Zahlungsziel und Skonto stehen auf Ihren Rechnungen.' },
  48: { art: 'datev_andere', grund: 'Diverse Adressen (zusätzliche Liefer- und Rechnungsadressen) werden noch nicht übernommen — die Hauptadresse kommt mit den Debitoren/Kreditoren.' },
};

/** DATEV-Kopf „EXTF";700;16;"Debitoren/Kreditoren";… -> Kategorie (null = keine DATEV-Datei). */
export function datevKategorie(ersteZeile: string): number | null {
  const m = /^"?extf"?;\s*"?\d*"?;\s*"?(\d+)"?;/i.exec(ersteZeile.trim());
  return m ? Number(m[1]) : null;
}

function sonder(art: SonderWeg['art']): SonderWeg { return { art, ...SONDER[art] }; }

/** Sonderweg an Dateiendung, Kopf oder erster Zeile erkennen. */
export function erkenneSonderweg(dateiname: string, kopf: readonly string[], ersteZeile = ''): SonderWeg | null {
  const n = dateiname.toLowerCase();
  if (/\.(x8[0-9]|d8[0-9]|p8[0-9])$/.test(n) || /\.gaeb$/.test(n)) return sonder('gaeb');
  if (/\.xml$/.test(n)) {
    if (/crossindustryinvoice|urn:oasis:names:specification:ubl|xrechnung|zugferd|factur-x/i.test(ersteZeile) || /rechnung|invoice/.test(n)) return sonder('erechnung');
    if (/gaeb/i.test(ersteZeile)) return sonder('gaeb');
  }
  if (/\.(sta|mt940|camt|camt\.053)$/.test(n) || /camt\.05[234]/i.test(ersteZeile)) return sonder('bank');
  const kat = datevKategorie(ersteZeile);
  if (kat !== null && kat !== 16) {
    const g = DATEV_GRUND[kat];
    const name = DATEV_KATEGORIEN[kat] ?? `Kategorie ${kat}`;
    return g ? { ...sonder(g.art), titel: `DATEV: ${name}`, grund: g.grund }
      : { ...sonder('datev_andere'), titel: `DATEV: ${name}` };
  }
  const k = new Set(kopf.map((x) => normal(x)));
  const hat = (...w: string[]) => w.some((x) => k.has(x));
  if (hat('buchungstag', 'buchungsdatum') && hat('verwendungszweck', 'buchungstext') && (hat('betrag', 'umsatz', 'betrag eur') || hat('valuta', 'wertstellung'))) return sonder('bank');
  return null;
}

/**
 * Paket 152: DATEV Debitoren/Kreditoren im Umzug-Stapel. Eine DATEV-Datei
 * enthaelt beide — also wird sie ZWEIMAL eingeplant: als Kunden (Debitoren)
 * und als Lieferanten (Kreditoren). Beim Import faellt jeweils die andere
 * Sorte mit Grund heraus (lib/importMotor datevKontoArt). null = keine
 * DATEV-Stammdatendatei.
 */
export function datevStapel(text: string): { kopf: string[]; zeilen: string[][]; debitoren: number; kreditoren: number; sonst: number } | null {
  // leseDatev liefert null ohne EXTF-Kopf und einen Fehler fuer jede andere Kategorie als 16
  const d = leseDatev(text);
  if (!d || d.fehler) return null;
  const { kopf, zeilen } = d.tabelle;
  const i = kopf.findIndex((k) => normal(k) === 'konto');
  if (i < 0) return { kopf, zeilen, debitoren: 0, kreditoren: 0, sonst: zeilen.length };
  return { kopf, zeilen, ...datevZaehlen(zeilen, i, d.kopf.sachkontenlaenge) };
}

/** Woerter des Dateinamens (ohne Endung, Nummern, Fuellwoerter). */
function namensWoerter(dateiname: string): string[] {
  return normal(dateiname.replace(/\.[a-z0-9]+$/i, '')).split(' ').filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !['und', 'the', 'export', 'liste', 'daten', 'alle', 'stand'].includes(w));
}

/** Woerter, an denen ein Ziel im Dateinamen erkannt wird (Schluessel, Name, Einzahl). */
const NAMEN_EXTRA: Record<string, string[]> = {
  kontakte: ['kunden', 'kunde', 'kundenliste', 'kontakte', 'adressen', 'debitoren', 'customers', 'contacts'],
  lieferanten: ['lieferanten', 'lieferant', 'kreditoren', 'suppliers', 'vendors'],
  artikel: ['artikel', 'lager', 'sortiment', 'produkte', 'products', 'items', 'material'],
  rechnungen: ['offene', 'posten', 'opos', 'ausgangsrechnungen', 'forderungen'],
  leistungskatalog: ['leistungskatalog', 'leistungen', 'stundensaetze', 'leistungsverzeichnis'],
  mitarbeiter: ['mitarbeiter', 'personal', 'employees', 'team'],
  mitarbeiter_qualifikation: ['qualifikationen', 'qualifikation', 'schulungen', 'zertifikate'],
  leads: ['leads', 'lead', 'anfragen'],
  verkaufschancen: ['verkaufschancen', 'chancen', 'deals', 'opportunities', 'pipeline'],
  kontakt_aktivitaeten: ['aktivitaeten', 'aktivitaten', 'historie', 'notizen', 'activities'],
  auftraege: ['auftraege', 'auftrage', 'orders'],
  wartungsvertraege: ['wartungsvertraege', 'wartung', 'wartungen'],
  bestellungen: ['bestellungen', 'einkauf', 'purchase'],
  anlagegueter: ['anlagen', 'anlageverzeichnis', 'anlagegueter', 'afa'],
  eingangsbelege: ['eingangsrechnungen', 'eingangsbelege', 'belege', 'kreditorenrechnungen'],
  vertraege: ['vertraege', 'laufende', 'kosten', 'abos', 'fixkosten'],
  fahrzeuge: ['fahrzeuge', 'fuhrpark', 'kfz'],
  projekte: ['projekte', 'projects'],
  angebote: ['angebote', 'angebot', 'kva', 'quotes'],
  shop: ['shop', 'shopify', 'woocommerce', 'shopware', 'bestellungen online'],
  mitglieder: ['mitglieder', 'abos', 'members'],
  spenden: ['spenden', 'zuwendungen', 'spender'],
};

function namensBonus(ziel: ImportZiel, woerter: readonly string[]): number {
  if (woerter.length === 0) return 0;
  const eigene = new Set([...(NAMEN_EXTRA[ziel.key] ?? []), ...normal(ziel.label).split(' ').filter((w) => w.length >= 4), normal(ziel.key.replace(/_/g, ' '))]);
  // Mehr passende Woerter = mehr Gewicht („laufende kosten" -> Laufende Kosten & Verträge, nicht Laufende Aufträge)
  const treffer = woerter.filter((w) => eigene.has(w)).length;
  return treffer === 0 ? 0 : Math.min(0.35, 0.2 + 0.15 * (treffer - 1));
}

/**
 * Welches Ziel passt zu dieser Datei? Punkte = Anteil erkannter Spalten
 * (ohne Eigene Felder) + Dateinamen-Bonus − Abzug, wenn ein Pflichtfeld
 * nicht zugeordnet werden kann. „sicher" = klarer Vorsprung vor Platz 2.
 */
export function erkenneDatei(
  dateiname: string, kopf: readonly string[], zeilen: readonly string[][],
  opt: { dbSpalten?: KatalogSpalte[] | null; erlaubt?: (zielKey: string) => boolean; ersteZeile?: string } = {},
): DateiErkennung {
  const so = erkenneSonderweg(dateiname, kopf, opt.ersteZeile ?? '');
  if (so) return { datei: dateiname, ziel: null, sicher: true, kandidaten: [], sonder: so };
  const woerter = namensWoerter(dateiname);
  const treffer: ZielTreffer[] = [];
  for (const basis of ZIELE) {
    if (basis.bestandSetzen) continue;                // Bestand je Filiale nur gezielt
    if (opt.erlaubt && !opt.erlaubt(basis.key)) continue;
    const k = katalogFuerZiel(basis.key, opt.dbSpalten ?? null);
    if (!k) continue;
    if (basis.nurMitKatalog && opt.dbSpalten && !opt.dbSpalten.some((c) => c.tabelle === basis.tabelle)) continue;
    // Zum Erkennen reicht die Feldliste des Ziels, wenn die Datenbank-Liste fehlt
    // (importiert wird spaeter ohnehin mit dem Katalog der Datenbank).
    const z = k.ausDb ? k.ziel : basis;
    const map = vorschlagMapping(kopf, zeilen, z);
    const erkannt = Object.values(map).filter((v) => v && v !== EIGEN).length;
    const pflichtFehlt = fehlendePflichtfelder(map, basis.key, z).map((f) => f.label);
    const punkte = (kopf.length > 0 ? erkannt / kopf.length : 0) + namensBonus(basis, woerter) - (pflichtFehlt.length > 0 ? 0.5 : 0);
    treffer.push({ ziel: basis.key, label: basis.label, punkte: Math.round(punkte * 1000) / 1000, erkannt, spalten: kopf.length, pflichtFehlt });
  }
  treffer.sort((a, b) => b.punkte - a.punkte || b.erkannt - a.erkannt);
  const [erster, zweiter] = treffer;
  const sicher = !!erster && erster.punkte >= 0.5 && erster.pflichtFehlt.length === 0 && (!zweiter || erster.punkte - zweiter.punkte >= 0.15);
  return { datei: dateiname, ziel: erster && erster.punkte >= 0.3 && erster.pflichtFehlt.length === 0 ? erster.ziel : null, sicher, kandidaten: treffer.slice(0, 5), sonder: null };
}

// ---------------------------------------------------------------------------
// Reihenfolge
// ---------------------------------------------------------------------------

/** Zusaetzliche Abhaengigkeiten, die nicht aus kundeVerweis/nachschlag folgen. */
const EXTRA_VORHER: Record<string, string[]> = {
  bestellungen: ['artikel'],
  bestand_filiale: ['artikel'],
  shop: ['artikel'],
};

/** Tabelle -> Ziel, das sie fuellt (erstes Ziel je Tabelle). */
function zielFuerTabelle(tabelle: string): string | null {
  return ZIELE.find((z) => z.tabelle === tabelle)?.key ?? null;
}

/**
 * Worauf verweist dieses Ziel? Kunden/Mitarbeiter/Lieferanten (kundeVerweis)
 * und Nachschlag-Tabellen, die NICHT automatisch angelegt werden.
 */
export function abhaengigkeiten(zielKey: string): string[] {
  const z = zielDef(zielKey);
  if (!z) return [];
  const raus = new Set<string>(EXTRA_VORHER[zielKey] ?? []);
  if (z.kundeVerweis) {
    const q = z.kundeVerweis.quelle ?? 'kontakte';
    raus.add(q);
  }
  if (z.nachschlag && !z.nachschlag.anlegen) {
    const t = zielFuerTabelle(z.nachschlag.tabelle);
    if (t && t !== zielKey) raus.add(t);
  }
  raus.delete(zielKey);
  return [...raus];
}

/**
 * Reihenfolge fuer die Dateien eines Umzugs: Abhaengigkeiten zuerst, sonst
 * die Reihenfolge der Ziele im Katalog (Stammdaten vorn). Fehlt eine
 * Abhaengigkeit im Stapel, zaehlt sie nicht (vielleicht schon im System) —
 * sie wird aber als Hinweis gemeldet.
 */
export function umzugReihenfolge(zielKeys: readonly string[]): { reihenfolge: string[]; fehlend: { ziel: string; braucht: string }[] } {
  const menge = new Set(zielKeys);
  const rang = (k: string) => { const i = ZIELE.findIndex((z) => z.key === k); return i < 0 ? 999 : i; };
  const fehlend: { ziel: string; braucht: string }[] = [];
  for (const k of menge) for (const d of abhaengigkeiten(k)) if (!menge.has(d)) fehlend.push({ ziel: k, braucht: d });
  const fertig: string[] = [];
  const offen = [...menge].sort((a, b) => rang(a) - rang(b));
  while (offen.length > 0) {
    const i = offen.findIndex((k) => abhaengigkeiten(k).every((d) => !menge.has(d) || fertig.includes(d)));
    const naechster = offen.splice(i >= 0 ? i : 0, 1)[0];   // Kreis (sollte nie vorkommen): Katalog-Reihenfolge
    fertig.push(naechster);
  }
  return { reihenfolge: fertig, fehlend };
}

export type PlanEintrag = { datei: string; ziel: string | null; sonder: SonderWeg | null; sicher: boolean; schritt: number | null };

/** Der ganze Plan: Dateien mit Ziel in Reihenfolge, Sonderwege und Unsicheres ans Ende. */
export function umzugPlan(erkennungen: readonly { datei: string; ziel: string | null; sonder: SonderWeg | null; sicher: boolean }[]): { eintraege: PlanEintrag[]; fehlend: { ziel: string; braucht: string }[] } {
  const mitZiel = erkennungen.filter((e) => e.ziel && !e.sonder);
  const { reihenfolge, fehlend } = umzugReihenfolge([...new Set(mitZiel.map((e) => e.ziel as string))]);
  const eintraege: PlanEintrag[] = [];
  let schritt = 1;
  for (const z of reihenfolge) for (const e of mitZiel.filter((x) => x.ziel === z)) eintraege.push({ ...e, schritt: schritt++ });
  for (const e of erkennungen.filter((x) => !x.ziel || x.sonder)) eintraege.push({ ...e, schritt: null });
  return { eintraege, fehlend };
}
