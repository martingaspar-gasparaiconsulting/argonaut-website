// ============================================================================
// ARGONAUT OS · lib/diktat.ts — Diktat ueberall (D4)
//
// Bisher gibt es Spracheingabe an genau EINER Stelle: der CRM-Kontaktseite,
// eingebaut mitten in eine 80-KB-Datei. Ueberall sonst, wo jemand mit
// dreckigen Haenden vor dem Telefon steht — Einsatzbericht auf der Baustelle,
// Ticket, Bautagebuch — muss getippt werden.
//
// DAS PROBLEM, DAS DIESE DATEI LOEST:
// Die Browser-Spracherkennung beendet sich nach einer Sprechpause von selbst.
// Auf dem Telefon oft schon nach wenigen Sekunden. Die bestehende Fassung
// setzt dann einfach „Aufnahme aus" — mitten im Satz, ohne Hinweis. Wer
// weiterspricht, verliert alles Gesagte. Deshalb wird hier zwischen
// „gewollt beendet" und „von selbst ausgegangen" unterschieden, und der
// bereits erkannte Text lebt getrennt vom laufenden Zwischenstand.
//
// KEINE Netzwerk-/Browser-Aufrufe, KEINE React-Hooks — pure, node-testbar.
// ============================================================================

/** Harte Obergrenze je Aufnahme. Schutz gegen ein Telefon in der Hosentasche. */
export const MAX_SEKUNDEN = 10 * 60;

/** So oft startet die Erkennung nach einer Sprechpause automatisch neu. */
export const MAX_NEUSTARTS = 40;

// ---------------------------------------------------------------------------
// Sprechbefehle
// ---------------------------------------------------------------------------

type Befehl = { woerter: string[]; ersatz: string; klebt: boolean };

/**
 * Was man sagen kann, statt es zu tippen. Bewusst kurz gehalten: Wer sich
 * zwanzig Befehle merken muss, benutzt keinen davon.
 *
 * `klebt` = kommt ohne Leerzeichen direkt an das Wort davor.
 */
const BEFEHLE: Befehl[] = [
  { woerter: ['punkt'], ersatz: '.', klebt: true },
  { woerter: ['komma'], ersatz: ',', klebt: true },
  { woerter: ['fragezeichen'], ersatz: '?', klebt: true },
  { woerter: ['ausrufezeichen'], ersatz: '!', klebt: true },
  { woerter: ['doppelpunkt'], ersatz: ':', klebt: true },
  { woerter: ['semikolon', 'strichpunkt'], ersatz: ';', klebt: true },
  { woerter: ['bindestrich'], ersatz: '-', klebt: true },
  { woerter: ['neue zeile', 'neuer absatz', 'absatz'], ersatz: '\n', klebt: true },
  { woerter: ['aufzählung', 'aufzaehlung', 'spiegelstrich'], ersatz: '\n- ', klebt: true },
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Sprechbefehle in Zeichen umsetzen. Nur als EIGENES Wort — sonst wird aus
 * „Rohrbruch am Knotenpunkt" ein Satzende mitten im Wort.
 */
export function wendeBefehleAn(roh: unknown): string {
  let t = String(roh ?? '');
  for (const b of BEFEHLE) {
    for (const w of b.woerter) {
      const re = new RegExp(`(^|\\s)${escapeRegex(w)}(?=\\s|$|[.,!?;:])`, 'gi');
      t = t.replace(re, b.klebt ? b.ersatz : ` ${b.ersatz}`);
    }
  }
  return t;
}

// ---------------------------------------------------------------------------
// Aufräumen
// ---------------------------------------------------------------------------

/**
 * Den erkannten Text lesbar machen: Leerzeichen vor Satzzeichen weg, doppelte
 * Leerzeichen zusammen, nach einem Satzende gross weiter.
 *
 * Bewusst NUR Formsachen — kein Umformulieren, kein Korrigieren von Inhalten.
 * Was jemand diktiert hat, soll er hinterher wiedererkennen.
 */
export function saeubere(roh: unknown): string {
  let t = String(roh ?? '');
  t = t.replace(/[ \t]+([.,!?;:])/g, '$1');          // Leerzeichen vor Satzzeichen
  t = t.replace(/([.,!?;:])(?=[^\s.,!?;:\d])/g, '$1 '); // Leerzeichen danach
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/[ \t]*\n[ \t]*/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  // Satzanfang gross — nach Zeilenanfang und nach . ! ?
  t = t.replace(/(^|[.!?]\s+|\n\s*)([a-zäöüß])/g, (_m, vor: string, buchstabe: string) =>
    vor + buchstabe.toUpperCase());
  return t.trim();
}

/**
 * Neu Gesprochenes an vorhandenen Text haengen. Der Bestand wird NIE
 * ueberschrieben: Wer schon etwas getippt hat und dann das Mikrofon
 * benutzt, verliert sonst seine Arbeit.
 */
export function verbinde(bestand: unknown, neu: unknown): string {
  const a = String(bestand ?? '').replace(/\s+$/, '');
  const b = String(neu ?? '').trim();
  if (!b) return String(bestand ?? '');
  if (!a) return b;
  // Endet der Bestand mit einem Satzende, faengt der neue Teil einen neuen an.
  const trenner = /[.!?:]$/.test(a) ? ' ' : (/[,;-]$/.test(a) ? ' ' : ' ');
  return a + trenner + b;
}

/** Der vollstaendige Weg vom Roh-Erkannten zum fertigen Feldinhalt. */
export function uebernimm(bestand: unknown, erkannt: unknown): string {
  return verbinde(bestand, saeubere(wendeBefehleAn(erkannt)));
}

// ---------------------------------------------------------------------------
// Was tun, wenn die Erkennung aufhört?
// ---------------------------------------------------------------------------

export type EndeGrund = 'gewollt' | 'stille' | 'fehler' | 'zeit';

/**
 * Nach einer Sprechpause beendet der Browser die Erkennung von selbst. Solange
 * der Mensch nicht auf „Stopp" gedrueckt hat, wird neu gestartet — sonst
 * bricht die Aufnahme mitten im Satz ab und niemand merkt es.
 */
export function sollNeuStarten(
  grund: EndeGrund,
  gewolltBeendet: boolean,
  neustarts: number,
  sekunden: number,
): boolean {
  if (gewolltBeendet) return false;
  if (grund === 'gewollt' || grund === 'fehler' || grund === 'zeit') return false;
  if (neustarts >= MAX_NEUSTARTS) return false;
  if (sekunden >= MAX_SEKUNDEN) return false;
  return true;
}

/**
 * Fehlercodes der Browser-Spracherkennung in Klartext. „not-allowed" ist der
 * haeufigste und der einzige, den der Mensch selbst beheben kann — deshalb
 * steht dort, WO er es beheben kann.
 */
export function fehlerText(code: unknown): string {
  switch (String(code ?? '')) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Das Mikrofon ist gesperrt. Erlauben Sie den Zugriff in den Browser-Einstellungen '
        + '(Schloss-Symbol neben der Adresse) und versuchen Sie es erneut.';
    case 'no-speech':
      return 'Es war nichts zu hören. Sprechen Sie etwas näher ans Gerät.';
    case 'audio-capture':
      return 'Kein Mikrofon gefunden. Prüfen Sie, ob eines angeschlossen ist.';
    case 'network':
      return 'Die Spracherkennung braucht eine Internetverbindung. Tippen Sie den Text so lange ein.';
    case 'aborted':
      return 'Die Aufnahme wurde unterbrochen.';
    default:
      return 'Die Aufnahme hat nicht funktioniert. Tippen Sie den Text bitte ein.';
  }
}

/** Wird dieser Browser es koennen? Erwartet das window-Objekt (oder nichts). */
export function wirdUnterstuetzt(fenster: unknown): boolean {
  const w = fenster as Record<string, unknown> | null | undefined;
  if (!w) return false;
  return typeof w.SpeechRecognition === 'function' || typeof w.webkitSpeechRecognition === 'function';
}

/** Der Hinweis, wenn es der Browser nicht kann. Nie eine Sackgasse. */
export const KEIN_DIKTAT_HINWEIS =
  'Ihr Browser kann noch nicht zuhören (am besten klappt es mit Chrome). '
  + 'Tippen Sie den Text einfach ein — das Feld funktioniert genauso.';

// ---------------------------------------------------------------------------
// Anzeige
// ---------------------------------------------------------------------------

export function restSekunden(verbraucht: unknown): number {
  const v = Math.max(0, Math.floor(Number(verbraucht)) || 0);
  return Math.max(0, MAX_SEKUNDEN - v);
}

/** mm:ss — fuer die laufende Anzeige waehrend der Aufnahme. */
export function alsUhr(sekunden: unknown): string {
  const s = Math.max(0, Math.floor(Number(sekunden)) || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** Wortzahl — damit man sieht, dass etwas ankommt. */
export function woerter(text: unknown): number {
  const t = String(text ?? '').trim();
  return t ? t.split(/\s+/).length : 0;
}
