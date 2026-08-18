// lib/reportBaukasten.ts
// Report-Baukasten (Punkt 10a): Self-Service-Auswertungen. Der Nutzer wählt
// Quelle + Kennzahl (Anzahl / Summe) + Gruppierung + Zeitraum; diese Datei
// definiert die Quellen und rechnet das Ergebnis. Reine Daten/Formeln — KEINE
// Supabase-/React-Abhängigkeit. Node-getestet.

export type FeldTyp = 'zahl' | 'text' | 'datum';
export interface Feld { key: string; label: string; typ: FeldTyp; }
export interface Quelle {
  key: string; name: string; icon: string; table: string;
  datumFeld: string;           // Feld für den Zeitraum-Filter
  felder: Feld[];              // auswertbare Felder
}

// Quellen = Tabellen mit owner-RLS, die ARGONAUT sicher je Betrieb liest.
export const QUELLEN: Quelle[] = [
  { key: 'rechnungen', name: 'Rechnungen', icon: '🧾', table: 'rechnungen', datumFeld: 'rechnungsdatum',
    felder: [
      { key: 'brutto_summe', label: 'Brutto-Betrag', typ: 'zahl' },
      { key: 'netto_summe', label: 'Netto-Betrag', typ: 'zahl' },
      { key: 'zahlungsstatus', label: 'Zahlungsstatus', typ: 'text' },
      { key: 'rechnungsdatum', label: 'Rechnungsdatum', typ: 'datum' },
    ] },
  { key: 'angebote', name: 'Angebote', icon: '🗒', table: 'angebote', datumFeld: 'erstellt_am',
    felder: [
      { key: 'brutto_summe', label: 'Brutto-Betrag', typ: 'zahl' },
      { key: 'status', label: 'Status', typ: 'text' },
      { key: 'erstellt_am', label: 'Erstellt am', typ: 'datum' },
    ] },
  { key: 'deals', name: 'Deals (Pipeline)', icon: '📊', table: 'crm_deal', datumFeld: 'erstellt_am',
    felder: [
      { key: 'wert_netto', label: 'Deal-Wert', typ: 'zahl' },
      { key: 'stufe', label: 'Stufe', typ: 'text' },
      { key: 'erstellt_am', label: 'Erstellt am', typ: 'datum' },
    ] },
  { key: 'versand', name: 'Versand', icon: '📦', table: 'versand_sendung', datumFeld: 'erstellt_am',
    felder: [
      { key: 'kosten', label: 'Versandkosten', typ: 'zahl' },
      { key: 'status', label: 'Status', typ: 'text' },
      { key: 'carrier', label: 'Dienstleister', typ: 'text' },
      { key: 'richtung', label: 'Richtung', typ: 'text' },
      { key: 'erstellt_am', label: 'Erstellt am', typ: 'datum' },
    ] },
];

export function quelle(key: string | null | undefined): Quelle | undefined {
  return QUELLEN.find((q) => q.key === key);
}
export function zahlFelder(q: Quelle | undefined): Feld[] { return (q?.felder ?? []).filter((f) => f.typ === 'zahl'); }
export function textFelder(q: Quelle | undefined): Feld[] { return (q?.felder ?? []).filter((f) => f.typ === 'text'); }

function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') { const n = Number(x.replace(',', '.').trim()); return Number.isFinite(n) ? n : 0; }
  return 0;
}
function r2(n: number): number { return Math.round((n + Number.EPSILON) * 100) / 100; }

export type MetrikTyp = 'anzahl' | 'summe';
export interface ReportKonfig {
  metrik: MetrikTyp;
  summeFeld?: string | null;   // bei metrik='summe'
  gruppeFeld?: string | null;  // optional gruppieren
}
export interface ReportZeile { gruppe: string; wert: number; anteil: number; }
export interface ReportErgebnis { zeilen: ReportZeile[]; gesamt: number; istGeld: boolean; }

/**
 * Rechnet die Auswertung über bereits (zeit-)gefilterte Rows.
 * metrik 'anzahl' = Zeilen zählen; 'summe' = summeFeld aufsummieren.
 * gruppeFeld gesetzt = je Ausprägung eine Zeile (sonst eine Gesamtzeile).
 */
export function baueReport(rows: Array<Record<string, unknown>>, konfig: ReportKonfig): ReportErgebnis {
  const list = rows || [];
  const istSumme = konfig.metrik === 'summe' && !!konfig.summeFeld;
  const wertVon = (r: Record<string, unknown>): number => istSumme ? z(r[konfig.summeFeld as string]) : 1;

  const map = new Map<string, number>();
  let gesamt = 0;
  for (const r of list) {
    const g = konfig.gruppeFeld ? String(r[konfig.gruppeFeld] ?? '—').trim() || '—' : 'Gesamt';
    const w = wertVon(r);
    map.set(g, (map.get(g) || 0) + w);
    gesamt += w;
  }
  gesamt = istSumme ? r2(gesamt) : gesamt;

  const zeilen: ReportZeile[] = [...map.entries()]
    .map(([gruppe, wert]) => ({ gruppe, wert: istSumme ? r2(wert) : wert, anteil: gesamt > 0 ? Math.round((wert / gesamt) * 100) : 0 }))
    .sort((a, b) => b.wert - a.wert);

  return { zeilen, gesamt, istGeld: istSumme };
}

export function formatWert(n: number, istGeld: boolean): string {
  if (istGeld) return (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  return (Number(n) || 0).toLocaleString('de-DE');
}

/** CSV aus dem Ergebnis (für Export, 10b). */
export function reportCsv(erg: ReportErgebnis, gruppeLabel: string, metrikLabel: string): string {
  const head = `${gruppeLabel};${metrikLabel};Anteil %`;
  const zeilen = erg.zeilen.map((z2) => `${String(z2.gruppe).replace(/;/g, ',')};${z2.wert};${z2.anteil}`);
  return [head, ...zeilen, `Gesamt;${erg.gesamt};100`].join('\n');
}

// ============================================================================
// GESPEICHERTE AUSWERTUNGEN (16.08.26)
//
// Bisher war jede Auswertung nach dem Verlassen der Seite weg. Wer „unsere
// Monatsauswertung" wollte, klickte sie jedes Mal neu zusammen.
//
// Gespeichert wird die EINSTELLUNG, nie das Ergebnis. Sonst zeigte ein Report
// von gestern die Zahlen von gestern, und niemand wuesste, warum sie nicht zum
// Cockpit passen.
//
// Der Zeitraum wird RELATIV gespeichert („letzte 90 Tage"), nicht als festes
// Datumspaar. Ein gespeicherter Report soll beim naechsten Oeffnen die
// aktuellen Zahlen zeigen — ein eingefrorenes Von-Bis waere in drei Monaten
// wertlos und faellt niemandem auf, weil die Zahlen ja plausibel aussehen.
// ============================================================================

export type ZeitraumKey = 'monat' | 'quartal' | 'jahr' | 'alles';

export const ZEITRAEUME: Array<{ key: ZeitraumKey; label: string; tage: number | null }> = [
  { key: 'monat', label: 'Letzte 30 Tage', tage: 30 },
  { key: 'quartal', label: 'Letzte 90 Tage', tage: 90 },
  { key: 'jahr', label: 'Letzte 365 Tage', tage: 365 },
  { key: 'alles', label: 'Ohne Zeitgrenze', tage: null },
];

export function istZeitraumKey(x: unknown): x is ZeitraumKey {
  return typeof x === 'string' && ZEITRAEUME.some((z) => z.key === x);
}

/** Wieviele Tage zurueck? null = keine Grenze. Unbekanntes faellt auf ein Jahr. */
export function zeitraumTage(key: string | null | undefined): number | null {
  const t = ZEITRAEUME.find((z) => z.key === key);
  return t ? t.tage : 365;
}

/**
 * Aus einem relativen Zeitraum ein Von-Bis machen.
 * `heute` wird uebergeben statt hier gelesen — sonst waere die Funktion nicht
 * testbar und das Ergebnis haenge davon ab, wann jemand hinsieht.
 */
export function zeitraumSpanne(key: string | null | undefined, heute: Date): { von: string; bis: string } {
  const bis = heute.toISOString().slice(0, 10);
  const tage = zeitraumTage(key);
  if (tage === null) return { von: '', bis };
  const von = new Date(heute.getTime() - tage * 86400000).toISOString().slice(0, 10);
  return { von, bis };
}

/** Eine Zeile aus `report_gespeichert`. */
export interface GespeicherterReport {
  id: string;
  name: string;
  quelle: string;
  metrik: string;
  summe_feld?: string | null;
  gruppe_feld?: string | null;
  zeitraum?: string | null;
  plan?: string | null;
  plan_empfaenger?: string | null;
}

export interface KonfigPruefung {
  ok: boolean;
  /** Klartext-Beanstandungen — leer heisst brauchbar. */
  fehler: string[];
  /** Die bereinigte Konfiguration, so weit sie traegt. */
  konfig: ReportKonfig & { quelleKey: string; zeitraum: ZeitraumKey };
}

/**
 * Ist ein gespeicherter Report noch gueltig?
 *
 * DER GRUND, WARUM ES DIESE FUNKTION GIBT: Ein gespeicherter Report zeigt auf
 * Felder einer Quelle. Faellt spaeter ein Feld aus QUELLEN weg oder wird
 * umbenannt, rechnet der Report sonst klaglos weiter — nur eben mit
 * Nullwerten, weil das Feld nicht mehr existiert. Eine Summe von 0 EUR sieht
 * aus wie ein schlechter Monat, nicht wie ein Fehler. Deshalb wird lieber
 * laut beanstandet als leise falsch gerechnet.
 */
export function pruefeGespeicherten(r: GespeicherterReport | null | undefined): KonfigPruefung {
  const fehler: string[] = [];
  const q = quelle(r?.quelle);

  if (!q) {
    fehler.push(`Die Quelle „${r?.quelle ?? '—'}" gibt es nicht mehr.`);
    return {
      ok: false, fehler,
      konfig: { quelleKey: QUELLEN[0].key, metrik: 'anzahl', summeFeld: null, gruppeFeld: null, zeitraum: 'jahr' },
    };
  }

  const metrik: MetrikTyp = r?.metrik === 'summe' ? 'summe' : 'anzahl';

  let summeFeld: string | null = null;
  if (metrik === 'summe') {
    const gewuenscht = String(r?.summe_feld ?? '');
    const treffer = zahlFelder(q).find((f) => f.key === gewuenscht);
    if (treffer) summeFeld = treffer.key;
    else {
      fehler.push(`Das Summen-Feld „${gewuenscht || '—'}" gibt es in „${q.name}" nicht mehr.`);
      summeFeld = zahlFelder(q)[0]?.key ?? null;
    }
  }

  let gruppeFeld: string | null = null;
  const gWunsch = String(r?.gruppe_feld ?? '');
  if (gWunsch) {
    const treffer = textFelder(q).find((f) => f.key === gWunsch);
    if (treffer) gruppeFeld = treffer.key;
    else fehler.push(`Die Gruppierung „${gWunsch}" gibt es in „${q.name}" nicht mehr.`);
  }

  const zeitraum: ZeitraumKey = istZeitraumKey(r?.zeitraum) ? r.zeitraum : 'jahr';

  return { ok: fehler.length === 0, fehler, konfig: { quelleKey: q.key, metrik, summeFeld, gruppeFeld, zeitraum } };
}

/** Ein Name, der in einer Liste wiederzufinden ist. Leer -> Vorschlag aus der Quelle. */
export function reportName(roh: string | null | undefined, quelleKey: string, metrik: string): string {
  const n = String(roh ?? '').trim().slice(0, 120);
  if (n) return n;
  const q = quelle(quelleKey);
  return `${q?.name ?? 'Auswertung'} — ${metrik === 'summe' ? 'Summe' : 'Anzahl'}`;
}

// ============================================================================
// GEPLANTE AUSWERTUNGEN (18.08.26)
//
// Eine gespeicherte Auswertung kann sich regelmaessig selbst per Mail melden.
// Die Faelligkeit wird hier gerechnet, nicht im Cron: so ist sie node-testbar
// und haengt nicht davon ab, wann jemand hinsieht.
//
// WARUM DER LETZTE VERSAND ZAEHLT UND NICHT DER WOCHENTAG
// „Jeden Montag" klingt einfach, ist es aber nicht: faellt ein Cron-Lauf aus
// (Wartung, Fehler), waere der Bericht fuer diese Woche fuer immer verloren —
// am Dienstag ist ja nicht Montag. Gerechnet wird deshalb der ABSTAND zum
// letzten tatsaechlichen Versand. Ein ausgefallener Lauf holt sich beim
// naechsten Durchgang selbst nach, und niemand merkt etwas.
//
// UND WARUM NICHT OEFTER ALS GEPLANT
// Der Cron laeuft taeglich. Ohne Abstandspruefung bekaeme der Betrieb seinen
// „monatlichen" Bericht jeden Tag — 30 Mails statt einer. Bei Resend im
// Free-Tarif waere das Tageskontingent nach drei Kunden aufgebraucht.
// ============================================================================

export type PlanKey = 'keiner' | 'woechentlich' | 'monatlich';

export const PLAENE: Array<{ key: PlanKey; label: string; tage: number | null }> = [
  { key: 'keiner', label: 'Nicht automatisch senden', tage: null },
  { key: 'woechentlich', label: 'Wöchentlich per E-Mail', tage: 7 },
  { key: 'monatlich', label: 'Monatlich per E-Mail', tage: 30 },
];

export function istPlanKey(x: unknown): x is PlanKey {
  return typeof x === 'string' && PLAENE.some((p) => p.key === x);
}

/** Abstand in Tagen. null = gar nicht senden. Unbekanntes sendet NICHT. */
export function planTage(key: string | null | undefined): number | null {
  const p = PLAENE.find((x) => x.key === key);
  return p ? p.tage : null;
}

/**
 * Ist dieser geplante Report jetzt faellig?
 *
 * Bewusst streng: Im Zweifel wird NICHT gesendet. Eine ausgefallene Mail
 * bemerkt der Betrieb und fragt nach; eine Mail zu viel — jeden Tag dieselbe —
 * kostet Vertrauen und Kontingent.
 */
export function istFaellig(
  plan: string | null | undefined,
  zuletztGesendet: string | null | undefined,
  jetzt: Date,
): boolean {
  const tage = planTage(plan);
  if (tage === null) return false;

  const roh = String(zuletztGesendet ?? '').trim();
  if (!roh) return true;                       // noch nie gesendet -> jetzt

  const letzte = new Date(roh).getTime();
  if (isNaN(letzte)) return true;              // unlesbares Datum -> lieber senden
  if (letzte > jetzt.getTime()) return false;  // Datum in der Zukunft -> nichts tun

  return jetzt.getTime() - letzte >= tage * 86400000;
}

/** Wann ist der naechste Versand faellig? null = kein Plan. Fuer die Anzeige. */
export function naechsterVersand(
  plan: string | null | undefined,
  zuletztGesendet: string | null | undefined,
): Date | null {
  const tage = planTage(plan);
  if (tage === null) return null;
  const roh = String(zuletztGesendet ?? '').trim();
  const letzte = roh ? new Date(roh).getTime() : NaN;
  if (isNaN(letzte)) return null;              // noch nie gesendet -> beim naechsten Lauf
  return new Date(letzte + tage * 86400000);
}

/**
 * Empfaenger aus einem Freitextfeld holen.
 * Mehrere durch Komma, Semikolon oder Zeilenumbruch getrennt. Doppelte fallen
 * raus — sonst bekommt jemand denselben Bericht zweimal, und das Kontingent
 * zahlt es doppelt.
 */
export function empfaengerListe(roh: string | null | undefined, grenze = 10): string[] {
  const teile = String(roh ?? '')
    .split(/[,;\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));
  return [...new Set(teile)].slice(0, grenze);
}
