// ============================================================================
// ARGONAUT OS · lib/kfzRechnung.ts — Paket 268 (07.10.2026) · K7 Rechnung Fahrzeugverkauf
//
// Aus einem Verkaufsvorgang (kfz_verkauf, Status „vertrag" oder „uebergeben")
// werden die Rechnungsposten gebaut — getrennt nach Besteuerung und Lieferort:
//
//   Inland, § 25a        Fahrzeug mit 0 % (Kennung „§ 25a"), Betrag = vereinbarter
//                        Preis, KEIN Steuerausweis. Zusatzleistungen (Zulassung,
//                        Überführung …) mit 19 % gesondert. Die Differenzsteuer
//                        (Marge × 19/119) wird nur INTERN gespeichert (für die
//                        UStVA), nie auf die Rechnung gedruckt.
//   Inland, Regel        alles mit 19 %. Der Nettobetrag wird so gewählt, dass
//                        die Rechnung centgenau beim vereinbarten Bruttopreis
//                        landet (Steuer je Satz auf die Gruppensumme).
//   EU-Unternehmer       nur Regelbesteuerung (§ 25a Abs. 7 Nr. 3 UStG schließt
//                        die steuerfreie EU-Lieferung aus), Käufer = Unternehmer
//                        mit ausländischer USt-IdNr., eigene USt-IdNr. Pflicht.
//                        Rechnungsbetrag = Netto aus dem vereinbarten Bruttopreis.
//   Ausfuhr (Drittland)  steuerfrei; bei Regelbesteuerung Netto aus Brutto, bei
//                        § 25a der vereinbarte Preis.
//
// Inzahlungnahme mindert die Rechnung NICHT (eigener Ankauf) — sie steht als
// Zahlungshinweis darunter und zählt mit der Anzahlung als „vorab verrechnet".
//
// Die steuerlichen Grenzfälle (Zusatzleistung als Nebenleistung? Neufahrzeug
// in die EU nach § 1b UStG?) sind als Hinweis sichtbar und stehen auf der
// Kontrollgang-Liste für den Steuerberater.
//
// Reine Logik, keine Hooks, keine Systemuhr. Node-testbar.
// ============================================================================

import { centRunden } from './zahlen';
import { steuerGruppen } from '../app/dashboard/_components/steuerLogik';
import { erloes } from './kfzKalkulation';
import { betraege, zusatzBereinigen, geld, type Verkauf, type FahrzeugFuerVerkauf } from './kfzVerkauf';
import type { SteuerSonderfall } from './steuerSonderfall';

export const UST = 19;

export type Lieferung = 'inland' | 'eu' | 'ausfuhr';
export const LIEFERUNGEN: { key: Lieferung; label: string; text: string }[] = [
  { key: 'inland', label: 'Inland', text: 'Käufer übernimmt das Fahrzeug in Deutschland.' },
  { key: 'eu', label: 'EU-Unternehmer', text: 'Lieferung an ein Unternehmen in einem anderen EU-Land (mit USt-IdNr.).' },
  { key: 'ausfuhr', label: 'Ausfuhr (Drittland)', text: 'Das Fahrzeug verlässt die EU (z. B. Schweiz, Norwegen, Türkei).' },
];

export function lieferungLesen(roh: unknown): Lieferung {
  return roh === 'eu' || roh === 'ausfuhr' ? roh : 'inland';
}

/** USt-IdNr. eines anderen EU-Landes: 2 Buchstaben + 2–13 Zeichen, nicht DE. Grobe Form, keine Bestätigung beim BZSt. */
export function ustIdEuGueltig(roh: string | null | undefined): boolean {
  const s = String(roh ?? '').replace(/[\s.-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9A-Z+*]{2,13}$/.test(s)) return false;
  const land = s.slice(0, 2);
  const EU = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI'];
  return EU.includes(land);
}

export type Ermittlung = { sonderfall: SteuerSonderfall | null; fehler: string[]; hinweise: string[] };

/** Welcher Steuerfall gilt — und was fehlt dafür. */
export function steuerfall(
  besteuerung: string | null,
  lieferung: Lieferung,
  v: Pick<Verkauf, 'kaeufer_art' | 'kaeufer_ustid'>,
  eigeneUstId: string | null,
  fz?: Pick<FahrzeugFuerVerkauf, 'km_stand' | 'erstzulassung'>,
  heuteIso?: string,
): Ermittlung {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  if (besteuerung !== '25a' && besteuerung !== 'regel') {
    fehler.push('Besteuerung des Fahrzeugs fehlt: in der Handelsakte „§ 25a" oder „Regelbesteuerung" festlegen.');
    return { sonderfall: null, fehler, hinweise };
  }
  if (lieferung === 'eu') {
    if (besteuerung === '25a') fehler.push('Bei Differenzbesteuerung (§ 25a) ist die steuerfreie EU-Lieferung ausgeschlossen (§ 25a Abs. 7 Nr. 3 UStG). Entweder als Inlandslieferung mit § 25a abrechnen oder vorher auf Regelbesteuerung umstellen (Steuerberater fragen).');
    if (v.kaeufer_art !== 'unternehmer') fehler.push('Steuerfreie EU-Lieferung nur an Unternehmer — Käufer im Verkauf als Unternehmer erfassen.');
    if (!ustIdEuGueltig(v.kaeufer_ustid)) fehler.push('USt-IdNr. des Käufers fehlt oder ist keine gültige EU-Nummer (z. B. ATU12345678).');
    if (!String(eigeneUstId ?? '').trim()) fehler.push('Ihre eigene USt-IdNr. fehlt — in den Firmendaten ergänzen.');
    hinweise.push('USt-IdNr. des Käufers vor der Auslieferung beim Bundeszentralamt für Steuern qualifiziert bestätigen lassen und den Ausdruck aufbewahren.');
    hinweise.push('Gelangensbestätigung (Nachweis, dass das Fahrzeug im anderen EU-Land angekommen ist) einholen. Die Lieferung gehört in die Zusammenfassende Meldung.');
    if (fz && neufahrzeugEu(fz, heuteIso)) hinweise.push('Achtung: Das Fahrzeug könnte als „neues Fahrzeug" gelten (bis 6.000 km oder höchstens 6 Monate seit Erstzulassung, § 1b UStG). Dafür gelten Sonderregeln — bitte mit dem Steuerberater klären.');
    return { sonderfall: fehler.length ? null : 'eu_ig', fehler, hinweise };
  }
  if (lieferung === 'ausfuhr') {
    hinweise.push('Steuerfrei nur mit Ausfuhrnachweis (Ausgangsvermerk der Zollstelle). Ohne Nachweis schulden Sie die Umsatzsteuer.');
    return { sonderfall: 'ausfuhr', fehler, hinweise };
  }
  if (besteuerung === '25a') {
    if (v.kaeufer_art === 'unternehmer') hinweise.push('Differenzbesteuerung: Der Käufer kann aus dieser Rechnung keine Vorsteuer ziehen.');
    return { sonderfall: 'diff25a', fehler, hinweise };
  }
  return { sonderfall: null, fehler, hinweise };
}

/** Neues Fahrzeug im Sinne § 1b UStG (Landfahrzeug): höchstens 6.000 km ODER höchstens 6 Monate seit Erstzulassung. */
export function neufahrzeugEu(fz: Pick<FahrzeugFuerVerkauf, 'km_stand' | 'erstzulassung'>, heuteIso?: string): boolean {
  if (fz.km_stand !== null && fz.km_stand !== undefined && fz.km_stand <= 6000) return true;
  if (fz.erstzulassung && heuteIso && /^\d{4}-\d{2}-\d{2}/.test(fz.erstzulassung) && /^\d{4}-\d{2}-\d{2}/.test(heuteIso)) {
    const ez = new Date(fz.erstzulassung.slice(0, 10) + 'T00:00:00Z');
    const grenze = new Date(ez); grenze.setUTCMonth(grenze.getUTCMonth() + 6);
    return new Date(heuteIso.slice(0, 10) + 'T00:00:00Z') <= grenze;
  }
  return false;
}

export type Posten = { bezeichnung: string; menge: number; einheit: string; einzelpreis: number; mwst_satz: number; gesamt_netto: number };

/** Netto aus Brutto für eine 19-%-Zeile (einzeln). */
export function nettoAusBrutto(brutto: number): number {
  return centRunden(brutto / (1 + UST / 100));
}

/**
 * Netto-Beträge für mehrere 19-%-Zeilen, so dass die Rechnung (Steuer auf die
 * Gruppensumme) centgenau beim Brutto-Gesamt landet. Gelingt das nicht exakt
 * (nicht jeder Bruttobetrag ist so erreichbar — die Steuer springt je Netto-Cent
 * um 0 oder 1 Cent, rund jeder sechste Betrag fällt dazwischen), bleibt die
 * kleinste Abweichung, bei Gleichstand nach UNTEN, und wird zurückgemeldet.
 */
export function nettoAufteilen(brutto: number[]): { netto: number[]; abweichung: number } {
  const netto = brutto.map(nettoAusBrutto);
  if (!netto.length) return { netto, abweichung: 0 };
  const ziel = centRunden(brutto.reduce((a, b) => a + b, 0));
  const bruttoVon = (n: number[]) => steuerGruppen(n.map((x) => ({ netto: x, satz: UST }))).brutto;
  let groesste = 0;
  for (let i = 1; i < brutto.length; i++) if (brutto[i] > brutto[groesste]) groesste = i;
  let beste = netto.slice();
  let besteAbw = centRunden(bruttoVon(beste) - ziel);
  for (let d = -5; d <= 5 && besteAbw !== 0; d++) {
    const versuch = netto.slice();
    versuch[groesste] = centRunden(versuch[groesste] + d / 100);
    const abw = centRunden(bruttoVon(versuch) - ziel);
    // gleich weit weg: lieber einen Cent WENIGER als vereinbart (der Käufer zahlt nie mehr)
    if (Math.abs(abw) < Math.abs(besteAbw) || (Math.abs(abw) === Math.abs(besteAbw) && abw < besteAbw)) { beste = versuch; besteAbw = abw; }
  }
  return { netto: beste, abweichung: besteAbw };
}

function ezText(iso: string | null): string | null {
  return iso && /^\d{4}-\d{2}/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null;
}

/** Bezeichnung der Fahrzeugposition (§ 14 Abs. 4 Nr. 5 UStG: Art und Umfang). */
export function fahrzeugBezeichnung(fz: FahrzeugFuerVerkauf, kmUebergabe: number | null): string {
  const name = [fz.marke, fz.modell, fz.variante].filter(Boolean).join(' ') || 'Fahrzeug';
  const km = kmUebergabe ?? fz.km_stand;
  const teile = [
    `Fahrzeug ${name}`,
    fz.fin ? `FIN ${fz.fin}` : null,
    ezText(fz.erstzulassung) ? `Erstzulassung ${ezText(fz.erstzulassung)}` : null,
    km !== null && km !== undefined ? `${km.toLocaleString('de-DE')} km` : null,
    fz.interne_nr ? `Nr. ${fz.interne_nr}` : null,
  ].filter(Boolean);
  return teile.join(' · ').slice(0, 250);
}

export type RechnungsEntwurf = {
  posten: Posten[];
  netto: number; steuer: number; brutto: number;
  vorab: number;            // Anzahlung + Inzahlungnahme, höchstens der Rechnungsbetrag
  rest: number;             // noch zu zahlen (nie negativ)
  auszahlung: number;       // übersteigt die Anrechnung den Rechnungsbetrag: zahlt der Betrieb an den Käufer
  diffBemessung: number | null;  // § 25a: Marge netto (intern, UStVA)
  diffSteuer: number | null;     // § 25a: Differenzsteuer (intern, UStVA)
  zahlungsText: string;
  fehler: string[];
  hinweise: string[];
};

/**
 * Rechnungsposten, Summen und Zahlungshinweis. ek = Einkaufspreis des Fahrzeugs
 * (für die Differenzsteuer bei § 25a; fehlt er, bleibt die Differenz offen).
 */
export function rechnungBauen(
  v: Verkauf,
  fz: FahrzeugFuerVerkauf,
  sonderfall: SteuerSonderfall | null,
  ek: number | null,
  inzahlungText: string | null,
): RechnungsEntwurf {
  const fehler: string[] = [];
  const hinweise: string[] = [];
  const b = betraege(v);
  const zusatz = zusatzBereinigen(v.zusatz);
  if (!(b.fahrzeug > 0)) fehler.push('Fahrzeugpreis fehlt.');
  if (v.status !== 'vertrag' && v.status !== 'uebergeben') fehler.push('Eine Rechnung gibt es erst ab dem Kaufvertrag.');

  const bez = fahrzeugBezeichnung(fz, v.km_uebergabe);
  const posten: Posten[] = [];
  const zeile = (bezeichnung: string, betrag: number, satz: number): Posten =>
    ({ bezeichnung, menge: 1, einheit: 'Stk', einzelpreis: betrag, mwst_satz: satz, gesamt_netto: betrag });

  let diffBemessung: number | null = null;
  let diffSteuer: number | null = null;

  if (sonderfall === 'diff25a') {
    posten.push(zeile(bez, b.fahrzeug, 0));
    if (zusatz.length) {
      const { netto, abweichung } = nettoAufteilen(zusatz.map((z) => z.betrag));
      zusatz.forEach((z, i) => posten.push(zeile(z.text, netto[i], UST)));
      if (abweichung !== 0) hinweise.push(`Rundung: Die Zusatzleistungen weichen um ${geld(abweichung)} vom vereinbarten Bruttobetrag ab.`);
      hinweise.push('Zusatzleistungen (z. B. Zulassung, Überführung) stehen mit 19 % gesondert auf der Rechnung. Ob sie als Nebenleistung der Differenzbesteuerung folgen, bitte mit dem Steuerberater klären.');
    }
    if (ek !== null && Number.isFinite(ek) && ek >= 0) {
      const e = erloes(b.fahrzeug, ek, '25a');
      diffSteuer = e.ust;
      diffBemessung = centRunden(Math.max(0, b.fahrzeug - ek) - e.ust);
      if (b.fahrzeug < ek) hinweise.push('Verkauf unter Einkaufspreis: keine Differenzsteuer (ein Verlust wird nicht verrechnet).');
    } else {
      hinweise.push('Einkaufspreis fehlt in der Handelsakte — die Differenzsteuer für die Umsatzsteuer-Voranmeldung kann nicht berechnet werden.');
    }
  } else if (sonderfall === 'eu_ig' || sonderfall === 'ausfuhr') {
    // steuerfrei: Netto aus dem vereinbarten Bruttopreis; bei § 25a + Ausfuhr der Preis selbst
    const fzBetrag = sonderfall === 'ausfuhr' && fz.besteuerung === '25a' ? b.fahrzeug : nettoAusBrutto(b.fahrzeug);
    posten.push(zeile(bez, fzBetrag, 0));
    zusatz.forEach((z) => posten.push(zeile(z.text, nettoAusBrutto(z.betrag), 0)));
    hinweise.push(fzBetrag !== b.fahrzeug
      ? `Steuerfrei: Rechnungsbetrag ist der Nettopreis (vereinbart ${geld(b.fahrzeug)} brutto).`
      : 'Steuerfrei: Rechnungsbetrag ist der vereinbarte Preis.');
  } else {
    const alle = [b.fahrzeug, ...zusatz.map((z) => z.betrag)];
    const { netto, abweichung } = nettoAufteilen(alle);
    posten.push(zeile(bez, netto[0], UST));
    zusatz.forEach((z, i) => posten.push(zeile(z.text, netto[i + 1], UST)));
    if (abweichung !== 0) hinweise.push(`Rundung: Die Rechnung weicht um ${geld(abweichung)} vom vereinbarten Bruttobetrag ab.`);
  }

  const s = steuerGruppen(posten.map((p) => ({ netto: p.gesamt_netto, satz: p.mwst_satz })));
  const anrechnung = centRunden(b.inzahlung + b.anzahlung);
  const vorab = Math.min(anrechnung, s.brutto);
  const rest = centRunden(Math.max(0, s.brutto - anrechnung));
  const auszahlung = centRunden(Math.max(0, anrechnung - s.brutto));

  const z: string[] = [`Fahrzeugverkauf ${v.nr ?? ''}${v.vertrag_am ? ` · Kaufvertrag vom ${v.vertrag_am.split('-').reverse().join('.')}` : ''}.`];
  if (b.anzahlung > 0) z.push(`Anzahlung erhalten${v.anzahlung_am ? ` am ${v.anzahlung_am.split('-').reverse().join('.')}` : ''}: ${geld(b.anzahlung)}.`);
  if (b.inzahlung > 0) z.push(`In Zahlung genommenes Fahrzeug${inzahlungText ? ` (${inzahlungText})` : ''}: ${geld(b.inzahlung)} angerechnet.`);
  if (anrechnung > 0) z.push(auszahlung > 0 ? `Die Anrechnung übersteigt den Rechnungsbetrag — wir zahlen an Sie aus: ${geld(auszahlung)}.` : `Noch zu zahlen: ${geld(rest)}.`);
  if (auszahlung > 0) hinweise.push(`Die Anrechnung übersteigt den Rechnungsbetrag um ${geld(auszahlung)} — dieser Betrag wird an den Käufer ausgezahlt.`);

  return {
    posten, netto: s.netto, steuer: s.steuer, brutto: s.brutto, vorab, rest, auszahlung,
    diffBemessung, diffSteuer, zahlungsText: z.join('\n'), fehler, hinweise,
  };
}

/** Zahlungsstatus direkt nach dem Anlegen (vorab Verrechnetes zählt als bezahlt). */
export function startStatus(brutto: number, vorab: number): 'offen' | 'teilbezahlt' | 'bezahlt' {
  if (!(vorab > 0)) return 'offen';
  return vorab >= brutto ? 'bezahlt' : 'teilbezahlt';
}

/** Empfängername für die Rechnung: Firma vor Person. */
export function empfaenger(v: Pick<Verkauf, 'kaeufer_firma' | 'kaeufer_name' | 'kaeufer_anschrift'>): { name: string | null; anschrift: string | null } {
  const name = [v.kaeufer_firma, v.kaeufer_name].map((x) => (x ?? '').trim()).filter(Boolean).join(' · ') || null;
  const anschrift = (v.kaeufer_anschrift ?? '').trim() || null;
  return { name: name ? name.slice(0, 200) : null, anschrift: anschrift ? anschrift.slice(0, 300) : null };
}
