// ============================================================================
// ARGONAUT OS · lib/chatVerwaltung.ts — der Berater aus Betreiber-Sicht
//
// WARUM ES DAS GIBT
// Seit dem 11.09.2026 hat der öffentliche Berater eine Mengengrenze
// (lib/chatDeckel.ts). Stufe und Verbrauch standen aber NUR in der Datenbank —
// wer sie sehen oder ändern wollte, musste SQL schreiben. Genauso die Frage,
// auf welchen fremden Websites der Berater überhaupt laufen darf: die stand im
// Kunden-Dashboard unter /dashboard/webseiten, also an einer Stelle, an die der
// Betreiber gar nicht kommt.
//
// Beides gehört dorthin, wo der Betreiber ohnehin arbeitet: in die Betriebs-Akte
// im Command Center. Diese Datei ist die Denkarbeit dafür.
//
// ZWEI UNTERSCHIEDLICHE STRENGEN — das ist Absicht:
//   · lib/chatDeckel.ts → stufeAngabe()  ist NACHSICHTIG. Sie läuft im laufenden
//     Gespräch. Steht Unsinn in der Datenbank, fällt sie auf „klein" zurück und
//     der Chat läuft weiter. Ein Besucher darf nie einen Tippfehler ausbaden.
//   · diese Datei    → leseStufe()       ist STRENG. Sie läuft beim Speichern.
//     Käme sie hier auf „klein" zurück, hätte der Betreiber „groß" geklickt und
//     stillschweigend „klein" bekommen — und würde es erst merken, wenn ein
//     Kunde bei 1.000 Gesprächen abgeschnitten wird.
//
// Reine Logik: kein Supabase, kein fetch, keine Seiteneffekte. Node-getestet.
// ============================================================================

import { CHAT_STUFEN, WARN_AB_PROZENT, type ChatStufe, type DeckelErgebnis } from './chatDeckel';
import { leseDomainListe, MAX_DOMAINS } from './chatEinbetten';

/** Die Reihenfolge, in der die Stufen im Command Center stehen. */
export const STUFEN_REIHE: ChatStufe[] = ['klein', 'gross', 'individuell'];

/**
 * STRENG: Welche Stufe hat der Betreiber gewählt?
 *
 * Gibt `null` zurück, wenn der Wert nicht eindeutig eine der drei Stufen ist.
 * Der Endpunkt lehnt dann ab, statt etwas anderes zu speichern als geklickt
 * wurde. „groß" mit Umlaut wird erkannt, weil es dieselbe Stufe MEINT —
 * gespeichert wird trotzdem immer der Datenbank-Wert `gross`.
 */
export function leseStufe(roh: unknown): ChatStufe | null {
  const s = String(roh ?? '').trim().toLowerCase();
  if (s === 'klein') return 'klein';
  if (s === 'gross' || s === 'groß') return 'gross';
  if (s === 'individuell') return 'individuell';
  return null;
}

export type ChatAmpel = 'gruen' | 'gelb' | 'rot';

/**
 * Die eine Farbe, die der Betreiber in der Liste sieht.
 *   rot  — Grenze erreicht, Besucher bekommen den Hinweis aufs Kontaktformular
 *   gelb — 80 % erreicht, jetzt ist der Moment für das Gespräch über die Stufe
 *   grün — unauffällig
 */
export function ampel(d: DeckelErgebnis): ChatAmpel {
  if (!d.erlaubt) return 'rot';
  if (d.warnen) return 'gelb';
  return 'gruen';
}

/** Deutsche Tausenderpunkte, ohne Intl — damit Server und Browser dasselbe zeigen. */
export function zahl(n: number): string {
  const ganz = Math.max(0, Math.floor(Number(n) || 0));
  return String(ganz).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Eine Zeile Klartext für die Betriebs-Akte.
 * „312 von 1.000 Gesprächen · 31 %" — oder ohne Grenze bei „individuell".
 */
export function klartext(verbraucht: number, stufe: string | null | undefined): string {
  const s = leseStufe(stufe) ?? 'klein';
  const angabe = CHAT_STUFEN[s];
  const bisher = Math.max(0, Math.floor(Number(verbraucht) || 0));
  if (angabe.grenze === null) {
    return `${zahl(bisher)} ${bisher === 1 ? 'Gespräch' : 'Gespräche'} diesen Monat · frei vereinbart, keine feste Grenze`;
  }
  const prozent = Math.round((bisher / angabe.grenze) * 100);
  return `${zahl(bisher)} von ${zahl(angabe.grenze)} Gesprächen · ${prozent} %`;
}

/**
 * Was der Betreiber wissen muss, BEVOR er eine Stufe umstellt.
 * Leer, wenn der Wechsel unauffällig ist.
 */
export function wechselHinweis(verbraucht: number, von: string | null | undefined, nach: unknown): string {
  const alt = leseStufe(von) ?? 'klein';
  const neu = leseStufe(nach);
  if (!neu || neu === alt) return '';

  const bisher = Math.max(0, Math.floor(Number(verbraucht) || 0));
  const grenzeNeu = CHAT_STUFEN[neu].grenze;

  // Der gefährliche Fall: herunterstufen unter das, was diesen Monat schon
  // verbraucht ist. Der Berater wäre auf der Stelle zu — ohne dass jemand
  // etwas falsch gemacht hätte.
  if (grenzeNeu !== null && bisher >= grenzeNeu) {
    return (
      `Achtung: Dieser Betrieb hat diesen Monat bereits ${zahl(bisher)} Gespräche. ` +
      `Mit „${CHAT_STUFEN[neu].name}" (${zahl(grenzeNeu)}) ist die Grenze sofort erreicht — ` +
      `Besucher bekämen ab dem Speichern den Hinweis aufs Kontaktformular. ` +
      `Ab dem Monatsersten zählt es wieder bei null.`
    );
  }

  if (grenzeNeu !== null && (bisher / grenzeNeu) * 100 >= WARN_AB_PROZENT) {
    return (
      `Hinweis: Mit „${CHAT_STUFEN[neu].name}" wären die bisherigen ${zahl(bisher)} Gespräche ` +
      `schon über ${WARN_AB_PROZENT} % der neuen Grenze von ${zahl(grenzeNeu)}.`
    );
  }

  if (grenzeNeu === null) {
    return 'Ab jetzt greift für diesen Betrieb keine technische Grenze mehr. Gezählt wird weiter — abgerechnet wird nach Vereinbarung.';
  }

  return '';
}

export type DomainWechsel = {
  /** Die saubere Liste, die gespeichert wird. */
  liste: string[];
  /** Domains, die neu dazukommen. */
  hinzu: string[];
  /** Domains, die wegfallen — dort geht der Berater danach NICHT mehr. */
  weg: string[];
  /** Was der Betreiber vor dem Speichern lesen sollte. Leer, wenn nichts. */
  warnung: string;
  /** Zeilen, aus denen sich keine Domain lesen ließ. */
  verworfen: string[];
};

/**
 * Was passiert, wenn der Betreiber die Domain-Liste eines FREMDEN Betriebs
 * überschreibt?
 *
 * Diese Funktion gibt es, weil hier jemand an einer laufenden Kundenwebsite
 * dreht. Eine Domain, die aus der Liste fällt, schaltet den Berater dort still
 * ab — der Kunde sieht keinen Fehler, nur einen Bot, der nicht mehr antwortet.
 * Deshalb wird vor dem Speichern gezeigt, was verschwindet.
 */
export function pruefeDomainWechsel(alt: readonly string[] | null | undefined, neuText: unknown): DomainWechsel {
  const vorher = leseDomainListe(Array.isArray(alt) ? alt.join('\n') : '');
  const liste = leseDomainListe(neuText);

  const hinzu = liste.filter((d) => !vorher.includes(d));
  const weg = vorher.filter((d) => !liste.includes(d));

  // Was hat der Betreiber getippt, das nicht als Domain durchging?
  const getippt = String(neuText ?? '').split(/[\n,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const verworfen: string[] = [];
  for (const t of getippt) {
    const norm = leseDomainListe(t);
    if (norm.length === 0 && !verworfen.includes(t)) verworfen.push(t);
  }

  const teile: string[] = [];
  if (weg.length > 0) {
    teile.push(
      `Der Berater antwortet danach NICHT mehr auf ${weg.length === 1 ? 'dieser Adresse' : 'diesen Adressen'}: ${weg.join(', ')}.`,
    );
  }
  if (vorher.length > 0 && liste.length === 0) {
    teile.push('Die Liste wird vollständig geleert — der Berater läuft dann nur noch auf der ARGONAUT-Seite dieses Betriebs.');
  }
  if (verworfen.length > 0) {
    teile.push(`Nicht übernommen, weil es keine Adresse ist: ${verworfen.join(', ')}.`);
  }
  if (getippt.length > MAX_DOMAINS) {
    teile.push(`Höchstens ${MAX_DOMAINS} Adressen je Seite — alles darüber fällt weg.`);
  }

  return { liste, hinzu, weg, warnung: teile.join(' '), verworfen };
}
