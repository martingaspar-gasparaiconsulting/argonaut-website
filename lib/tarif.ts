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
export type Monatspreis = { netto: number; mwst: number; brutto: number; positionen: PreisPosition[] };

/**
 * Monatspreis = Grundgebühr + Σ Sitze. Bei SOLO nur die Grundgebühr
 * (1 Voll-Nutzer + KI sind im All-in enthalten).
 */
export function monatspreis(key: StufeKey, sitze: Sitzbelegung = {}): Monatspreis {
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

  const mwst = Math.round(netto * MWST * 100) / 100;
  return { netto, mwst, brutto: netto + mwst, positionen };
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
