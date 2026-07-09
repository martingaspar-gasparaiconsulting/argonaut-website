// ============================================================================
// ARGONAUT OS · dublettenLogik.ts
// Block 1 · I-1b — Doppelte Kontakte erkennen und zusammenführen
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Seiteneffekte.
// BRANCHENNEUTRAL. Kein Wort über Holz. Dieselbe Datei trägt jede Migration.
//
// DIE EINE REGEL, DIE ALLES TRÄGT
//   Zusammenführen ist unumkehrbar. Also entscheidet es KEIN AUTOMAT.
//   Diese Datei schlägt vor. Ein Mensch klickt.
//
//   Ein übersehener Doppelter kostet eine Minute. Ein falsch verschmolzener
//   Kunde kostet einen Kunden.
//
// DER FALL, DEN SIE LÖSEN MUSS
//   Kanban:  "P. Schäfer"      —              0170 33 26 126
//   HubSpot: "Philipp Schaefer" info@…de      +491703326126
//   Ein Mensch. Kein Feld stimmt exakt überein.
//
// DER FALL, DEN SIE NIEMALS LÖSEN DARF
//   Zwei Müllers in derselben Stadt mit zwei verschiedenen E-Mail-Adressen
//   sind ZWEI MENSCHEN. Verschiedene E-Mails = harte Sperre, egal wie
//   ähnlich alles andere ist.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. TYPEN
// ----------------------------------------------------------------------------

/** Was verglichen wird. Passt auf `kontakte` wie auf `firmen`. */
export interface Kandidat {
  id?: string;
  vorname?: string | null;
  nachname?: string | null;
  /** Bei Firmen der Firmenname, bei Kontakten die Firmenzugehörigkeit. */
  firmenname?: string | null;
  email?: string | null;
  telefon?: string | null;
  strasse?: string | null;
  plz?: string | null;
  ort?: string | null;
}

export type SignalArt =
  | 'email_gleich'
  | 'telefon_gleich'
  | 'name_exakt'
  | 'name_aehnlich'
  | 'name_initial'
  | 'nachname_plz'
  | 'adresse_gleich'
  | 'firma_gleich';

export interface Signal {
  art: SignalArt;
  punkte: number;
  erklaerung: string;
}

export type Zone = 'sicher' | 'pruefen' | 'getrennt';

export interface Vergleich {
  punkte: number;
  zone: Zone;
  signale: Signal[];
  /** Harte Sperre: verschiedene E-Mail-Adressen. Nie automatisch vorschlagen. */
  emailKonflikt: boolean;
  begruendung: string;
}

/** Ab hier gilt "sehr wahrscheinlich dieselbe Person" — aber nie vorangehakt. */
export const SCHWELLE_SICHER = 90;
/** Darunter kein Vorschlag. */
export const SCHWELLE_PRUEFEN = 50;

// ----------------------------------------------------------------------------
// 2. NORMALISIERUNG — hier entscheidet sich alles
// ----------------------------------------------------------------------------

/**
 * Faltet Umlaute doppelt: erst nach ae/oe/ue, dann auf den Grundvokal.
 * So werden "Schäfer", "Schaefer" und "Schafer" zum selben Schlüssel.
 * Ohne diesen Schritt findet man in Deutschland keinen einzigen Doppelten.
 */
export function namensSchluessel(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // é -> e
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Telefonnummern auf Ziffern reduzieren, deutsche Landesvorwahl auf 0.
 * "+49 170 33 26 126" und "0170/3326126" ergeben dieselbe Kette.
 */
export function telefonSchluessel(text: string | null | undefined): string {
  if (!text) return '';
  let z = text.replace(/[^\d+]/g, '');
  if (z.startsWith('+49')) z = '0' + z.slice(3);
  else if (z.startsWith('0049')) z = '0' + z.slice(4);
  else if (z.startsWith('49') && z.length > 10) z = '0' + z.slice(2);
  z = z.replace(/\D/g, '');
  // Zu kurz ist kein Signal, sondern Rauschen.
  return z.length >= 7 ? z : '';
}

/** E-Mail: klein, getrimmt. Kein Punkt-Entfernen — nicht jeder Anbieter ignoriert sie. */
export function emailSchluessel(text: string | null | undefined): string {
  if (!text) return '';
  const e = text.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : '';
}

/** "Starenweg 1a" und "starenweg1a" werden gleich. */
export function adressSchluessel(strasse: string | null | undefined, plz?: string | null): string {
  const s = namensSchluessel(strasse);
  const p = (plz ?? '').replace(/\D/g, '');
  return s ? `${s}|${p}` : '';
}

// ----------------------------------------------------------------------------
// 3. ÄHNLICHKEIT
// ----------------------------------------------------------------------------

/** Levenshtein-Abstand. Klein und ausreichend für Namenslängen. */
export function abstand(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let vorher = Array.from({ length: b.length + 1 }, (_, i) => i);
  let jetzt = new Array<number>(b.length + 1);

  for (let i = 0; i < a.length; i++) {
    jetzt[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const kosten = a[i] === b[j] ? 0 : 1;
      jetzt[j + 1] = Math.min(jetzt[j] + 1, vorher[j + 1] + 1, vorher[j] + kosten);
    }
    [vorher, jetzt] = [jetzt, vorher];
  }
  return vorher[b.length];
}

/** 0 bis 1. */
export function aehnlichkeit(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const max = Math.max(a.length, b.length);
  return 1 - abstand(a, b) / max;
}

/** Ist "P." eine Abkürzung von "Philipp"? */
export function istInitial(kurz: string, lang: string): boolean {
  const k = namensSchluessel(kurz);
  const l = namensSchluessel(lang);
  return k.length === 1 && l.length > 1 && l.startsWith(k);
}

// ----------------------------------------------------------------------------
// 4. DER VERGLEICH
// ----------------------------------------------------------------------------

/**
 * Vergleicht zwei Kandidaten und sammelt Signale.
 *
 * Kein einzelnes Kriterium entscheidet. Punkte addieren sich, weil erst die
 * Summe aus Name, Telefon und Adresse aus einer Vermutung eine Wahrscheinlich-
 * keit macht.
 */
export function vergleiche(a: Kandidat, b: Kandidat): Vergleich {
  const signale: Signal[] = [];

  const emailA = emailSchluessel(a.email);
  const emailB = emailSchluessel(b.email);
  const telA = telefonSchluessel(a.telefon);
  const telB = telefonSchluessel(b.telefon);
  const vorA = namensSchluessel(a.vorname);
  const vorB = namensSchluessel(b.vorname);
  const nachA = namensSchluessel(a.nachname);
  const nachB = namensSchluessel(b.nachname);
  const firmaA = namensSchluessel(a.firmenname);
  const firmaB = namensSchluessel(b.firmenname);
  const plzA = (a.plz ?? '').replace(/\D/g, '');
  const plzB = (b.plz ?? '').replace(/\D/g, '');

  // ⚠️ DIE HARTE SPERRE.
  const emailKonflikt = Boolean(emailA && emailB && emailA !== emailB);

  // --- E-Mail: fast beweisend ------------------------------------------
  if (emailA && emailA === emailB) {
    signale.push({ art: 'email_gleich', punkte: 90, erklaerung: `Gleiche E-Mail: ${emailA}` });
  }

  // --- Telefon ----------------------------------------------------------
  if (telA && telA === telB) {
    signale.push({ art: 'telefon_gleich', punkte: 80, erklaerung: 'Gleiche Telefonnummer' });
  }

  // --- Name -------------------------------------------------------------
  if (nachA && nachA === nachB) {
    if (vorA && vorA === vorB) {
      signale.push({ art: 'name_exakt', punkte: 40, erklaerung: 'Vor- und Nachname stimmen überein' });
    } else if ((a.vorname && b.vorname) && (istInitial(a.vorname, b.vorname) || istInitial(b.vorname, a.vorname))) {
      signale.push({ art: 'name_initial', punkte: 30, erklaerung: `Vorname abgekürzt: „${a.vorname}" / „${b.vorname}"` });
    } else if (!vorA || !vorB) {
      signale.push({ art: 'name_aehnlich', punkte: 20, erklaerung: 'Gleicher Nachname, ein Vorname fehlt' });
    }

    if (plzA && plzA === plzB) {
      signale.push({ art: 'nachname_plz', punkte: 35, erklaerung: `Gleicher Nachname, gleiche PLZ (${plzA})` });
    }
  } else if (nachA && nachB && aehnlichkeit(nachA, nachB) >= 0.85) {
    signale.push({
      art: 'name_aehnlich', punkte: 25,
      erklaerung: `Ähnlicher Nachname: „${a.nachname}" / „${b.nachname}"`,
    });
  }

  // --- Firma -------------------------------------------------------------
  if (firmaA && firmaA === firmaB) {
    signale.push({ art: 'firma_gleich', punkte: 30, erklaerung: `Gleiche Firma: ${b.firmenname}` });
  }

  // --- Adresse ------------------------------------------------------------
  const adrA = adressSchluessel(a.strasse, a.plz);
  const adrB = adressSchluessel(b.strasse, b.plz);
  if (adrA && adrA === adrB) {
    signale.push({ art: 'adresse_gleich', punkte: 30, erklaerung: 'Gleiche Anschrift' });
  }

  const punkte = Math.min(100, signale.reduce((s, x) => s + x.punkte, 0));

  // Bei E-Mail-Konflikt niemals in die Zone "sicher".
  let zone: Zone;
  if (emailKonflikt) {
    zone = punkte >= SCHWELLE_PRUEFEN ? 'pruefen' : 'getrennt';
  } else if (punkte >= SCHWELLE_SICHER) {
    zone = 'sicher';
  } else if (punkte >= SCHWELLE_PRUEFEN) {
    zone = 'pruefen';
  } else {
    zone = 'getrennt';
  }

  const begruendung = emailKonflikt
    ? 'Verschiedene E-Mail-Adressen — vermutlich zwei verschiedene Personen. Bitte genau prüfen.'
    : zone === 'sicher'
      ? 'Sehr wahrscheinlich dieselbe Person.'
      : zone === 'pruefen'
        ? 'Könnte dieselbe Person sein.'
        : 'Keine ausreichenden Übereinstimmungen.';

  return { punkte, zone, signale, emailKonflikt, begruendung };
}

// ----------------------------------------------------------------------------
// 5. SUCHE IM BESTAND
// ----------------------------------------------------------------------------

export interface Treffer {
  kandidat: Kandidat;
  vergleich: Vergleich;
}

/**
 * Findet mögliche Doppelte zu einem neuen Datensatz.
 * Sortiert nach Punkten, absteigend. Gibt nur zurück, was mindestens
 * die Prüf-Schwelle erreicht — alles darunter ist Rauschen.
 */
export function findeDubletten(
  neu: Kandidat,
  bestand: readonly Kandidat[],
  mindestens = SCHWELLE_PRUEFEN,
): Treffer[] {
  return bestand
    .filter((k) => k.id !== neu.id)
    .map((k) => ({ kandidat: k, vergleich: vergleiche(neu, k) }))
    .filter((t) => t.vergleich.punkte >= mindestens)
    .sort((a, b) => b.vergleich.punkte - a.vergleich.punkte);
}

/** Doppelte innerhalb einer Import-Liste — HubSpot und Kanban im selben Lauf. */
export function findeInternenDubletten(
  liste: readonly Kandidat[],
  mindestens = SCHWELLE_PRUEFEN,
): Array<{ a: number; b: number; vergleich: Vergleich }> {
  const paare: Array<{ a: number; b: number; vergleich: Vergleich }> = [];
  for (let i = 0; i < liste.length; i++) {
    for (let j = i + 1; j < liste.length; j++) {
      const v = vergleiche(liste[i], liste[j]);
      if (v.punkte >= mindestens) paare.push({ a: i, b: j, vergleich: v });
    }
  }
  return paare.sort((x, y) => y.vergleich.punkte - x.vergleich.punkte);
}

// ----------------------------------------------------------------------------
// 6. ZUSAMMENFÜHREN — Feld für Feld, vom Menschen entschieden
// ----------------------------------------------------------------------------

export type Feldname = keyof Omit<Kandidat, 'id'>;

export const FELDER: Feldname[] = [
  'vorname', 'nachname', 'firmenname', 'email', 'telefon', 'strasse', 'plz', 'ort',
];

export interface FeldVorschlag {
  feld: Feldname;
  wertA: string | null;
  wertB: string | null;
  /** Was das System vorschlägt — der Mensch darf umstellen. */
  empfehlung: 'a' | 'b';
  grund: string;
  /** Beide Werte vorhanden und verschieden? Dann geht einer verloren. */
  konflikt: boolean;
}

function leer(v: string | null | undefined): boolean {
  return !v || !v.trim();
}

/**
 * Trägt der Text Umlaute oder Akzente?
 *
 * Wichtig beim Zusammenführen: "Schäfer" und "Schaefer" bedeuten dasselbe,
 * aber nur die erste Schreibweise ist die richtige. Die längere zu nehmen,
 * wäre hier genau falsch — "Schaefer" hat mehr Zeichen und weniger Information.
 */
function hatDiakritika(text: string): boolean {
  return /[äöüßÄÖÜáàâéèêíìîóòôúùûñçÁÀÂÉÈÊÍÌÎÓÒÔÚÙÛÑÇ]/.test(text);
}

/**
 * Bei bedeutungsgleichen Werten: welche Schreibweise ist die bessere?
 *   1. Die mit Umlauten/Akzenten — sie ist die korrekte.
 *   2. Sonst die längere — mehr Information.
 */
function bessereSchreibweise(wertA: string, wertB: string): 'a' | 'b' {
  const dA = hatDiakritika(wertA);
  const dB = hatDiakritika(wertB);
  if (dA !== dB) return dA ? 'a' : 'b';
  return wertB.trim().length > wertA.trim().length ? 'b' : 'a';
}

/**
 * Baut die Feld-für-Feld-Ansicht.
 *
 * Regeln, in dieser Reihenfolge:
 *   1. Ist ein Wert leer, gewinnt der andere. Immer.
 *   2. Ist einer eine Abkürzung des anderen ("P." / "Philipp"), gewinnt der lange.
 *   3. Ist einer länger, gewinnt er — mehr Information schlägt weniger.
 *   4. Sonst gewinnt A (der behaltene Datensatz).
 *
 * Was nicht gewinnt, geht NICHT verloren: der Aufrufer schreibt es in eine Notiz.
 */
export function zusammenfuehrungsVorschlag(a: Kandidat, b: Kandidat): FeldVorschlag[] {
  return FELDER.map((feld) => {
    const wertA = (a[feld] as string | null | undefined) ?? null;
    const wertB = (b[feld] as string | null | undefined) ?? null;

    if (leer(wertA) && leer(wertB)) {
      return { feld, wertA, wertB, empfehlung: 'a', grund: 'beide leer', konflikt: false };
    }
    if (leer(wertA)) {
      return { feld, wertA, wertB, empfehlung: 'b', grund: 'nur hier vorhanden', konflikt: false };
    }
    if (leer(wertB)) {
      return { feld, wertA, wertB, empfehlung: 'a', grund: 'nur hier vorhanden', konflikt: false };
    }

    const gleich =
      feld === 'email' ? emailSchluessel(wertA) === emailSchluessel(wertB)
      : feld === 'telefon' ? telefonSchluessel(wertA) === telefonSchluessel(wertB)
      : namensSchluessel(wertA) === namensSchluessel(wertB);

    if (gleich) {
      // Bei gleicher Bedeutung: Umlaute schlagen Länge. "Schäfer" vor "Schaefer".
      const empfehlung = bessereSchreibweise(wertA as string, wertB as string);
      const grund = hatDiakritika(wertA as string) !== hatDiakritika(wertB as string)
        ? 'gleicher Wert, richtige Schreibweise mit Umlaut'
        : 'gleicher Wert, andere Schreibweise';
      return { feld, wertA, wertB, empfehlung, grund, konflikt: false };
    }

    if ((feld === 'vorname' || feld === 'nachname')) {
      if (istInitial(wertA as string, wertB as string)) {
        return { feld, wertA, wertB, empfehlung: 'b', grund: 'ausgeschrieben statt abgekürzt', konflikt: false };
      }
      if (istInitial(wertB as string, wertA as string)) {
        return { feld, wertA, wertB, empfehlung: 'a', grund: 'ausgeschrieben statt abgekürzt', konflikt: false };
      }
    }

    const laengerB = (wertB as string).trim().length > (wertA as string).trim().length;
    return {
      feld, wertA, wertB,
      empfehlung: laengerB ? 'b' : 'a',
      grund: 'unterschiedliche Werte — bitte prüfen',
      konflikt: true,
    };
  });
}

/**
 * Baut den Datensatz, der überlebt. `wahl` bestimmt je Feld die Quelle.
 * Ohne Angabe gilt die Empfehlung.
 */
export function fuehreZusammen(
  a: Kandidat,
  b: Kandidat,
  wahl: Partial<Record<Feldname, 'a' | 'b'>> = {},
): Kandidat {
  const vorschlaege = zusammenfuehrungsVorschlag(a, b);
  const raus: Kandidat = { id: a.id };
  for (const v of vorschlaege) {
    const q = wahl[v.feld] ?? v.empfehlung;
    raus[v.feld] = (q === 'a' ? v.wertA : v.wertB) as never;
  }
  return raus;
}

/**
 * Was verloren ginge, als lesbare Notiz. Der Aufrufer hängt sie an den
 * überlebenden Datensatz. Nichts verschwindet stillschweigend.
 */
export function verworfeneWerte(
  a: Kandidat,
  b: Kandidat,
  wahl: Partial<Record<Feldname, 'a' | 'b'>> = {},
): string[] {
  const zeilen: string[] = [];
  for (const v of zusammenfuehrungsVorschlag(a, b)) {
    if (!v.konflikt) continue;
    const q = wahl[v.feld] ?? v.empfehlung;
    const verworfen = q === 'a' ? v.wertB : v.wertA;
    if (verworfen && verworfen.trim()) zeilen.push(`${v.feld}: ${verworfen}`);
  }
  return zeilen;
}
