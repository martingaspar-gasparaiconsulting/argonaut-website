// ============================================================================
// ARGONAUT OS · lib/importFortschritt.ts — Fortschritt, Stoppuhr, Hochrechnung
//
// Schritt 0 des Umzug-Plans (27.09.2026). Reine Funktionen, node-getestet
// (tests/importFortschritt.test.mjs). Die Import-Seite rechnet damit:
//
//   · den Balken JE DATEI mit vier Phasen
//       Laden (Bytes %) -> Lesen -> Pruefen -> Einspielen (Zeilen x von y)
//   · die Restzeit aus dem GEMESSENEN Tempo (gleitendes Fenster, kein Raten)
//   · den Gesamtbalken ueber alle Dateien eines Umzugs + "fertig ca. 10:42 Uhr"
//   · die Pakete beim Einspielen (500 Zeilen je Schreibvorgang)
//   · die Zeilen-Bilanz: jede gelesene Zeile muss irgendwo gelandet sein —
//     uebernommen, geaendert, uebersprungen, abgelehnt, doppelt oder gescheitert.
//     Was uebrig bleibt, ist "verschluckt" und wird angezeigt, nie versteckt.
//   · die Hochrechnung "wie lange dauert mein Umzug" aus den EIGENEN
//     Messwerten des Betriebs, ehrlich mit Spanne und mit den echten Grenzen.
//
// Grundsatz: Wo wir etwas nicht koennen, steht es da. Keine Zahl ohne Herkunft.
// ============================================================================

export type Phase = 'laden' | 'lesen' | 'pruefen' | 'einspielen';

export const PHASEN: readonly { key: Phase; label: string; gewicht: number }[] = [
  { key: 'laden', label: 'Laden', gewicht: 10 },
  { key: 'lesen', label: 'Lesen', gewicht: 10 },
  { key: 'pruefen', label: 'Prüfen', gewicht: 10 },
  { key: 'einspielen', label: 'Einspielen', gewicht: 70 },
];

/** So viele Zeilen gehen je Schreibvorgang in die Datenbank. */
export const PAKET_GROESSE = 500;

/**
 * Supabase liefert je Abfrage hoechstens 1.000 Zeilen (Projekt-Einstellung
 * "Max rows"). Wer mehr braucht, muss seitenweise lesen — sonst sieht die
 * Doppelten-Pruefung ab dem 1.001. Kunden nichts mehr.
 */
export const LESE_SEITE = 1000;

/** Die echten Grenzen — sichtbar in der Oberflaeche, nie geschoent. */
export const GRENZEN_UMZUG = {
  /** Vercel nimmt je Anfrage ca. 4,5 MB an; mit Luft fuer den Rest der Anfrage. */
  serverDateiBytes: 4 * 1024 * 1024,
  /** CSV wird im Browser gelesen; darueber wird der Arbeitsspeicher knapp. */
  browserDateiBytes: 200 * 1024 * 1024,
  /** Ab hier waere Upload in Teilen + Verarbeitung im Hintergrund noetig. */
  teileUploadBytes: 2 * 1024 * 1024 * 1024,
  /** Ab hier ist es kein Tabellen-Umzug mehr, sondern ein eigenes Projekt. */
  projektBytes: 50 * 1024 * 1024 * 1024,
  /** Ziel: Onboarding in einem Vormittag. */
  vormittagMs: 4 * 60 * 60 * 1000,
} as const;

/** Richtwerte, solange der Betrieb selbst noch nichts gemessen hat. */
export const RICHTWERTE = {
  zeilenProSekunde: { von: 150, bis: 900 },
  bytesProZeile: { von: 80, bis: 250 },
} as const;

// ---------------------------------------------------------------------------
// 1) Anzeige: Dauer, Uhrzeit, Zahl
// ---------------------------------------------------------------------------

const ZAHL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/** 12480 -> "12.480" (Punkt vor den Tausendern). */
export function zahlDe(n: number): string {
  return Number.isFinite(n) ? ZAHL.format(Math.round(n)) : '—';
}

/** Millisekunden -> "12 s", "1 Min 20 s", "1 Std 47 Min", "2 Tage 3 Std". */
export function formatDauer(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return 'unter 1 s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) {
    const rest = s % 60;
    return rest ? `${min} Min ${rest} s` : `${min} Min`;
  }
  const std = Math.floor(min / 60);
  if (std < 24) {
    const rest = min % 60;
    return rest ? `${std} Std ${rest} Min` : `${std} Std`;
  }
  const tage = Math.floor(std / 24);
  const rest = std % 24;
  const t = tage === 1 ? '1 Tag' : `${tage} Tage`;
  return rest ? `${t} ${rest} Std` : t;
}

/** Zeitpunkt -> "10:42 Uhr" in deutscher Zeit (auch wenn der Rechner anders steht). */
export function uhrzeitBerlin(ms: number): string {
  const f = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${f.format(new Date(ms))} Uhr`;
}

/** Bytes -> "812 KB", "3,4 MB", "1,2 GB". */
export function formatBytes(b: number): string {
  if (!Number.isFinite(b) || b < 0) return '—';
  const einheiten = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  let i = 0; let w = b;
  while (w >= 1024 && i < einheiten.length - 1) { w /= 1024; i++; }
  const text = i === 0 ? String(Math.round(w)) : w.toLocaleString('de-DE', { maximumFractionDigits: w < 10 ? 1 : 0 });
  return `${text} ${einheiten[i]}`;
}

// ---------------------------------------------------------------------------
// 2) Tempo und Restzeit
// ---------------------------------------------------------------------------

export type Messpunkt = { t: number; n: number };

/** Nur die letzten 15 Sekunden zaehlen — das Tempo aendert sich unterwegs. */
export const TEMPO_FENSTER_MS = 15000;

/**
 * Einheiten je Millisekunde aus den Messpunkten (n ist der Zaehlerstand,
 * nicht der Zuwachs). null, solange zu wenig gemessen ist — dann zeigt die
 * Seite "Tempo wird gemessen …" statt einer erfundenen Zahl.
 */
export function tempoProMs(punkte: readonly Messpunkt[], fensterMs = TEMPO_FENSTER_MS): number | null {
  if (punkte.length < 2) return null;
  const letzter = punkte[punkte.length - 1];
  let erster = punkte[0];
  for (const p of punkte) { if (letzter.t - p.t <= fensterMs) { erster = p; break; } }
  const dt = letzter.t - erster.t;
  const dn = letzter.n - erster.n;
  if (dt < 500 || dn <= 0) return null;
  return dn / dt;
}

/** Restzeit in ms aus erledigt/gesamt und gemessenem Tempo. */
export function restMs(erledigt: number, gesamt: number, tempo: number | null): number | null {
  if (gesamt <= 0) return null;
  if (erledigt >= gesamt) return 0;
  if (!tempo || tempo <= 0) return null;
  return (gesamt - erledigt) / tempo;
}

/** "noch ca. 1 Min 20 s" — oder ehrlich, dass noch gemessen wird. */
export function restText(ms: number | null): string {
  if (ms === null) return 'Tempo wird gemessen …';
  if (ms <= 0) return 'gleich fertig';
  return `noch ca. ${formatDauer(ms)}`;
}

// ---------------------------------------------------------------------------
// 3) Balken je Datei
// ---------------------------------------------------------------------------

export type DateiStand = {
  phase: Phase | 'fertig';
  /** Anteil der AKTUELLEN Phase, 0 bis 1. */
  anteil: number;
};

/** Gesamtprozent einer Datei aus Phase + Anteil der Phase (0 bis 100). */
export function dateiProzent(s: DateiStand): number {
  if (s.phase === 'fertig') return 100;
  let vorher = 0;
  for (const p of PHASEN) {
    if (p.key === s.phase) {
      const a = Math.min(1, Math.max(0, Number.isFinite(s.anteil) ? s.anteil : 0));
      return Math.min(99, Math.round(vorher + p.gewicht * a));
    }
    vorher += p.gewicht;
  }
  return 0;
}

/** Stapel fuer das Einspielen: [{von, bis}] mit bis exklusiv. */
export function pakete(anzahl: number, groesse = PAKET_GROESSE): { von: number; bis: number }[] {
  const g = Math.max(1, Math.floor(groesse));
  const raus: { von: number; bis: number }[] = [];
  for (let i = 0; i < anzahl; i += g) raus.push({ von: i, bis: Math.min(anzahl, i + g) });
  return raus;
}

// ---------------------------------------------------------------------------
// 4) Gesamtbalken ueber einen Umzug
// ---------------------------------------------------------------------------

export type GesamtStand = {
  fertig: number;
  gesamt: number;
  prozent: number;
  /** Zeitpunkt (ms), zu dem der Umzug bei gleichem Tempo fertig waere. */
  fertigUm: number | null;
};

/**
 * geplant = wie viele Dateien der Betrieb mitbringt (0 = unbekannt, dann
 * zaehlen die bisherigen). laufendProzent = Prozent der Datei, die gerade
 * laeuft (null = keine). startMs = Beginn des Umzugs.
 */
export function gesamtFortschritt(opt: {
  geplant: number; fertigeDateien: number; laufendProzent: number | null; startMs: number; jetztMs: number;
}): GesamtStand {
  const laufend = opt.laufendProzent === null ? 0 : 1;
  const gesamt = Math.max(opt.geplant || 0, opt.fertigeDateien + laufend, 1);
  const erledigt = opt.fertigeDateien + (opt.laufendProzent ?? 0) / 100;
  const anteil = Math.min(1, erledigt / gesamt);
  const prozent = Math.round(anteil * 100);
  const vergangen = opt.jetztMs - opt.startMs;
  // Unter 5 % ist jede Hochrechnung Raten — dann lieber keine.
  const fertigUm = anteil >= 0.05 && anteil < 1 && vergangen > 0
    ? opt.startMs + vergangen / anteil
    : null;
  return { fertig: opt.fertigeDateien, gesamt, prozent, fertigUm };
}

// ---------------------------------------------------------------------------
// 5) Zeilen-Bilanz — "nichts verschluckt"
// ---------------------------------------------------------------------------

export type ZeilenBilanz = {
  gelesen: number;
  angelegt: number;
  aktualisiert: number;
  /** schon vorhanden, bewusst uebersprungen */
  uebersprungen: number;
  /** Pruefung abgelehnt (Pflichtfeld fehlt, unlesbar …) */
  abgelehnt: number;
  /** in der Datei doppelt — nur der erste Eintrag zaehlt */
  doppelt: number;
  /** beim Speichern gescheitert */
  gescheitert: number;
  /** noch nicht eingespielt, weil angehalten */
  offen?: number;
};

/** Was keiner Kategorie zuzuordnen ist. Muss 0 sein — sonst ist etwas verloren. */
export function verschluckt(b: ZeilenBilanz): number {
  const verbucht = b.angelegt + b.aktualisiert + b.uebersprungen + b.abgelehnt + b.doppelt + b.gescheitert + (b.offen ?? 0);
  return b.gelesen - verbucht;
}

// ---------------------------------------------------------------------------
// 6) Hochrechnung "Wie lange dauert mein Umzug?"
// ---------------------------------------------------------------------------

export type MengenEinheit = 'MB' | 'GB' | 'TB' | 'Zeilen';

/** Ein frueherer Import des Betriebs — aus import_jobs. */
export type Messwert = { bytes: number | null; zeilen: number; dauerMs: number };

export type Hochrechnung = {
  zeilenVon: number;
  zeilenBis: number;
  dauerVonMs: number;
  dauerBisMs: number;
  /** eigen = aus den Messwerten des Betriebs; richtwert = noch nichts gemessen */
  quelle: 'eigen' | 'richtwert';
  messungen: number;
  /** browser = heute moeglich; teile = braucht Upload in Teilen (nicht gebaut); projekt = eigenes Projekt */
  weg: 'browser' | 'teile' | 'projekt';
  hinweise: string[];
};

const BYTES_JE: Record<Exclude<MengenEinheit, 'Zeilen'>, number> = {
  MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024,
};

function spanne(werte: number[], fallback: { von: number; bis: number }): { von: number; bis: number } {
  const w = werte.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (w.length === 0) return { ...fallback };
  if (w.length < 3) {
    // Eine oder zwei Messungen sind zu wenig fuer eine enge Spanne: +/- 40 %.
    const m = w.reduce((s, x) => s + x, 0) / w.length;
    return { von: m * 0.6, bis: m * 1.4 };
  }
  return { von: w[0], bis: w[w.length - 1] };
}

/**
 * Menge + Einheit -> geschaetzte Dauer mit Spanne. Gemessen wird nur, was
 * mindestens 20 Zeilen und 1 Sekunde hatte — sonst verzerrt der Start.
 */
export function hochrechnung(menge: number, einheit: MengenEinheit, messwerte: readonly Messwert[]): Hochrechnung | null {
  if (!Number.isFinite(menge) || menge <= 0) return null;
  const brauchbar = messwerte.filter((m) => m.zeilen >= 20 && m.dauerMs >= 1000);
  const quelle: Hochrechnung['quelle'] = brauchbar.length > 0 ? 'eigen' : 'richtwert';

  const tempo = spanne(brauchbar.map((m) => m.zeilen / (m.dauerMs / 1000)), RICHTWERTE.zeilenProSekunde);
  const mitBytes = brauchbar.filter((m) => (m.bytes ?? 0) > 0);
  const jeZeile = spanne(mitBytes.map((m) => (m.bytes as number) / m.zeilen), RICHTWERTE.bytesProZeile);

  let bytes: number | null = null;
  let zeilenVon: number; let zeilenBis: number;
  if (einheit === 'Zeilen') {
    zeilenVon = zeilenBis = Math.round(menge);
  } else {
    bytes = menge * BYTES_JE[einheit];
    zeilenVon = Math.round(bytes / jeZeile.bis);
    zeilenBis = Math.round(bytes / jeZeile.von);
  }

  const dauerVonMs = (zeilenVon / tempo.bis) * 1000;
  const dauerBisMs = (zeilenBis / tempo.von) * 1000;

  const hinweise: string[] = [];
  let weg: Hochrechnung['weg'] = 'browser';
  if (quelle === 'richtwert') {
    hinweise.push('Noch keine eigenen Messwerte — gerechnet mit Richtwerten. Nach dem ersten Import wird die Schätzung genauer.');
  } else {
    hinweise.push(`Gerechnet aus ${brauchbar.length} eigenen Import${brauchbar.length === 1 ? '' : 'en'}.`);
  }
  if (bytes !== null && bytes > GRENZEN_UMZUG.projektBytes) {
    weg = 'projekt';
    hinweise.push('Diese Menge ist kein Tabellen-Umzug mehr: Die Stammdaten eines Betriebs (Kunden, Artikel, Belege als Tabelle) liegen fast immer unter 1 GB. Große Mengen sind meist Dokumente und Fotos. Diesen Umzug planen wir gemeinsam mit Ihnen; im Browser geht das nicht.');
  } else if (bytes !== null && bytes > GRENZEN_UMZUG.teileUploadBytes) {
    weg = 'teile';
    hinweise.push('Diese Menge geht nicht als Browser-Upload am Stück. Nötig wäre ein Upload in Teilen direkt in den Speicher mit Verarbeitung im Hintergrund. Das ist noch nicht gebaut. Bis dahin: im Altsystem in Teilen exportieren (z. B. nach Jahren) und nacheinander importieren.');
  }
  if (bytes !== null && bytes > GRENZEN_UMZUG.browserDateiBytes && weg === 'browser') {
    hinweise.push(`Eine einzelne Datei sollte höchstens ${formatBytes(GRENZEN_UMZUG.browserDateiBytes)} groß sein. Größere Exporte bitte in mehrere Dateien teilen.`);
  }
  if (dauerBisMs > GRENZEN_UMZUG.vormittagMs && weg === 'browser') {
    hinweise.push('Im ungünstigen Fall passt das nicht in einen Vormittag. Tipp: Altdaten (z. B. Jahre vor der Aufbewahrungsfrist) weglassen oder den Umzug auf zwei Termine legen.');
  }
  return { zeilenVon, zeilenBis, dauerVonMs, dauerBisMs, quelle, messungen: brauchbar.length, weg, hinweise };
}

/** "ca. 4 Min bis 12 Min" bzw. "ca. 5 Min", wenn beide Enden gleich aussehen. */
export function spannenText(vonMs: number, bisMs: number): string {
  const a = formatDauer(vonMs); const b = formatDauer(bisMs);
  return a === b ? `ca. ${a}` : `ca. ${a} bis ${b}`;
}

// ---------------------------------------------------------------------------
// 7) Welcher Weg fuer welche Datei?
// ---------------------------------------------------------------------------

export type DateiWeg = { weg: 'browser' | 'server' | 'zu_gross'; hinweis: string | null };

/**
 * CSV/TXT liest der Browser selbst (keine Upload-Grenze, keine Zeilen-Kappung).
 * Excel liest der Server — dort gilt die Vercel-Grenze je Anfrage.
 */
export function dateiWeg(name: string, bytes: number): DateiWeg {
  const endung = (name.toLowerCase().split('.').pop() ?? '');
  // Schritt 2: altes .xls liest der Browser selbst (lib/xlsLeser) — nur .xlsx geht an den Server.
  const excel = endung === 'xlsx' || endung === 'xlsm';
  if (!excel) {
    if (bytes > GRENZEN_UMZUG.browserDateiBytes) {
      return { weg: 'zu_gross', hinweis: `Die Datei ist ${formatBytes(bytes)} groß. Im Browser gehen bis ${formatBytes(GRENZEN_UMZUG.browserDateiBytes)} je Datei — bitte im Altsystem in mehrere Dateien exportieren.` };
    }
    return { weg: 'browser', hinweis: null };
  }
  if (bytes > GRENZEN_UMZUG.serverDateiBytes) {
    return { weg: 'zu_gross', hinweis: `Excel-Dateien gehen bis ${formatBytes(GRENZEN_UMZUG.serverDateiBytes)}. Diese hat ${formatBytes(bytes)}. Bitte in Excel „Speichern unter → CSV (Trennzeichen-getrennt)" wählen — CSV liest ARGONAUT direkt im Browser, ohne Größen-Grenze des Servers.` };
  }
  return { weg: 'server', hinweis: null };
}

/**
 * Text-Datei im Browser dekodieren: UTF-8, bei ungueltigen Zeichen
 * Windows-1252 (Excel-Standard in Deutschland) — wie die Server-Route.
 */
export function dekodiere(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// ---------------------------------------------------------------------------
// 8) Abschluss-Karte
// ---------------------------------------------------------------------------

export type UmzugSumme = {
  dauerMs: number;
  dateien: number;
  datensaetze: number;
  warnungen: number;
  abgelehnt: number;
  verschluckt: number;
};

/** Aus den Import-Protokollen eines Umzugs die Summe bilden. */
export function umzugSumme(jobs: readonly {
  zeilen_gelesen?: number | null; zeilen_gesamt?: number | null; zeilen_ok?: number | null;
  zeilen_uebersprungen?: number | null; zeilen_abgelehnt?: number | null; zeilen_doppelt?: number | null;
  zeilen_gescheitert?: number | null; zeilen_offen?: number | null; warnungen?: number | null;
  status?: string | null;
}[], startMs: number, endeMs: number): UmzugSumme {
  let datensaetze = 0; let warnungen = 0; let abgelehnt = 0; let versch = 0; let dateien = 0;
  for (const j of jobs) {
    if (j.status === 'rueckgaengig') continue;
    dateien++;
    const ok = j.zeilen_ok ?? 0;
    datensaetze += ok;
    warnungen += j.warnungen ?? 0;
    abgelehnt += (j.zeilen_abgelehnt ?? 0) + (j.zeilen_gescheitert ?? 0);
    const gelesen = j.zeilen_gelesen ?? j.zeilen_gesamt ?? 0;
    const rest = gelesen - ok - (j.zeilen_uebersprungen ?? 0) - (j.zeilen_abgelehnt ?? 0)
      - (j.zeilen_doppelt ?? 0) - (j.zeilen_gescheitert ?? 0) - (j.zeilen_offen ?? 0);
    // Alte Protokolle (vor Schritt 0) kennen die Aufteilung nicht — die
    // zaehlen nicht als verschluckt, weil wir es schlicht nicht wissen.
    if (j.zeilen_gelesen !== null && j.zeilen_gelesen !== undefined) versch += Math.max(0, rest);
  }
  return { dauerMs: Math.max(0, endeMs - startMs), dateien, datensaetze, warnungen, abgelehnt, verschluckt: versch };
}

/** "Umzug fertig in 1 Std 47 Min · 12.480 Datensätze · 3 Warnungen · 0 verschluckt" */
export function abschlussText(s: UmzugSumme): string {
  return [
    `Umzug fertig in ${formatDauer(s.dauerMs)}`,
    `${zahlDe(s.dateien)} ${s.dateien === 1 ? 'Datei' : 'Dateien'}`,
    `${zahlDe(s.datensaetze)} Datensätze`,
    `${zahlDe(s.warnungen)} ${s.warnungen === 1 ? 'Warnung' : 'Warnungen'}`,
    `${zahlDe(s.verschluckt)} verschluckt`,
  ].join(' · ');
}
