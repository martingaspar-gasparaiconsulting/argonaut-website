// ============================================================================
// ARGONAUT OS · lib/sepaGemeinsam.ts — die gemeinsamen Bausteine beider
// SEPA-Dateien (pain.008 Lastschrift · pain.001 Ueberweisung)
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT (Punkt 64, 22.09.2026) ▄▄▄
// lib/sepa.ts und lib/sepaUeberweisung.ts trugen SECHS zeichengleiche
// Funktionen doppelt: esc, ibanClean, betragStr, sepaText, agent, ibanGueltig.
// Zwei Kopien heisst: eine Reparatur an einer Stelle verpufft an der anderen.
// Genau das war beim Betrag der Fall — beide machten aus einem unbrauchbaren
// Wert still "0.00" und schrieben diese Null in eine Bankdatei.
//
// ▄▄▄ DIE REGELN DIESER DATEI ▄▄▄
//  1. EIN UNBRAUCHBARER BETRAG WIRD NIE STILL ZU 0,00. Er wirft einen Fehler.
//     Eine Bankdatei mit 0,00 Euro sieht gueltig aus und ist es nicht; der
//     Betrieb merkt es erst, wenn das Geld nicht kommt.
//  2. WAS IN DER DATEI STEHT, WIRD AUCH GEZAEHLT. Die Kontrollsumme entsteht
//     aus den GERUNDETEN Einzelposten — nicht aus den ungerundeten Rohwerten.
//     Sonst weicht CtrlSum von der Summe der InstdAmt ab und die Bank weist
//     die ganze Datei ab.
//  3. Gerundet wird ueber lib/zahlen.ts (centRunden), nirgends von Hand.
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln, node-getestet.
// ============================================================================

import { centRunden } from './zahlen';

/** XML-Sonderzeichen entschaerfen. */
export function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** IBAN ohne Leerzeichen, in Grossbuchstaben. */
export function ibanClean(s: string): string {
  return (s ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Text auf den SEPA-Zeichenvorrat bringen und auf die erlaubte Laenge kuerzen. */
export function sepaText(s: string, max: number): string {
  return (s ?? '')
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9 /?:().,'+\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Bank-Kennung: BIC, wenn vorhanden — sonst der Standardplatzhalter. */
export function agent(bic: string | undefined): string {
  const b = (bic || '').replace(/\s+/g, '').toUpperCase();
  return b ? `<FinInstnId><BIC>${esc(b)}</BIC></FinInstnId>` : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;
}

/**
 * Prueft eine IBAN ueber die ISO-Pruefsumme (Modulo 97). Verhindert
 * Zahlendreher und falsche IBANs in der Bankdatei.
 */
export function ibanGueltig(ibanRaw: string): boolean {
  const iban = ibanClean(ibanRaw);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  const zahl = umgestellt.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rest = 0;
  for (let i = 0; i < zahl.length; i += 7) {
    rest = Number(String(rest) + zahl.slice(i, i + 7)) % 97;
  }
  return rest === 1;
}

/** Wird geworfen, wenn ein Betrag nicht in eine Bankdatei gehoert. */
export class SepaBetragFehler extends Error {
  constructor(nachricht: string) {
    super(nachricht);
    this.name = 'SepaBetragFehler';
  }
}

/**
 * Erkennt den Betrags-Fehler OHNE instanceof — und zwar mit Absicht.
 * Gemessen am 22.09.: Die Test-Uebersetzung buendelt jede Logik-Datei einzeln,
 * dadurch gibt es die Klasse mehrfach und `instanceof` sagt bei genau demselben
 * Fehler mal ja, mal nein. Der Name traegt immer.
 */
export function istSepaBetragFehler(e: unknown): boolean {
  return !!e && typeof e === 'object' && (e as { name?: string }).name === 'SepaBetragFehler';
}

/**
 * Der eine Betrags-Pruefer. Liefert den auf Cent gerundeten Betrag —
 * oder wirft, wenn der Wert in keiner Bankdatei stehen darf.
 *
 * KEIN stilles 0,00 mehr: NaN, Infinity und alles, was keine Zahl ist,
 * fuehren zum Abbruch mit Klartext statt zu einer Null in der Datei.
 */
export function sepaBetrag(n: unknown, wofuer = 'Betrag'): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) {
    throw new SepaBetragFehler(`${wofuer}: kein gueltiger Betrag (${String(n)}). Die SEPA-Datei wurde NICHT erzeugt.`);
  }
  return centRunden(n);
}

/** Der Betrag, wie er in der Datei steht: auf Cent gerundet, zwei Stellen. */
export function betragStr(n: unknown, wofuer = 'Betrag'): string {
  return sepaBetrag(n, wofuer).toFixed(2);
}

/**
 * Kontrollsumme aus den GERUNDETEN Einzelposten. Genau die Betraege, die in
 * der Datei stehen, werden addiert — und das Ergebnis selbst noch einmal auf
 * Cent gebracht, damit die Gleitkomma-Reste (0.1 + 0.2) nicht durchschlagen.
 *
 * Jeder Posten bringt seine eigene Bezeichnung mit, damit ein Abbruch sagt,
 * WELCHE Zeile den unbrauchbaren Betrag traegt — die Summe wird vor den
 * Einzelposten gerechnet, ohne das stuende im Fehlertext nur "Betrag".
 */
export function sepaSumme(posten: { betrag: unknown; wofuer?: string }[]): number {
  let summe = 0;
  for (const p of posten) summe += sepaBetrag(p.betrag, p.wofuer || 'Betrag');
  return centRunden(summe);
}
