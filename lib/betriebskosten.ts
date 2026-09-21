// lib/betriebskosten.ts
// B-IV Teil 2 · Betriebskostenabrechnung — reine Formeln & Logik.
// KEINE Supabase-Aufrufe, KEINE React-Hooks (importierbar von Client + Node).
//
// Recht (verifiziert 07/2026):
//   §2 BetrKV — 17 umlagefähige Kostenarten (Katalog unten).
//   §556a BGB — ohne Vereinbarung wird nach Wohnfläche umgelegt.
//   §7 HeizkostenV — Heiz-/Warmwasserkosten: mind. 50 %, höchstens 70 % nach
//   erfasstem Verbrauch; der Rest (Grundkosten) nach Wohn-/Nutzfläche.
//
// ▄▄▄ PUNKT 29b (20.09.2026) ▄▄▄
// Im Kopf stand bis heute „Node-getestet (betriebskosten.test.ts)". DIESE
// TESTDATEI GIBT ES IM REPO NICHT — dieselbe falsche Zusage wie bei
// bankAbgleich.ts (P18), fristen.ts (P21) und provision.ts (P25). Jetzt gibt
// es tests/steuerRechnerP29.test.mjs, und die Zusage stimmt.
//
// Drei Befunde, alle am echten Code GEMESSEN:
//
//  1. OHNE ERFASSTEN VERBRAUCH VERSCHWINDEN DIE HEIZKOSTEN FAST GANZ.
//     GEMESSEN: zwei Einheiten ohne Verbrauchswerte, 1.000 EUR Heizkosten →
//     verteilt wurden 300 EUR. Die 700 EUR Verbrauchsanteil fielen weg, weil
//     die Verteilbasis 0 war — ohne jede Meldung.
//     NICHT GERATEN: Wie ohne Erfassung abzurechnen ist, ist eine
//     Rechtsfrage (§ 9a HeizkostenV lässt eine Schätzung zu, nach welchem
//     Maßstab entscheidet der Vermieter). Die Verteilung bleibt deshalb wie
//     sie ist — aber bkHinweise() sagt es jetzt im Klartext.
//
//  2. r2() las Zahlen mit Number() und rundete unsymmetrisch. Ein Betrag als
//     "1.234,56" wurde 0, und ein GUTHABEN über -2,345 EUR wurde -2,34 statt
//     -2,35. Jetzt über lib/zahlen.ts.
//
//  3. Jeder Anteil wird einzeln auf Cent gerundet, deshalb trifft die Summe
//     den Gesamtbetrag nicht immer: 100 EUR auf drei gleiche Einheiten ergibt
//     99,99 EUR. Eine Restcent-Verteilung würde jede bestehende Abrechnung
//     ändern; stattdessen nennt bkHinweise() die Differenz.
//
// Node-getestet: tests/steuerRechnerP29.test.mjs

import { leseZahlOder, centRunden } from './zahlen';

export type Verteiler = 'wohnflaeche' | 'personen' | 'einheiten' | 'verbrauch';

export const VERTEILER: { key: Verteiler; label: string }[] = [
  { key: 'wohnflaeche', label: 'Wohnfläche (m²)' },
  { key: 'personen', label: 'Personen' },
  { key: 'einheiten', label: 'Einheiten (gleich)' },
  { key: 'verbrauch', label: 'Verbrauch' },
];

// §2 BetrKV — Katalog mit üblichem Standard-Verteiler.
export interface BetrKvArt { nr: number; bezeichnung: string; verteiler: Verteiler; heiz?: boolean; }
export const BETRKV_KATALOG: BetrKvArt[] = [
  { nr: 1, bezeichnung: 'Grundsteuer', verteiler: 'wohnflaeche' },
  { nr: 2, bezeichnung: 'Wasserversorgung', verteiler: 'verbrauch' },
  { nr: 3, bezeichnung: 'Entwässerung', verteiler: 'wohnflaeche' },
  { nr: 4, bezeichnung: 'Heizung', verteiler: 'verbrauch', heiz: true },
  { nr: 5, bezeichnung: 'Warmwasser', verteiler: 'verbrauch', heiz: true },
  { nr: 6, bezeichnung: 'Verbundene Heizung/Warmwasser', verteiler: 'verbrauch', heiz: true },
  { nr: 7, bezeichnung: 'Aufzug', verteiler: 'einheiten' },
  { nr: 8, bezeichnung: 'Straßenreinigung & Müllbeseitigung', verteiler: 'wohnflaeche' },
  { nr: 9, bezeichnung: 'Gebäudereinigung & Ungezieferbekämpfung', verteiler: 'wohnflaeche' },
  { nr: 10, bezeichnung: 'Gartenpflege', verteiler: 'wohnflaeche' },
  { nr: 11, bezeichnung: 'Beleuchtung', verteiler: 'wohnflaeche' },
  { nr: 12, bezeichnung: 'Schornsteinreinigung', verteiler: 'einheiten' },
  { nr: 13, bezeichnung: 'Sach- & Haftpflichtversicherung', verteiler: 'wohnflaeche' },
  { nr: 14, bezeichnung: 'Hauswart/Hausmeister', verteiler: 'wohnflaeche' },
  { nr: 15, bezeichnung: 'Gemeinschaftsantenne/Breitband', verteiler: 'einheiten' },
  { nr: 16, bezeichnung: 'Wascheinrichtungen', verteiler: 'einheiten' },
  { nr: 17, bezeichnung: 'Sonstige Betriebskosten', verteiler: 'wohnflaeche' },
];

export const HEIZ_VERBRAUCH_MIN = 50;
export const HEIZ_VERBRAUCH_MAX = 70;
export const HEIZ_VERBRAUCH_STD = 70;

/** Auf Cent runden — symmetrisch, damit ein Guthaben nicht anders rundet. */
function r2(n: number): number { return centRunden(leseZahlOder(n, 0)); }

/** Zahl lesen; nicht lesbar heisst 0 (diese Datei kennt keinen null-Fall). */
function z(n: unknown): number { return leseZahlOder(n, 0); }

/** Verbrauchsanteil auf den zulässigen Bereich 50–70 % begrenzen. */
export function heizVerbrauchAnteil(prozent: number | null | undefined): number {
  if (prozent == null) return HEIZ_VERBRAUCH_STD;
  const p = leseZahlOder(prozent, Number.NaN);
  if (!Number.isFinite(p)) return HEIZ_VERBRAUCH_STD;
  return Math.min(Math.max(p, HEIZ_VERBRAUCH_MIN), HEIZ_VERBRAUCH_MAX);
}
export function heizAnteilGueltig(prozent: number): boolean {
  const p = leseZahlOder(prozent, Number.NaN);
  return p >= HEIZ_VERBRAUCH_MIN && p <= HEIZ_VERBRAUCH_MAX;
}

// ---------------------------------------------------------------------------
// Einheiten & Kostenarten
// ---------------------------------------------------------------------------
export interface EinheitLite {
  id?: string;
  wohnflaeche?: number;
  personen?: number;
  verbrauch?: number;
  vorauszahlung?: number;
}
export interface KostenartLite {
  id?: string;
  bezeichnung?: string;
  betrag_gesamt?: number;
  verteiler?: Verteiler;
  ist_heizkosten?: boolean;
  verbrauch_anteil_prozent?: number | null;
}

/** Basiswert einer Einheit für einen Verteilerschlüssel. */
export function basisWert(e: EinheitLite, v: Verteiler): number {
  if (v === 'wohnflaeche') return z(e.wohnflaeche);
  if (v === 'personen') return z(e.personen);
  if (v === 'verbrauch') return z(e.verbrauch);
  return 1; // einheiten: jede Einheit gleich
}

export function summeBasis(einheiten: EinheitLite[], v: Verteiler): number {
  return einheiten.reduce((s, e) => s + basisWert(e, v), 0);
}

/** Anteil einer Einheit an EINER Kostenart (inkl. Heizkosten-Split nach HeizkostenV). */
export function anteilKostenart(k: KostenartLite, e: EinheitLite, einheiten: EinheitLite[]): number {
  const betrag = z(k.betrag_gesamt);
  if (betrag === 0) return 0;
  const teile = (b: number, basisE: number, basisS: number) => (basisS > 0 ? b * (basisE / basisS) : 0);

  if (k.ist_heizkosten) {
    const vProz = heizVerbrauchAnteil(k.verbrauch_anteil_prozent);
    const verbrauchBetrag = betrag * vProz / 100;
    const grundBetrag = betrag - verbrauchBetrag;
    const anteilV = teile(verbrauchBetrag, basisWert(e, 'verbrauch'), summeBasis(einheiten, 'verbrauch'));
    const anteilG = teile(grundBetrag, basisWert(e, 'wohnflaeche'), summeBasis(einheiten, 'wohnflaeche'));
    return r2(anteilV + anteilG);
  }
  const v = k.verteiler ?? 'wohnflaeche';
  return r2(teile(betrag, basisWert(e, v), summeBasis(einheiten, v)));
}

export interface AbrechnungsPosition { bezeichnung: string; anteil: number; }
export interface EinheitAbrechnung {
  positionen: AbrechnungsPosition[];
  summeKosten: number;
  vorauszahlung: number;
  saldo: number; // > 0 = Nachzahlung, < 0 = Guthaben
}

/** Komplette Abrechnung für EINE Einheit über alle Kostenarten. */
export function abrechnungFuerEinheit(e: EinheitLite, kostenarten: KostenartLite[], einheiten: EinheitLite[]): EinheitAbrechnung {
  const positionen = kostenarten.map((k) => ({ bezeichnung: k.bezeichnung || 'Kostenart', anteil: anteilKostenart(k, e, einheiten) }));
  const summeKosten = r2(positionen.reduce((s, p) => s + p.anteil, 0));
  const vorauszahlung = r2(e.vorauszahlung as number);
  return { positionen, summeKosten, vorauszahlung, saldo: r2(summeKosten - vorauszahlung) };
}

/** Kontrollsumme: verteilte Kosten über alle Einheiten je Kostenart = Gesamtbetrag? */
export function verteilteSumme(kostenarten: KostenartLite[], einheiten: EinheitLite[]): number {
  let s = 0;
  for (const k of kostenarten) for (const e of einheiten) s += anteilKostenart(k, e, einheiten);
  return r2(s);
}
export function gesamtKosten(kostenarten: KostenartLite[]): number {
  return r2(kostenarten.reduce((s, k) => s + z(k.betrag_gesamt), 0));
}

// ---------------------------------------------------------------------------
// Was der Vermieter VOR dem Versenden sehen muss (Punkt 29b, additiv)
// ---------------------------------------------------------------------------

/**
 * Nennt die Stellen, an denen die Abrechnung nicht aufgeht.
 *
 * Wie extfHinweise und ustvaHinweise: ändert NICHTS und blockiert nichts,
 * macht nur sichtbar, was ein Mensch ansehen muss. Eine
 * Betriebskostenabrechnung wird vom Mieter nachgerechnet — was hier fehlt,
 * fällt dort auf.
 */
export function bkHinweise(einheiten: EinheitLite[], kostenarten: KostenartLite[]): string[] {
  const raus: string[] = [];
  const eur = (n: number) => `${centRunden(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

  // 1. Heizkosten ohne erfassten Verbrauch — der schwerste Fall.
  const heizOhneBasis = kostenarten.filter((k) => k.ist_heizkosten && z(k.betrag_gesamt) !== 0);
  if (heizOhneBasis.length > 0 && summeBasis(einheiten, 'verbrauch') <= 0) {
    const summe = heizOhneBasis.reduce((s, k) => s + z(k.betrag_gesamt) * heizVerbrauchAnteil(k.verbrauch_anteil_prozent) / 100, 0);
    raus.push(
      `Für keine Einheit ist ein Verbrauch erfasst. Der verbrauchsabhängige Teil der Heiz- und ` +
        `Warmwasserkosten — ${eur(summe)} — wird deshalb auf NIEMANDEN verteilt und fehlt in der ` +
        `Abrechnung. Nach § 7 HeizkostenV müssen mindestens 50 % nach Verbrauch abgerechnet werden; ` +
        `ohne Erfassung lässt § 9a HeizkostenV eine Schätzung zu. Nach welchem Maßstab geschätzt wird, ` +
        `entscheidet der Vermieter — ARGONAUT rät das bewusst nicht.`,
    );
  }

  // 2. Einzelne Verteiler ohne Basis.
  for (const v of ['wohnflaeche', 'personen', 'verbrauch'] as Verteiler[]) {
    const betroffen = kostenarten.filter((k) => !k.ist_heizkosten && (k.verteiler ?? 'wohnflaeche') === v && z(k.betrag_gesamt) !== 0);
    if (betroffen.length > 0 && summeBasis(einheiten, v) <= 0) {
      const summe = betroffen.reduce((s, k) => s + z(k.betrag_gesamt), 0);
      const name = VERTEILER.find((x) => x.key === v)?.label ?? v;
      raus.push(
        `${betroffen.length === 1 ? 'Eine Kostenart wird' : `${betroffen.length} Kostenarten werden`} nach ` +
          `„${name}" verteilt, aber keine Einheit hat dafür einen Wert. ${eur(summe)} bleiben unverteilt.`,
      );
    }
  }

  // 3. Rundungsdifferenz.
  const gesamt = gesamtKosten(kostenarten);
  const verteilt = verteilteSumme(kostenarten, einheiten);
  const diff = centRunden(gesamt - verteilt);
  if (diff !== 0 && raus.length === 0) {
    raus.push(
      `Die verteilten Anteile ergeben ${eur(verteilt)}, die Kosten betragen ${eur(gesamt)} — ` +
        `Differenz ${eur(diff)}. Das ist Centrundung bei der Aufteilung, kein Rechenfehler. ` +
        `Wer sie vermeiden will, legt den Restbetrag auf eine Einheit.`,
    );
  } else if (diff !== 0) {
    raus.push(`Verteilt sind ${eur(verteilt)} von ${eur(gesamt)} — Differenz ${eur(diff)}.`);
  }

  // 4. Verbrauchsanteil außerhalb des zulässigen Bereichs.
  const luecken = kostenarten.filter(
    (k) => k.ist_heizkosten && k.verbrauch_anteil_prozent != null && !heizAnteilGueltig(k.verbrauch_anteil_prozent as number),
  );
  for (const k of luecken) {
    raus.push(
      `„${k.bezeichnung || 'Heizkosten'}": ${k.verbrauch_anteil_prozent} % Verbrauchsanteil liegen außerhalb der ` +
        `nach § 7 HeizkostenV zulässigen ${HEIZ_VERBRAUCH_MIN}–${HEIZ_VERBRAUCH_MAX} %. ` +
        `Gerechnet wird mit ${heizVerbrauchAnteil(k.verbrauch_anteil_prozent)} %.`,
    );
  }

  return raus;
}

// ---------------------------------------------------------------------------
// KPI-Zähler
// ---------------------------------------------------------------------------
export interface BkKennzahlen {
  einheiten: number;
  kostenGesamt: number;
  vorauszahlungGesamt: number;
  saldoGesamt: number;      // Summe aller Salden (Nachzahlung − Guthaben)
  nachzahler: number;
  heizLuecken: number;      // Heizkosten-Positionen mit Verbrauchsanteil außerhalb 50–70 %
}

export function zaehleBk(einheiten: EinheitLite[], kostenarten: KostenartLite[]): BkKennzahlen {
  const kostenGesamt = gesamtKosten(kostenarten);
  const vorauszahlungGesamt = r2(einheiten.reduce((s, e) => s + z(e.vorauszahlung), 0));
  let saldoGesamt = 0, nachzahler = 0;
  for (const e of einheiten) {
    const a = abrechnungFuerEinheit(e, kostenarten, einheiten);
    saldoGesamt += a.saldo;
    if (a.saldo > 0) nachzahler++;
  }
  const heizLuecken = kostenarten.filter((k) => k.ist_heizkosten && k.verbrauch_anteil_prozent != null && !heizAnteilGueltig(k.verbrauch_anteil_prozent as number)).length;
  return {
    einheiten: einheiten.length,
    kostenGesamt,
    vorauszahlungGesamt,
    saldoGesamt: r2(saldoGesamt),
    nachzahler,
    heizLuecken,
  };
}

// ============================================================================
// PUNKT 65 / R12, PAKET 2 (21.09.2026) — ZWÖLFMONATSFRIST UND KABELANSCHLUSS
//
// REIN ADDITIV. Der BetrKV-Katalog, die Verteiler und alle Rechenfunktionen
// darüber bleiben unverändert.
//
// ▄▄▄ BEFUND 1 — DIE ZWÖLFMONATSFRIST FEHLTE GANZ ▄▄▄
// § 556 Abs. 3 Satz 2 und 3 BGB: Der Vermieter muss binnen ZWÖLF MONATEN
// nach Ende des Abrechnungszeitraums abrechnen. Danach ist die
// Geltendmachung einer NACHFORDERUNG ausgeschlossen — es sei denn, er hat
// die Verspätung nicht zu vertreten.
//
// Das ist eine AUSSCHLUSSFRIST, keine Verjährung: sie wirkt von selbst, der
// Mieter muss sich nicht darauf berufen. Und sie ist einseitig — ein
// GUTHABEN des Mieters muss trotzdem ausgezahlt werden.
//
// Für einen Hausverwalter mit zwanzig Einheiten ist das der teuerste Termin
// im Jahr, und bis heute erinnerte ihn nichts daran.
//
// ▄▄▄ BEFUND 2 — DER KABELANSCHLUSS STEHT NOCH IM KATALOG ▄▄▄
// Nr. 15 heißt hier „Gemeinschaftsantenne/Breitband". Seit dem 1. Juli 2024
// ist das TV-GRUNDENTGELT nicht mehr umlagefähig — das Nebenkostenprivileg
// ist mit dem Telekommunikationsmodernisierungsgesetz entfallen
// (§ 2 Nr. 15 BetrKV, § 230 Abs. 5 TKG).
//
// WICHTIG, und der Grund, warum die Zeile nicht einfach gestrichen wird:
// Nr. 15 ist NICHT komplett weg. Umlagefähig bleiben der Betriebsstrom der
// Gemeinschaftsantennenanlage und die Kosten der Betriebsbereitschafts-
// prüfung; NEU hinzugekommen ist das Glasfaser-Bereitstellungsentgelt nach
// § 72 Abs. 1 TKG (§ 2 Nr. 15 lit. c BetrKV). Wer die Position ganz
// streicht, nimmt dem Vermieter etwas, das ihm zusteht.
// ============================================================================

/** Abrechnungsfrist in Monaten nach Ende des Abrechnungszeitraums. */
export const ABRECHNUNGSFRIST_MONATE = 12;

/** Tag, ab dem das TV-Grundentgelt nicht mehr umlagefähig ist. */
export const KABEL_PRIVILEG_ENDE = '2024-07-01';

/** Nummer der betroffenen Kostenart im BetrKV-Katalog. */
export const BETRKV_NR_ANTENNE = 15;

export interface FristErgebnis {
  /** Letzter Tag, an dem die Abrechnung beim Mieter sein muss. */
  fristEnde: string;
  /** Tage bis zum Fristende, negativ wenn schon vorbei. */
  tageBis: number;
  abgelaufen: boolean;
  /** Kann der Vermieter noch nachfordern? */
  nachforderungMoeglich: boolean;
  /** Ein Guthaben muss IMMER ausgezahlt werden — auch nach Fristablauf. */
  guthabenAuszahlen: true;
  hinweis: string;
}

function tagUtc(iso: string): number {
  const y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)), d = Number(iso.slice(8, 10));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d);
}

function isoVon(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Prüft die Zwölfmonatsfrist für einen Abrechnungszeitraum.
 *
 * `endeISO` ist der LETZTE Tag des Abrechnungszeitraums (bei Kalenderjahr
 * also der 31.12.). Die Frist endet zwölf Monate später am selben Kalendertag.
 *
 * `nichtZuVertreten` ist die Ausnahme des § 556 Abs. 3 Satz 3 BGB. Sie ist
 * ein EINGABEWERT, kein Standardwert: ob die Verspätung entschuldigt ist,
 * kann die Software nicht wissen, und eine ungeprüfte Annahme wäre hier
 * teurer als eine Rückfrage.
 */
export function abrechnungsfrist(
  endeISO: string,
  heuteISO: string,
  nichtZuVertreten = false,
): FristErgebnis {
  const ende = tagUtc(endeISO);
  const heute = tagUtc(heuteISO);
  if (!Number.isFinite(ende) || !Number.isFinite(heute)) {
    return {
      fristEnde: endeISO, tageBis: 0, abgelaufen: false,
      nachforderungMoeglich: true, guthabenAuszahlen: true,
      hinweis: 'Abrechnungszeitraum oder Stichtag sind kein gültiges Datum.',
    };
  }

  const d = new Date(ende);
  const fristMs = Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate());
  const fristEnde = isoVon(fristMs);
  const tageBis = Math.round((fristMs - heute) / 86400000);
  const abgelaufen = tageBis < 0;

  let hinweis: string;
  if (!abgelaufen) {
    hinweis = tageBis <= 60
      ? `Noch ${tageBis} Tage bis zum ${fristEnde}. Danach ist eine Nachforderung nach § 556 Abs. 3 BGB ausgeschlossen.`
      : `Die Abrechnung muss bis zum ${fristEnde} beim Mieter sein (§ 556 Abs. 3 Satz 2 BGB).`;
  } else if (nichtZuVertreten) {
    hinweis =
      `Die Frist lief am ${fristEnde} ab. Eine Nachforderung ist nur möglich, weil die Verspätung als ` +
      'nicht zu vertreten eingestuft wurde (§ 556 Abs. 3 Satz 3 BGB) — das muss der Vermieter belegen können.';
  } else {
    hinweis =
      `Die Frist lief am ${fristEnde} ab (vor ${Math.abs(tageBis)} Tagen). Eine NACHFORDERUNG ist ausgeschlossen ` +
      '(§ 556 Abs. 3 Satz 3 BGB) — das wirkt von selbst, der Mieter muss sich nicht darauf berufen. ' +
      'Ein GUTHABEN muss trotzdem ausgezahlt werden.';
  }

  return {
    fristEnde, tageBis, abgelaufen,
    nachforderungMoeglich: !abgelaufen || nichtZuVertreten,
    guthabenAuszahlen: true,
    hinweis,
  };
}

/**
 * Was von einer Abrechnung nach Fristablauf übrig bleibt.
 * Eine Nachforderung fällt weg, ein Guthaben nicht.
 */
export function ergebnisNachFrist(saldo: number, frist: FristErgebnis): {
  betrag: number;
  art: 'nachforderung' | 'guthaben' | 'ausgeglichen' | 'nachforderung_verfallen';
  hinweis: string;
} {
  const s = centRunden(leseZahlOder(saldo, 0));
  if (Math.abs(s) < 0.005) return { betrag: 0, art: 'ausgeglichen', hinweis: 'Die Abrechnung geht auf null auf.' };

  // Positiv = Nachforderung des Vermieters, negativ = Guthaben des Mieters.
  if (s < 0) {
    return {
      betrag: s, art: 'guthaben',
      hinweis: frist.abgelaufen
        ? 'Guthaben des Mieters — wird trotz abgelaufener Frist ausgezahlt.'
        : 'Guthaben des Mieters.',
    };
  }
  if (!frist.nachforderungMoeglich) {
    return {
      betrag: 0, art: 'nachforderung_verfallen',
      hinweis:
        `Die Nachforderung über ${s.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR ` +
        'ist nach § 556 Abs. 3 Satz 3 BGB ausgeschlossen, weil die Abrechnung zu spät kam.',
    };
  }
  return { betrag: s, art: 'nachforderung', hinweis: 'Nachforderung des Vermieters.' };
}

export interface KostenartPruefung {
  umlagefaehig: boolean;
  /** Teilweise: die Position gibt es noch, aber nicht mehr in voller Höhe. */
  teilweise: boolean;
  hinweis: string | null;
}

/**
 * Prüft eine Kostenart auf Besonderheiten, die der Katalog nicht abbildet.
 *
 * BEFUND 2: Nr. 15 ist nicht pauschal weg. Deshalb gibt diese Funktion
 * `teilweise: true` zurück und sagt im Klartext, WAS noch geht — statt die
 * Position stumm zu streichen und dem Vermieter etwas wegzunehmen.
 */
export function pruefeKostenart(
  nr: number,
  abrechnungsEndeISO: string,
): KostenartPruefung {
  if (nr !== BETRKV_NR_ANTENNE) return { umlagefaehig: true, teilweise: false, hinweis: null };

  const ende = tagUtc(abrechnungsEndeISO);
  const stichtag = tagUtc(KABEL_PRIVILEG_ENDE);
  if (!Number.isFinite(ende) || ende < stichtag) {
    return {
      umlagefaehig: true, teilweise: false,
      hinweis: `Für Zeiträume vor dem ${KABEL_PRIVILEG_ENDE} war das TV-Grundentgelt noch umlagefähig.`,
    };
  }

  return {
    umlagefaehig: true,
    teilweise: true,
    hinweis:
      `Seit dem ${KABEL_PRIVILEG_ENDE} ist das GRUNDENTGELT für Kabel-TV nicht mehr umlagefähig — ` +
      'das Nebenkostenprivileg ist mit dem Telekommunikationsmodernisierungsgesetz entfallen ' +
      '(§ 2 Nr. 15 BetrKV, § 230 Abs. 5 TKG). Weiterhin umlagefähig bleiben: Betriebsstrom der ' +
      'Gemeinschaftsantennenanlage, Kosten der Betriebsbereitschaftsprüfung und — unter den ' +
      'Voraussetzungen des § 2 Nr. 15 lit. c BetrKV — das Glasfaser-Bereitstellungsentgelt nach ' +
      '§ 72 Abs. 1 TKG. Bitte prüfen, was in dieser Position wirklich steckt.',
  };
}
