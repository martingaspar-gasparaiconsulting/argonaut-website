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

// ---------------------------------------------------------------------------
// POSTEINGANG
//
// Die Mails kommen ueber IMAP, nicht aus der Datenbank. Ein „beantwortet"-
// Merkmal gibt es deshalb NICHT — nur „gelesen". Das Auge sagt darum genau
// das und nicht mehr: ungelesen und wie alt die aelteste davon ist. Wer hier
// „unbeantwortet" behauptet, behauptet etwas, das die Daten nicht hergeben.
// ---------------------------------------------------------------------------

export type MailZeileZaehl = { datumIso?: string | null; gelesen?: boolean };

export type PosteingangZahlen = {
  gesamt: number;
  ungelesen: number;
  /** Alter der aeltesten ungelesenen Nachricht in Tagen. */
  aeltesteUngeleseneTage: number | null;
  /** Ungelesene, die heute hereingekommen sind. */
  ungelesenHeute: number;
};

export function zaehlePosteingang(mails: MailZeileZaehl[], jetzt: Date): PosteingangZahlen {
  let gesamt = 0, ungelesen = 0, ungelesenHeute = 0;
  let aeltesteUngeleseneTage: number | null = null;

  for (const m of mails || []) {
    if (!m) continue;
    gesamt++;
    if (m.gelesen) continue;
    ungelesen++;
    const tage = tageDazwischen(m.datumIso, jetzt);
    if (tage === 0) ungelesenHeute++;
    if (tage !== null && tage >= 0 && (aeltesteUngeleseneTage === null || tage > aeltesteUngeleseneTage)) {
      aeltesteUngeleseneTage = tage;
    }
  }

  return { gesamt, ungelesen, aeltesteUngeleseneTage, ungelesenHeute };
}

// ---------------------------------------------------------------------------
// DISPO
//
// WICHTIG: Die Liste `unzugeordnet` wird von der Seite hereingereicht, nicht
// hier neu gefiltert. Die Seite kennt die Regel bereits
// (kein Monteur, kein Inhaber-Einsatz, nicht abgesagt) und zeigt sie im
// „Unzugeordnet"-Panel an. Wuerde hier zum zweiten Mal gefiltert, koennten
// Panel und Auge verschiedene Zahlen zeigen — das ist der schlimmste Fehler,
// den ein Auge machen kann: sich selbst auf derselben Seite widersprechen.
// ---------------------------------------------------------------------------

export type EinsatzZeile = { beginn_am?: string | null; titel?: string | null; einsatzort?: string | null };

export type DispoZahlen = {
  unzugeordnetGesamt: number;
  unzugeordnetHeute: number;
  unzugeordnetMorgen: number;
  /** Einsaetze heute insgesamt, auch die zugewiesenen. */
  einsaetzeHeute: number;
  /** Titel des naechsten Einsatzes ohne Monteur. */
  naechsterOhneMonteur: string | null;
};

export function zaehleDispo(
  unzugeordnet: EinsatzZeile[],
  alleEinsaetze: EinsatzZeile[],
  jetzt: Date,
): DispoZahlen {
  const heute0 = tagStart(jetzt);
  const morgen0 = heute0 + TAG_MS;
  const uebermorgen0 = heute0 + 2 * TAG_MS;

  let unzugeordnetHeute = 0, unzugeordnetMorgen = 0;
  let naechsterMs: number | null = null;
  let naechsterOhneMonteur: string | null = null;

  for (const e of unzugeordnet || []) {
    if (!e || !e.beginn_am) continue;
    const ms = new Date(e.beginn_am).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms >= heute0 && ms < morgen0) unzugeordnetHeute++;
    if (ms >= morgen0 && ms < uebermorgen0) unzugeordnetMorgen++;
    if (ms >= heute0 && (naechsterMs === null || ms < naechsterMs)) {
      naechsterMs = ms;
      naechsterOhneMonteur = (e.titel || '').trim() || (e.einsatzort || '').trim() || null;
    }
  }

  let einsaetzeHeute = 0;
  for (const e of alleEinsaetze || []) {
    if (!e || !e.beginn_am) continue;
    const ms = new Date(e.beginn_am).getTime();
    if (!Number.isNaN(ms) && ms >= heute0 && ms < morgen0) einsaetzeHeute++;
  }

  return {
    unzugeordnetGesamt: (unzugeordnet || []).length,
    unzugeordnetHeute,
    unzugeordnetMorgen,
    einsaetzeHeute,
    naechsterOhneMonteur,
  };
}

// ---------------------------------------------------------------------------
// BANKING
//
// Das Auge stoesst hier eine HANDLUNG an, es meldet keinen Missstand: Solange
// offene Rechnungen daliegen, lohnt sich ein Kontoabgleich. Es ist deshalb
// bewusst nicht dieselbe Aussage wie beim Zahlungen-Auge — dort geht es um
// den Betrag, hier um den naechsten Handgriff.
// ---------------------------------------------------------------------------

export type OffeneRechnungZeile = { brutto?: number | null };

export type BankingZahlen = {
  offeneRechnungen: number;
  offenerBetrag: number;
  /** Zahl der eingerichteten und verbundenen Bankzugaenge. */
  bankenVerbunden: number;
};

export function zaehleBanking(
  offene: OffeneRechnungZeile[],
  verbindungen: { verbunden?: boolean }[],
  _jetzt?: Date,
): BankingZahlen {
  let offeneRechnungen = 0, offenerBetrag = 0;
  for (const r of offene || []) {
    if (!r) continue;
    offeneRechnungen++;
    offenerBetrag += zahl(r.brutto);
  }
  const bankenVerbunden = (verbindungen || []).filter((v) => v && v.verbunden).length;
  return { offeneRechnungen, offenerBetrag: Math.round(offenerBetrag * 100) / 100, bankenVerbunden };
}

// ---------------------------------------------------------------------------
// ZEITERFASSUNG — die persoenliche Stempeluhr
//
// WICHTIG FUERS VERSTAENDNIS: Diese Seite ist NICHT die Chef-Uebersicht.
// Im Kopf der Seite steht: „Jeder stempelt SEINE eigene Zeit." Der Nutzer
// sieht dort ausschliesslich seine eigenen Buchungen. Ein Auge zeigt ihm
// deshalb SELBSTAUSKUNFT, keine Fremdueberwachung — § 87 Abs. 1 Nr. 6 BetrVG
// ist hier nicht beruehrt, weil niemand ueber jemand anderen etwas erfaehrt.
//
// Trotzdem gilt: keine Bewertung, kein „zu spaet", kein „zu wenig". Nur
// Zustand und Datenqualitaet.
// ---------------------------------------------------------------------------

export type SitzungZeile = {
  kommen_um?: string | null;
  gehen_um?: string | null;
  pause_minuten?: number | null;
  pause_offen_seit?: string | null;
};

export type ZeiterfassungZahlen = {
  /** Laeuft gerade eine Sitzung? */
  eingestempelt: boolean;
  /** Minuten seit dem Einstempeln der laufenden Sitzung. */
  laufendMinuten: number | null;
  /** Minuten, seit die aktuelle Pause offen ist. */
  pauseOffenMinuten: number | null;
  buchungenHeute: number;
};

export function zaehleZeiterfassung(
  offen: SitzungZeile | null | undefined,
  heute: SitzungZeile[],
  jetzt: Date,
): ZeiterfassungZahlen {
  const jetztMs = jetzt.getTime();
  const min = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((jetztMs - t) / 60000));
  };

  return {
    eingestempelt: !!(offen && offen.kommen_um && !offen.gehen_um),
    laufendMinuten: offen && !offen.gehen_um ? min(offen.kommen_um) : null,
    pauseOffenMinuten: offen ? min(offen.pause_offen_seit) : null,
    buchungenHeute: (heute || []).length,
  };
}

// ---------------------------------------------------------------------------
// SCHICHTPLAN — Chef-Seite, deshalb bewusst nur Summen
//
// Hier waere ein Satz wie „Mitarbeiter X hat 3 Schichten nicht bestaetigt"
// eine Aussage ueber das Verhalten einer einzelnen Person — und damit nach
// § 87 Abs. 1 Nr. 6 BetrVG mitbestimmungspflichtig, weil es dafuer GEEIGNET
// ist; auf die Absicht kommt es nicht an.
//
// Gezaehlt wird deshalb ausschliesslich, WIE VIELE. Kein Name, keine Kennung,
// keine Rangfolge. Die Minijob-Warnung ist davon unberuehrt: dass die
// Geringfuegigkeitsgrenze gerissen wird, MUSS der Arbeitgeber wissen — sonst
// wird die Beschaeftigung rueckwirkend sozialversicherungspflichtig. Auch die
// wird als blosse Anzahl gefuehrt.
// ---------------------------------------------------------------------------

export type SchichtplanZahlen = {
  offeneTauschantraege: number;
  minijobUeber: number;
  minijobKnapp: number;
  unbestaetigt: number;
};

export function zaehleSchichtplan(
  tauschAntraege: unknown[],
  minijobWarnung: Record<string, { status?: string }>,
  bestaetigungen: Record<string, { status?: string }>,
): SchichtplanZahlen {
  const warn = Object.values(minijobWarnung || {});
  const best = Object.values(bestaetigungen || {});
  return {
    offeneTauschantraege: (tauschAntraege || []).length,
    minijobUeber: warn.filter((w) => w && w.status === 'ueber').length,
    minijobKnapp: warn.filter((w) => w && w.status === 'knapp').length,
    unbestaetigt: best.filter((b) => b && b.status && b.status !== 'bestaetigt').length,
  };
}
