// ============================================================================
// ARGONAUT OS · lib/augeZaehler.ts — Kennzahlen für das Wachende Auge (Punkt 6.5)
//
// WARUM EINE EIGENE DATEI
// Das Wachende Auge hat zwei Hälften: diese hier zählt, lib/auge.ts formuliert.
// Beide sind reine Logik — kein Supabase, kein React, keine Seiteneffekte —
// und damit vollständig mit `node --test` prüfbar. Eine falsche Zahl im Auge
// ist schlimmer als gar kein Auge: sie schickt den Chef auf die falsche Spur.
//
// Die Seite reicht ihre schon geladenen Listen herein und bekommt Zahlen
// zurück. Nichts wird zusätzlich geladen, nichts geht zusätzlich hinaus.
//
// ALLE ZEITRECHNUNG BRAUCHT EIN „JETZT" ALS PARAMETER — nie `new Date()` in
// der Logik selbst. Sonst ist die Funktion nicht testbar, weil sie morgen ein
// anderes Ergebnis liefert als heute.
// ============================================================================

/** Tagesbeginn (00:00:00.000) des übergebenen Zeitpunkts. */
function tagStart(d: Date): number {
  const x = new Date(d.getTime());
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

const TAG_MS = 86_400_000;

/** Ganze Tage zwischen zwei Zeitpunkten, kalendarisch (nicht auf die Stunde genau). */
export function tageDazwischen(vonIso: string | null | undefined, jetzt: Date): number | null {
  if (!vonIso) return null;
  const t = new Date(vonIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((tagStart(jetzt) - tagStart(new Date(t))) / TAG_MS);
}

// ---------------------------------------------------------------------------
// TERMINE
// ---------------------------------------------------------------------------

export type TerminZeile = {
  titel?: string | null;
  beginn_am?: string | null;
  status?: string | null;
  ort?: string | null;
};

export type TerminZahlen = {
  heute: number;
  morgen: number;
  dieseWoche: number;
  /** Termine, deren Beginn vorbei ist und die noch auf „geplant" stehen. */
  vergangenOffen: number;
  naechsterTitel: string | null;
  /** Stunden bis zum nächsten Termin, aufgerundet. Null, wenn keiner kommt. */
  naechsterInStunden: number | null;
};

export function zaehleTermine(termine: TerminZeile[], jetzt: Date): TerminZahlen {
  const jetztMs = jetzt.getTime();
  const heute0 = tagStart(jetzt);
  const morgen0 = heute0 + TAG_MS;
  const uebermorgen0 = heute0 + 2 * TAG_MS;
  const inSiebenTagen = heute0 + 7 * TAG_MS;

  let heute = 0, morgen = 0, dieseWoche = 0, vergangenOffen = 0;
  let naechsterMs: number | null = null;
  let naechsterTitel: string | null = null;

  for (const t of termine || []) {
    if (!t || !t.beginn_am) continue;
    const ms = new Date(t.beginn_am).getTime();
    if (Number.isNaN(ms)) continue;

    const abgesagt = (t.status || '').toLowerCase() === 'abgesagt';
    if (abgesagt) continue;

    if (ms >= heute0 && ms < morgen0) heute++;
    if (ms >= morgen0 && ms < uebermorgen0) morgen++;
    if (ms >= heute0 && ms < inSiebenTagen) dieseWoche++;

    // Vorbei, aber noch nicht abgeschlossen: das ist die eigentliche Nachlässigkeit.
    if (ms < jetztMs && (t.status || 'geplant').toLowerCase() === 'geplant') vergangenOffen++;

    if (ms >= jetztMs && (naechsterMs === null || ms < naechsterMs)) {
      naechsterMs = ms;
      naechsterTitel = (t.titel || '').trim() || null;
    }
  }

  return {
    heute,
    morgen,
    dieseWoche,
    vergangenOffen,
    naechsterTitel,
    naechsterInStunden: naechsterMs === null ? null : Math.ceil((naechsterMs - jetztMs) / 3_600_000),
  };
}

// ---------------------------------------------------------------------------
// ZAHLUNGEN
// ---------------------------------------------------------------------------

export type ZahlungRechnung = {
  brutto_summe?: number | null;
  zahlungsstatus?: string | null;
  bezahlt_am?: string | null;
  zahlung_gemeldet_am?: string | null;
  empfaenger_name?: string | null;
};

export type ZahlungBeleg = { brutto?: number | null; bezahlt_am?: string | null; belegdatum?: string | null };

export type ZahlungZahlen = {
  /** Kunde hat „Ich habe bezahlt" gemeldet, im Haus aber noch niemand geprüft. */
  gemeldetOffen: number;
  gemeldetBetrag: number;
  /** Rechnungen ohne Zahlungseingang. */
  offeneRechnungen: number;
  offenerBetrag: number;
  /** Eigene Eingangsbelege, die noch nicht bezahlt sind. */
  offeneBelege: number;
  offenerBelegBetrag: number;
  /** Ältester unbezahlter eigener Beleg, in Tagen. */
  aeltesterBelegTage: number | null;
};

function zahl(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function zaehleZahlungen(
  rechnungen: ZahlungRechnung[],
  belege: ZahlungBeleg[],
  jetzt: Date,
): ZahlungZahlen {
  let gemeldetOffen = 0, gemeldetBetrag = 0, offeneRechnungen = 0, offenerBetrag = 0;

  for (const r of rechnungen || []) {
    if (!r) continue;
    if ((r.zahlungsstatus || '').toLowerCase() === 'storniert') continue;
    if (r.bezahlt_am) continue;

    offeneRechnungen++;
    offenerBetrag += zahl(r.brutto_summe);
    if (r.zahlung_gemeldet_am) {
      gemeldetOffen++;
      gemeldetBetrag += zahl(r.brutto_summe);
    }
  }

  let offeneBelege = 0, offenerBelegBetrag = 0;
  let aeltesterBelegTage: number | null = null;

  for (const b of belege || []) {
    if (!b || b.bezahlt_am) continue;
    offeneBelege++;
    offenerBelegBetrag += zahl(b.brutto);
    const tage = tageDazwischen(b.belegdatum, jetzt);
    if (tage !== null && tage >= 0 && (aeltesterBelegTage === null || tage > aeltesterBelegTage)) {
      aeltesterBelegTage = tage;
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    gemeldetOffen,
    gemeldetBetrag: r2(gemeldetBetrag),
    offeneRechnungen,
    offenerBetrag: r2(offenerBetrag),
    offeneBelege,
    offenerBelegBetrag: r2(offenerBelegBetrag),
    aeltesterBelegTage,
  };
}

// ---------------------------------------------------------------------------
// EINGANGSBELEGE
// ---------------------------------------------------------------------------

export type EingangsbelegZeile = {
  brutto?: number | null;
  belegdatum?: string | null;
  datei_pfad?: string | null;
  datev_konto?: string | null;
  bezahlt_am?: string | null;
};

export type EingangsbelegZahlen = {
  gesamt: number;
  /** Beleg erfasst, aber kein Bild/PDF hinterlegt — bei einer Prüfung fehlt der Nachweis. */
  ohneDatei: number;
  /** Noch nicht kontiert — bleibt beim Steuerberater liegen. */
  ohneKonto: number;
  unbezahlt: number;
  unbezahltBetrag: number;
  aeltesterUnbezahltTage: number | null;
};

export function zaehleEingangsbelege(belege: EingangsbelegZeile[], jetzt: Date): EingangsbelegZahlen {
  let gesamt = 0, ohneDatei = 0, ohneKonto = 0, unbezahlt = 0, unbezahltBetrag = 0;
  let aeltesterUnbezahltTage: number | null = null;

  for (const b of belege || []) {
    if (!b) continue;
    gesamt++;
    if (!(b.datei_pfad || '').trim()) ohneDatei++;
    if (!(b.datev_konto || '').trim()) ohneKonto++;
    if (!b.bezahlt_am) {
      unbezahlt++;
      unbezahltBetrag += zahl(b.brutto);
      const tage = tageDazwischen(b.belegdatum, jetzt);
      if (tage !== null && tage >= 0 && (aeltesterUnbezahltTage === null || tage > aeltesterUnbezahltTage)) {
        aeltesterUnbezahltTage = tage;
      }
    }
  }

  return {
    gesamt,
    ohneDatei,
    ohneKonto,
    unbezahlt,
    unbezahltBetrag: Math.round(unbezahltBetrag * 100) / 100,
    aeltesterUnbezahltTage,
  };
}
