// ============================================================================
// ARGONAUT OS · lib/importMotor.ts — EIN Import-Motor (Umzug Schritt 2)
//
// Stand 27.09.2026. Baut auf lib/importParser.ts auf (CSV lesen, Werte deutsch
// verstehen, Zeilen pruefen) und ergaenzt, was fuer einen echten Umzug fehlte:
//
//  1. FELDKATALOG AUS DER DATENBANK
//     Der feste Katalog (ZIELE) kennt Felder, die es in einer Datenbank noch
//     nicht geben kann (Kundennummer, Land …) — und kennt Spalten nicht, die
//     es laengst gibt. Die Funktion import_feldkatalog() (SQL Paket 124)
//     liefert die ECHTEN Spalten je Tabelle. Der Motor bietet nur an, was es
//     wirklich gibt, und nimmt weitere Datenbank-Spalten automatisch dazu.
//     Ohne das SQL: der alte Katalog ohne die neuen Felder — wie bisher.
//
//  2. NICHTS VERSCHLUCKT
//     Jede Spalte der Datei endet an genau EINER von drei Stellen:
//       · in einem Feld,
//       · als „Eigenes Feld" (eigenes_feld / eigenes_feld_wert, je Betrieb),
//       · in der Liste „nicht übernommen, weil …" — mit Grund.
//     Eine unbekannte Spalte mit Inhalt wird NICHT still weggelassen, sondern
//     standardmaessig als Eigenes Feld uebernommen.
//
//  3. BANKDATEN BLEIBEN DRAUSSEN (GEMEINSAM-Regel)
//     IBAN, BIC, Mandate: nie automatisch, auch nicht als Eigenes Feld. Sie
//     stehen mit Grund in der Liste „nicht übernommen".
//
//  4. DATEV-FORMAT
//     Kopf "EXTF"/"DTVF" wird erkannt; Debitoren/Kreditoren-Stammdaten werden
//     gelesen, Kunden und Lieferanten sauber getrennt (Kontonummernkreis).
//
// Reine Funktionen, keine Netzwerk-Aufrufe, keine Hooks — node-testbar.
// ============================================================================

import {
  leseCsv, normal, leseZahl, leseDatumGenau, errateMappingFuer, zielDef,
  type ImportZiel, type ZielFeld, type Mapping, type FeldTyp, type Tabelle,
} from './importParser';
import { systemAliase, DATEV_SPALTEN_KONTAKTE, DATEV_SPALTEN_LIEFERANTEN } from './altsysteme';
import { centRunden } from './zahlen';

/** Mapping-Wert: diese Spalte als Eigenes Feld uebernehmen. */
export const EIGEN = '@eigen';
/** Mapping-Wert: nicht uebernehmen. */
export const NICHT = '';

/** Die Ziele, fuer die der Motor den Feldkatalog aus der Datenbank laedt. */
export const MOTOR_TABELLEN = [
  'kontakte', 'lieferanten', 'artikel', 'rechnungen',
  // Schritt 3 (Paket 125)
  'leistungskatalog', 'wartungsvertraege', 'verkaufschancen', 'kontakt_aktivitaeten', 'leads',
  // Schritt 3 Teil 2 (Paket 126)
  'mitarbeiter', 'auftraege', 'projekte', 'vertraege', 'anlagegueter', 'fahrzeuge', 'eingangsbelege',
  // Schritt 3 Teil 3 (Paket 127) — bestellpositionen nur fuer die Positionen der Bestellungen
  'mitarbeiter_qualifikation', 'bestellungen', 'bestellpositionen',
  // Paket 128: die ersten 15 Karten, die bisher nur eine Vorlage hatten
  'assets', 'asset_gruppen', 'pruef_protokoll', 'bde_maschine', 'charge_los', 'expose', 'bildung_kurse',
  'event_veranstaltung', 'reservierung_platz', 'belegung_einheit', 'erinnerung', 'gutachten', 'schlag',
  'tier_gruppe', 'ertrag_anlage', 'proof_asset',
  // Paket 129: Karten mit uebergeordnetem Eintrag
  'rezeptur_zutaten', 'rezepturen', 'zuschnitt_teil', 'zuschnitt_projekt', 'tour_stopp', 'tour',
  // Paket 130
  'bk_einheit', 'bk_abrechnung', 'reservierung_vorgang',
  // Paket 132: Umzug Schritt 4 — Handwerk & Handel
  'einsaetze', 'tickets', 'inventar', 'verleih_artikel',
  // Paket 133: Umzug Schritt 4 Teil 2 — Lebensmittel, Kasse, Beratung, Land-/Forstwirtschaft
  'lm_haccp_plan', 'lm_haccp', 'kassen_system', 'agentur_retainer', 'schlag_duengung', 'forst_objekte', 'forst_baeume',
  // Paket 134: Umzug Schritt 4 Teil 3 — Pflanzenschutz, Immobilien, Bildung/Vereine
  'schlag_psm', 'immo_einheiten', 'immo_mietvertraege', 'expose_interessent', 'bildung_anmeldungen', 'verein_ehrenamt',
  // Paket 135
  'agentur_nutzungsrecht',
  // Paket 138: GEMEINSAM-Block (freigegeben 27.09.2026) — Katalog fuer alle neun Punkte auf einmal
  'gutschein', 'foerder_vorhaben', 'mitglieder', 'spende', 'angebote', 'angebot_positionen',
  'projektleistungen', 'immo_kaution', 'immo_zahlungen', 'shop_bestellungen',
  // Paket 151: Umzug Schritt 7 — Termine (iCal)
  'termine',
] as const;

// ---------------------------------------------------------------------------
// 1) Kopfzeile: eindeutige Spaltennamen
// ---------------------------------------------------------------------------

/**
 * Doppelte Spaltennamen eindeutig machen: „Straße", „Straße (2)".
 * Die Zuordnung ist nach Spaltennamen gespeichert — zwei gleichnamige Spalten
 * haetten sich bisher gegenseitig ueberschrieben, und die zweite waere
 * verschluckt worden (DATEV-Stammdaten haben solche Spalten).
 */
export function eindeutigeKoepfe(kopf: readonly string[]): string[] {
  const gesehen = new Map<string, number>();
  return kopf.map((roh, i) => {
    const basis = String(roh ?? '').trim() || `Spalte ${i + 1}`;
    const n = (gesehen.get(basis) ?? 0) + 1;
    gesehen.set(basis, n);
    return n === 1 ? basis : `${basis} (${n})`;
  });
}

// ---------------------------------------------------------------------------
// 2) Feldkatalog aus der Datenbank
// ---------------------------------------------------------------------------

/** Eine Zeile aus import_feldkatalog(). */
export type KatalogSpalte = {
  tabelle: string;
  spalte: string;
  datentyp: string;
  /** NOT NULL ohne Vorgabewert — muss beim Anlegen gefuellt sein. */
  pflicht: boolean;
  /** Berechnete Spalte / Identitaet — darf nicht beschrieben werden. */
  generiert?: boolean;
};

/**
 * Spalten, die der Motor selbst setzt oder die niemand aus einer Datei
 * beschreiben darf (Kennungen, Besitzer, Zeitstempel).
 */
export const SYSTEM_SPALTEN = new Set([
  'id', 'owner_user_id', 'user_id', 'erstellt_von', 'geaendert_von', 'created_by', 'updated_by',
  'created_at', 'updated_at', 'erstellt_am', 'aktualisiert_am', 'geaendert_am', 'deleted_at', 'geloescht_am',
  'standort_id', 'mandant_id', 'tenant_id', 'betrieb_id', 'firma_id', 'lead_id', 'kontakt_id',
  // Werbe-Einwilligungen nie aus einer Datei (UWG) — siehe istEinwilligungSpalte
  'werbung_einwilligung', 'einwilligung_am', 'ist_bestand',
  // von ARGONAUT selbst gefuellt
  'score', 'ki_intent', 'ki_zusammenfassung', 'ki_naechster_schritt', 'stufe', 'stufe_geaendert_am',
  'nachfass_status', 'nachfass_schritt', 'nachfass_faellig_am', 'nachfass_zuletzt_am', 'angebot_entwurf',
  'angebot_status', 'angebot_erstellt_am', 'angebot_versendet_am', 'kampagne_id', 'ki_generiert',
  'erinnerung_gesendet_am', 'letzte_abrechnung_am', 'archiviert', 'aw_minuten', 'stundensatz_netto', 'einheitspreis_netto',
  'termin_gebucht_am', 'termin_gehalten_am', 'kunde_seit',
]);

/** Postgres-Datentyp -> Feldtyp des Motors (null = nicht aus Dateien befuellbar). */
export function feldTypAusDb(datentyp: string): FeldTyp | null {
  const t = String(datentyp ?? '').toLowerCase();
  if (/^(text|character varying|character|varchar|char|citext)$/.test(t)) return 'text';
  if (/^(integer|bigint|smallint|numeric|real|double precision|decimal)$/.test(t)) return 'zahl';
  if (/^(date|timestamp with time zone|timestamp without time zone|timestamptz|timestamp)$/.test(t)) return 'datum';
  if (t === 'boolean') return 'jaNein';
  return null;   // uuid, json, Arrays, eigene Typen: nicht aus einer Datei
}

/** „letzter_kontakt_am" -> „Letzter Kontakt am". */
export function spaltenLabel(spalte: string): string {
  const s = String(spalte ?? '').replace(/_/g, ' ')
    .replace(/\bae/g, 'ä').replace(/\boe/g, 'ö').replace(/\bue/g, 'ü')
    .trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : spalte;
}

export type KatalogErgebnis = {
  ziel: ImportZiel;
  /** Felder des festen Katalogs, deren Spalte es in DIESER Datenbank nicht gibt. */
  fehlend: ZielFeld[];
  /** Zusaetzliche Felder, die nur die Datenbank kennt. */
  zusatz: ZielFeld[];
  /** true = der Katalog kommt aus der Datenbank, false = fester Katalog (Rueckfall). */
  ausDb: boolean;
};

/**
 * Das Ziel so, wie es in DIESER Datenbank beschreibbar ist.
 *   · ohne Katalog (SQL noch nicht gelaufen): nur die Felder ohne „neu"
 *   · mit Katalog: feste Felder, deren Spalte existiert, + virtuelle Felder,
 *     deren Zielfelder existieren, + alle weiteren einfachen Spalten
 */
export function katalogFuerZiel(zielKey: string, dbSpalten: readonly KatalogSpalte[] | null | undefined): KatalogErgebnis | null {
  const basis = zielDef(zielKey);
  if (!basis) return null;
  const eigene = (dbSpalten ?? []).filter((c) => c.tabelle === basis.tabelle);

  if (eigene.length === 0) {
    // Schritt 3: neue Ziele nur mit Katalog — ohne ihn ist nicht sicher, welche Spalten es gibt.
    if (basis.nurMitKatalog) return { ziel: { ...basis, felder: [] }, fehlend: [...basis.felder], zusatz: [], ausDb: false };
    const felder = basis.felder.filter((f) => !f.neu);
    return { ziel: { ...basis, felder }, fehlend: basis.felder.filter((f) => f.neu), zusatz: [], ausDb: false };
  }

  const vorhanden = new Map(eigene.map((c) => [c.spalte, c]));
  // Paket 127: Positionen (Bestellungen) — deren Spalten stehen in der Kinder-Tabelle.
  // Paket 146: auch die Kind-Tabelle der jsonPositionen (Angebote -> angebot_positionen)
  const kindTabelle = basis.kinder?.tabelle ?? basis.jsonPositionen?.kindTabelle?.tabelle ?? null;
  const kinderSpalten = new Set((dbSpalten ?? []).filter((c) => kindTabelle && c.tabelle === kindTabelle && !c.generiert).map((c) => c.spalte));
  const nutzbar = (key: string) => {
    const c = vorhanden.get(key);
    return !!c && !c.generiert;
  };
  const felder: ZielFeld[] = [];
  const fehlend: ZielFeld[] = [];
  for (const f of basis.felder) {
    if (f.virtuell === 'name_zerlegen') { (nutzbar('nachname') ? felder : fehlend).push(f); continue; }
    if (f.virtuell === 'adresse_teil') { (nutzbar(f.fuellt ?? 'adresse') ? felder : fehlend).push(f); continue; }
    if (f.virtuell === 'kunde_verweis') { (basis.kundeVerweis && vorhanden.has(basis.kundeVerweis.spalte) ? felder : fehlend).push(f); continue; }
    if (f.virtuell === 'name_teil') { (nutzbar(f.fuellt ?? 'name') ? felder : fehlend).push(f); continue; }
    if (f.virtuell === 'anhang') { (f.anhangAn && nutzbar(f.anhangAn) ? felder : fehlend).push(f); continue; }
    if (f.virtuell === 'filter' || f.virtuell === 'rechnen') { felder.push(f); continue; }
    if (f.virtuell === 'nachschlag') {
      const n = basis.nachschlag;
      (n && (vorhanden.has(n.spalte) || (n.textFeld && nutzbar(n.textFeld))) ? felder : fehlend).push(f);
      continue;
    }
    if (f.virtuell === 'nachschlagMit') {
      const n = basis.nachschlag;
      const ok = !!n && !!f.elternSpalte && (dbSpalten ?? []).some((c) => c.tabelle === n.tabelle && c.spalte === f.elternSpalte);
      (ok ? felder : fehlend).push(f);
      continue;
    }
    if (f.virtuell === 'position' && basis.jsonPositionen) {
      const kt = basis.jsonPositionen.kindTabelle;
      // Paket 146: Positionen in einer Kind-Tabelle — Fremdschluessel und Spalte muessen dort da sein
      if (kt) (kinderSpalten.has(kt.fremdschluessel) && (!f.positionSpalte || kinderSpalten.has(f.positionSpalte)) ? felder : fehlend).push(f);
      // Paket 144: Positionen als Liste in EINER jsonb-Spalte (Shop-Archiv)
      else (vorhanden.has(basis.jsonPositionen.spalte) ? felder : fehlend).push(f);
      continue;
    }
    if (f.virtuell === 'position') {
      const ok = basis.kinder && kinderSpalten.has(basis.kinder.fremdschluessel)
        && (f.positionSpalte === null || f.positionSpalte === undefined || kinderSpalten.has(f.positionSpalte));
      (ok ? felder : fehlend).push(f);
      continue;
    }
    if (f.virtuell === 'preis') { (vorhanden.has('stundensatz_netto') || vorhanden.has('einheitspreis_netto') ? felder : fehlend).push(f); continue; }
    if (nutzbar(f.key)) {
      const c = vorhanden.get(f.key)!;
      felder.push(c.pflicht && !f.pflicht && f.standard === undefined ? { ...f, pflicht: true } : f);
    } else fehlend.push(f);
  }

  const bekannt = new Set(basis.felder.map((f) => f.key));
  const zusatz: ZielFeld[] = [];
  const aus = new Set(basis.ausblenden ?? []);
  for (const c of eigene) {
    if (bekannt.has(c.spalte) || SYSTEM_SPALTEN.has(c.spalte) || c.generiert || aus.has(c.spalte)) continue;
    const typ = feldTypAusDb(c.datentyp);
    if (!typ) continue;
    zusatz.push({
      key: c.spalte,
      label: spaltenLabel(c.spalte),
      typ,
      pflicht: c.pflicht || undefined,
      alias: [c.spalte, spaltenLabel(c.spalte)],
      hinweis: 'Feld aus Ihrer Datenbank',
      nurExakt: true,
    });
  }
  return { ziel: { ...basis, felder: [...felder, ...zusatz] }, fehlend, zusatz, ausDb: true };
}

// ---------------------------------------------------------------------------
// 3) Bankdaten erkennen (GEMEINSAM-Regel)
// ---------------------------------------------------------------------------

const BANK = /\b(iban|bic|swift|blz|bankleitzahl|bank[a-z]*|kontonummer|konto nr|kontonr|kontoinhaber|sepa|mandat[a-z]*|mandatsreferenz|kreditkarte|kartennummer|creditcard|credit card|account number|routing)\b/;

const EINWILLIGUNG = /\b(einwilligung[a-z]*|opt in|optin|double opt in|newsletter|werbung|marketing (erlaubt|einwilligung)|accepts email marketing|accepts sms marketing|email marketing|consent|dsgvo zustimmung)\b/;

/**
 * Werbe-Einwilligung (Newsletter, „Accepts Email Marketing", Opt-in)? Die
 * uebernimmt ARGONAUT nie aus einer Datei: ob sie rechtlich traegt, muss
 * vorher geprueft sein (UWG § 7). Sie steht mit Grund in „nicht übernommen".
 */
export function istEinwilligungSpalte(spalte: string): boolean {
  return EINWILLIGUNG.test(normal(spalte));
}

/**
 * Gesperrt aus Rechtsgruenden (Bank, Werbe-Einwilligung) oder weil das Ziel
 * es verbietet (Mitarbeiter: Lohn, SV-/Steuernummer, Zugaenge) — mit Grund.
 */
export function sperrGrund(spalte: string, ziel?: Pick<ImportZiel, 'sperren' | 'bankGrund'> | null): string | null {
  if (istBankSpalte(spalte)) return ziel?.bankGrund ?? GRUND.bank;
  if (istEinwilligungSpalte(spalte)) return GRUND.einwilligung;
  const n = normal(spalte);
  for (const s of ziel?.sperren ?? []) {
    if (new RegExp(`\\b(?:${s.muster})`).test(n)) return s.grund;
  }
  return null;
}

/** Ist das eine Spalte mit Bankverbindung, Mandat oder Kartendaten? */
export function istBankSpalte(spalte: string): boolean {
  return BANK.test(normal(spalte));
}

export const GRUND = {
  bank: 'Bankdaten (IBAN, BIC, Mandate) übernimmt ARGONAUT nur nach gemeinsamer Freigabe — sie bleiben in Ihrer Datei.',
  einwilligung: 'Werbe-Einwilligungen übernimmt ARGONAUT nicht aus einer Datei — ob sie rechtlich tragen, wird vorher geprüft.',
  leer: 'Die Spalte ist in allen Zeilen leer.',
  abgewaehlt: 'Sie haben „nicht übernehmen" gewählt.',
} as const;

// ---------------------------------------------------------------------------
// 4) Zuordnung vorschlagen — nichts faellt still weg
// ---------------------------------------------------------------------------

export type VorschlagOptionen = {
  /** Die angehakten Altsysteme (Reihenfolge = Prioritaet). */
  systeme?: readonly string[];
  /** Die Datei ist eine DATEV-Stammdaten-Datei. */
  datev?: boolean;
};

/** Belegte Spaltennamen aus Altsystemen und DATEV fuer ein Ziel. */
export function zusatzAliase(zielKey: string, opt: VorschlagOptionen = {}): Record<string, string[]> {
  const raus: Record<string, string[]> = {};
  const dazu = (quelle: Record<string, string[]>) => {
    for (const [feld, namen] of Object.entries(quelle)) {
      const liste = (raus[feld] ??= []);
      for (const n of namen) if (!liste.includes(n)) liste.push(n);
    }
  };
  if (opt.datev && zielKey === 'kontakte') dazu(DATEV_SPALTEN_KONTAKTE);
  if (opt.datev && zielKey === 'lieferanten') dazu(DATEV_SPALTEN_LIEFERANTEN);
  dazu(systemAliase(opt.systeme ?? [], zielKey));
  return raus;
}

export function spalteLeer(zeilen: readonly string[][], index: number): boolean {
  return zeilen.every((z) => String(z[index] ?? '').trim() === '');
}

/**
 * Vorschlag fuer die ganze Datei:
 *   erkannt -> Feld · Bankdaten -> nicht (Grund) · leer -> nicht (Grund) ·
 *   alles andere mit Inhalt -> Eigenes Feld.
 */
export function vorschlagMapping(
  kopf: readonly string[],
  zeilen: readonly string[][],
  ziel: ImportZiel,
  opt: VorschlagOptionen = {},
): Mapping {
  const geraten = errateMappingFuer([...kopf], ziel, zusatzAliase(ziel.key, opt));
  const raus: Mapping = {};
  kopf.forEach((spalte, i) => {
    if (sperrGrund(spalte, ziel)) { raus[spalte] = NICHT; return; }
    const feld = geraten[spalte];
    if (feld) { raus[spalte] = feld; return; }
    raus[spalte] = spalteLeer(zeilen, i) ? NICHT : EIGEN;
  });
  return raus;
}

/**
 * Eine Zuordnung, die der Nutzer geaendert (oder aus einem frueheren Import
 * gemerkt) hat, auf das aktuelle Ziel bringen: Felder, die es nicht (mehr)
 * gibt, werden zu Eigenen Feldern; Bankspalten sind immer gesperrt.
 */
export function bereinigeMapping(kopf: readonly string[], mapping: Mapping, ziel: ImportZiel): Mapping {
  const keys = new Set(ziel.felder.map((f) => f.key));
  const raus: Mapping = {};
  const vergeben = new Set<string>();
  for (const spalte of kopf) {
    const wert = mapping[spalte] ?? NICHT;
    if (sperrGrund(spalte, ziel)) { raus[spalte] = NICHT; continue; }
    if (wert === EIGEN || wert === NICHT) { raus[spalte] = wert; continue; }
    if (!keys.has(wert) || vergeben.has(wert)) { raus[spalte] = EIGEN; continue; }
    raus[spalte] = wert; vergeben.add(wert);
  }
  return raus;
}

// ---------------------------------------------------------------------------
// 5) Spalten-Bilanz: wohin ging jede Spalte?
// ---------------------------------------------------------------------------

export type SpaltenEintrag = {
  spalte: string;
  art: 'feld' | 'eigen' | 'nicht';
  /** Label des Zielfelds bzw. des Eigenen Feldes. */
  ziel?: string;
  grund?: string;
};

export type SpaltenBilanz = {
  eintraege: SpaltenEintrag[];
  gesamt: number;
  feld: number;
  eigen: number;
  nicht: number;
  /** muss 0 sein: Spalten ohne jede Zuordnung */
  verschluckt: number;
};

export function spaltenBilanz(
  kopf: readonly string[],
  zeilen: readonly string[][],
  mapping: Mapping,
  ziel: ImportZiel,
): SpaltenBilanz {
  const eintraege: SpaltenEintrag[] = kopf.map((spalte, i) => {
    const wert = mapping[spalte];
    const sperre = sperrGrund(spalte, ziel);
    if (sperre) return { spalte, art: 'nicht', grund: sperre };
    if (wert === EIGEN) return { spalte, art: 'eigen', ziel: spalte };
    if (wert && wert !== NICHT) {
      const f = ziel.felder.find((x) => x.key === wert);
      if (f) return { spalte, art: 'feld', ziel: f.label };
      return { spalte, art: 'eigen', ziel: spalte };
    }
    return { spalte, art: 'nicht', grund: spalteLeer(zeilen, i) ? GRUND.leer : GRUND.abgewaehlt };
  });
  const zaehle = (a: SpaltenEintrag['art']) => eintraege.filter((e) => e.art === a).length;
  const feld = zaehle('feld'); const eigen = zaehle('eigen'); const nicht = zaehle('nicht');
  return { eintraege, gesamt: kopf.length, feld, eigen, nicht, verschluckt: kopf.length - feld - eigen - nicht };
}

// ---------------------------------------------------------------------------
// 6) Eigene Felder
// ---------------------------------------------------------------------------

export type EigeneSpalte = { spalte: string; index: number; typ: 'text' | 'zahl' | 'datum' };

/**
 * Typ eines Eigenen Feldes aus den Werten raten. Vorsichtig: Postleitzahlen
 * und Telefonnummern mit fuehrender Null bleiben Text, sonst wird aus 01067
 * die Zahl 1067.
 */
export function eigenTyp(werte: readonly string[]): 'text' | 'zahl' | 'datum' {
  const w = werte.map((x) => String(x ?? '').trim()).filter(Boolean);
  if (w.length === 0) return 'text';
  if (w.every((x) => /^\d{1,4}[./-]\d{1,2}[./-]\d{2,4}$/.test(x) && leseDatumGenau(x).datum)) return 'datum';
  if (w.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && leseDatumGenau(x).datum)) return 'datum';
  if (w.some((x) => /^0\d/.test(x))) return 'text';
  if (w.every((x) => /^[-+]?[\d.,\s]+(\s?(€|eur|%))?$/i.test(x) && leseZahl(x) !== null)) return 'zahl';
  return 'text';
}

/** Welche Spalten werden Eigene Felder, mit geratenem Typ. */
export function eigeneSpalten(kopf: readonly string[], zeilen: readonly string[][], mapping: Mapping, ziel?: Pick<ImportZiel, 'sperren'> | null): EigeneSpalte[] {
  const raus: EigeneSpalte[] = [];
  kopf.forEach((spalte, index) => {
    if (mapping[spalte] !== EIGEN || sperrGrund(spalte, ziel)) return;
    raus.push({ spalte, index, typ: eigenTyp(zeilen.map((z) => z[index] ?? '')) });
  });
  return raus;
}

/** Wert fuer eigenes_feld_wert.wert (Text). Datum -> ISO, Zahl -> Punkt-Schreibweise. */
export function eigenerWert(typ: EigeneSpalte['typ'], roh: string): string {
  const s = String(roh ?? '').trim();
  if (!s) return '';
  if (typ === 'datum') return leseDatumGenau(s).datum ?? s;
  if (typ === 'zahl') { const n = leseZahl(s); return n === null ? s : String(n); }
  return s;
}

/** Die Eigenen-Feld-Werte EINER Dateizeile (nur gefuellte). */
export function eigeneWerteDerZeile(zeile: readonly string[], eigene: readonly EigeneSpalte[]): { spalte: string; wert: string }[] {
  const raus: { spalte: string; wert: string }[] = [];
  for (const e of eigene) {
    const wert = eigenerWert(e.typ, zeile[e.index] ?? '');
    if (wert) raus.push({ spalte: e.spalte, wert: wert.slice(0, 5000) });
  }
  return raus;
}

/**
 * Vorhandene Eigene Felder wiederfinden (gleiches Label, Gross/Klein egal) —
 * ein zweiter Import legt kein zweites „Kundengruppe" an.
 */
export function eigeneFelderZuordnen(
  eigene: readonly EigeneSpalte[],
  vorhanden: readonly { id: string; label: string }[],
): { vorhanden: Record<string, string>; neu: EigeneSpalte[] } {
  const nachLabel = new Map(vorhanden.map((f) => [normal(f.label), f.id]));
  const zugeordnet: Record<string, string> = {};
  const neu: EigeneSpalte[] = [];
  for (const e of eigene) {
    const id = nachLabel.get(normal(e.spalte));
    if (id) zugeordnet[e.spalte] = id; else neu.push(e);
  }
  return { vorhanden: zugeordnet, neu };
}

/** Feldtyp in eigenes_feld (dort heisst ja/nein anders). */
export function eigenFeldTyp(typ: EigeneSpalte['typ']): 'text' | 'zahl' | 'datum' {
  return typ;
}

// ---------------------------------------------------------------------------
// 7) Dubletten gegen den Bestand
// ---------------------------------------------------------------------------

/** Welche Erkennungsfelder dieses Ziel in DIESER Datenbank hat. */
export function erkennungsFelder(ziel: ImportZiel): string[] {
  const keys = new Set(ziel.felder.map((f) => f.key));
  // Paket 127: die Verweis-Spalte (mitarbeiter_id) ist kein Feld, steht aber
  // nach dem Verknuepfen im Satz — „mitarbeiter_id+art" erkennt den Bestand.
  if (ziel.kundeVerweis) keys.add(ziel.kundeVerweis.spalte);
  // Paket 129: ebenso die Nachschlag-Spalte (rezeptur_id+bezeichnung).
  if (ziel.nachschlag) keys.add(ziel.nachschlag.spalte);
  const liste = ziel.schluesselFelder ?? (ziel.schluessel ? [ziel.schluessel] : []);
  // „lieferant+belegnummer": nur, wenn es beide Spalten gibt
  return liste.filter((k) => k.split('+').every((t) => keys.has(t)));
}

/** Die Datenbank-Spalten zu den Erkennungsfeldern (fuer das select). */
export function erkennungsSpalten(felder: readonly string[]): string[] {
  const raus: string[] = [];
  for (const f of felder) for (const t of f.split('+')) if (!raus.includes(t)) raus.push(t);
  return raus;
}

/**
 * Paket 132: Zeitpunkte vergleichbar machen. Die Datenbank liefert
 * „2026-10-05T05:00:00+00:00", der Import schreibt „2026-10-05T05:00:00.000Z"
 * (oder ohne Zone „2026-10-05T05:00") — gleicher Zeitpunkt, anderer Text.
 * Ohne Angleichen kaeme derselbe Einsatz beim zweiten Import doppelt.
 */
export function vergleichsText(v: unknown): string {
  // Paket 141: Betraege angleichen — die Datenbank liefert numeric oft als
  // Text „100.00", der Import hat die Zahl 100. Nur Dezimalzahlen MIT Punkt;
  // ganze Zahlen bleiben Text (Nummern mit fuehrender 0 wie „007").
  const s = String(v ?? '').trim();
  if (/^-?\d+\.\d+$/.test(s)) return String(Number(s));
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2}(\.\d+)?)?(z|[+-]\d{2}(:?\d{2})?)?$/i);
  if (!m) return s.toLowerCase();
  const zone = m[5] ? (/^[+-]\d{2}$/.test(m[5]) ? `${m[5]}:00` : m[5]) : 'Z';
  const t = Date.parse(`${m[1]}T${m[2]}${m[3] ?? ':00'}${zone}`);
  return Number.isFinite(t) ? `@${t}` : s.toLowerCase();
}

function erkennungsWert(z: Record<string, unknown>, f: string): string {
  const teile = f.split('+').map((t) => vergleichsText(z[t]));
  return teile.every(Boolean) ? teile.join('|') : '';
}

/**
 * Aus den vorhandenen Eintraegen eine Nachschlage-Tabelle „feld:wert" -> id.
 * Der erste Eintrag gewinnt (aelteste id bei order('id')).
 */
export function baueBestandIndex(zeilen: readonly Record<string, unknown>[], felder: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const z of zeilen) {
    const id = z?.id;
    if (id === undefined || id === null) continue;
    for (const f of felder) {
      const v = erkennungsWert(z, f);
      if (v && !index.has(`${f}:${v}`)) index.set(`${f}:${v}`, String(id));
    }
  }
  return index;
}

/** Den vorhandenen Eintrag zu einem Satz finden — ueber irgendein Erkennungsfeld. */
export function findeImBestand(satz: Record<string, unknown>, felder: readonly string[], index: Map<string, string>): string | undefined {
  for (const f of felder) {
    const v = erkennungsWert(satz, f);
    if (!v) continue;
    const id = index.get(`${f}:${v}`);
    if (id) return id;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 7b) Schritt 3: Verknuepfung mit dem Kunden
// ---------------------------------------------------------------------------

export type KundeRoh = {
  id?: unknown; kundennummer?: unknown; email?: unknown; firma?: unknown;
  vorname?: unknown; nachname?: unknown; firma_id?: unknown; import_schluessel?: unknown;
};
export type KundenIndex = {
  nummer: Map<string, string[]>;
  email: Map<string, string[]>;
  name: Map<string, string[]>;
  firmaId: Map<string, string | null>;
  /** alle Kundennummern — fuer die Suche im Freitext */
  nummern: string[];
};

function klein(v: unknown): string { return String(v ?? '').trim().toLowerCase(); }
function dazu(m: Map<string, string[]>, k: string, id: string) {
  if (!k) return;
  const l = m.get(k) ?? [];
  if (!l.includes(id)) l.push(id);
  m.set(k, l);
}

/** Nachschlagetabellen aus den Kontakten des Betriebs. */
export function baueKundenIndex(kontakte: readonly KundeRoh[]): KundenIndex {
  const idx: KundenIndex = { nummer: new Map(), email: new Map(), name: new Map(), firmaId: new Map(), nummern: [] };
  for (const k of kontakte) {
    const id = k?.id ? String(k.id) : '';
    if (!id) continue;
    idx.firmaId.set(id, k.firma_id ? String(k.firma_id) : null);
    dazu(idx.nummer, klein(k.kundennummer), id);
    dazu(idx.nummer, klein(k.import_schluessel), id);
    dazu(idx.email, klein(k.email), id);
    dazu(idx.name, normal(String(k.firma ?? '')), id);
    dazu(idx.name, normal([k.vorname, k.nachname].filter(Boolean).join(' ')), id);
    dazu(idx.name, normal([k.nachname, k.vorname].filter(Boolean).join(' ')), id);
    const nr = String(k.kundennummer ?? '').trim();
    if (nr.length >= 3) idx.nummern.push(nr);
  }
  return idx;
}

export type KundeTreffer =
  | { art: 'gefunden'; id: string; firmaId: string | null; ueber: 'nummer' | 'email' | 'name' | 'text' }
  | { art: 'mehrdeutig'; anzahl: number }
  | { art: 'keiner' };

/**
 * Den Kunden zu einem Wert finden: Kundennummer, dann E-Mail, dann der
 * GENAUE Name (Firma oder Vor- + Nachname). Passen mehrere, wird nichts
 * verknuepft — ein falsch zugeordneter Offener Posten waere schlimmer als
 * keiner.
 */
export function findeKunde(wert: unknown, idx: KundenIndex): KundeTreffer {
  const w = klein(wert);
  if (!w) return { art: 'keiner' };
  const stufen: [Map<string, string[]>, string, 'nummer' | 'email' | 'name'][] = [
    [idx.nummer, w, 'nummer'], [idx.email, w, 'email'], [idx.name, normal(String(wert)), 'name'],
  ];
  for (const [m, k, ueber] of stufen) {
    const ids = m.get(k);
    if (!ids || ids.length === 0) continue;
    if (ids.length > 1) return { art: 'mehrdeutig', anzahl: ids.length };
    return { art: 'gefunden', id: ids[0], firmaId: idx.firmaId.get(ids[0]) ?? null, ueber };
  }
  return { art: 'keiner' };
}

/**
 * Eine bekannte Kundennummer im Freitext finden („Kunde K-1008 Schreinerei …").
 * Nur ganze Woerter, nur Nummern, die es im Bestand gibt — und nur, wenn
 * genau EINE vorkommt.
 */
export function kundeAusText(texte: readonly unknown[], idx: KundenIndex): KundeTreffer {
  const text = texte.map((t) => String(t ?? '')).join(' ');
  if (!text.trim() || idx.nummern.length === 0) return { art: 'keiner' };
  const gefunden = new Set<string>();
  for (const nr of idx.nummern) {
    const muster = new RegExp(`(^|[^\\p{L}\\p{N}-])${nr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}-])`, 'iu');
    if (muster.test(text)) {
      for (const id of idx.nummer.get(nr.toLowerCase()) ?? []) gefunden.add(id);
    }
  }
  if (gefunden.size === 0) return { art: 'keiner' };
  if (gefunden.size > 1) return { art: 'mehrdeutig', anzahl: gefunden.size };
  const id = [...gefunden][0];
  return { art: 'gefunden', id, firmaId: idx.firmaId.get(id) ?? null, ueber: 'text' };
}

/**
 * Einen Satz mit dem Kunden verknuepfen (nach ziel.kundeVerweis). Gibt den
 * Satz OHNE Hilfsfelder zurueck plus was passiert ist.
 */
export function verknuepfeKunde(
  satz: Record<string, unknown>,
  verweis: NonNullable<ImportZiel['kundeVerweis']>,
  idx: KundenIndex,
): { satz: Record<string, unknown>; treffer: KundeTreffer; gesucht: string } {
  const raus = fuerDatenbank(satz);
  let gesucht = String(satz.__kunde ?? '').trim();
  let treffer: KundeTreffer = gesucht ? findeKunde(gesucht, idx) : { art: 'keiner' };
  // Nummer nicht gefunden, aber ein Name dabei: dann ueber den Namen.
  const zweit = String(satz.__kunde2 ?? '').trim();
  if (treffer.art === 'keiner' && zweit) {
    const t2 = findeKunde(zweit, idx);
    if (t2.art !== 'keiner') { treffer = t2; gesucht = zweit; }
  }
  if (treffer.art === 'keiner' && !gesucht) {
    for (const f of verweis.ausFeldern ?? []) {
      const v = String(satz[f] ?? '').trim();
      if (!v) continue;
      gesucht = v;
      treffer = findeKunde(v, idx);
      break;
    }
  }
  if (treffer.art === 'keiner' && verweis.textSuche) {
    const t = kundeAusText(verweis.textSuche.map((f) => satz[f]), idx);
    if (t.art !== 'keiner') treffer = t;
  }
  if (treffer.art === 'gefunden') {
    raus[verweis.spalte] = treffer.id;
    if (verweis.firmaSpalte && treffer.firmaId && !raus[verweis.firmaSpalte]) raus[verweis.firmaSpalte] = treffer.firmaId;
  }
  return { satz: raus, treffer, gesucht };
}

/** Hilfsfelder (beginnen mit __) duerfen nie in die Datenbank. */
export function fuerDatenbank(satz: Record<string, unknown>): Record<string, unknown> {
  const raus: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(satz)) if (!k.startsWith('__')) raus[k] = v;
  return raus;
}

// ---------------------------------------------------------------------------
// 8) DATEV-Format
// ---------------------------------------------------------------------------

export type DatevKopf = {
  kennzeichen: 'EXTF' | 'DTVF';
  version: number | null;
  kategorie: number | null;
  formatname: string;
  sachkontenlaenge: number | null;
};

/** DATEV-Formatkategorien, die Martins Kunden mitbringen. */
export const DATEV_KATEGORIEN: Record<number, string> = {
  16: 'Debitoren/Kreditoren',
  20: 'Kontenbeschriftungen',
  21: 'Buchungsstapel',
  46: 'Zahlungsbedingungen',
  48: 'Diverse Adressen',
  65: 'Wiederkehrende Buchungen',
};

function ohneAnf(s: string): string {
  return String(s ?? '').trim().replace(/^"(.*)"$/, '$1').trim();
}

/** Erste Zeile „EXTF";700;16;"Debitoren/Kreditoren";5;… erkennen. */
export function erkenneDatev(text: string): DatevKopf | null {
  const erste = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  const teile = erste.split(';').map(ohneAnf);
  const k = (teile[0] ?? '').toUpperCase();
  if (k !== 'EXTF' && k !== 'DTVF') return null;
  const zahl = (x: string | undefined) => { const n = Number.parseInt(String(x ?? ''), 10); return Number.isFinite(n) ? n : null; };
  return {
    kennzeichen: k as 'EXTF' | 'DTVF',
    version: zahl(teile[1]),
    kategorie: zahl(teile[2]),
    formatname: teile[3] ?? '',
    sachkontenlaenge: zahl(teile[13]),
  };
}

/**
 * Eine DATEV-Datei lesen: die erste Zeile ist der Formatkopf, die zweite die
 * Spaltennamen, danach die Daten (Semikolon). Liefert dieselbe Tabelle wie
 * leseCsv — plus den erkannten Kopf und, was nicht importierbar ist.
 */
export function leseDatev(text: string): { tabelle: Tabelle; kopf: DatevKopf; fehler: string | null } | null {
  const kopf = erkenneDatev(text);
  if (!kopf) return null;
  const rest = String(text).replace(/^﻿/, '').replace(/^[^\n]*\n/, '');
  const tabelle = leseCsv(rest, ';');
  tabelle.kopf = eindeutigeKoepfe(tabelle.kopf);
  let fehler: string | null = null;
  if (kopf.kategorie !== null && kopf.kategorie !== 16) {
    const name = DATEV_KATEGORIEN[kopf.kategorie] ?? kopf.formatname ?? `Kategorie ${kopf.kategorie}`;
    fehler = kopf.kategorie === 21
      ? 'Das ist ein DATEV-Buchungsstapel (Buchungen), keine Stammdaten. Für den Umzug brauchen wir die Debitoren/Kreditoren: in DATEV „Bestand" › „Exportieren" › „DATEV-Format" › Reiter „Stammdaten".'
      : `Diese DATEV-Datei enthält „${name}". Übernommen werden Debitoren/Kreditoren (Stammdaten) — bitte diesen Export wählen.`;
  }
  return { tabelle, kopf, fehler };
}

export type KontoArt = 'debitor' | 'kreditor' | 'sachkonto' | 'unbekannt';

/**
 * Debitor oder Kreditor? Personenkonten sind eine Stelle laenger als die
 * Sachkonten (bei Sachkontenlaenge 4: fuenfstellig). 1…–6… = Debitor,
 * 7…–9… = Kreditor. Ohne bekannte Laenge: ab fuenf Stellen nach der ersten Ziffer.
 */
export function datevKontoArt(konto: unknown, sachkontenlaenge?: number | null): KontoArt {
  const s = String(konto ?? '').replace(/\s/g, '');
  if (!/^\d+$/.test(s)) return 'unbekannt';
  const laenge = sachkontenlaenge && sachkontenlaenge >= 4 && sachkontenlaenge <= 8 ? sachkontenlaenge : null;
  const person = laenge ? s.length === laenge + 1 : s.length >= 5;
  if (!person) return 'sachkonto';
  const erste = Number(s[0]);
  if (erste >= 1 && erste <= 6) return 'debitor';
  if (erste >= 7 && erste <= 9) return 'kreditor';
  return 'unbekannt';
}

/**
 * Ablehnung fuer pruefeAlles(opt.ablehnen): In einer DATEV-Datei, die als
 * Kunden importiert wird, sind Kreditoren falsch — und umgekehrt. Die Zeile
 * wird nicht verschluckt, sondern mit Grund gemeldet.
 */
export function datevAblehnung(
  zielKey: string,
  kontoIndex: number,
  sachkontenlaenge?: number | null,
): ((zeile: string[]) => { feld: string; grund: string } | null) | undefined {
  if (kontoIndex < 0 || (zielKey !== 'kontakte' && zielKey !== 'lieferanten')) return undefined;
  return (zeile: string[]) => {
    const konto = String(zeile[kontoIndex] ?? '').trim();
    const art = datevKontoArt(konto, sachkontenlaenge);
    if (zielKey === 'kontakte' && art === 'kreditor') {
      return { feld: 'Konto', grund: `Konto ${konto} ist ein Kreditor (Lieferant) — diese Zeile kommt beim Import als „Lieferanten" an.` };
    }
    if (zielKey === 'lieferanten' && art === 'debitor') {
      return { feld: 'Konto', grund: `Konto ${konto} ist ein Debitor (Kunde) — diese Zeile kommt beim Import als „Kunden & Kontakte" an.` };
    }
    return null;
  };
}

/** Zaehlt Debitoren und Kreditoren einer DATEV-Datei (fuer den Hinweis). */
export function datevZaehlen(zeilen: readonly string[][], kontoIndex: number, sachkontenlaenge?: number | null) {
  let debitoren = 0; let kreditoren = 0; let sonst = 0;
  for (const z of zeilen) {
    const a = datevKontoArt(z[kontoIndex], sachkontenlaenge);
    if (a === 'debitor') debitoren++; else if (a === 'kreditor') kreditoren++; else sonst++;
  }
  return { debitoren, kreditoren, sonst };
}

// ---------------------------------------------------------------------------
// 9) Welche Datei ist das? (Weg zum Lesen)
// ---------------------------------------------------------------------------

export type DateiArt = 'csv' | 'xls' | 'xlsx' | 'unbekannt';

/** Nach Dateiendung und — bei .xls — nach dem Inhalt (manche .xls sind in Wahrheit CSV/HTML). */
export function dateiArt(name: string, anfang?: Uint8Array): DateiArt {
  const endung = String(name ?? '').toLowerCase().split('.').pop() ?? '';
  const ole = !!anfang && anfang.length >= 8 && anfang[0] === 0xd0 && anfang[1] === 0xcf && anfang[2] === 0x11 && anfang[3] === 0xe0;
  const zip = !!anfang && anfang.length >= 2 && anfang[0] === 0x50 && anfang[1] === 0x4b;
  if (endung === 'xls') return ole ? 'xls' : zip ? 'xlsx' : anfang ? 'csv' : 'xls';
  if (endung === 'xlsx' || endung === 'xlsm') return 'xlsx';
  if (endung === 'csv' || endung === 'txt' || endung === 'tsv' || endung === '') return 'csv';
  if (ole) return 'xls';
  return 'unbekannt';
}

// ---------------------------------------------------------------------------
// 10) Paket 127: Verweise auf Mitarbeiter und Lieferanten
//
// Derselbe Suchweg wie bei den Kunden (Nummer -> E-Mail -> genauer Name,
// mehrdeutig nie) — nur die Quelle ist eine andere. Die Datensaetze werden
// in die Form eines Kunden gebracht, damit findeKunde() unveraendert bleibt.
// ---------------------------------------------------------------------------

/** Ist dieses Eigene Feld die Personalnummer? („Personalnummer", „Pers.-Nr.", „MA-Nr") */
export function istPersonalnummerLabel(label: unknown): boolean {
  const n = normal(String(label ?? ''));
  return /^(personalnummer|personalnr|personal nr|pers nr|persnr|mitarbeiternummer|mitarbeiter nr|ma nr|manr|employee id|employee number)$/.test(n);
}

export type MitarbeiterRoh = { id?: unknown; vorname?: unknown; nachname?: unknown; email?: unknown };

/**
 * Mitarbeiter als Verweis-Ziel. Die Personalnummer gibt es nicht als Spalte —
 * der Mitarbeiter-Import legt sie als Eigenes Feld an (Paket 126). `personalNr`
 * ist datensatz_id -> Wert dieses Eigenen Feldes.
 */
export function verweisAusMitarbeitern(liste: readonly MitarbeiterRoh[], personalNr: Readonly<Record<string, string>> = {}): KundeRoh[] {
  return liste.filter((m) => m?.id).map((m) => ({
    id: m.id, email: m.email, vorname: m.vorname, nachname: m.nachname,
    kundennummer: personalNr[String(m.id)] ?? null,
  }));
}

export type LieferantRoh = { id?: unknown; name?: unknown; email?: unknown; lieferantennummer?: unknown };

/** Lieferanten als Verweis-Ziel (Nummer, E-Mail, Name). */
export function verweisAusLieferanten(liste: readonly LieferantRoh[]): KundeRoh[] {
  return liste.filter((l) => l?.id).map((l) => ({ id: l.id, email: l.email, firma: l.name, kundennummer: l.lieferantennummer ?? null }));
}

// ---------------------------------------------------------------------------
// 11) Paket 128: Nachschlagen ueber einen Namen (Gruppe, Objekt …)
// ---------------------------------------------------------------------------

/** name (klein, getrimmt) -> id; mehrdeutige Namen fallen heraus (nie raten). */
export function nachschlagIndex(zeilen: readonly Record<string, unknown>[], nameSpalte: string): Map<string, string> {
  const index = new Map<string, string>();
  const doppelt = new Set<string>();
  for (const z of zeilen) {
    const n = String(z?.[nameSpalte] ?? '').trim().toLowerCase();
    if (!n || !z?.id) continue;
    if (index.has(n) && index.get(n) !== String(z.id)) { doppelt.add(n); continue; }
    index.set(n, String(z.id));
  }
  for (const n of doppelt) index.delete(n);
  return index;
}

/** Namen, die noch fehlen und angelegt werden sollen (je Name einmal, in Datei-Reihenfolge). */
export function fehlendeNamen(saetze: readonly Record<string, unknown>[], index: Map<string, string>): string[] {
  const raus: string[] = [];
  const gesehen = new Set<string>();
  for (const s of saetze) {
    const name = String(s.__nach ?? '').trim();
    const k = name.toLowerCase();
    if (!name || index.has(k) || gesehen.has(k)) continue;
    gesehen.add(k); raus.push(name);
  }
  return raus;
}

/**
 * Den Verweis eines Satzes setzen. Kein Treffer: der Name steht im Textfeld
 * („Gruppe: Halle 2") — verschluckt wird nichts.
 */
export function loeseNachschlag(
  satz: Record<string, unknown>,
  n: { spalte: string; textFeld?: string; label: string; ausFeld: string },
  index: Map<string, string> | null,
  virtuell: boolean,
): { satz: Record<string, unknown>; gefunden: boolean; name: string } {
  const name = String(satz.__nach ?? '').trim();
  const raus = fuerDatenbank(satz);
  if (!name) return { satz: raus, gefunden: false, name };
  const id = index?.get(name.toLowerCase());
  if (id) { raus[n.spalte] = id; return { satz: raus, gefunden: true, name }; }
  // Nur ein virtuelles Namensfeld braucht den Text — ein echtes Feld steht schon im Satz.
  if (virtuell && n.textFeld) {
    const zeile = `${n.label}: ${name}`;
    const alt = String(raus[n.textFeld] ?? '').trim();
    raus[n.textFeld] = alt ? `${alt}\n${zeile}` : zeile;
  }
  return { satz: raus, gefunden: false, name };
}

/** Paket 134: Grund, wenn ein Pflicht-Nachschlag (Kurs, Exposé) nicht gefunden wurde. */
export function nachschlagPflichtGrund(n: { label: string; mehrzahl?: string }, name: string): string {
  const was = n.mehrzahl ?? `die ${n.label}-Einträge`;
  return name
    ? `${n.label} „${name}" nicht gefunden. Bitte zuerst ${was} importieren (genau gleicher Name), dann diese Datei noch einmal.`
    : `Kein ${n.label} angegeben — ohne ${n.label} kann dieser Eintrag nicht angelegt werden.`;
}

// ---------------------------------------------------------------------------
// 12) Paket 129: uebergeordnete Eintraege anlegen (Rezept, Zuschnitt-Projekt, Tour)
// ---------------------------------------------------------------------------

/** Heute als JJJJ-MM-TT in deutscher Zeit (fuer '@heute'). */
export function heuteBerlin(jetzt: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(jetzt);
}

/**
 * Die Zeilen fuer neu anzulegende uebergeordnete Eintraege: Name, feste
 * Werte (anlegenMit, '@heute' ersetzt) und die Werte aus der ERSTEN Datei-
 * Zeile mit diesem Namen (__nachMit: Rezept-Typ, Tour-Datum …).
 */
export function elternZeilen(
  namen: readonly string[],
  saetze: readonly Record<string, unknown>[],
  n: { nameSpalte: string; anlegenMit?: Record<string, string | number | boolean | null> },
  owner: string,
  heute: string = heuteBerlin(),
): Record<string, unknown>[] {
  const ersteMit = new Map<string, Record<string, unknown>>();
  for (const s of saetze) {
    const k = String(s.__nach ?? '').trim().toLowerCase();
    if (k && !ersteMit.has(k) && s.__nachMit && typeof s.__nachMit === 'object') ersteMit.set(k, s.__nachMit as Record<string, unknown>);
  }
  return namen.map((name) => {
    const fest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(n.anlegenMit ?? {})) fest[k] = v === '@heute' ? heute : v;
    return { ...fest, ...(ersteMit.get(name.toLowerCase()) ?? {}), owner_user_id: owner, [n.nameSpalte]: name.slice(0, 200) };
  });
}

/**
 * Laufende Nummer je uebergeordnetem Eintrag in Datei-Reihenfolge (1, 2, 3 …),
 * nur wo die Datei selbst keine Nummer hat. Gibt die Nummer je Satz zurueck.
 */
export function positionenJeEintrag(saetze: readonly Record<string, unknown>[], spalte: string): (number | null)[] {
  const zaehler = new Map<string, number>();
  return saetze.map((s) => {
    const k = String(s.__nach ?? '').trim().toLowerCase();
    const n = (zaehler.get(k) ?? 0) + 1;
    zaehler.set(k, n);
    const vorhanden = s[spalte];
    return typeof vorhanden === 'number' && vorhanden > 0 ? null : n;
  });
}

// ---------------------------------------------------------------------------
// Paket 146: Positionen fuer eine Kind-Tabelle (Angebote -> angebot_positionen)
// ---------------------------------------------------------------------------

/**
 * Die gesammelten Positionen eines Kopfes (satz[jsonPositionen.spalte]) als
 * Zeilen fuer die Kind-Tabelle: laufende Position, Besitzer = Betrieb,
 * gesamt_netto = Menge x Einzelpreis (auf Cent), nur bekannte Schluessel.
 */
export function kindZeilen(
  positionen: unknown, kopfId: string, fremdschluessel: string, owner: string,
): Record<string, unknown>[] {
  if (!Array.isArray(positionen)) return [];
  const erlaubt = new Set(['bezeichnung', 'menge', 'einheit', 'einzelpreis', 'mwst_satz']);
  return positionen.filter((p) => p && typeof p === 'object').map((p, i) => {
    const z: Record<string, unknown> = { owner_user_id: owner, [fremdschluessel]: kopfId, position: i + 1 };
    for (const [k, v] of Object.entries(p as Record<string, unknown>)) if (erlaubt.has(k)) z[k] = v;
    const menge = typeof z.menge === 'number' ? z.menge : 1;
    z.menge = menge;
    if (typeof z.einzelpreis === 'number') z.gesamt_netto = centRunden(menge * z.einzelpreis);
    return z;
  });
}
