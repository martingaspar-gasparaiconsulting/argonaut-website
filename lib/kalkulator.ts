// ============================================================================
// ARGONAUT OS · lib/kalkulator.ts — Vorkalkulation fuer jedes Gewerk
//
// Beantwortet die Frage, die vor jedem Angebot steht:
//   "Was kostet mich das — und was muss ich verlangen?"
//
// Der Rechenweg ist die klassische Zuschlagskalkulation:
//
//   Einzelkosten            Material + Zeit + Energie + Fremdleistung
// + Gemeinkostenzuschlag    Werkstatt, Fahrzeuge, Buero, Versicherungen
// = SELBSTKOSTEN            ab hier verdient man nichts, man haelt nur die Null
// + Wagnis und Gewinn
// = Barverkaufspreis
// + Skonto und Rabatt       "im Hundert" — siehe unten
// = ANGEBOTSPREIS netto
//
// DER PUNKT, AN DEM SICH HANDWERKER REIHENWEISE VERRECHNEN:
// Skonto und Rabatt werden NICHT aufgeschlagen, sondern herausgerechnet.
// Wer 1.000 EUR braucht und 3 % Skonto gewaehrt, darf nicht 1.030 EUR
// anbieten (das waeren nach Abzug nur 999,10) — sondern 1.000 / 0,97 =
// 1.030,93 EUR. Bei jedem einzelnen Auftrag sind das Centbetraege, ueber ein
// Jahr sind es vierstellige Summen. Diese Datei rechnet es richtig.
//
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

export type PostenArt = 'material' | 'zeit' | 'energie' | 'fremd';

export type Posten = {
  id: string;
  art: PostenArt;
  bezeichnung: string;
  /** Verbrauch je EINER Einheit des Endprodukts (z.B. 0,25 l Farbe je m²). */
  menge_je_einheit: number;
  /** Einheit des Verbrauchs: l · kg · min · h · kWh · Stk … */
  einheit: string;
  /** Was EINE dieser Einheiten kostet (z.B. 14,90 EUR je Liter). */
  preis_je_einheit: number;
  /** Nur bei Material: Verschnitt, Bruch, Reste in Prozent. */
  verschnitt_prozent?: number;
};

export type Zuschlaege = {
  gemeinkosten_prozent: number;
  wagnis_gewinn_prozent: number;
  skonto_prozent: number;
  rabatt_prozent: number;
  mwst_satz: number;
};

export const ZUSCHLAEGE_STANDARD: Zuschlaege = {
  gemeinkosten_prozent: 15,
  wagnis_gewinn_prozent: 10,
  skonto_prozent: 0,
  rabatt_prozent: 0,
  mwst_satz: 19,
};

export type Kalkulation = {
  menge: number;
  einheit: string;
  posten: Posten[];
  zuschlaege: Zuschlaege;
};

export type Ergebnis = {
  /** Kosten je Kostenart, fuer die gesamte Menge. */
  material: number;
  zeit: number;
  energie: number;
  fremd: number;

  einzelkosten: number;
  gemeinkosten: number;
  selbstkosten: number;
  wagnis_gewinn: number;
  barverkaufspreis: number;
  angebotspreis_netto: number;
  mwst: number;
  angebotspreis_brutto: number;

  /** Alles noch einmal je Einheit — die Zahl, die man im Kopf behaelt. */
  je_einheit: {
    einzelkosten: number;
    selbstkosten: number;
    angebotspreis_netto: number;
  };

  /** Was der Auftrag an Zeit und Strom wirklich zieht. */
  zeit_minuten: number;
  zeit_minuten_je_einheit: number;
  energie_kwh: number;
  energie_kwh_je_einheit: number;

  deckungsbeitrag: number;
  marge_prozent: number;
  /** Ab wieviel Einheiten die Gemeinkosten gedeckt sind — nur informativ. */
  gewinn_je_einheit: number;
};

// ---------------------------------------------------------------------------
// Helfer
// ---------------------------------------------------------------------------

export function zahl(wert: unknown, standard = 0): number {
  if (typeof wert === 'number') return isNaN(wert) ? standard : wert;
  if (wert === null || wert === undefined || wert === '') return standard;
  let s = String(wert).trim().replace(/[€\s ]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? standard : n;
}

/** Auf Cent runden — konsequent an jeder Stelle, damit die Summen aufgehen. */
export function cent(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function euro(n: number): string {
  return (isFinite(n) ? n : 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

/** Prozentwert absichern: negative Zuschlaege und Skonto ab 100 % ergeben keinen Sinn. */
function proz(wert: unknown, max = 400): number {
  const n = zahl(wert, 0);
  if (n < 0) return 0;
  return n > max ? max : n;
}

/** Zeitangaben auf Minuten bringen, egal ob in h, min oder sek erfasst. */
export function inMinuten(menge: number, einheit: string): number {
  const e = (einheit || '').toLowerCase();
  if (e === 'h' || e === 'std' || e === 'stunde' || e === 'stunden') return menge * 60;
  if (e === 's' || e === 'sek' || e === 'sekunden') return menge / 60;
  return menge;   // min ist der Normalfall
}

/** Kosten EINES Postens fuer EINE Einheit des Endprodukts — inkl. Verschnitt. */
export function postenJeEinheit(p: Posten): number {
  const menge = zahl(p.menge_je_einheit);
  const preis = zahl(p.preis_je_einheit);
  const verschnitt = p.art === 'material' ? proz(p.verschnitt_prozent, 200) : 0;
  return menge * (1 + verschnitt / 100) * preis;
}

// ---------------------------------------------------------------------------
// Die Rechnung
// ---------------------------------------------------------------------------

export function rechne(k: Kalkulation): Ergebnis {
  const menge = Math.max(0, zahl(k.menge, 0));
  const posten = Array.isArray(k.posten) ? k.posten : [];
  const z = { ...ZUSCHLAEGE_STANDARD, ...(k.zuschlaege || {}) };

  const gemein = proz(z.gemeinkosten_prozent);
  const gewinn = proz(z.wagnis_gewinn_prozent);
  const skonto = proz(z.skonto_prozent, 99);
  const rabatt = proz(z.rabatt_prozent, 99);
  const mwst = proz(z.mwst_satz, 100);

  // 1) Einzelkosten je Kostenart
  let material = 0, zeitKosten = 0, energie = 0, fremd = 0;
  let zeitMinuten = 0, energieKwh = 0;

  for (const p of posten) {
    const jeEinheit = postenJeEinheit(p);
    const gesamt = jeEinheit * menge;

    if (p.art === 'material') material += gesamt;
    else if (p.art === 'zeit') {
      zeitKosten += gesamt;
      zeitMinuten += inMinuten(zahl(p.menge_je_einheit), p.einheit) * menge;
    } else if (p.art === 'energie') {
      energie += gesamt;
      if ((p.einheit || '').toLowerCase() === 'kwh') energieKwh += zahl(p.menge_je_einheit) * menge;
    } else fremd += gesamt;
  }

  const einzelkosten = cent(material + zeitKosten + energie + fremd);

  // 2) Gemeinkosten -> Selbstkosten
  const gemeinkosten = cent(einzelkosten * gemein / 100);
  const selbstkosten = cent(einzelkosten + gemeinkosten);

  // 3) Wagnis und Gewinn -> Barverkaufspreis
  const wagnisGewinn = cent(selbstkosten * gewinn / 100);
  const barverkaufspreis = cent(selbstkosten + wagnisGewinn);

  // 4) Skonto und Rabatt IM HUNDERT herausrechnen (nicht aufschlagen!)
  const teiler = (1 - skonto / 100) * (1 - rabatt / 100);
  const angebotNetto = cent(teiler > 0 ? barverkaufspreis / teiler : barverkaufspreis);

  const mwstBetrag = cent(angebotNetto * mwst / 100);
  const angebotBrutto = cent(angebotNetto + mwstBetrag);

  const proEinheit = (n: number) => (menge > 0 ? cent(n / menge) : 0);

  return {
    material: cent(material),
    zeit: cent(zeitKosten),
    energie: cent(energie),
    fremd: cent(fremd),

    einzelkosten,
    gemeinkosten,
    selbstkosten,
    wagnis_gewinn: wagnisGewinn,
    barverkaufspreis,
    angebotspreis_netto: angebotNetto,
    mwst: mwstBetrag,
    angebotspreis_brutto: angebotBrutto,

    je_einheit: {
      einzelkosten: proEinheit(einzelkosten),
      selbstkosten: proEinheit(selbstkosten),
      angebotspreis_netto: proEinheit(angebotNetto),
    },

    zeit_minuten: Math.round(zeitMinuten),
    zeit_minuten_je_einheit: menge > 0 ? Math.round((zeitMinuten / menge) * 10) / 10 : 0,
    energie_kwh: Math.round(energieKwh * 100) / 100,
    energie_kwh_je_einheit: menge > 0 ? Math.round((energieKwh / menge) * 1000) / 1000 : 0,

    deckungsbeitrag: cent(angebotNetto - einzelkosten),
    marge_prozent: angebotNetto > 0 ? Math.round(((angebotNetto - selbstkosten) / angebotNetto) * 1000) / 10 : 0,
    gewinn_je_einheit: proEinheit(cent(angebotNetto - selbstkosten)),
  };
}

/**
 * Umgekehrter Weg: Der Kunde nennt einen Preis — was bleibt uebrig?
 * Liefert die Marge, die bei diesem Wunschpreis noch bleibt.
 */
export function beiWunschpreis(k: Kalkulation, wunschNetto: number): {
  angebotspreis_netto: number;
  selbstkosten: number;
  gewinn: number;
  marge_prozent: number;
  traegt_sich: boolean;
} {
  const e = rechne(k);
  const preis = cent(Math.max(0, zahl(wunschNetto)));
  const gewinn = cent(preis - e.selbstkosten);
  return {
    angebotspreis_netto: preis,
    selbstkosten: e.selbstkosten,
    gewinn,
    marge_prozent: preis > 0 ? Math.round((gewinn / preis) * 1000) / 10 : 0,
    traegt_sich: gewinn >= 0,
  };
}

/** Eingabe-Pruefung in Klartext — bevor gerechneter Unsinn im Angebot landet. */
export function pruefeKalkulation(k: Kalkulation): string[] {
  const fehler: string[] = [];
  if (zahl(k.menge, 0) <= 0) fehler.push('Bitte die Menge angeben (z.B. 25 m²).');
  const posten = Array.isArray(k.posten) ? k.posten : [];
  if (posten.length === 0) fehler.push('Es ist noch keine Position erfasst.');

  posten.forEach((p, i) => {
    const nr = `Position ${i + 1}${p.bezeichnung ? ` („${p.bezeichnung}")` : ''}`;
    if (!String(p.bezeichnung ?? '').trim()) fehler.push(`${nr}: Bezeichnung fehlt.`);
    if (zahl(p.menge_je_einheit, 0) < 0) fehler.push(`${nr}: Verbrauch kann nicht negativ sein.`);
    if (zahl(p.preis_je_einheit, 0) < 0) fehler.push(`${nr}: Preis kann nicht negativ sein.`);
  });

  const z = k.zuschlaege || ZUSCHLAEGE_STANDARD;
  if (zahl(z.skonto_prozent, 0) + zahl(z.rabatt_prozent, 0) >= 100) {
    fehler.push('Skonto und Rabatt ergeben zusammen 100 % oder mehr — dann bleibt nichts übrig.');
  }
  return fehler;
}

/** Kurzer Klartext-Befund fuer den Chef — was die Zahlen bedeuten. */
export function befund(e: Ergebnis): { ton: 'gut' | 'achtung' | 'schlecht'; text: string } {
  if (e.einzelkosten <= 0) return { ton: 'achtung', text: 'Noch nichts zu rechnen — bitte Positionen erfassen.' };
  if (e.marge_prozent <= 0) {
    return { ton: 'schlecht', text: `Bei diesem Preis zahlen Sie drauf: die Selbstkosten liegen bei ${euro(e.selbstkosten)}.` };
  }
  if (e.marge_prozent < 5) {
    return { ton: 'achtung', text: `Nur ${e.marge_prozent} % Marge — ein einziger Fehltag frisst den Gewinn auf.` };
  }
  if (e.marge_prozent < 12) {
    return { ton: 'achtung', text: `${e.marge_prozent} % Marge — tragfähig, aber ohne Puffer für Nacharbeit.` };
  }
  return { ton: 'gut', text: `${e.marge_prozent} % Marge — ${euro(e.gewinn_je_einheit)} Gewinn je ${''}Einheit.` };
}

// ---------------------------------------------------------------------------
// Branchen-Vorlagen
//
// Das sind STARTWERTE, keine Wahrheit: sie sollen dem Betrieb das leere Blatt
// ersparen. Jeder Wert ist gedacht zum Ueberschreiben — deshalb wird in der
// Oberflaeche und in der Datenbank (`quelle`) unterschieden, ob eine Zahl aus
// der Vorlage stammt oder vom Betrieb selbst.
// ---------------------------------------------------------------------------

export type GewerkVorlage = {
  key: string;
  label: string;
  icon: string;
  einheit: string;
  beispielMenge: number;
  hinweis: string;
  posten: Array<Omit<Posten, 'id'>>;
};

export const GEWERKE: GewerkVorlage[] = [
  {
    key: 'maler', label: 'Maler & Lackierer', icon: '🎨', einheit: 'm²', beispielMenge: 80,
    hinweis: 'Zwei Anstriche auf vorbereitetem Untergrund, Innenwand.',
    posten: [
      { art: 'material', bezeichnung: 'Wandfarbe', menge_je_einheit: 0.35, einheit: 'l', preis_je_einheit: 4.5, verschnitt_prozent: 5 },
      { art: 'material', bezeichnung: 'Abdeckmaterial, Kreppband', menge_je_einheit: 1, einheit: 'Stk', preis_je_einheit: 0.35 },
      { art: 'zeit', bezeichnung: 'Streichen, zwei Anstriche', menge_je_einheit: 8, einheit: 'min', preis_je_einheit: 0.85 },
      { art: 'zeit', bezeichnung: 'Abkleben und Abdecken', menge_je_einheit: 3, einheit: 'min', preis_je_einheit: 0.85 },
    ],
  },
  {
    key: 'metallbau', label: 'Metallbau & Schlosserei', icon: '🔩', einheit: 'Stk', beispielMenge: 10,
    hinweis: 'Geschweißte Baugruppe aus Stahl, geschliffen und grundiert.',
    posten: [
      { art: 'material', bezeichnung: 'Stahl S235', menge_je_einheit: 4.2, einheit: 'kg', preis_je_einheit: 1.55, verschnitt_prozent: 12 },
      { art: 'material', bezeichnung: 'Schweißdraht, Gas', menge_je_einheit: 0.12, einheit: 'kg', preis_je_einheit: 6.2 },
      { art: 'zeit', bezeichnung: 'Zuschnitt und Vorrichten', menge_je_einheit: 14, einheit: 'min', preis_je_einheit: 1.05 },
      { art: 'zeit', bezeichnung: 'Schweißen', menge_je_einheit: 18, einheit: 'min', preis_je_einheit: 1.15 },
      { art: 'zeit', bezeichnung: 'Schleifen und Grundieren', menge_je_einheit: 9, einheit: 'min', preis_je_einheit: 0.95 },
      { art: 'energie', bezeichnung: 'Strom Schweißgerät und Absaugung', menge_je_einheit: 0.9, einheit: 'kWh', preis_je_einheit: 0.32 },
    ],
  },
  {
    key: 'baecker', label: 'Bäckerei & Konditorei', icon: '🥖', einheit: 'Stk', beispielMenge: 200,
    hinweis: 'Weizenbrötchen, 60 g Teigeinlage, Backverlust bereits eingerechnet.',
    posten: [
      { art: 'material', bezeichnung: 'Weizenmehl Type 550', menge_je_einheit: 0.038, einheit: 'kg', preis_je_einheit: 0.78, verschnitt_prozent: 2 },
      { art: 'material', bezeichnung: 'Hefe, Salz, Malz', menge_je_einheit: 0.004, einheit: 'kg', preis_je_einheit: 2.4 },
      { art: 'material', bezeichnung: 'Verpackung, Tüte', menge_je_einheit: 1, einheit: 'Stk', preis_je_einheit: 0.02 },
      { art: 'zeit', bezeichnung: 'Teigführung, Aufarbeiten, Backen', menge_je_einheit: 0.6, einheit: 'min', preis_je_einheit: 0.55 },
      { art: 'energie', bezeichnung: 'Ofen und Gärraum', menge_je_einheit: 0.055, einheit: 'kWh', preis_je_einheit: 0.32 },
    ],
  },
  {
    key: 'elektro', label: 'Elektrotechnik', icon: '⚡', einheit: 'Stk', beispielMenge: 24,
    hinweis: 'Steckdose im Altbau setzen: Dose, Leitung, Anschluss.',
    posten: [
      { art: 'material', bezeichnung: 'Steckdose mit Rahmen', menge_je_einheit: 1, einheit: 'Stk', preis_je_einheit: 6.9 },
      { art: 'material', bezeichnung: 'Leitung NYM 3×1,5', menge_je_einheit: 4.5, einheit: 'm', preis_je_einheit: 1.15, verschnitt_prozent: 8 },
      { art: 'material', bezeichnung: 'Gerätedose, Kleinmaterial', menge_je_einheit: 1, einheit: 'Stk', preis_je_einheit: 1.4 },
      { art: 'zeit', bezeichnung: 'Stemmen, Verlegen, Anschließen', menge_je_einheit: 26, einheit: 'min', preis_je_einheit: 1.1 },
    ],
  },
  {
    key: 'tischler', label: 'Tischlerei & Schreinerei', icon: '🪵', einheit: 'm²', beispielMenge: 12,
    hinweis: 'Möbelfront aus beschichteter Platte, gekantet und montiert.',
    posten: [
      { art: 'material', bezeichnung: 'Spanplatte beschichtet 19 mm', menge_je_einheit: 1, einheit: 'm²', preis_je_einheit: 21.5, verschnitt_prozent: 18 },
      { art: 'material', bezeichnung: 'Kantenband, Leim, Beschläge', menge_je_einheit: 1, einheit: 'Satz', preis_je_einheit: 7.8 },
      { art: 'zeit', bezeichnung: 'Zuschnitt und Kanten', menge_je_einheit: 22, einheit: 'min', preis_je_einheit: 1.05 },
      { art: 'zeit', bezeichnung: 'Montage beim Kunden', menge_je_einheit: 15, einheit: 'min', preis_je_einheit: 1.05 },
      { art: 'energie', bezeichnung: 'Maschinen und Absaugung', menge_je_einheit: 0.6, einheit: 'kWh', preis_je_einheit: 0.32 },
    ],
  },
  {
    key: 'galabau', label: 'Garten- & Landschaftsbau', icon: '🌿', einheit: 'm²', beispielMenge: 120,
    hinweis: 'Pflasterfläche mit Tragschicht, Betonstein.',
    posten: [
      { art: 'material', bezeichnung: 'Betonpflaster', menge_je_einheit: 1, einheit: 'm²', preis_je_einheit: 18.5, verschnitt_prozent: 6 },
      { art: 'material', bezeichnung: 'Schotter und Splitt', menge_je_einheit: 0.35, einheit: 't', preis_je_einheit: 32 },
      { art: 'zeit', bezeichnung: 'Aushub und Tragschicht', menge_je_einheit: 12, einheit: 'min', preis_je_einheit: 0.95 },
      { art: 'zeit', bezeichnung: 'Pflastern und Verfugen', menge_je_einheit: 18, einheit: 'min', preis_je_einheit: 0.95 },
      { art: 'fremd', bezeichnung: 'Entsorgung Aushub', menge_je_einheit: 0.3, einheit: 't', preis_je_einheit: 24 },
    ],
  },
  {
    key: 'kfz', label: 'KFZ-Werkstatt', icon: '🚗', einheit: 'Auftrag', beispielMenge: 1,
    hinweis: 'Inspektion mit Ölwechsel, Mittelklasse.',
    posten: [
      { art: 'material', bezeichnung: 'Motoröl 5W-30', menge_je_einheit: 5.5, einheit: 'l', preis_je_einheit: 6.4 },
      { art: 'material', bezeichnung: 'Ölfilter, Dichtring', menge_je_einheit: 1, einheit: 'Satz', preis_je_einheit: 14.9 },
      { art: 'material', bezeichnung: 'Luft- und Innenraumfilter', menge_je_einheit: 1, einheit: 'Satz', preis_je_einheit: 27.5 },
      { art: 'zeit', bezeichnung: 'Inspektion nach Herstellervorgabe', menge_je_einheit: 1.2, einheit: 'h', preis_je_einheit: 82 },
      { art: 'fremd', bezeichnung: 'Altöl-Entsorgung', menge_je_einheit: 1, einheit: 'Stk', preis_je_einheit: 4.5 },
    ],
  },
  {
    key: 'reinigung', label: 'Gebäudereinigung', icon: '🧽', einheit: 'm²', beispielMenge: 450,
    hinweis: 'Unterhaltsreinigung Büro, einmal wöchentlich.',
    posten: [
      { art: 'material', bezeichnung: 'Reinigungsmittel, Tücher', menge_je_einheit: 1, einheit: 'm²', preis_je_einheit: 0.02 },
      { art: 'zeit', bezeichnung: 'Reinigungsleistung', menge_je_einheit: 0.9, einheit: 'min', preis_je_einheit: 0.42 },
      { art: 'zeit', bezeichnung: 'An- und Abfahrt, Rüstzeit', menge_je_einheit: 0.15, einheit: 'min', preis_je_einheit: 0.42 },
    ],
  },
];

export function gewerkDef(key: string): GewerkVorlage | undefined {
  return GEWERKE.find((g) => g.key === key);
}

/** Baut aus einer Gewerk-Vorlage eine startklare Kalkulation. */
export function ausVorlage(key: string, idGeber: () => string): Kalkulation | null {
  const g = gewerkDef(key);
  if (!g) return null;
  return {
    menge: g.beispielMenge,
    einheit: g.einheit,
    posten: g.posten.map((p) => ({ ...p, id: idGeber() })),
    zuschlaege: { ...ZUSCHLAEGE_STANDARD },
  };
}
