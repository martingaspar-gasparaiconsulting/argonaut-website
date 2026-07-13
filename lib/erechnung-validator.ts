// ============================================================
// ARGONAUT OS · MODUL 6 (Rechnung) · P34 — E-RECHNUNG VALIDIERUNG
// ------------------------------------------------------------
// Prüft eine E-Rechnung gegen die WICHTIGSTEN EN-16931-Regeln
// (Business Rules), bevor sie versendet wird. Gibt ein klares
// Ergebnis: konform (grün) oder Liste von Fehlern/Warnungen.
//
// EHRLICHE EINORDNUNG: Dies ist KEINE vollständige offizielle
// KoSIT-Schematron-Validierung (die braucht ein externes Java-Tool).
// Es ist eine solide Prüfung der zentralen Pflichtfelder und
// Konsistenzregeln, die in der Praxis die häufigsten Fehler
// abfängt (fehlende Pflichtangaben, Summen-Inkonsistenz,
// Steuer-Plausibilität, Formatfehler).
//
// Arbeitet auf den Rohdaten (rechnung, positionen, aussteller,
// empfaenger) — dieselben, aus denen das XML gebaut wird. So
// prüfen wir VOR dem Erzeugen, nicht erst hinterher.
// ============================================================

export type PruefStufe = 'fehler' | 'warnung' | 'info';

export interface PruefPunkt {
  regel: string;       // z.B. "BR-06"
  stufe: PruefStufe;
  text: string;
}

export interface ValidierErgebnis {
  konform: boolean;            // true = keine Fehler (Warnungen erlaubt)
  fehlerAnzahl: number;
  warnungAnzahl: number;
  punkte: PruefPunkt[];
}

export interface ValidierEingabe {
  rechnung: any;
  positionen: any[];
  aussteller: any;
  empfaenger: any;
  profil?: 'xrechnung' | 'zugferd' | 'zugferd-pdf';
  leitweg_id?: string;
}

function n(v: any): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function leer(s: any): boolean {
  return !s || !String(s).trim();
}

/** Positions-Netto: gespeicherter Wert schlägt Berechnung. */
function posNetto(p: any): number {
  if (p?.gesamt_netto != null) return n(p.gesamt_netto);
  return n(p?.menge) * n(p?.einzelpreis);
}

/**
 * Prüft die E-Rechnung. Wirft nie.
 */
export function validiereERechnung(e: ValidierEingabe): ValidierErgebnis {
  const punkte: PruefPunkt[] = [];
  const add = (regel: string, stufe: PruefStufe, text: string) => punkte.push({ regel, stufe, text });

  const r = e.rechnung || {};
  const pos: any[] = Array.isArray(e.positionen) ? e.positionen : [];
  const seller = e.aussteller || {};
  const buyer = e.empfaenger || {};
  const klein = !!r.kleinunternehmer;
  const istXR = e.profil === 'xrechnung';

  // ── BR-02 / BR-03: Rechnungsnummer + Ausstellungsdatum ──
  if (leer(r.rechnungsnummer)) add('BR-02', 'fehler', 'Rechnungsnummer fehlt.');
  if (leer(r.rechnungsdatum)) add('BR-03', 'fehler', 'Rechnungsdatum fehlt.');

  // ── BR-05: Währung ──
  if (leer(r.waehrung)) add('BR-05', 'warnung', 'Währung fehlt — Standard EUR wird angenommen.');

  // ── BR-06 / BR-08: Verkäufer Name + Anschrift ──
  const sAdr = seller.adresse || {};
  if (leer(seller.name)) add('BR-06', 'fehler', 'Verkäufer-Name (dein Firmenname) fehlt.');
  if (leer(sAdr.ort)) add('BR-08', 'fehler', 'Verkäufer-Ort fehlt.');
  if (leer(sAdr.plz)) add('BR-08', 'warnung', 'Verkäufer-PLZ fehlt.');
  if (leer(sAdr.strasse)) add('BR-08', 'warnung', 'Verkäufer-Straße fehlt.');

  // ── BR-07 / BR-10: Käufer Name + Anschrift ──
  const bAdr = buyer.adresse || {};
  if (leer(buyer.name)) add('BR-07', 'fehler', 'Käufer-Name (Kunde) fehlt.');
  if (leer(bAdr.ort)) add('BR-10', 'warnung', 'Käufer-Ort fehlt — für gültige EN 16931 empfohlen.');

  // ── BR-CO-26: Verkäufer-Steuerkennzeichnung ──
  if (leer(seller.ust_idnr) && leer(seller.steuernummer)) {
    add('BR-CO-26', 'fehler', 'Verkäufer USt-IdNr. oder Steuernummer fehlt (§ 14 UStG Pflicht).');
  }

  // ── BR-16: mindestens eine Position ──
  if (pos.length === 0) {
    add('BR-16', 'fehler', 'Keine Rechnungsposition vorhanden.');
  }

  // ── Positionen einzeln ──
  pos.forEach((p, i) => {
    const nr = i + 1;
    if (leer(p.bezeichnung)) add('BR-25', 'warnung', `Position ${nr}: Bezeichnung fehlt.`);
    if (n(p.menge) === 0) add('BR-22', 'warnung', `Position ${nr}: Menge ist 0.`);
    if (!klein && n(p.mwst_satz) === 0 && posNetto(p) !== 0) {
      add('BR-DE-Satz', 'info', `Position ${nr}: Steuersatz 0 % — bitte prüfen, ob korrekt.`);
    }
  });

  // ── Summen-Konsistenz (BR-CO-10 / BR-CO-13 / BR-CO-15) ──
  const summeNettoPos = pos.reduce((a, p) => a + posNetto(p), 0);
  const rNetto = n(r.netto_summe);
  const rMwst = n(r.mwst_summe);
  const rBrutto = n(r.brutto_summe);

  // Positionssumme vs. gespeicherte Nettosumme
  if (pos.length > 0 && rNetto !== 0 && Math.abs(summeNettoPos - rNetto) > 0.02) {
    add('BR-CO-10', 'fehler',
      `Summe der Positionen (${summeNettoPos.toFixed(2)}) weicht von der Netto-Rechnungssumme (${rNetto.toFixed(2)}) ab.`);
  }

  // Netto + USt = Brutto
  if (!klein && rBrutto !== 0) {
    const soll = rNetto + rMwst;
    if (Math.abs(soll - rBrutto) > 0.02) {
      add('BR-CO-15', 'fehler',
        `Netto (${rNetto.toFixed(2)}) + USt (${rMwst.toFixed(2)}) = ${soll.toFixed(2)} passt nicht zum Brutto (${rBrutto.toFixed(2)}).`);
    }
  }

  // ── USt-Neuberechnung als Plausibilität (Warnung, nicht Fehler) ──
  if (!klein && pos.length > 0) {
    // je Satz gruppieren und Steuer rechnen
    const grp = new Map<number, number>();
    for (const p of pos) grp.set(n(p.mwst_satz), (grp.get(n(p.mwst_satz)) || 0) + posNetto(p));
    let berechneteSteuer = 0;
    for (const [satz, netto] of grp.entries()) berechneteSteuer += Math.round(netto * satz) / 100;
    berechneteSteuer = Math.round(berechneteSteuer * 100) / 100;
    if (rMwst !== 0 && Math.abs(berechneteSteuer - rMwst) > 0.02) {
      add('BR-CO-14', 'warnung',
        `Errechnete USt (${berechneteSteuer.toFixed(2)}) weicht von der gespeicherten USt (${rMwst.toFixed(2)}) ab. Rechnung einmal öffnen und speichern.`);
    }
  }

  // ── Kleinunternehmer §19: kein Steuerausweis, Befreiungsgrund ──
  if (klein) {
    if (rMwst > 0) add('BR-E-Klein', 'fehler', 'Kleinunternehmer (§19): Es darf keine Umsatzsteuer ausgewiesen werden.');
    add('BR-E-10', 'info', 'Kleinunternehmer §19: Befreiungsgrund wird im XML gesetzt.');
  }

  // ── XRechnung/Behörde: Leitweg-ID ──
  if (istXR) {
    if (leer(e.leitweg_id)) {
      add('BR-DE-15', 'warnung', 'XRechnung: Leitweg-ID fehlt — bei Rechnungen an Behörden ist sie Pflicht.');
    }
  }

  const fehlerAnzahl = punkte.filter((p) => p.stufe === 'fehler').length;
  const warnungAnzahl = punkte.filter((p) => p.stufe === 'warnung').length;

  return {
    konform: fehlerAnzahl === 0,
    fehlerAnzahl,
    warnungAnzahl,
    punkte,
  };
}
