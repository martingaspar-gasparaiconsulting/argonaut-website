// ============================================================================
// ARGONAUT OS · lib/lpAnalytics.ts — reine Helfer fuer Landingpage-Funnel
// (Marketing-Autopilot · Funnel-Analytics Paket 1)
//
// KEINE Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen (node-testbar).
// Rechnet rohe Ereignis-Zeilen (typ: aufruf|anmeldung|bestaetigung) je Landingpage
// zu einem Funnel + Quoten zusammen.
// ============================================================================

export type LpEreignisTyp = 'aufruf' | 'anmeldung' | 'bestaetigung';

export type LpEreignis = {
  landingpage_id: string | null;
  typ: string | null;
  /** Anonyme Tageskennung; NULL bei Altdaten (dann zaehlt jede Zeile einzeln). */
  besucher_hash?: string | null;
};

export type LpFunnel = {
  landingpage_id: string;
  aufrufe: number;
  anmeldungen: number;
  bestaetigungen: number;
  quoteAnmeldung: number;    // Anmeldungen / Aufrufe (in %)
  quoteBestaetigung: number; // Bestaetigungen / Anmeldungen (in %)
};

export type LpFunnelGesamt = {
  aufrufe: number;
  anmeldungen: number;
  bestaetigungen: number;
  quoteAnmeldung: number;
  quoteBestaetigung: number;
};

// ---------------------------------------------------------------------------
// ENTDOPPELUNG
//
// Ohne sie zaehlt jeder Reload als neuer Aufruf. Das druckt die
// Conversion-Quote UND blaeht die Fallzahl im A-B-Signifikanztest auf — der
// meldet dann zu frueh ein Ergebnis und fuehrt zur falschen Variante.
//
// Die Regel ist rueckwaertskompatibel: hat ein Ereignis eine Besucherkennung,
// zaehlt dieselbe Kennung je Gruppe und Ereignistyp nur EINMAL. Hat es keine
// (Altdaten vor dem 16.08.26), zaehlt die Zeile wie bisher einzeln. So
// verschwinden keine alten Zahlen ruecklings aus den Auswertungen.
// ---------------------------------------------------------------------------

/** Sammelt entdoppelte Zaehlerstaende je Gruppe. */
export class EindeutigZaehler {
  private gesehen = new Set<string>();
  private stand = new Map<string, number>();

  /** @returns true, wenn das Ereignis gezaehlt wurde (also kein Duplikat war). */
  zaehle(gruppe: string, typ: string, besucherHash?: string | null): boolean {
    const hash = (besucherHash ?? '').trim();
    if (hash) {
      const schluessel = `${gruppe}|${typ}|${hash}`;
      if (this.gesehen.has(schluessel)) return false;
      this.gesehen.add(schluessel);
    }
    const k = `${gruppe}|${typ}`;
    this.stand.set(k, (this.stand.get(k) ?? 0) + 1);
    return true;
  }

  wert(gruppe: string, typ: string): number {
    return this.stand.get(`${gruppe}|${typ}`) ?? 0;
  }
}

/** Prozent mit einer Nachkommastelle; Nenner <= 0 -> 0. */
export function prozent(zaehler: number, nenner: number): number {
  if (!nenner || nenner <= 0) return 0;
  return Math.round((zaehler / nenner) * 1000) / 10;
}

/**
 * Zaehlt Ereignisse je Landingpage zusammen.
 * @param ereignisse rohe Zeilen aus lp_ereignisse
 * @param landingpageIds alle IDs des Betriebs (auch ohne Ereignisse -> erscheinen mit 0)
 * Reihenfolge folgt landingpageIds. Ereignisse zu unbekannten IDs werden ignoriert.
 */
export function funnelJeLandingpage(
  ereignisse: LpEreignis[],
  landingpageIds: string[],
): LpFunnel[] {
  const bekannt = new Set(landingpageIds);
  const z = new EindeutigZaehler();
  for (const e of ereignisse || []) {
    const id = e?.landingpage_id;
    if (!id || !bekannt.has(id)) continue;
    if (e.typ !== 'aufruf' && e.typ !== 'anmeldung' && e.typ !== 'bestaetigung') continue;
    z.zaehle(id, e.typ, e.besucher_hash);
  }
  return landingpageIds.map((id) => {
    const aufrufe = z.wert(id, 'aufruf');
    const anmeldungen = z.wert(id, 'anmeldung');
    const bestaetigungen = z.wert(id, 'bestaetigung');
    return {
      landingpage_id: id,
      aufrufe,
      anmeldungen,
      bestaetigungen,
      quoteAnmeldung: prozent(anmeldungen, aufrufe),
      quoteBestaetigung: prozent(bestaetigungen, anmeldungen),
    };
  });
}

export type TagPunkt = {
  datum: string;        // YYYY-MM-DD (Europe/Berlin)
  aufrufe: number;
  anmeldungen: number;
  bestaetigungen: number;
};

/** Kalendertag in Europe/Berlin (YYYY-MM-DD) für einen ISO-Zeitstempel.
 *  Berücksichtigt Sommer-/Winterzeit automatisch; Leerstring bei Ungültigkeit. */
export function berlinTag(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

/**
 * Baut eine lueckenlose Tagesreihe der letzten `tage` Tage (endend an bisDatumIso).
 * bisDatumIso = beliebiger ISO-Zeitstempel; gezaehlt wird nach dem Kalendertag in
 * Europe/Berlin (D1-Härtung: nicht mehr UTC — Ereignisse kurz nach Mitternacht
 * landen so im richtigen deutschen Tag). Tage ohne Ereignisse erscheinen mit 0.
 * Pure + node-testbar (Referenzdatum wird uebergeben).
 */
export function tagesreihe(
  ereignisse: { typ: string | null; created_at?: string | null; besucher_hash?: string | null }[],
  bisDatumIso: string,
  tage = 30,
): TagPunkt[] {
  const n = Math.max(1, Math.floor(tage));
  const endeTag = berlinTag(bisDatumIso) || new Date(bisDatumIso).toISOString().slice(0, 10);
  // Mittag-UTC-Anker: reines Kalender-Rechnen, DST-unabhaengig.
  const anker = new Date(`${endeTag}T12:00:00Z`);
  const tageListe: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(anker);
    d.setUTCDate(d.getUTCDate() - i);
    tageListe.push(d.toISOString().slice(0, 10));
  }
  // Entdoppelt wird JE TAG: wer an drei Tagen wiederkommt, zaehlt dreimal —
  // das ist gewollt. Nur der fuenfte Reload am selben Tag faellt weg.
  const bekannt = new Set(tageListe);
  const z = new EindeutigZaehler();
  for (const e of ereignisse || []) {
    const roh = e?.created_at;
    if (!roh) continue;
    const tag = berlinTag(String(roh));
    if (!bekannt.has(tag)) continue;
    if (e.typ !== 'aufruf' && e.typ !== 'anmeldung' && e.typ !== 'bestaetigung') continue;
    z.zaehle(tag, e.typ, e.besucher_hash);
  }
  return tageListe.map((t) => ({
    datum: t,
    aufrufe: z.wert(t, 'aufruf'),
    anmeldungen: z.wert(t, 'anmeldung'),
    bestaetigungen: z.wert(t, 'bestaetigung'),
  }));
}

/** Summiert mehrere Funnel zu einer Gesamt-Uebersicht. */
export function funnelGesamt(funnels: LpFunnel[]): LpFunnelGesamt {
  const s = { aufrufe: 0, anmeldungen: 0, bestaetigungen: 0 };
  for (const f of funnels || []) {
    s.aufrufe += f.aufrufe;
    s.anmeldungen += f.anmeldungen;
    s.bestaetigungen += f.bestaetigungen;
  }
  return {
    aufrufe: s.aufrufe,
    anmeldungen: s.anmeldungen,
    bestaetigungen: s.bestaetigungen,
    quoteAnmeldung: prozent(s.anmeldungen, s.aufrufe),
    quoteBestaetigung: prozent(s.bestaetigungen, s.anmeldungen),
  };
}

// ============================================================================
// A-B-TESTS — Funnel je Variante + Sieger-Ermittlung (pure)
// ============================================================================

export type VariantenFunnel = {
  aufrufe: number;
  anmeldungen: number;
  bestaetigungen: number;
  quoteAnmeldung: number;      // Anmeldungen / Aufrufe (%)
  quoteBestaetigung: number;   // Bestaetigungen / Anmeldungen (%)
  quoteGesamt: number;         // Bestaetigungen / Aufrufe (%) — End-to-End-Conversion
};

export type VariantenEreignis = { typ: string | null; variante?: string | null; besucher_hash?: string | null };

/** Zaehlt die Ereignisse EINER Landingpage getrennt nach Variante A und B. */
export function funnelJeVariante(ereignisse: VariantenEreignis[]): { A: VariantenFunnel; B: VariantenFunnel } {
  // HIER ist die Entdoppelung am wichtigsten: der Signifikanztest weiter
  // unten rechnet mit diesen Zahlen als Fallzahl. Mehrfach gezaehlte Reloads
  // taeuschen ihm mehr Stichprobe vor, als es gibt — er meldet dann zu frueh
  // einen Sieger.
  const z = new EindeutigZaehler();
  for (const e of ereignisse || []) {
    const v = e?.variante === 'A' ? 'A' : e?.variante === 'B' ? 'B' : null;
    if (!v) continue;
    if (e.typ !== 'aufruf' && e.typ !== 'anmeldung' && e.typ !== 'bestaetigung') continue;
    z.zaehle(v, e.typ, e.besucher_hash);
  }
  const a = { aufrufe: z.wert('A', 'aufruf'), anmeldungen: z.wert('A', 'anmeldung'), bestaetigungen: z.wert('A', 'bestaetigung') };
  const b = { aufrufe: z.wert('B', 'aufruf'), anmeldungen: z.wert('B', 'anmeldung'), bestaetigungen: z.wert('B', 'bestaetigung') };
  const fin = (z: { aufrufe: number; anmeldungen: number; bestaetigungen: number }): VariantenFunnel => ({
    ...z,
    quoteAnmeldung: prozent(z.anmeldungen, z.aufrufe),
    quoteBestaetigung: prozent(z.bestaetigungen, z.anmeldungen),
    quoteGesamt: prozent(z.bestaetigungen, z.aufrufe),
  });
  return { A: fin(a), B: fin(b) };
}

export type AbSieger = {
  reif: boolean;                       // genug Daten fuer eine Aussage?
  sieger: 'A' | 'B' | 'gleich' | null;
  quoteA: number;                      // End-to-End (Aufruf -> Bestaetigt), %
  quoteB: number;
  hinweis: string;
};

/**
 * Bewertet A gegen B anhand der End-to-End-Conversion (Bestaetigt/Aufrufe).
 * D1-Härtung: kein Sieger mehr allein wegen eines Prozent-Unterschieds — es
 * braucht je Variante mind. `minAufrufe` Aufrufe UND statistische Signifikanz
 * (Zwei-Stichproben-Anteilstest / z-Test, ~95 % Konfidenz). Pure/node-testbar.
 */
export function abSieger(
  a: { aufrufe: number; bestaetigungen: number },
  b: { aufrufe: number; bestaetigungen: number },
  minAufrufe = 30,
): AbSieger {
  const quoteA = prozent(a.bestaetigungen, a.aufrufe);
  const quoteB = prozent(b.bestaetigungen, b.aufrufe);
  if (a.aufrufe < minAufrufe || b.aufrufe < minAufrufe) {
    return {
      reif: false,
      sieger: null,
      quoteA,
      quoteB,
      hinweis: `Noch zu wenig Daten — für ein verlässliches Ergebnis sollte jede Version mindestens ${minAufrufe} Aufrufe haben.`,
    };
  }
  // Zwei-Stichproben-Anteilstest auf die End-to-End-Conversion (Bestaetigt/Aufrufe).
  const pA = a.bestaetigungen / a.aufrufe;
  const pB = b.bestaetigungen / b.aufrufe;
  const pPool = (a.bestaetigungen + b.bestaetigungen) / (a.aufrufe + b.aufrufe);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.aufrufe + 1 / b.aufrufe));
  const z = se > 0 ? (pA - pB) / se : 0;
  if (Math.abs(z) < 1.96) {
    return {
      reif: true,
      sieger: 'gleich',
      quoteA,
      quoteB,
      hinweis: 'Der Unterschied ist statistisch noch nicht aussagekräftig (95 %-Konfidenz nicht erreicht) — weiter testen.',
    };
  }
  const sieger: 'A' | 'B' = pA > pB ? 'A' : 'B';
  const hoch = Math.max(quoteA, quoteB);
  const tief = Math.min(quoteA, quoteB);
  return {
    reif: true,
    sieger,
    quoteA,
    quoteB,
    hinweis: `Variante ${sieger} liegt statistisch signifikant vorn (Aufruf → Bestätigt: ${hoch} % vs. ${tief} %, 95 %-Konfidenz).`,
  };
}
