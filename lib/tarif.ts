// ============================================================================
// ARGONAUT OS · lib/tarif.ts — EINE Quelle der Wahrheit für alle Preise
//
// Website (components/Pricing.tsx), AGB (app/agb/page.tsx), der Tarif-Rechner
// und die Rechnungs-Logik ziehen AUSSCHLIESSLICH von hier. Nie wieder Zahlen an
// mehreren Stellen pflegen.
//
// Preisstand: 26.07.2026 (von Martin freigegeben). Alle Beträge NETTO, zzgl.
// 19 % MwSt. Keine Imports, keine Hooks — von Client- UND Server-Code nutzbar.
// ============================================================================

export type StufeKey = 'solo' | 'mini' | 'klein' | 'mittel' | 'gross' | 'enterprise';
export type SitzTyp = 'voll' | 'standard' | 'self_service';

export const MWST = 0.19;
/** Jahreszahlung: 2 Monate geschenkt (= 10 statt 12 Monatsbeiträge). */
export const JAHR_FREIMONATE = 2;

export type Stufe = {
  key: StufeKey;
  name: string;
  /** Anzeige, z. B. "1–2". */
  personen: string;
  minMa: number;
  maxMa: number | null;      // null = nach oben offen
  grundgebuehr: number;      // €/Monat netto
  onboarding: number;        // einmalig netto
  /** true = All-in (SOLO): 1 Voll-Nutzer + KI enthalten, keine getrennten Sitze. */
  allIn?: boolean;
  /** true = Betrag ist ein "ab"-Preis (Enterprise, individuell). */
  abPreis?: boolean;
  hinweis?: string;
};

// --- Die Stufen (Grundgebühr + einmaliges Onboarding je Betriebsgröße) ------
export const STUFEN: Stufe[] = [
  { key: 'solo',       name: 'SOLO',       personen: '1–2',     minMa: 1,   maxMa: 2,    grundgebuehr: 499,  onboarding: 990,   allIn: true, hinweis: 'All-in: inkl. 1 Voll-Nutzer + KI — keine getrennten Sitze' },
  { key: 'mini',       name: 'MINI',       personen: '3–9',     minMa: 3,   maxMa: 9,    grundgebuehr: 790,  onboarding: 1500,  hinweis: 'ab hier Sitze getrennt hinzu' },
  { key: 'klein',      name: 'KLEIN',      personen: '10–24',   minMa: 10,  maxMa: 24,   grundgebuehr: 1290, onboarding: 2900 },
  { key: 'mittel',     name: 'MITTEL',     personen: '25–99',   minMa: 25,  maxMa: 99,   grundgebuehr: 2690, onboarding: 4900,  hinweis: 'Sitz-Staffel greift' },
  { key: 'gross',      name: 'GROSS',      personen: '100–499', minMa: 100, maxMa: 499,  grundgebuehr: 4900, onboarding: 9900 },
  { key: 'enterprise', name: 'ENTERPRISE', personen: '500+',    minMa: 500, maxMa: null, grundgebuehr: 7900, onboarding: 14900, abPreis: true, hinweis: 'individuell, nach oben offen — verhandelbar' },
];

// --- Sitz-Preise je Nutzer-Typ. Staffel an die Betriebsgröße gekoppelt: -----
//     Band 0 = MINI/KLEIN · Band 1 = MITTEL · Band 2 = GROSS · Band 3 = ENTERPRISE.
export const SITZ: Record<SitzTyp, { name: string; wer: string; preise: [number, number, number, number] }> = {
  voll:         { name: 'Voll-Nutzer',     wer: 'Chef, GF, Büro, Meister, Verwaltung',        preise: [380, 320, 260, 190] },
  standard:     { name: 'Standard-Nutzer', wer: 'operative Nutzung (Monteure, Verkauf, Fachkräfte)', preise: [170, 145, 120, 90] },
  self_service: { name: 'Self-Service',    wer: 'eingeschränkt: Zeiterfassung & eigene Daten', preise: [19, 19, 19, 14] },
};

// --- Fair-Use KI-Nutzung ----------------------------------------------------
export const FAIR_USE: { stufe: string; calls: string; aufpreis: number | null; text: string }[] = [
  { stufe: 'Inklusive',  calls: 'bis 10.000',       aufpreis: 0,    text: '0 € · enthalten' },
  { stufe: 'Heavy',      calls: '10.000 – 50.000',  aufpreis: 200,  text: '+ 200 € / Monat' },
  { stufe: 'Enterprise', calls: 'über 50.000',      aufpreis: null, text: 'individuell' },
];

// --- Zusatzspeicher ---------------------------------------------------------
export const SPEICHER_INKL_PRO_MA_GB = 100;
export const SPEICHER_BLOCK_GB = 100;
export const SPEICHER_BLOCK_PREIS = 5;

// --- Laufzeit-Rabatte (auf die monatlichen Gebühren, nicht aufs Onboarding) --
export const LAUFZEIT_RABATT: { monate: number; prozent: number }[] = [
  { monate: 24, prozent: 5 },
  { monate: 36, prozent: 8 },
];

// --- Laufzeit: waehlbare Vertragslaufzeiten + Rabatt-Rechnung ---------------
// AGB § 5.1: Mindestlaufzeit 12 Monate; wahlweise 24 oder 36 Monate mit Rabatt.
// AGB § 3.6: Der Rabatt gilt NUR auf die monatlichen Gebuehren (Grundgebuehr +
// Nutzer-Sitze). Die einmalige Einrichtungsgebuehr ist ausdruecklich AUSGENOMMEN.
export const LAUFZEITEN = [12, 24, 36] as const;
export type LaufzeitMonate = (typeof LAUFZEITEN)[number];
export const LAUFZEIT_STANDARD: LaufzeitMonate = 12;

/** Kaufmaennisch auf 2 Nachkommastellen runden. */
function rund(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Rabattsatz in Prozent fuer eine Laufzeit. 12 Monate = 0 % (Mindestlaufzeit).
 * Laengere Laufzeiten als 36 Monate erhalten den hoechsten hinterlegten Satz.
 */
export function laufzeitRabattProzent(monate: number): number {
  const m = Math.round(Number(monate) || 0);
  let prozent = 0;
  for (const r of LAUFZEIT_RABATT) {
    if (m >= r.monate && r.prozent > prozent) prozent = r.prozent;
  }
  return prozent;
}

/** Laufzeit-Auswahl fuers UI — Beschriftung inklusive. */
export function laufzeitOptionen(): { monate: LaufzeitMonate; prozent: number; label: string }[] {
  return LAUFZEITEN.map((monate) => {
    const prozent = laufzeitRabattProzent(monate);
    return {
      monate,
      prozent,
      label: prozent ? `${monate} Monate (\u2212${prozent}\u00a0%)` : `${monate} Monate`,
    };
  });
}

// ---------------------------------------------------------------------------
// Reine Helfer (keine Seiteneffekte)
// ---------------------------------------------------------------------------

export function getStufe(key: StufeKey): Stufe {
  const s = STUFEN.find((x) => x.key === key);
  if (!s) throw new Error(`Unbekannte Tarif-Stufe: ${key}`);
  return s;
}

/** Passende Stufe zur Mitarbeiterzahl. */
export function stufeFuerMitarbeiter(anzahl: number): Stufe {
  return STUFEN.find((s) => anzahl >= s.minMa && (s.maxMa === null || anzahl <= s.maxMa)) ?? STUFEN[STUFEN.length - 1];
}

/** Größen-Band (0..3) für die Sitz-Staffel. SOLO nutzt Band 0 (hat aber keine getrennten Sitze). */
export function bandIndex(key: StufeKey): 0 | 1 | 2 | 3 {
  switch (key) {
    case 'mittel': return 1;
    case 'gross': return 2;
    case 'enterprise': return 3;
    default: return 0; // solo, mini, klein
  }
}

/** Preis eines Sitzes je Typ in der gegebenen Stufe. */
export function sitzPreis(typ: SitzTyp, key: StufeKey): number {
  return SITZ[typ].preise[bandIndex(key)];
}

export type Sitzbelegung = { voll?: number; standard?: number; self_service?: number };
export type PreisPosition = { label: string; betrag: number };
export type Monatspreis = {
  /** Zu zahlender Nettobetrag je Monat — bereits NACH Laufzeit-Rabatt. */
  netto: number;
  mwst: number;
  brutto: number;
  positionen: PreisPosition[];
  /** Netto vor Abzug des Laufzeit-Rabatts (Listenpreis). */
  nettoVorRabatt: number;
  /** Gewaehlte Laufzeit in Monaten. */
  laufzeitMonate: number;
  /** Angewandter Rabattsatz in Prozent (0 bei 12 Monaten). */
  rabattProzent: number;
  /** Ersparnis je Monat in Euro. */
  rabattBetrag: number;
};

/**
 * Monatspreis = Grundgebühr + Σ Sitze − Laufzeit-Rabatt.
 * Bei SOLO nur die Grundgebühr (1 Voll-Nutzer + KI sind im All-in enthalten).
 *
 * Der dritte Parameter ist optional; ohne Angabe wird mit der Mindestlaufzeit
 * von 12 Monaten gerechnet, also OHNE Rabatt. Bestehende Aufrufer ohne
 * Laufzeit-Angabe liefern deshalb exakt dasselbe Ergebnis wie bisher.
 */
export function monatspreis(
  key: StufeKey,
  sitze: Sitzbelegung = {},
  laufzeitMonate: number = LAUFZEIT_STANDARD,
): Monatspreis {
  const stufe = getStufe(key);
  const positionen: PreisPosition[] = [{ label: `Grundgebühr ${stufe.name}`, betrag: stufe.grundgebuehr }];
  let netto = stufe.grundgebuehr;

  if (!stufe.allIn) {
    (['voll', 'standard', 'self_service'] as SitzTyp[]).forEach((typ) => {
      const anzahl = sitze[typ] ?? 0;
      if (anzahl > 0) {
        const einzel = sitzPreis(typ, key);
        const betrag = anzahl * einzel;
        positionen.push({ label: `${anzahl} × ${SITZ[typ].name} (${einzel} €)`, betrag });
        netto += betrag;
      }
    });
  }

  const nettoVorRabatt = rund(netto);
  const rabattProzent = laufzeitRabattProzent(laufzeitMonate);
  const rabattBetrag = rund((nettoVorRabatt * rabattProzent) / 100);
  if (rabattBetrag > 0) {
    positionen.push({
      label: `Laufzeit-Rabatt ${Math.round(laufzeitMonate)} Monate (\u2212${rabattProzent}\u00a0%)`,
      betrag: -rabattBetrag,
    });
  }
  const nettoNachRabatt = rund(nettoVorRabatt - rabattBetrag);
  const mwst = rund(nettoNachRabatt * MWST);

  return {
    netto: nettoNachRabatt,
    mwst,
    brutto: rund(nettoNachRabatt + mwst),
    positionen,
    nettoVorRabatt,
    laufzeitMonate: Math.round(Number(laufzeitMonate) || LAUFZEIT_STANDARD),
    rabattProzent,
    rabattBetrag,
  };
}

export type Angebotssumme = {
  monatlich: Monatspreis;
  /** Einmalige Einrichtung — NIE rabattiert (AGB § 3.6). */
  einrichtungNetto: number;
  einrichtungMwst: number;
  einrichtungBrutto: number;
  /** Was im ersten Monat insgesamt faellig wird (brutto). */
  ersterMonatBrutto: number;
  /** Ersparnis ueber die gesamte Laufzeit gegenueber 12 Monaten ohne Rabatt. */
  ersparnisGesamt: number;
};

/**
 * Komplette Angebotssumme fuer die Bestellstrecke: monatliche Gebuehren mit
 * Laufzeit-Rabatt PLUS die einmalige Einrichtung ohne Rabatt.
 * istBestandskunde = true -> keine erneute Einrichtungsgebuehr (Upgrade-Regel).
 */
export function angebotssumme(
  key: StufeKey,
  sitze: Sitzbelegung = {},
  laufzeitMonate: number = LAUFZEIT_STANDARD,
  istBestandskunde = false,
): Angebotssumme {
  const monatlich = monatspreis(key, sitze, laufzeitMonate);
  const einrichtungNetto = onboardingFuer(key, istBestandskunde);
  const einrichtungMwst = rund(einrichtungNetto * MWST);
  return {
    monatlich,
    einrichtungNetto,
    einrichtungMwst,
    einrichtungBrutto: rund(einrichtungNetto + einrichtungMwst),
    ersterMonatBrutto: rund(monatlich.brutto + einrichtungNetto + einrichtungMwst),
    ersparnisGesamt: rund(monatlich.rabattBetrag * monatlich.laufzeitMonate),
  };
}

/** Jahrespreis bei Jahreszahlung (2 Monate frei). */
export function jahrespreisNetto(monatlichNetto: number): number {
  return monatlichNetto * (12 - JAHR_FREIMONATE);
}

/**
 * Onboarding-Betrag für einen Vorgang.
 * UPGRADE-REGEL: Ein BESTANDSKUNDE zahlt beim Wechsel in eine höhere Stufe
 * KEIN erneutes Onboarding (er ist bereits eingerichtet). Nur bei einem
 * echten Neukunden fällt das einmalige Onboarding der Zielstufe an.
 */
export function onboardingFuer(key: StufeKey, istBestandskunde: boolean): number {
  return istBestandskunde ? 0 : getStufe(key).onboarding;
}

/**
 * Beschreibt einen Stufen-Wechsel eines Bestandskunden:
 * neue Grundgebühr ab dem Wechsel, KEIN erneutes Onboarding.
 */
export function stufenWechsel(vonKey: StufeKey, nachKey: StufeKey): {
  neueGrundgebuehr: number; onboarding: 0; differenzGrundgebuehr: number;
} {
  return {
    neueGrundgebuehr: getStufe(nachKey).grundgebuehr,
    onboarding: 0,
    differenzGrundgebuehr: getStufe(nachKey).grundgebuehr - getStufe(vonKey).grundgebuehr,
  };
}

/** Einheitliche Euro-Formatierung (de-DE). */
export function euro(n: number): string {
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
}

// ============================================================================
// MULTISTANDORT — Preis-Richtlinie für Betriebe mit mehreren Filialen/Standorten
//
// Modell (von Martin freigegeben 02.08.2026):
//  - Sitze/Mitarbeiterkosten unverändert (pro echtem Nutzer, siehe monatspreis).
//  - Grundgebühr + Onboarding je Standort nach DESSEN eigener Größenstufe.
//  - Der größte Standort = Hauptsitz zahlt 100 %.
//  - Jeder weitere Standort zahlt nur STANDORT_FAKTOR (40 %) seiner eigenen
//    Stufe — für Grundgebühr UND Onboarding (ein Setup zentral, Filialen dranhängen).
// Reine Richtlinie fürs Beratungsgespräch — keine Abbuchung.
// ============================================================================

/** Rabatt-Faktor für jeden weiteren Standort (Grundgebühr + Onboarding). */
export const STANDORT_FAKTOR = 0.4;

export type StandortEingabe = { name?: string; mitarbeiter: number };
export type StandortZeile = {
  name: string;
  mitarbeiter: number;
  stufe: Stufe;
  istHauptsitz: boolean;
  faktor: number;         // 1 = Hauptsitz, sonst STANDORT_FAKTOR
  grundgebuehr: number;   // €/Monat netto (bereits mit Faktor)
  onboarding: number;     // einmalig netto (bereits mit Faktor)
};
export type MultiStandortErgebnis = {
  zeilen: StandortZeile[];
  grundgebuehrGesamt: number;
  onboardingGesamt: number;
  gesamtMitarbeiter: number;
};

/** Nur Standorte mit mindestens 1 Mitarbeiter. */
function bereinigeStandorte(standorte: StandortEingabe[]): StandortEingabe[] {
  return standorte.filter((s) => Number(s.mitarbeiter) > 0);
}

/**
 * Je-Standort-Variante: größter Standort = Hauptsitz (100 %), jeder weitere
 * 40 % SEINER eigenen Größenstufe (Grundgebühr + Onboarding).
 */
export function multiStandort(standorte: StandortEingabe[]): MultiStandortErgebnis {
  const liste = bereinigeStandorte(standorte);
  if (liste.length === 0) {
    return { zeilen: [], grundgebuehrGesamt: 0, onboardingGesamt: 0, gesamtMitarbeiter: 0 };
  }
  // Hauptsitz = meiste Mitarbeiter; bei Gleichstand der erste.
  let hauptIdx = 0;
  liste.forEach((s, i) => { if (s.mitarbeiter > liste[hauptIdx].mitarbeiter) hauptIdx = i; });

  const zeilen: StandortZeile[] = liste.map((s, i) => {
    const stufe = stufeFuerMitarbeiter(s.mitarbeiter);
    const istHauptsitz = i === hauptIdx;
    const faktor = istHauptsitz ? 1 : STANDORT_FAKTOR;
    return {
      name: s.name?.trim() || (istHauptsitz ? 'Hauptsitz' : `Standort ${i + 1}`),
      mitarbeiter: s.mitarbeiter,
      stufe,
      istHauptsitz,
      faktor,
      grundgebuehr: Math.round(stufe.grundgebuehr * faktor),
      onboarding: Math.round(stufe.onboarding * faktor),
    };
  });

  return {
    zeilen,
    grundgebuehrGesamt: zeilen.reduce((a, z) => a + z.grundgebuehr, 0),
    onboardingGesamt: zeilen.reduce((a, z) => a + z.onboarding, 0),
    gesamtMitarbeiter: liste.reduce((a, s) => a + s.mitarbeiter, 0),
  };
}

/**
 * Firmenweite Variante: alle Mitarbeiter zusammengezählt → EINE Größenstufe
 * fürs ganze Unternehmen (ein Vertrag). Vergleichsgröße zur je-Standort-Variante.
 */
export function firmenweit(standorte: StandortEingabe[]): {
  stufe: Stufe; grundgebuehr: number; onboarding: number; gesamtMitarbeiter: number;
} {
  const total = bereinigeStandorte(standorte).reduce((a, s) => a + s.mitarbeiter, 0);
  const stufe = stufeFuerMitarbeiter(Math.max(1, total));
  return { stufe, grundgebuehr: stufe.grundgebuehr, onboarding: stufe.onboarding, gesamtMitarbeiter: total };
}
