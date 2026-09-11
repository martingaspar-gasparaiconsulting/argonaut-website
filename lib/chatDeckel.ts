// ============================================================================
// ARGONAUT OS · lib/chatDeckel.ts — Mengengrenze für den öffentlichen Berater
//
// WARUM ES DAS GIBT
// Am 11.09.2026 fiel auf: Der öffentliche Chat auf Kundenwebsites lief OHNE
// jede Mengenbegrenzung. Die drei Kostenbremsen in lib/ki.ts (Rate-Limit,
// Demo-Deckel, Firmen-Topf) greifen alle nur `if (userId)` — ein Besucher auf
// einer fremden Website ist nicht eingeloggt und hat keine userId. Für ihn galt
// keine einzige Grenze.
//
// Gerechnet mit den echten Werten (claude-haiku-4-5, max_tokens 500) kostet ein
// Gespräch rund 1,9 Cent. 20.000 Gespräche im Monat sind also über 300 € —
// bei 99 € Einnahme.
//
// DIE STUFEN (Martin, 11.09.2026)
//   49 €  bis 1.000 Gespräche im Monat
//   99 €  bis 3.000 Gespräche im Monat
//   darüber: individuell, nach Terminvereinbarung
//
// WAS ÜBER DER GRENZE PASSIERT
// Der Berater schaltet NICHT ab. Er antwortet weiter — nur nicht mehr mit der
// KI, sondern mit einem freundlichen Hinweis auf den direkten Weg. Für den
// Besucher sieht das aus wie ein normales Kontaktangebot, nicht wie ein
// Fehler. Der Betreiber bekommt die Meldung und führt das Verkaufsgespräch
// über die nächste Stufe.
//
// Reine Logik: kein Supabase, kein fetch, keine Seiteneffekte. Node-getestet.
// ============================================================================

export type ChatStufe = 'klein' | 'gross' | 'individuell';

export type StufenAngabe = {
  name: string;
  /** Monatspreis in Euro, netto. 0 = frei verhandelt. */
  preis: number;
  /** Gespräche je Monat. null = keine feste Grenze (individuell vereinbart). */
  grenze: number | null;
};

/**
 * Die Stufen. Der Preis steht hier nur zur Anzeige — abgerechnet wird über
 * lib/tarif.ts. Wer hier eine Zahl ändert, ändert auch die AGB (siehe
 * tests/agbPreise.test.mjs).
 */
export const CHAT_STUFEN: Record<ChatStufe, StufenAngabe> = {
  klein:       { name: 'Berater · klein',       preis: 49, grenze: 1000 },
  gross:       { name: 'Berater · groß',        preis: 99, grenze: 3000 },
  individuell: { name: 'Berater · individuell', preis: 0,  grenze: null },
};

/** Ab diesem Anteil der Grenze geht eine Meldung an den Betreiber. */
export const WARN_AB_PROZENT = 80;

/**
 * Höchstzahl der Gespräche, die EIN Besucher in einer Minute führen darf.
 * Schützt gegen Skripte, die den Bot in einer Schleife anrufen — die würden
 * sonst das Monatskontingent eines Kunden in Minuten verbrennen.
 */
export const BESUCHER_PRO_MINUTE = 6;

export function stufeAngabe(stufe: string | null | undefined): StufenAngabe {
  const s = (stufe || '').trim().toLowerCase();
  if (s === 'gross' || s === 'groß') return CHAT_STUFEN.gross;
  if (s === 'individuell') return CHAT_STUFEN.individuell;
  return CHAT_STUFEN.klein;
}

export type DeckelErgebnis = {
  /** Darf der KI-Aufruf raus? */
  erlaubt: boolean;
  /** Soll der Betreiber eine Meldung bekommen? */
  warnen: boolean;
  /** Wie viele Gespräche bleiben in diesem Monat noch. null = keine Grenze. */
  rest: number | null;
  /** Anteil der Grenze in Prozent, gerundet. null = keine Grenze. */
  prozent: number | null;
  /** Text für den Besucher, wenn nicht erlaubt. Sonst leer. */
  besucherText: string;
  /** Text für die Betreiber-Meldung. Leer, wenn nichts zu melden ist. */
  betreiberText: string;
};

/**
 * Die eine Entscheidung: Geht dieser Aufruf noch raus?
 *
 * @param verbraucht Gespräche, die dieser Betrieb im laufenden Monat schon hatte.
 * @param stufe      Gebuchte Stufe ('klein' | 'gross' | 'individuell').
 */
export function pruefeDeckel(verbraucht: number, stufe: string | null | undefined): DeckelErgebnis {
  const angabe = stufeAngabe(stufe);
  const bisher = Math.max(0, Math.floor(Number(verbraucht) || 0));

  // Individuell vereinbart: keine technische Grenze, aber weiterhin gezählt.
  if (angabe.grenze === null) {
    return {
      erlaubt: true, warnen: false, rest: null, prozent: null,
      besucherText: '', betreiberText: '',
    };
  }

  const rest = Math.max(0, angabe.grenze - bisher);
  const prozent = Math.round((bisher / angabe.grenze) * 100);
  const erlaubt = bisher < angabe.grenze;

  if (!erlaubt) {
    return {
      erlaubt: false, warnen: true, rest: 0, prozent,
      // Kein Wort über Kontingente oder Grenzen — das ist nicht das Problem
      // des Besuchers. Er soll einfach den nächsten Schritt sehen.
      besucherText:
        'Der Berater ist gerade nicht erreichbar. Schreiben Sie uns gern direkt über das Kontaktformular — oder rufen Sie an, wir melden uns zügig.',
      betreiberText:
        `Die Monatsgrenze des Beraters ist erreicht (${bisher} von ${angabe.grenze} Gesprächen, Stufe „${angabe.name}"). ` +
        `Besucher bekommen ab jetzt den Hinweis aufs Kontaktformular. ` +
        `Das ist der richtige Moment für ein Gespräch über die nächste Stufe.`,
    };
  }

  // Auf den ECHTEN Anteil pruefen, nicht auf den gerundeten Anzeigewert:
  // 799 von 1000 sind 79,9 % und werden zu „80 %" gerundet — gewarnt wird aber
  // erst, wenn die Schwelle wirklich erreicht ist.
  const warnen = (bisher / angabe.grenze) * 100 >= WARN_AB_PROZENT;
  return {
    erlaubt: true, warnen, rest, prozent,
    besucherText: '',
    betreiberText: warnen
      ? `Der Berater hat ${prozent} % der Monatsgrenze erreicht (${bisher} von ${angabe.grenze}, Stufe „${angabe.name}"). Noch ${rest} Gespräche.`
      : '',
  };
}

/**
 * Monatsschlüssel für die Zählung: immer der Monatserste.
 * Nimmt „jetzt" als Parameter, damit die Funktion testbar bleibt.
 */
export function monatsSchluessel(jetzt: Date): string {
  const j = jetzt.getFullYear();
  const m = String(jetzt.getMonth() + 1).padStart(2, '0');
  return `${j}-${m}-01`;
}
