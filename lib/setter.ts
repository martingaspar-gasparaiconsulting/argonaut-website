// ============================================================================
// ARGONAUT OS · lib/setter.ts — G3: aus dem Auskunftsgeber wird ein Verkäufer
//
// Bis heute war der öffentliche Berater ein Auskunftsgeber: Er beantwortet
// Fragen und verweist bei Unbekanntem aufs Kontaktformular. Ein SETTER tut
// mehr — er verfolgt ein Ziel, stellt der Reihe nach die Fragen, die der
// Betrieb braucht, und erkennt, wann Schluss ist.
//
// Der Betrieb wählt je Kanal: Auskunft (wie bisher) oder Setter.
//
// WIE DAS GESPRÄCH SEIN GEDÄCHTNIS BEHÄLT
// Ein Chat hat keinen Zustand — bei jedem Aufruf kommt nur der Textverlauf.
// Statt die Antworten mit einem zweiten KI-Aufruf herauszulesen (Kosten,
// Wartezeit, neue Fehlerquelle), hängt die KI ihre Erkenntnisse selbst als
// unsichtbare Markierung an:
//
//     Gerne! Wann würde es Ihnen passen?[[ERFASST: name=Petra Wagner]]
//
// Die Markierung wird VOR der Auslieferung entfernt — der Besucher sieht sie
// nie. Beim nächsten Aufruf liest `leseErfasst()` sie aus dem Verlauf zurück.
// Damit ist die ganze Gesprächsführung reine Textverarbeitung: keine Imports,
// kein Netzwerk, mit `node --test` prüfbar. Genau das, was eine Logik braucht,
// die im Namen eines Betriebs mit dessen Kunden spricht.
// ============================================================================

export type Rolle = 'auskunft' | 'setter';
export type Ziel = 'termin' | 'rueckruf' | 'anfrage';

export type Frage = {
  /** Kurzer Schlüssel, unter dem die Antwort gemerkt wird (z. B. 'anliegen'). */
  schluessel: string;
  /** Die Frage, wie sie der Besucher liest. */
  frage: string;
  /** Ohne Pflichtfragen gilt das Ziel nie als erreicht. */
  pflicht?: boolean;
};

/** Was der Betrieb je Kanal eingestellt hat. */
export type SetterEinstellung = {
  rolle: Rolle;
  ziel: Ziel;
  fragen: Frage[];
  /** Stichworte, bei denen an einen Menschen übergeben wird. */
  uebergabeBei: string[];
  /** Slug der Online-Buchung — nur damit entstehen Termine, die im Schichtplan stehen. */
  buchungSlug?: string | null;
};

export const ZIEL_TEXT: Record<Ziel, string> = {
  termin: 'einen konkreten Termin vereinbaren',
  rueckruf: 'einen Rückruf mit Telefonnummer und Wunschzeit vereinbaren',
  anfrage: 'eine vollständige Anfrage aufnehmen',
};

/** Ohne eigene Fragen fragt der Setter wenigstens das Nötigste. */
export const STANDARD_FRAGEN: Frage[] = [
  { schluessel: 'anliegen', frage: 'Worum geht es genau?', pflicht: true },
  { schluessel: 'name', frage: 'Wie ist Ihr Name?', pflicht: true },
  { schluessel: 'kontakt', frage: 'Wie erreichen wir Sie am besten — E-Mail oder Telefon?', pflicht: true },
];

/**
 * Wortsignale, bei denen ohne weitere Einstellung an einen Menschen übergeben wird.
 *
 * Die Beugungen stehen einzeln da, weil auf WORTGRENZEN geprüft wird: „mensch
 * sprechen" findet „Menschen sprechen" nicht, das „en" steht dazwischen. Lieber
 * ein paar Zeilen mehr als ein verärgerter Kunde, den die Maschine festhält.
 */
export const STANDARD_UEBERGABE = [
  'beschwerde', 'beschweren', 'anwalt', 'kündigen', 'kuendigen', 'reklamation',
  'mitarbeiter sprechen', 'jemanden sprechen', 'jemandem sprechen',
  'echten menschen', 'echter mensch', 'mensch sprechen', 'menschen sprechen',
];

// ---------------------------------------------------------------------------
// 1) Die unsichtbare Markierung
// ---------------------------------------------------------------------------

const MARKE = /\[\[ERFASST:([^\]]*)\]\]/gi;

/**
 * Schneidet die Markierung aus der Antwort. Was der Besucher sieht, darf
 * NIE eine technische Notiz enthalten — auch dann nicht, wenn die KI sie
 * mitten im Satz oder mehrfach setzt.
 */
export function bereinigeAntwort(text: string | null | undefined): string {
  return String(text ?? '').replace(MARKE, '').replace(/[ \t]{2,}/g, ' ').trim();
}

/** Liest ein einzelnes `[[ERFASST: a=1; b=2]]` in ein Objekt. */
function leseMarke(inhalt: string): Record<string, string> {
  const raus: Record<string, string> = {};
  for (const teil of String(inhalt || '').split(';')) {
    const i = teil.indexOf('=');
    if (i <= 0) continue;
    const k = teil.slice(0, i).trim().toLowerCase();
    const v = teil.slice(i + 1).trim();
    if (k && v) raus[k] = v.slice(0, 200);
  }
  return raus;
}

/**
 * Baut eine Markierung aus dem, was bisher bekannt ist.
 *
 * WARUM DIE SERVERSEITE SIE NEU SCHREIBT
 * Der Chat lebt im Browser; sein Verlauf ist die einzige Erinnerung. Die
 * Markierung, die die KI anhaengt, wird vor der Auslieferung entfernt — sonst
 * saehe der Besucher sie. Also schickt der Server sie getrennt zurueck, und
 * das Widget haengt sie an den gemerkten Text (nicht an den angezeigten).
 *
 * Dabei wird sie NEU aufgebaut statt durchgereicht: Semikolon und Klammern
 * fliegen aus den Werten, die Zahl der Schluessel ist gedeckelt. Ein Besucher
 * kann seinen Verlauf manipulieren — er soll damit hoechstens das erreichen,
 * was er auch durch Tippen erreicht haette, und keine Marke sprengen.
 */
export const MARKE_MAX_SCHLUESSEL = 25;

export function baueMarke(erfasst: Record<string, string> | null | undefined): string {
  const teile: string[] = [];
  for (const [k, v] of Object.entries(erfasst || {})) {
    const s = String(k ?? '').trim().toLowerCase().replace(/[;=[\]]/g, '');
    const w = String(v ?? '').replace(/[;[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!s || !w) continue;
    teile.push(`${s}=${w}`);
    if (teile.length >= MARKE_MAX_SCHLUESSEL) break;
  }
  return teile.length ? `[[ERFASST: ${teile.join('; ')}]]` : '';
}

export type VerlaufItem = { role?: string; text?: string };

/**
 * Sammelt alles, was im bisherigen Gespräch erfasst wurde. Spätere Angaben
 * überschreiben frühere — wer seinen Namen korrigiert, bekommt den neuen.
 */
export function leseErfasst(verlauf: readonly VerlaufItem[] | null | undefined): Record<string, string> {
  const raus: Record<string, string> = {};
  for (const m of Array.isArray(verlauf) ? verlauf : []) {
    if (m?.role !== 'assistant') continue;
    const text = String(m?.text ?? '');
    for (const treffer of text.matchAll(new RegExp(MARKE.source, 'gi'))) {
      Object.assign(raus, leseMarke(treffer[1] ?? ''));
    }
  }
  return raus;
}

// ---------------------------------------------------------------------------
// 1b) Die Einstellung aus der Datenbank
// ---------------------------------------------------------------------------

/**
 * Liest eine Zeile aus `dialog_einstellung` in eine SetterEinstellung.
 *
 * Bewusst wehrhaft: `fragen` und `uebergabe_bei` koennen als Liste (jsonb,
 * text[]) ODER als Text ankommen — je nachdem, was der Treiber liefert und was
 * jemand in die Zeile geschrieben hat. Nichts davon darf die oeffentliche Route
 * zum Absturz bringen; im Zweifel gilt die Standard-Einstellung.
 *
 * `fragen` ist danach IMMER gefuellt (notfalls mit STANDARD_FRAGEN). Damit
 * braucht keine aufrufende Stelle mehr einen eigenen Notnagel — und es kann
 * auch keine vergessen.
 */
export function leseEinstellung(zeile: unknown): SetterEinstellung {
  const z = (zeile ?? {}) as Record<string, unknown>;

  const rolle: Rolle = String(z.rolle ?? '').trim().toLowerCase() === 'setter' ? 'setter' : 'auskunft';

  const zielRoh = String(z.ziel ?? '').trim().toLowerCase();
  const ziel: Ziel = zielRoh === 'termin' || zielRoh === 'rueckruf' ? zielRoh : 'anfrage';

  const fragen = leseFragen(z.fragen);

  const slugRoh = String(z.buchung_slug ?? z.buchungSlug ?? '').trim().toLowerCase();

  return {
    rolle,
    ziel,
    fragen: fragen.length ? fragen : STANDARD_FRAGEN,
    uebergabeBei: leseListe(z.uebergabe_bei ?? z.uebergabeBei),
    buchungSlug: slugRoh || null,
  };
}

/** Aus jsonb, Text oder Unsinn eine Liste von Zeichenketten machen. */
function leseListe(wert: unknown): string[] {
  let roh: unknown = wert;
  if (typeof roh === 'string') {
    const t = roh.trim();
    if (!t) return [];
    try { roh = JSON.parse(t); } catch { roh = t.split(','); }
  }
  if (!Array.isArray(roh)) return [];
  return roh.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 60);
}

/** Dasselbe fuer die Fragenliste — ohne Schluessel ist eine Frage wertlos. */
function leseFragen(wert: unknown): Frage[] {
  let roh: unknown = wert;
  if (typeof roh === 'string') {
    const t = roh.trim();
    if (!t) return [];
    try { roh = JSON.parse(t); } catch { return []; }
  }
  if (!Array.isArray(roh)) return [];
  const raus: Frage[] = [];
  for (const x of roh) {
    const f = (x ?? {}) as Record<string, unknown>;
    const schluessel = String(f.schluessel ?? f.key ?? '').trim().toLowerCase();
    const frage = String(f.frage ?? f.text ?? '').trim();
    if (!schluessel || !frage) continue;
    raus.push({ schluessel, frage, pflicht: f.pflicht === true || f.pflicht === 'true' });
    if (raus.length >= 12) break;
  }
  return raus;
}

// ---------------------------------------------------------------------------
// 2) Der Gesprächsstand
// ---------------------------------------------------------------------------

/** Die erste Frage, auf die noch keine Antwort vorliegt. null = alles da. */
export function naechsteFrage(fragen: readonly Frage[] | null | undefined, erfasst: Record<string, string>): Frage | null {
  for (const f of Array.isArray(fragen) ? fragen : []) {
    const wert = erfasst?.[String(f?.schluessel ?? '').toLowerCase()];
    if (!wert || !wert.trim()) return f;
  }
  return null;
}

/** Sind alle PFLICHT-Fragen beantwortet? Nur dann ist das Ziel erreichbar. */
export function istVollstaendig(fragen: readonly Frage[] | null | undefined, erfasst: Record<string, string>): boolean {
  for (const f of Array.isArray(fragen) ? fragen : []) {
    if (!f?.pflicht) continue;
    const wert = erfasst?.[String(f.schluessel ?? '').toLowerCase()];
    if (!wert || !wert.trim()) return false;
  }
  return true;
}

/**
 * Muss ein Mensch übernehmen?
 *
 * Bewusst großzügig: Lieber einmal zu früh an einen Menschen übergeben als
 * einen verärgerten Kunden von einer Maschine abfertigen lassen. Erkannt wird
 * auf Wortgrenzen, damit „kündigen" nicht in „ankündigen" anschlägt.
 */
export function brauchtMensch(text: string | null | undefined, stichworte?: readonly string[] | null): boolean {
  const t = String(text ?? '').toLowerCase();
  if (!t.trim()) return false;
  const liste = (Array.isArray(stichworte) && stichworte.length ? stichworte : STANDARD_UEBERGABE)
    .map((s) => String(s || '').toLowerCase().trim())
    .filter(Boolean);
  for (const w of liste) {
    const muster = new RegExp(`(^|[^a-zäöüß])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-zäöüß]|$)`, 'i');
    if (muster.test(t)) return true;
  }
  return false;
}

export type GespraechsStand = {
  /** 'fragen' · 'abschluss' · 'uebergabe' */
  phase: 'fragen' | 'abschluss' | 'uebergabe';
  offen: Frage | null;
  erfasst: Record<string, string>;
  vollstaendig: boolean;
};

/** Der Stand aus Verlauf und Einstellung — die eine Stelle, die alles zusammenführt. */
export function gespraechsStand(
  verlauf: readonly VerlaufItem[] | null | undefined,
  einst: SetterEinstellung,
  letzteFrage?: string | null,
): GespraechsStand {
  const erfasst = leseErfasst(verlauf);
  const fragen = Array.isArray(einst?.fragen) && einst.fragen.length ? einst.fragen : STANDARD_FRAGEN;

  if (brauchtMensch(letzteFrage, einst?.uebergabeBei)) {
    return { phase: 'uebergabe', offen: null, erfasst, vollstaendig: istVollstaendig(fragen, erfasst) };
  }
  const offen = naechsteFrage(fragen, erfasst);
  const vollstaendig = istVollstaendig(fragen, erfasst);
  return { phase: offen ? 'fragen' : 'abschluss', offen, erfasst, vollstaendig };
}

// ---------------------------------------------------------------------------
// 3) Der Systemtext
// ---------------------------------------------------------------------------

/**
 * Baut die Anweisung für den Setter.
 *
 * DIE ZWEI GRENZEN stehen hier fest verdrahtet und sind nicht einstellbar:
 *   · kein Preis, der nicht in den Stammdaten steht
 *   · er behauptet nie, ein Mensch zu sein — auch nicht auf Nachfrage
 *
 * Beides ist keine Geschmacksfrage: Ein erfundener Preis ist ein Angebot,
 * das der Betrieb halten muss, und die Offenlegungspflicht nach AI Act
 * Art. 50 gilt seit dem 02.08.2026.
 */
export function baueSetterSystemtext(opts: {
  firma: string;
  einst: SetterEinstellung;
  stand: GespraechsStand;
  produktText?: string;
  kontext?: string;
}): string {
  const firma = String(opts.firma || '').trim() || 'unser Betrieb';
  const einst = opts.einst;
  const stand = opts.stand;
  const fragen = Array.isArray(einst?.fragen) && einst.fragen.length ? einst.fragen : STANDARD_FRAGEN;

  const bekannt = Object.entries(stand.erfasst)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');

  const fragenListe = fragen
    .map((f, i) => `${i + 1}. ${f.frage}${f.pflicht ? ' (nötig)' : ' (wenn es sich ergibt)'} → merken als ${f.schluessel}`)
    .join('\n');

  const teile: string[] = [];

  teile.push(`Du führst für ${firma} ein kurzes Gespräch mit einem Interessenten. Dein Ziel: ${ZIEL_TEXT[einst?.ziel ?? 'anfrage']}.`);
  if (opts.kontext) teile.push(`Über den Betrieb: ${String(opts.kontext).slice(0, 400)}`);
  if (opts.produktText) teile.push(`\nDas bietet der Betrieb an:\n${opts.produktText}`);

  teile.push(`\nDiese Angaben brauchst du:\n${fragenListe}`);
  if (bekannt) teile.push(`\nSchon bekannt (NICHT erneut fragen): ${bekannt}`);

  if (stand.phase === 'uebergabe') {
    teile.push(
      '\nWICHTIG: Der Besucher möchte einen Menschen sprechen oder hat ein Anliegen, das nicht in ein Chatfenster gehört. '
      + 'Frage NICHTS mehr ab. Sag freundlich zu, dass sich jemand persönlich meldet, und frage nur noch nach der besten Erreichbarkeit, falls sie fehlt.',
    );
  } else if (stand.offen) {
    teile.push(`\nJetzt an der Reihe: „${stand.offen.frage}" — stelle GENAU DIESE eine Frage, freundlich und in einem Satz.`);
  } else {
    teile.push('\nAlle Angaben liegen vor. Fasse kurz zusammen, was du verstanden hast, und schließe das Gespräch ab.');
  }

  teile.push(
    '\nSo sprichst du:'
    + '\n- Deutsch, Sie-Ansprache, kurz und freundlich. Höchstens drei Sätze.'
    + '\n- EINE Frage auf einmal. Kein Verhör, kein Formular.'
    + '\n- Was der Besucher schon gesagt hat, fragst du nicht noch einmal.',
  );

  // Die zwei Grenzen — wortgleich, damit sie in keiner Einstellung verwässern.
  teile.push(
    '\nZwei Dinge sind absolut:'
    + '\n1. Du nennst NUR Preise, die oben ausdrücklich aufgeführt sind. Gibt es keinen, sagst du das offen und stellst einen Rückruf in Aussicht. Erfinde niemals einen Preis, eine Frist oder eine Zusage.'
    + '\n2. Du bist eine KI-Assistenz und sagst das ehrlich, wenn jemand danach fragt. Du behauptest NIE, ein Mensch zu sein — auch nicht scherzhaft.',
  );

  teile.push(
    '\nZum Schluss deiner Antwort hängst du unsichtbar an, was du neu erfahren hast:'
    + '\n[[ERFASST: schluessel=wert; schluessel=wert]]'
    + '\nNur neue oder korrigierte Angaben, mit den Schlüsseln von oben. Nichts erfahren? Dann lässt du die Markierung weg.',
  );

  return teile.join('\n');
}

// ---------------------------------------------------------------------------
// 4) Was am Ende ins CRM wandert
// ---------------------------------------------------------------------------

export type Ausbeute = {
  name: string;
  email: string;
  telefon: string;
  nachricht: string;
  /** Alles Übrige, das der Setter erfasst hat — landet als Notiz mit. */
  weiteres: Record<string, string>;
};

const MAIL_MUSTER = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Sortiert die erfassten Angaben in die Felder, die `leads` erwartet.
 *
 * Der häufigste Fall aus der Praxis: Auf „Wie erreichen wir Sie?" kommt EIN
 * Feld zurück — mal eine Mail, mal eine Nummer. Deshalb wird `kontakt`
 * anhand seiner Form einsortiert und nicht anhand seines Namens.
 */
export function baueAusbeute(erfasst: Record<string, string>): Ausbeute {
  const e = { ...(erfasst || {}) };
  const nimm = (...schluessel: string[]) => {
    for (const k of schluessel) {
      const v = (e[k] ?? '').trim();
      if (v) { delete e[k]; return v; }
    }
    return '';
  };

  const name = nimm('name', 'kunde', 'ansprechpartner');
  let email = nimm('email', 'e-mail', 'mail');
  let telefon = nimm('telefon', 'tel', 'handy', 'nummer');

  const kontakt = nimm('kontakt', 'erreichbarkeit');
  if (kontakt) {
    if (MAIL_MUSTER.test(kontakt)) { if (!email) email = kontakt; }
    else if (/\d{5,}/.test(kontakt.replace(/[^\d]/g, ''))) { if (!telefon) telefon = kontakt; }
    else if (!email && !telefon) { e.erreichbarkeit = kontakt; }
  }

  const anliegen = nimm('anliegen', 'nachricht', 'wunsch', 'thema');
  const rest = Object.entries(e).filter(([, v]) => (v ?? '').trim());
  const nachricht = [anliegen, ...rest.map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');

  return { name, email, telefon, nachricht, weiteres: Object.fromEntries(rest) };
}

/**
 * Reicht das Erfasste, um daraus einen Lead zu machen?
 * Ohne einen Weg zurück ist der schönste Gesprächsverlauf wertlos.
 */
export function lohntLead(a: Ausbeute): boolean {
  return !!(a && (a.email.trim() || a.telefon.trim()));
}
