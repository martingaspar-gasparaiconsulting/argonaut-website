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
//
// ▄▄▄ PUNKT 53 PAKET 2 (21.09.2026) — WARUM "KONFORM" NICHTS HIESS ▄▄▄
// Der Pruefbefund sagte: "der Validator meldet konform, weil er andere
// Zahlen prueft als der Erzeuger schreibt". Am echten Code bestaetigt, in
// drei Punkten:
//
//  1. DER ZAHLEN-LESER. n() war Number(v). Eine Position als Text
//     "1.234,56" wurde 0 — und die gespeicherte Rechnungssumme wurde
//     ebenfalls 0. Die Summenpruefung springt bei `rNetto !== 0` ab, also
//     wurde gar nicht geprueft und das Ergebnis lautete: konform.
//     ZWEI Nullen, die zueinander passen, sind keine Uebereinstimmung.
//  2. DIE RUNDUNG. Der Erzeuger rundet jede Zeile auf Cent (zeilenNetto),
//     der Validator summierte ungerundet. Er prueft jetzt mit DERSELBEN
//     Funktion, importiert aus lib/zugferd.ts — eine Rechenstelle, nicht
//     zwei, die auseinanderlaufen koennen.
//  3. DIE STEUER wurde hier nachgebaut statt aus steuerLogik geholt.
//     Jetzt rechnet der Validator mit derselben steuerGruppen-Funktion
//     wie das PDF und wie das XML.
//
// NEU GEPRUEFT wird ausserdem, was der Erzeuger laengst als Warnung
// ausgibt und der Validator verschwieg: fehlende Bankverbindung (BG-16),
// fehlender Kontakt (BG-6), ein unlesbares Rechnungsdatum und ein
// Steuersatz in den Positionen trotz Kleinunternehmer-Kennzeichen.
//
// EHRLICH ZU EINER GEGENPROBE, DIE NICHT ROT WIRD: Den Steuer-Nachbau durch
// steuerGruppen zu ersetzen laesst sich nicht rot beweisen. Beide Formeln
// liefern bei jeder realistischen Eingabe dasselbe — der Unterschied liegt in
// Grenzfaellen unterhalb der Zwei-Cent-Toleranz. Der Umbau ist also eine
// Vereinheitlichung (eine Rechenstelle statt zwei, die auseinanderlaufen
// koennen), kein behobener Rechenfehler.
//
// UND EINE BEOBACHTUNG ZUR TOLERANZ SELBST: zwei Cent Abweichung gelten hier
// als in Ordnung. Fuer OCR-Belege ist das sinnvoll, fuer selbst gerechnete
// Summen versteckt es genau die Rundungsunterschiede, um die es geht — bei
// zwei Positionen betraegt der Unterschied nur einen Cent und bleibt damit
// unsichtbar. Nicht geaendert, weil es eine fachliche Entscheidung ist.
//
// ALLE NEUEN PUNKTE SIND WARNUNGEN, KEINE FEHLER. Grund: `konform`
// steuert die Knopfbeschriftung im ERechnungDialog. Ein neuer Fehler
// haette aus "Herunterladen" ein rotes "Trotzdem herunterladen" gemacht,
// an Rechnungen, die gestern noch gruen waren.
//
// Node-getestet: tests/erechnungP53.test.mjs
// ============================================================

import { leseZahlOder, centRunden } from './zahlen';
import { zeilenNetto } from './zugferd';
import { steuerGruppen, type SteuerPosten } from '../app/dashboard/_components/steuerLogik';

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

/** Zahl aus einem beliebigen Feld — ueber den einen Leser (lib/zahlen.ts). */
function n(v: any): number {
  return leseZahlOder(v, 0);
}

function leer(s: any): boolean {
  return !s || !String(s).trim();
}

/** Ist das ein lesbares Datum? Der Erzeuger faellt sonst auf heute zurueck. */
function datumLesbar(v: any): boolean {
  if (v == null || String(v).trim() === '') return false;
  const d = new Date(v as any);
  return !isNaN(d.getTime());
}

/**
 * Positions-Netto — DIESELBE Funktion, die auch das XML schreibt.
 * Bewusst importiert und nicht nachgebaut: genau das Nachbauen war der
 * Grund, warum "konform" nichts hiess.
 */
function posNetto(p: any): number {
  return zeilenNetto(p);
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
  if (leer(seller.name)) add('BR-06', 'fehler', 'Verkäufer-Name (Ihr Firmenname) fehlt.');
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

  // Positionssumme vs. gespeicherte Nettosumme.
  // Die Bedingung `rNetto !== 0` bleibt stehen — aber sie darf nicht mehr
  // still durchwinken: wenn Positionen da sind und trotzdem keine Summe
  // gespeichert ist, wird das jetzt gesagt statt uebersprungen.
  if (pos.length > 0 && rNetto !== 0 && Math.abs(summeNettoPos - rNetto) > 0.02) {
    add('BR-CO-10', 'fehler',
      `Summe der Positionen (${summeNettoPos.toFixed(2)}) weicht von der Netto-Rechnungssumme (${rNetto.toFixed(2)}) ab.`);
  }
  if (pos.length > 0 && rNetto === 0 && summeNettoPos !== 0) {
    add('BR-CO-10', 'warnung',
      `Es sind Positionen ueber ${summeNettoPos.toFixed(2)} erfasst, aber keine Netto-Rechnungssumme gespeichert. Die Rechnung einmal oeffnen und speichern, dann stimmen beide Zahlen ueberein.`);
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
    // Genau so, wie das PDF und das XML es rechnen: je Steuersatz auf die
    // Gruppensumme, einmal gerundet (§ 14 Abs. 4 Nr. 7+8 UStG). Der frueher
    // hier stehende Nachbau lief im Detail anders.
    const posten: SteuerPosten[] = pos.map((p) => ({ netto: posNetto(p), satz: n(p.mwst_satz) }));
    const berechneteSteuer = steuerGruppen(posten).steuer;
    if (rMwst !== 0 && Math.abs(berechneteSteuer - rMwst) > 0.02) {
      add('BR-CO-14', 'warnung',
        `Errechnete USt (${berechneteSteuer.toFixed(2)}) weicht von der gespeicherten USt (${rMwst.toFixed(2)}) ab. Rechnung einmal öffnen und speichern.`);
    }
  }

  // ── Kleinunternehmer §19: kein Steuerausweis, Befreiungsgrund ──
  if (klein) {
    if (rMwst > 0) add('BR-E-Klein', 'fehler', 'Kleinunternehmer (§19): Es darf keine Umsatzsteuer ausgewiesen werden.');
    add('BR-E-10', 'info', 'Kleinunternehmer §19: Befreiungsgrund wird im XML gesetzt.');
    // Der Erzeuger setzt bei Kleinunternehmer JEDE Position auf 0 %. Steht in
    // einer Position trotzdem ein Satz, verschwindet er stillschweigend —
    // der Kunde bekommt eine andere Rechnung, als auf dem Schirm stand.
    const mitSatz = pos.filter((p) => n(p.mwst_satz) > 0).length;
    if (mitSatz > 0) {
      add('BR-E-Klein', 'warnung',
        `${mitSatz} Position(en) tragen einen Steuersatz, obwohl die Rechnung als Kleinunternehmer-Rechnung gekennzeichnet ist. Im XML werden sie auf 0 % gesetzt.`);
    }
  }

  // ── XRechnung/Behörde: Leitweg-ID ──
  if (istXR) {
    if (leer(e.leitweg_id)) {
      add('BR-DE-15', 'warnung', 'XRechnung: Leitweg-ID fehlt — bei Rechnungen an Behörden ist sie Pflicht.');
    }
  }

  // ── BG-16 · Zahlungsdaten. Ohne IBAN weiss der Empfaenger nicht, wohin
  //    er zahlen soll (BR-49/BR-50). Der Erzeuger warnt laengst — der
  //    Validator schwieg dazu und meldete trotzdem "konform". ──
  if (leer(seller.bank_iban)) {
    add('BG-16', 'warnung', 'Bankverbindung (IBAN) fehlt — die E-Rechnung enthaelt dann keine Zahlungsdaten. Im Profil unter Firmendaten nachtragen.');
  }

  // ── BG-6 · Kontaktangaben des Verkaeufers (BR-DE-2/5/6) ──
  if (istXR) {
    if (leer(seller.telefon)) add('BG-6', 'warnung', 'Telefonnummer fehlt — bei einer XRechnung gehoert sie zu den Pflichtangaben (BR-DE-6).');
    if (leer(seller.email)) add('BG-6', 'warnung', 'E-Mail-Adresse fehlt — bei einer XRechnung gehoert sie zu den Pflichtangaben (BR-DE-5).');
  }

  // ── BR-03 schaerfer: vorhanden ist nicht dasselbe wie lesbar ──
  if (!leer(r.rechnungsdatum) && !datumLesbar(r.rechnungsdatum)) {
    add('BR-03', 'warnung', 'Das Rechnungsdatum ist nicht als Datum lesbar. Im XML steht ersatzweise das heutige Datum.');
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
