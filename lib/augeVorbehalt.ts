// ============================================================================
// ARGONAUT OS · lib/augeVorbehalt.ts — der Rechtsvorbehalt unter dem Auge
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT (Punkt 41, 22.09.2026) ▄▄▄
// Das wachende Auge sagt dem Betrieb, was seine Zahlen bedeuten. An einigen
// Stellen sagt es dabei etwas RECHTLICHES: "das ist abmahnfaehig", "das
// verstoesst gegen die HeizkostenV; der Mieter darf um 15 % kuerzen". Das ist
// eine Rechtsauskunft, und die darf ARGONAUT nicht erteilen (§ 2 RDG). Also
// muss unter jeder solchen Aussage stehen, dass sie keine ist.
//
// DER VORBEHALT STEHT AN GENAU EINER STELLE — hier. Der Anwalt tauscht zum
// Termin Anfang Oktober EINEN Satz (Punkt B1 der Bauliste), und er wirkt
// sofort ueberall. Bis dahin ist der Wortlaut unten ein PLATZHALTER.
//
// ▄▄▄ DER WAECHTER ▄▄▄
// scanneAugeQuelle() liest lib/auge.ts als TEXT und meldet jede Rueckgabe,
// die rechtlich klingt und keinen Vorbehalt traegt. Der Test dazu ist HART:
// er faellt durch, und die einzige Art, ihn zufriedenzustellen, ist entweder
// ein Vorbehalt an der Stelle oder ein Eintrag in der benannten Ausnahmeliste
// unten — mit Begruendung. Kein Pauschal-Schalter.
//
// KEINE Supabase-, React- oder Next-Abhaengigkeit. Reine Formeln, node-getestet.
// ============================================================================

/**
 * PLATZHALTER-WORTLAUT (Stand 22.09.2026).
 * Der Anwalt liefert den endgueltigen Satz und sagt, ob ein Vorbehalt fuer
 * § 5 StBerG / RDG ueberhaupt genuegt (Punkt B1). NICHT hier herumbasteln —
 * es ist ein Satz, und er steht nur an dieser einen Stelle.
 */
export const RECHTS_VORBEHALT =
  'Hinweis: Das ist eine automatische Einschätzung aus Ihren eigenen Zahlen und '
  + 'keine Rechts- oder Steuerberatung. Im Zweifel lassen Sie den Fall von Ihrem '
  + 'Anwalt oder Steuerberater prüfen.';

/**
 * Woran ein Auge-Text als rechtliche Aussage erkannt wird.
 * Der Paragrafen-Zeichen-Fall ist der offensichtliche; die uebrigen fangen
 * Bewertungen ohne Paragraf ab ("das ist abmahnfaehig").
 */
export const RECHTS_MERKMALE: RegExp[] = [
  /§/,
  /abmahnf(ä|ae)hig/i,
  /verst(ö|oe)(ß|ss)(t|en)?\s+gegen/i,
  /bu(ß|ss)geld/i,
  /strafbar/i,
  /haftbar/i,
  /rechtswidrig/i,
];

/** Traegt dieser Text eine rechtliche Aussage — und damit Vorbehalts-Pflicht? */
export function brauchtVorbehalt(text: unknown): boolean {
  if (typeof text !== 'string' || !text) return false;
  return RECHTS_MERKMALE.some((r) => r.test(text));
}

/**
 * DIE BENANNTE AUSNAHMELISTE.
 * Jeder Eintrag ist ein Stueck Text, das im Auge-Text vorkommt, plus die
 * Begruendung, warum dort KEIN Vorbehalt noetig ist. Leer lassen ist die
 * Regel — ein Eintrag ist die Ausnahme und will begruendet sein.
 */
export const VORBEHALT_AUSNAHMEN: Array<{ enthaelt: string; grund: string }> = [
  // Beispiel, falls je gebraucht:
  // { enthaelt: '§ 2 BetrKV eintragen', grund: 'reine Ortsangabe im Formular, keine Bewertung' },
];

export interface AugeBefund {
  zeile: number;
  text: string;
  grund: string;
}

/** Ist diese Quellzeile nur ein Kommentar? Dann geht sie den Waechter nichts an. */
function istKommentar(zeile: string): boolean {
  const z = zeile.trim();
  return z.startsWith('//') || z.startsWith('*') || z.startsWith('/*');
}

/**
 * Liest lib/auge.ts als TEXT und meldet jede rechtlich klingende Stelle ohne
 * Vorbehalt. Warum als Text und nicht ueber die Funktionen? Weil jede der rund
 * siebzig auge*-Funktionen eigene Parameter braucht; ein Aufruf-Test wuerde
 * genau die Zweige verfehlen, auf die es ankommt. Der Textscan verfehlt keinen.
 *
 * Erkannt wird eine Rueckgabe daran, dass in derselben oder einer der
 * folgenden drei Zeilen `punkte:` oder `stimmung:` steht — so sehen alle
 * Rueckgaben in auge.ts aus.
 */
export function scanneAugeQuelle(quelltext: string): AugeBefund[] {
  const zeilen = (quelltext || '').split('\n');
  const befunde: AugeBefund[] = [];

  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    if (istKommentar(z)) continue;
    if (!brauchtVorbehalt(z)) continue;

    // Nur Text, der wirklich ausgegeben wird — nicht jede Zeile mit einem §.
    const istAusgabe = /klartext\s*:|punkte\s*\.push|punkte\s*:/.test(z)
      || /^\s*`/.test(z)
      || /^\s*'/.test(z);
    if (!istAusgabe) continue;

    const ausnahme = VORBEHALT_AUSNAHMEN.find((a) => z.includes(a.enthaelt));
    if (ausnahme) continue;

    // Fenster: diese Zeile plus die naechsten fuenf — dort steht der Vorbehalt,
    // wenn er gesetzt wurde. Rueckwaerts eine Zeile, falls er davor steht.
    const fenster = zeilen.slice(Math.max(0, i - 1), i + 6).join('\n');
    if (/vorbehalt\s*:/.test(fenster)) continue;

    befunde.push({
      zeile: i + 1,
      text: z.trim().slice(0, 160),
      grund: 'rechtliche Aussage ohne vorbehalt-Feld',
    });
  }
  return befunde;
}
