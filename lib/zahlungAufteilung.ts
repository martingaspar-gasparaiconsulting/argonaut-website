// ============================================================================
// ARGONAUT OS · lib/zahlungAufteilung.ts
//
// WOFUER DAS DA IST
// Eine Zahlung kommt herein. Gehoert sie zu einer Rechnung, ist alles klar:
// Netto und Umsatzsteuer stehen dort. Gehoert sie zu keiner — Barzahlung,
// Anzahlung, Kassenumsatz, importierter Kontoauszug —, kennt niemand den
// Steuersatz.
//
// WAS BISHER PASSIERTE UND WARUM ES FALSCH WAR
// Der gesamte Betrag wurde als Netto gezaehlt und die Umsatzsteuer
// verschluckt. Aus 119 Euro wurden 119 Euro Gewinn statt 100 Euro Gewinn
// plus 19 Euro Steuerschuld. Zwei Fehler auf einmal: der Gewinn zu hoch
// (zu viel Einkommensteuer) und die vereinnahmte Umsatzsteuer nirgends
// erfasst (bei Ist-Versteuerung eine Verkuerzung).
//
// WIE ES JETZT LAEUFT — DER KUNDE ENTSCHEIDET
// 1. Hat der Betrieb einen Satz eingestellt (0/7/19), gilt der.
// 2. Sonst wird er aus den eigenen Rechnungen abgeleitet, UMSATZGEWICHTET.
//    Nicht nach Anzahl: sonst kippt eine einzige Kleinstrechnung das Bild
//    gegen zwanzig grosse Auftraege.
// 3. Gibt es keine Rechnungen, bleibt es beim alten Verhalten (alles Netto)
//    — geraten wird NICHT. Stattdessen sagt die Oberflaeche, dass geschaetzt
//    werden musste.
//
// WARUM DIE WAHL BEIM KUNDEN LIEGEN MUSS
// Ein Landwirt hat 7 % auf unverarbeitete Erzeugnisse und 19 % auf
// verarbeitete. Ein Kleinunternehmer nach § 19 hat gar keine. Ein einziger
// automatisch gesetzter Satz waere fuer die Haelfte aller Betriebe falsch.
// Der abgeleitete Wert ist deshalb ein VORSCHLAG, keine Festlegung.
//
// Keine Imports, keine Hooks — node-testbar.
// ============================================================================

/** Die Saetze, die das deutsche Umsatzsteuerrecht kennt. */
export const SAETZE = [0, 7, 19] as const;
export type Satz = 0 | 7 | 19;

export type RechnungSummen = {
  netto_summe?: number | string | null;
  mwst_summe?: number | string | null;
  brutto_summe?: number | string | null;
};

export type ZahlungRoh = {
  betrag?: number | string | null;
  zahlungsdatum?: string | null;
  rechnung_id?: string | null;
};

function z(x: unknown): number {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') {
    const n = Number(x.replace(',', '.').trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function r2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Effektiver Satz einer Rechnung, auf den naechsten Regelsatz gerundet. */
export function satzVonRechnung(r: RechnungSummen): Satz {
  const netto = z(r.netto_summe);
  const mwst = z(r.mwst_summe);
  if (netto <= 0) return 0;
  const p = (mwst / netto) * 100;
  let beste: Satz = 0;
  let abstand = Infinity;
  for (const k of SAETZE) {
    const d = Math.abs(k - p);
    if (d < abstand) { abstand = d; beste = k; }
  }
  return beste;
}

export type SatzHerkunft = 'eingestellt' | 'abgeleitet' | 'unbekannt';

export type ErsatzSatz = {
  satz: Satz;
  herkunft: SatzHerkunft;
  /** Klartext für die Oberfläche. */
  erklaerung: string;
};

/**
 * Welcher Satz gilt fuer Zahlungen ohne Rechnungsbezug?
 *
 * @param eingestellt  Wert aus profiles.zahlung_ersatz_ust_satz (null = automatisch)
 * @param rechnungen   Die Rechnungen des Betriebs, aus denen abgeleitet wird
 */
export function ermittleErsatzSatz(
  eingestellt: number | string | null | undefined,
  rechnungen: RechnungSummen[],
): ErsatzSatz {
  // 1. Eingestellter Wert schlaegt alles.
  if (eingestellt !== null && eingestellt !== undefined && String(eingestellt).trim() !== '') {
    const w = z(eingestellt);
    const treffer = SAETZE.find((s) => s === w);
    if (treffer !== undefined) {
      return {
        satz: treffer,
        herkunft: 'eingestellt',
        erklaerung: treffer === 0
          ? 'Fest eingestellt: ohne Umsatzsteuer.'
          : `Fest eingestellt: ${treffer} %.`,
      };
    }
  }

  // 2. Aus den eigenen Rechnungen ableiten — nach UMSATZ gewichtet.
  const nachSatz = new Map<Satz, number>();
  let gesamt = 0;
  for (const r of rechnungen || []) {
    const netto = z(r.netto_summe);
    if (netto <= 0) continue;
    const s = satzVonRechnung(r);
    nachSatz.set(s, (nachSatz.get(s) ?? 0) + netto);
    gesamt += netto;
  }

  if (gesamt <= 0) {
    // 3. Nichts da, woraus man schliessen koennte. Nicht raten.
    return {
      satz: 0,
      herkunft: 'unbekannt',
      erklaerung: 'Kein Steuersatz ableitbar — es liegen noch keine Rechnungen vor. Zahlungen ohne Rechnungsbezug werden vorerst ohne Umsatzsteuer gerechnet.',
    };
  }

  let beste: Satz = 0;
  let hoechster = -1;
  for (const s of SAETZE) {
    const wert = nachSatz.get(s) ?? 0;
    if (wert > hoechster) { hoechster = wert; beste = s; }
  }

  const anteil = gesamt > 0 ? Math.round((hoechster / gesamt) * 100) : 0;
  return {
    satz: beste,
    herkunft: 'abgeleitet',
    erklaerung: beste === 0
      ? `Aus Ihren Rechnungen abgeleitet: ${anteil} % Ihres Umsatzes läuft ohne Umsatzsteuer.`
      : `Aus Ihren Rechnungen abgeleitet: ${anteil} % Ihres Umsatzes läuft mit ${beste} %.`,
  };
}

export type Aufteilung = {
  brutto: number;
  netto: number;
  ust: number;
  satz: number;
  /** true = der Satz kam nicht aus einer Rechnung, sondern aus dem Ersatzwert. */
  geschaetzt: boolean;
};

/**
 * Teilt einen Zahlbetrag in Netto und Umsatzsteuer.
 *
 * Mit Rechnung wird ANTEILIG geteilt — eine Teilzahlung auf eine Rechnung
 * traegt denselben Steueranteil wie die Rechnung selbst. Ohne Rechnung wird
 * der Ersatzsatz herausgerechnet.
 */
export function teileZahlung(
  betrag: number | string | null | undefined,
  rechnung: RechnungSummen | null | undefined,
  ersatzSatz: number,
): Aufteilung {
  const brutto = r2(z(betrag));

  if (rechnung) {
    const rBrutto = z(rechnung.brutto_summe);
    const rNetto = z(rechnung.netto_summe);
    const rMwst = z(rechnung.mwst_summe);
    if (rBrutto > 0) {
      const netto = r2(brutto * (rNetto / rBrutto));
      const ust = r2(brutto - netto);
      return { brutto, netto, ust, satz: satzVonRechnung(rechnung), geschaetzt: false };
    }
    // Rechnung ohne Bruttosumme — unbrauchbar, weiter mit dem Ersatzsatz.
    void rMwst;
  }

  const satz = z(ersatzSatz);
  if (satz <= 0) {
    return { brutto, netto: brutto, ust: 0, satz: 0, geschaetzt: true };
  }
  const netto = r2(brutto / (1 + satz / 100));
  return { brutto, netto, ust: r2(brutto - netto), satz, geschaetzt: true };
}

export type ZahlungsSummen = {
  brutto: number;
  netto: number;
  ust: number;
  /** Wie viele Zahlungen mussten geschätzt werden? */
  geschaetztAnzahl: number;
  /** Welche Summe steckt darin? */
  geschaetztBetrag: number;
  anzahl: number;
};

/**
 * Summiert Zahlungen eines Zeitraums und zaehlt mit, wie viel davon
 * geschaetzt werden musste. Die Zahl ist wichtiger als sie aussieht: eine
 * geschaetzte Summe darf in der Oberflaeche nicht so wirken wie eine
 * gerechnete.
 */
export function summiereZahlungen(
  zahlungen: ZahlungRoh[],
  rechnungen: Record<string, RechnungSummen>,
  ersatzSatz: number,
  von?: string,
  bis?: string,
): ZahlungsSummen {
  const s: ZahlungsSummen = {
    brutto: 0, netto: 0, ust: 0, geschaetztAnzahl: 0, geschaetztBetrag: 0, anzahl: 0,
  };

  for (const zg of zahlungen || []) {
    const d = zg.zahlungsdatum ?? '';
    if (von && (!d || d < von)) continue;
    if (bis && (!d || d > bis)) continue;

    const r = zg.rechnung_id ? rechnungen[zg.rechnung_id] : undefined;
    const a = teileZahlung(zg.betrag, r, ersatzSatz);

    s.anzahl += 1;
    s.brutto += a.brutto;
    s.netto += a.netto;
    s.ust += a.ust;
    if (a.geschaetzt) {
      s.geschaetztAnzahl += 1;
      s.geschaetztBetrag += a.brutto;
    }
  }

  return {
    brutto: r2(s.brutto), netto: r2(s.netto), ust: r2(s.ust),
    geschaetztAnzahl: s.geschaetztAnzahl, geschaetztBetrag: r2(s.geschaetztBetrag),
    anzahl: s.anzahl,
  };
}

/** Ein Satz für die Oberfläche — oder leer, wenn es nichts zu sagen gibt. */
export function hinweisText(s: ZahlungsSummen, ersatz: ErsatzSatz): string {
  if (s.geschaetztAnzahl === 0) return '';
  const betrag = s.geschaetztBetrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const wie = ersatz.satz > 0
    ? `mit ${ersatz.satz} % gerechnet`
    : 'ohne Umsatzsteuer gerechnet';
  const eine = s.geschaetztAnzahl === 1;
  return `${s.geschaetztAnzahl} ${eine ? 'Zahlung' : 'Zahlungen'} über ${betrag} ${eine ? 'ist' : 'sind'} keiner Rechnung zugeordnet und ${eine ? 'wurde' : 'wurden'} ${wie}. Ordnen Sie diese einer Rechnung zu, damit die Zahlen belegbar sind.`;
}

/** Auswahlmöglichkeiten für die Oberfläche. */
export function satzOptionen(abgeleitet: ErsatzSatz): Array<{ wert: string; label: string }> {
  const auto = abgeleitet.herkunft === 'unbekannt'
    ? 'Automatisch (noch nicht ableitbar)'
    : `Automatisch — derzeit ${abgeleitet.satz} %`;
  return [
    { wert: '', label: auto },
    { wert: '0', label: 'Ohne Umsatzsteuer (z. B. Kleinunternehmer § 19)' },
    { wert: '7', label: 'Ermäßigt 7 % (z. B. unverarbeitete Erzeugnisse)' },
    { wert: '19', label: 'Regelsatz 19 %' },
  ];
}
