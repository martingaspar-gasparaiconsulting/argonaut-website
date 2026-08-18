// ============================================================================
// ARGONAUT OS · lib/inhaltPrompt.ts
//
// DIE SPRACHE DER INHALTS-WERKSTATT. Hier steht, WIE ein Kapitel geschrieben
// wird — Rolle, Zielgruppe, Ton, Laenge, Verbote. Getrennt von
// lib/inhaltBaustein.ts (das WAS), damit sich der Ton aendern laesst, ohne die
// Bauplan-Logik anzufassen.
//
// WARUM DER SYSTEM-PROMPT EINE KONSTANTE IST
// Die Stapel-Schnittstelle rechnet den System-Block bei gleichbleibendem Text
// guenstiger ab. Wichtiger noch: 113 Kapitel, die mit demselben Auftrag
// geschrieben wurden, klingen wie ein Buch. 113 Kapitel mit jeweils leicht
// anderem Auftrag klingen wie 113 Autoren.
//
// DIE PRUEFUNG NACH DEM ABHOLEN IST DER EIGENTLICHE WERT
// Eine Maschine haelt sich nicht immer an Verbote. `pruefeEntwurf` faengt „du",
// „KI-Agenten", „KI-Crew" und zu kurze Antworten ab, BEVOR Martin 113 Texte
// von Hand durchliest. Was auffaellt, landet als Notiz am Entwurf.
//
// KEINE Netz-Aufrufe, KEINE Supabase-Aufrufe, KEINE Hooks. Node-testbar.
// ============================================================================

import type { BausteinTyp, OffenerBaustein } from './inhaltBaustein';

// ---------------------------------------------------------------------------
// Modell und Kosten
// ---------------------------------------------------------------------------

/**
 * Das Modell fuer die Werkstatt. Vorgabe ist das im Repo eingesetzte Haiku 4.5.
 * Ueber die Umgebungsvariable INHALT_MODELL umstellbar, ohne Codeaenderung —
 * fuer laengere Buchkapitel lohnt sich ein groesseres Modell, und der Name
 * soll nicht in einem Push festbetoniert sein.
 */
export const MODELL_VORGABE = 'claude-haiku-4-5';

export function modellWahl(ausUmgebung?: string | null): string {
  const m = String(ausUmgebung ?? '').trim();
  return m.length > 0 ? m : MODELL_VORGABE;
}

/** Wieviel Platz eine Antwort je Typ bekommt. */
export const MAX_TOKENS: Record<BausteinTyp, number> = {
  modul_kapitel: 1600,
  kategorie_kapitel: 1600,
  branchen_vorwort: 700,
  ki_dialog: 900,
};

/**
 * Grobe Kostenschaetzung in USD FUER DIE ANZEIGE vor dem Absenden.
 * Die echte Abrechnung steht spaeter in ki_nutzung — das hier soll nur
 * verhindern, dass jemand ahnungslos einen teuren Stapel abschickt.
 * Preise je 1 Mio Tokens, Stapel-Schnittstelle = halber Preis.
 */
export function schaetzeKosten(
  anzahl: number,
  modell: string,
  tokensRein = 700,
  tokensRaus = 1200,
): { usd: number; hinweis: string } {
  const m = (modell || '').toLowerCase();
  let rein = 3.0, raus = 15.0;                       // unbekannt -> konservativ
  if (m.includes('haiku')) { rein = 1.0; raus = 5.0; }
  else if (m.includes('sonnet')) { rein = 2.0; raus = 10.0; }

  const n = Math.max(0, Math.floor(anzahl));
  const voll = (n * tokensRein * rein + n * tokensRaus * raus) / 1_000_000;
  const usd = voll / 2;                              // Stapel = halber Preis
  return {
    usd,
    hinweis: `${n} Kapitel über die Stapel-Schnittstelle (halber Preis): geschätzt ${usd.toFixed(2)} USD.`,
  };
}

// ---------------------------------------------------------------------------
// Der System-Prompt
// ---------------------------------------------------------------------------

const VERBOTE = [
  'Niemals „KI-Agenten", „KI-Crew" oder „Agenten" — die Bestandteile von ARGONAUT heissen BAUSTEINE.',
  'Niemals duzen. Der Leser wird durchgehend mit „Sie" angesprochen.',
  'Keine Mitbewerber beim Namen nennen — falls noetig „führende Mitbewerber".',
  'Keine erfundenen Zahlen, Studien, Prozentwerte oder Kundenstimmen. Lieber nichts als Erfundenes.',
  'Keine Versprechen zu Preisen, Fristen oder Rechtsfolgen.',
  'Keine Werbefloskeln („revolutionär", „einzigartig", „nahtlos", „ganzheitlich", „State of the Art").',
  'Keine Anglizismen, wo es ein deutsches Wort gibt (Dashboard -> Übersicht, Workflow -> Ablauf).',
].map((z) => '· ' + z).join('\n');

export const SYSTEM_PROMPT = `Du schreibst Kapitel für die Handbücher von ARGONAUT OS, einem KI-Betriebssystem für den deutschen Mittelstand.

WER LIEST DAS
Inhaberinnen und Inhaber deutscher Betriebe mit 5 bis 50 Mitarbeitern: Handwerk, Handel, Gastronomie, Dienstleistung. Sie sind Fachleute in ihrem Gewerk, nicht in Software. Sie haben abends zwanzig Minuten Zeit und wenig Geduld für Fachchinesisch.

WIE DU SCHREIBST
· Ruhig, sachlich, respektvoll. Wie ein erfahrener Kollege, der etwas erklärt — nicht wie ein Verkäufer.
· Kurze Sätze. Ein Gedanke je Satz.
· Jeder Begriff, der erklärt werden muss, wird beim ersten Auftauchen erklärt.
· Konkrete Beispiele aus dem Betriebsalltag statt abstrakter Vorteile.
· Der Leser soll am Ende wissen, was sich MONTAG FRÜH bei ihm ändert.

WAS NIE VORKOMMT
${VERBOTE}

FORMAT
Reiner Fliesstext in Absätzen, Markdown nur für Zwischenüberschriften (##) und Aufzählungen (·).
KEINE Hauptüberschrift — die Überschrift setzt das Handbuch selbst.
Beginne direkt mit dem ersten Satz des Textes. Keine Einleitung wie „Hier ist der Text" und keine Schlussbemerkung.`;

// ---------------------------------------------------------------------------
// Die Frage je Typ
// ---------------------------------------------------------------------------

function zeile(bezeichnung: string, wert: string | undefined): string {
  const w = String(wert ?? '').trim();
  return w.length > 0 ? `${bezeichnung}: ${w}\n` : '';
}

/**
 * Aus einem offenen Baustein die Frage an das Modell bauen.
 * Gibt bei unbekanntem Typ einen leeren Text zurueck — bereiteVor() in
 * lib/kiBatch.ts wirft leere Auftraege heraus, bevor sie Geld kosten.
 */
export function frageFuer(offen: OffenerBaustein): string {
  const k = offen?.kontext ?? {};

  if (offen?.typ === 'modul_kapitel') {
    return (
      `Schreibe das Handbuch-Kapitel über den ARGONAUT-Baustein „${offen.ueberschrift}".\n\n` +
      zeile('Interner Schlüssel', k.modul) +
      zeile('Bereich im Programm', k.gruppe) +
      zeile('Umfasst auch die Ansichten', k.auch) +
      `\nAUFBAU (ohne diese vier Wörter als Überschriften zu benutzen):\n` +
      `1. Wie der Betrieb das heute ohne ARGONAUT löst — und woran es dabei hakt.\n` +
      `2. Was dieser Baustein übernimmt, in einfachen Worten.\n` +
      `3. Ein durchgehendes Beispiel aus einem konkreten Betriebsalltag.\n` +
      `4. Was sich dadurch messbar ändert — ohne erfundene Zahlen.\n\n` +
      `Länge: 400 bis 600 Wörter.`
    );
  }

  if (offen?.typ === 'kategorie_kapitel') {
    return (
      `Schreibe das einleitende Kapitel für die Branchengruppe „${offen.ueberschrift}".\n\n` +
      zeile('Bausteine dieser Gruppe', k.module) +
      `\nAUFBAU:\n` +
      `1. Woran es in Betrieben dieser Gruppe im Alltag typischerweise hakt — drei bis vier konkrete Punkte.\n` +
      `2. Warum Standardsoftware daran meist vorbeigeht.\n` +
      `3. Wie die Bausteine dieser Gruppe zusammenspielen — nicht als Aufzählung, sondern als Ablauf entlang eines Auftrags.\n\n` +
      `Erwähne die Bausteine namentlich, aber erkläre sie hier nicht im Detail — dafür kommen eigene Kapitel.\n` +
      `Länge: 450 bis 650 Wörter.`
    );
  }

  if (offen?.typ === 'branchen_vorwort') {
    return (
      `Schreibe das Vorwort des Handbuchs für die Branche „${offen.ueberschrift}".\n\n` +
      zeile('Branchengruppe', k.kategorie) +
      zeile('Was in dieser Branche Zeit frisst', k.schmerzen) +
      zeile('Was sich mit ARGONAUT ändert', k.ergebnisse) +
      `\nDas Vorwort spricht den Leser direkt an, benennt zwei bis drei Dinge, die in genau dieser Branche Zeit fressen, ` +
      `und sagt in einem Satz, was er auf den nächsten Seiten findet.\n` +
      `Kein Verkaufstext. Länge: 150 bis 220 Wörter.`
    );
  }

  if (offen?.typ === 'ki_dialog') {
    return (
      `Schreibe den Gesprächseinstieg, mit dem sich ARGONAUT einem Betrieb der Branche „${offen.ueberschrift}" vorstellt.\n\n` +
      zeile('Branchengruppe', k.kategorie) +
      zeile('Was in dieser Branche Zeit frisst', k.schmerzen) +
      zeile('Was sich mit ARGONAUT ändert', k.ergebnisse) +
      `\nZwei kurze Absätze, dann drei Fragen, die der Betrieb sich selbst stellen sollte. ` +
      `Die Fragen sind echte Fragen, keine verkappten Behauptungen.\n` +
      `Länge: 180 bis 260 Wörter.`
    );
  }

  return '';
}

// ---------------------------------------------------------------------------
// Die Pruefung nach dem Abholen
// ---------------------------------------------------------------------------

/** Mindestlaenge je Typ in Zeichen — darunter ist etwas schiefgelaufen. */
export const MIN_ZEICHEN: Record<BausteinTyp, number> = {
  modul_kapitel: 900,
  kategorie_kapitel: 900,
  branchen_vorwort: 400,
  ki_dialog: 400,
};

/** Worte, die in keinem Kundentext vorkommen duerfen. */
const VERBOTENE_WOERTER: Array<{ suche: RegExp; meldung: string }> = [
  { suche: /\bki[-\s]?agent(en)?\b/i, meldung: '„KI-Agenten" — muss „Bausteine" heissen' },
  { suche: /\bki[-\s]?crew\b/i, meldung: '„KI-Crew" — muss „Bausteine" heissen' },
  { suche: /\b(du|dich|dir|dein|deine|deinen|deiner|deinem|deines)\b/i, meldung: 'Duz-Form — Kundentexte siezen' },
  { suche: /\brevolutionär|bahnbrechend|einzigartig|nahtlos|ganzheitlich\b/i, meldung: 'Werbefloskel' },
];

export type EntwurfPruefung = {
  /** Der bereinigte Text (Rahmen-Saetze der Maschine entfernt). */
  text: string;
  /** Klartext-Beanstandungen — leer heisst sauber. */
  hinweise: string[];
  /** Sauber genug, um ohne Nacharbeit gelesen zu werden? */
  sauber: boolean;
};

/**
 * Vorspann und Nachklapp entfernen, die Modelle gern anhaengen
 * („Hier ist das Kapitel:", „Ich hoffe, das passt.").
 */
export function bereinige(roh: string): string {
  let t = String(roh ?? '').replace(/\r\n/g, '\n').trim();

  // Ein einleitender Meta-Satz vor der ersten Leerzeile.
  t = t.replace(/^(hier ist|gerne|natürlich|anbei|im folgenden)[^\n]{0,120}:\s*\n+/i, '');
  // Ein Nachklapp im letzten Absatz.
  t = t.replace(/\n+((ich hoffe|lass mich wissen|gerne passe ich|bei rückfragen)[^\n]{0,160})\s*$/i, '');
  // Eine faelschlich gesetzte Hauptueberschrift in der ersten Zeile.
  t = t.replace(/^#\s+[^\n]+\n+/, '');
  // Code-Zaun um den ganzen Text.
  t = t.replace(/^```[a-z]*\n([\s\S]*)\n```$/i, '$1');

  return t.trim();
}

/**
 * Einen abgeholten Entwurf pruefen. Wirft nie — was auffaellt, wird gemeldet
 * und als Notiz gespeichert. Der Text wird NICHT verworfen: er ist bezahlt,
 * und ein Mensch entscheidet besser als eine Regel.
 */
export function pruefeEntwurf(roh: string, typ: BausteinTyp): EntwurfPruefung {
  const text = bereinige(roh);
  const hinweise: string[] = [];

  const min = MIN_ZEICHEN[typ] ?? 400;
  if (text.length === 0) hinweise.push('Die Antwort war leer.');
  else if (text.length < min) hinweise.push(`Nur ${text.length} Zeichen — erwartet waren mindestens ${min}.`);

  for (const v of VERBOTENE_WOERTER) {
    if (v.suche.test(text)) hinweise.push(`Verbotenes Wording: ${v.meldung}.`);
  }

  if (/^##?\s*(kapitel|einleitung|überschrift)\b/im.test(text)) {
    hinweise.push('Enthält eine eigene Hauptüberschrift — die setzt das Handbuch selbst.');
  }

  return { text, hinweise, sauber: hinweise.length === 0 };
}

/** Aus dem Text eine kurze Kapitel-Zusammenfassung fuer die Redaktionsliste. */
export function vorschau(text: string, zeichen = 160): string {
  const t = String(text ?? '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length <= zeichen) return t;
  const schnitt = t.slice(0, zeichen);
  const luecke = schnitt.lastIndexOf(' ');
  return (luecke > zeichen * 0.6 ? schnitt.slice(0, luecke) : schnitt) + '…';
}
