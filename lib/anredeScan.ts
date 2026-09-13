// ============================================================================
// ARGONAUT OS · lib/anredeScan.ts — findet Anrede-Stellen im eigenen Code
//
// Punkt 3.1, Paket 9. Der alte Scan (supabase-sql/_BEFUND-anrede.txt) hat in
// sechs von sechs Paketen danebengelegen. Nachgemessen am 13.09.:
//
//   · Von 26 gemeldeten „IMPERATIV?"-Zeilen war fast alles CODE — Funktions-
//     namen wie oeffne(), waehle(), speichere(), JSX-Attribute. Echter Text
//     war eine einzige Zeile.
//   · Das Wort „versuche" kam im ganzen Befund NICHT vor, obwohl
//     „Bitte versuche es später erneut." an fünf Stellen im Code stand.
//
// Daraus die drei Regeln dieser Datei:
//
//  1) NUR TEXT, NIE CODE. Gesucht wird ausschliesslich in Zeichenketten und
//     in JSX-Text. Kommentare und Bezeichner fallen weg — dort steht nichts,
//     was ein Kunde je liest. Das erledigt stellen().
//  2) IMPERATIVE ZÄHLEN MIT. Ein geduzter Satz braucht kein „du": „Gib die
//     Nummer ein", „Lade sie hoch", „Schau bei den markierten". Ohne diese
//     Liste bleibt die halbe Arbeit liegen.
//  3) ANWEISUNGEN AN DIE KI ZÄHLEN AUCH. app/api/ki-auge sagte dem Modell
//     „Sprich den Unternehmer direkt an ('du')" — im Code stand kein einziger
//     geduzter Satz, der entstand erst zur Laufzeit. Diese Klasse findet kein
//     Textscan der Welt, wenn er nur nach fertigen Sätzen sucht.
//
// Das Ergebnis ist eine ARBEITSLISTE, kein Urteil. Wer geduzt wird, entscheidet
// die Rolle der Seite, und die entscheidet am Ende ein Mensch.
//
// Reine Logik, keine Dateizugriffe — der Durchlauf liegt in
// scripts/anrede-scan.cjs.
// ============================================================================

export type Rolle = 'endkunde' | 'chef' | 'mitarbeiter' | 'betreiber' | 'unklar';
export type Art = 'duz' | 'imperativ' | 'anrede-anweisung';

export type Stelle = { zeile: number; text: string; herkunft: 'zeichenkette' | 'jsx' };
export type Fund = {
  pfad: string;
  zeile: number;
  art: Art;
  rolle: Rolle;
  treffer: string;
  text: string;
  kiPrompt: boolean;
};

// --------------------------------------------------------------------------
// 1. Text aus dem Code holen
// --------------------------------------------------------------------------

/**
 * Zerlegt eine Datei in ihre Textstellen: Inhalte von Zeichenketten und
 * JSX-Text. Kommentare und Code werden übersprungen.
 *
 * Bewusst ein Zeichen-Automat und kein Parser: er muss nichts verstehen,
 * nur zuverlässig wissen, ob er gerade in Text steht oder nicht. Ein Parser
 * wäre an der ersten ungewöhnlichen Datei stehengeblieben; dieser hier läuft
 * im Zweifel weiter und meldet eher zu viel als zu wenig.
 */
export function stellen(quelle: string): Stelle[] {
  const gefunden: Stelle[] = [];
  const s = String(quelle ?? '');
  let zeile = 1;
  let i = 0;

  // Sammelt Zeichen und merkt sich, wo der Text angefangen hat.
  let puffer = '';
  let pufferZeile = 1;
  function ablegen(herkunft: 'zeichenkette' | 'jsx') {
    const t = puffer.trim();
    if (t.length > 1) gefunden.push({ zeile: pufferZeile, text: t, herkunft });
    puffer = '';
  }

  while (i < s.length) {
    const c = s[i];
    const naechstes = s[i + 1];

    if (c === '\n') { zeile++; i++; continue; }

    // --- Kommentare überspringen ------------------------------------------
    if (c === '/' && naechstes === '/') {
      while (i < s.length && s[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && naechstes === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) { if (s[i] === '\n') zeile++; i++; }
      i += 2;
      continue;
    }

    // --- Zeichenketten ' " ` ----------------------------------------------
    if (c === "'" || c === '"' || c === '`') {
      const ende = c;
      pufferZeile = zeile;
      i++;
      while (i < s.length) {
        const z = s[i];
        if (z === '\\') { puffer += s[i + 1] ?? ''; i += 2; continue; }
        if (z === ende) { i++; break; }
        if (z === '\n') { zeile++; puffer += ' '; i++; continue; }
        // ${...} in Backticks ist Code, kein Text — überspringen, damit keine
        // Variablennamen als geduzte Wörter durchgehen.
        if (ende === '`' && z === '$' && s[i + 1] === '{') {
          let tiefe = 1; i += 2;
          while (i < s.length && tiefe > 0) {
            if (s[i] === '{') tiefe++;
            else if (s[i] === '}') tiefe--;
            else if (s[i] === '\n') zeile++;
            i++;
          }
          puffer += ' ';
          continue;
        }
        puffer += z;
        i++;
      }
      ablegen('zeichenkette');
      continue;
    }

    // --- JSX-Text: alles zwischen > und < ---------------------------------
    // Grober Griff, absichtlich. Ein Vergleich wie (a > b) landet hier zwar
    // auch, enthält aber keine Anrede und fliegt in der Prüfung wieder raus.
    if (c === '>') {
      // Das > einer Pfeilfunktion ist kein Tag-Ende. Ohne diese Zeile wird aus
      // `onClick={() => waehle(x)}>Weiter` der „Imperativ" waehle — genau der
      // Fehlalarm, an dem der alte Scan gescheitert ist.
      if (s[i - 1] === '=' || s[i - 1] === '-') { i++; continue; }
      pufferZeile = zeile;
      i++;
      let hatBuchstabe = false;
      while (i < s.length && s[i] !== '<') {
        if (s[i] === '\n') { zeile++; puffer += ' '; i++; continue; }
        // { } im JSX ist wieder Code.
        if (s[i] === '{') {
          let tiefe = 1; i++;
          while (i < s.length && tiefe > 0) {
            if (s[i] === '{') tiefe++;
            else if (s[i] === '}') tiefe--;
            else if (s[i] === '\n') zeile++;
            i++;
          }
          puffer += ' ';
          continue;
        }
        if (/[A-Za-zÄÖÜäöüß]/.test(s[i])) hatBuchstabe = true;
        puffer += s[i];
        i++;
      }
      // Reste von Code im Puffer heissen: wir haben nicht an einem Tag-Ende
      // begonnen. Dann ist das kein Text, den jemand liest.
      if (hatBuchstabe && !/[)(;={}]/.test(puffer)) ablegen('jsx'); else puffer = '';
      continue;
    }

    i++;
  }

  return gefunden;
}

// --------------------------------------------------------------------------
// 2. Was in einem Text eine Anrede ist
// --------------------------------------------------------------------------

/** Duz-Pronomen. Nur als ganze Wörter — „Dusche" und „dein Programm" trennt \b. */
const DUZ = /\b(du|dir|dich|dein|deine|deinem|deinen|deiner|deines|euch|euer|eure|eurem|euren|eurer|eures)\b/gi;

/**
 * Imperative, die in ARGONAUT tatsächlich vorkommen. Bewusst eine feste Liste
 * statt einer Grammatik-Regel: „Ende" ist kein Imperativ von „enden", „Trage"
 * kann ein Substantiv sein. Eine Liste, die man ansehen kann, ist ehrlicher
 * als eine Regel, der man glauben muss.
 */
const IMPERATIVE = [
  'versuche', 'versuch', 'wende dich', 'gib', 'lade', 'trage', 'leg', 'lege',
  'schau', 'schaue', 'beschreibe', 'füge', 'fuege', 'prüfe', 'pruefe',
  'klicke', 'öffne', 'oeffne', 'wähle', 'waehle', 'wähl', 'melde dich', 'nimm',
  'ruf', 'rufe', 'suche', 'sende', 'schreibe', 'kontaktiere', 'achte',
  'denk', 'denke', 'vergiss', 'merke', 'setze', 'starte', 'stelle',
  'tippe', 'drücke', 'druecke', 'scrolle', 'halte', 'nutze',
  'teile', 'speichere', 'lösche', 'loesche',
];

const IMPERATIV_RE = new RegExp(`\\b(${IMPERATIVE.join('|')})\\b`, 'gi');

/**
 * Was vor einem Imperativ stehen darf, ohne dass er aufhört, einer zu sein.
 *
 * Ohne diese Liste fiel ausgerechnet der häufigste Fall durch: „Bitte versuche
 * es später erneut." stand fünfmal im Code und wurde nicht gemeldet, weil vor
 * dem Verb ein Wort stand. Ein Imperativ beginnt eben selten nackt.
 */
const VORLAUF = /^(bitte|und|dann|jetzt|danach|außerdem|ausserdem|also|einfach|kurz|nun|zuerst|am besten|tipp|hinweis|so)(\s+(bitte|einfach|kurz|jetzt|dann|nun))*$/;

/**
 * Anweisungen an ein Sprachmodell, den Leser zu duzen.
 * Diese Klasse ist der Grund für diese Datei: im Code steht kein geduzter
 * Satz, der entsteht erst, wenn das Modell antwortet.
 */
const ANREDE_WORT = /\b(sprich|sprechen|rede|anrede|ansprache|duze|duzen|sieze|siezen|anreden|antworte|formuliere|schreibe|schreib)\b/i;

/**
 * Bewusst NICHT jedes „du": ein Prompt wie „Du bist ein Berater. Antworte kurz."
 * redet das MODELL an, nicht den Leser — das ist keine Anrede-Regel. Gemeint
 * sind nur die Stellen, an denen die Anrede selbst zum Thema gemacht wird.
 */
const ANREDE_DU = /(\bdu-?form\b|\bper du\b|['"„][Dd]u['"“”]|\bduz(e|en|t|end)\b)/i;

/** Ladeanzeigen und Verlaufsmeldungen sind keine Anrede — nicht zu ändern. */
const LADEANZEIGE = /^(lade|lädt|laedt|speichere|speichert|sende|sendet|prüfe|pruefe|erstelle|berechne|suche)\b[^.!?]{0,40}(…|\.\.\.)\s*$/i;

export function istLadeanzeige(text: string): boolean {
  return LADEANZEIGE.test(String(text ?? '').trim());
}

/** Alle Anrede-Treffer eines Textstücks, ohne Wertung. */
export function pruefeText(text: string): Array<{ art: Art; treffer: string }> {
  const t = String(text ?? '');
  const raus: Array<{ art: Art; treffer: string }> = [];
  if (!t.trim() || istLadeanzeige(t)) return raus;

  // Anweisung an die KI zur Anrede — zuerst, weil sie am schwersten wiegt.
  if (ANREDE_WORT.test(t) && ANREDE_DU.test(t)) {
    raus.push({ art: 'anrede-anweisung', treffer: t.trim().slice(0, 80) });
  }

  const gesehen = new Set<string>();
  for (const m of t.matchAll(DUZ)) {
    const w = m[0].toLowerCase();
    if (!gesehen.has(w)) { gesehen.add(w); raus.push({ art: 'duz', treffer: m[0] }); }
  }

  const klein = t.toLowerCase();
  IMPERATIV_RE.lastIndex = 0;
  let m2: RegExpExecArray | null;
  while ((m2 = IMPERATIV_RE.exec(klein)) !== null) {
    // Alles seit dem letzten Satzende darf nur aus Fuellwoertern bestehen.
    // „Bitte versuche …" zaehlt, „Ich lade die Datei hoch" nicht.
    const satz = klein.slice(0, m2.index).split(/[.!?:;•]/).pop() ?? '';
    const vorlauf = satz.replace(/[-—*"'`„“]/g, ' ').trim();
    if (vorlauf === '' || VORLAUF.test(vorlauf)) {
      raus.push({ art: 'imperativ', treffer: m2[0] });
      break;
    }
  }

  return raus;
}

// --------------------------------------------------------------------------
// 3. Wer liest das? — die Rolle entscheidet, was richtig ist
// --------------------------------------------------------------------------

/**
 * Zwei Ausnahmen sind hier fest eingetragen, weil sie schon einmal Arbeit
 * gekostet haben: app/dashboard/schichtplan und app/dashboard/bde sehen nach
 * Mitarbeiterseiten aus, sind aber CHEF-Seiten — Mitarbeiter werden dort
 * weitergeleitet. Der alte Befund führte beide falsch.
 */
const CHEF_TROTZ_MITARBEITER = ['/schichtplan', '/bde'];

const ENDKUNDE_PFADE = [
  'app/api/oeffentlich/', 'app/f/', 'app/lp/', 'app/portal/', 'app/bewerten/',
  'app/widerruf', 'app/api/newsletter/', 'app/api/autoresponder/',
];
const MITARBEITER_PFADE = [
  'app/dashboard/mein-bereich', 'app/dashboard/meine-einsaetze',
  'app/dashboard/meine-', 'app/mitarbeiter', 'app/dashboard/zeiterfassung',
];

/** Endet der Text in einer E-Mail oder einem PDF, verlässt er das Haus. */
function verlaesstDasHaus(pfad: string): boolean {
  const p = pfad.toLowerCase();
  return /-pdf\//.test(p) || /\/mail|mail\.|newsletter|versand|senden|erinnerung|mahnung/.test(p);
}

export function rolleFuer(pfad: string): Rolle {
  const p = String(pfad ?? '').replace(/\\/g, '/').toLowerCase();
  if (!p) return 'unklar';

  // Betreiber-Oberfläche: das ist Martins eigener Schreibtisch. Dort darf
  // geduzt bleiben — zuerst geprüft, damit nichts anderes sie überstimmt.
  if (p.includes('app/admin/') || p.includes('app/api/admin/')) return 'betreiber';

  if (ENDKUNDE_PFADE.some((x) => p.includes(x))) return 'endkunde';
  if (verlaesstDasHaus(p)) return 'endkunde';

  if (CHEF_TROTZ_MITARBEITER.some((x) => p.includes(x))) return 'chef';
  if (MITARBEITER_PFADE.some((x) => p.includes(x))) return 'mitarbeiter';

  if (p.includes('app/dashboard/') || p.startsWith('lib/') || p.includes('/lib/')) return 'chef';
  if (p.includes('app/api/')) return 'chef';
  return 'unklar';
}

/** Was an dieser Rolle zu tun ist — steht so im Befund und spart Rückfragen. */
export function aufgabeFuer(rolle: Rolle): string {
  switch (rolle) {
    case 'endkunde': return 'SIEZEN — verlässt das Haus';
    case 'chef': return 'SIEZEN — der Chef ist zahlender Kunde';
    case 'mitarbeiter': return 'ANREDEFREI — weder duzen noch siezen';
    case 'betreiber': return 'egal — Martins eigene Oberfläche';
    default: return 'ANSEHEN';
  }
}

// --------------------------------------------------------------------------
// 4. Prompt oder Anzeige?
// --------------------------------------------------------------------------

/**
 * Schätzt, ob eine Fundstelle Teil einer Anweisung an das Sprachmodell ist.
 * Prompts werden nicht umformuliert — ausser sie regeln die Anrede.
 * Bewusst eine Schätzung: sie sortiert vor, sie entscheidet nicht.
 */
export function istKiPrompt(quelle: string, zeile: number): boolean {
  const zeilen = String(quelle ?? '').split('\n');
  if (/^\s*["'`]?Du bist\b/i.test(zeilen[zeile - 1] ?? '')) return true;

  // Rueckwaerts suchen, aber NICHT blind ueber Blockgrenzen hinweg. Ohne den
  // Abbruch galt in einer Datei mit SYSTEM-Prompt oben auch jede Fehlermeldung
  // weiter unten als Prompt — und waere still aus der Arbeitsliste gefallen.
  const ENDE = /^\s*(export|function|return\s*[(<]|\}|const\s+\w+\s*=\s*(await|use|async))/;
  const PROMPT = /\b(SYSTEM|system\s*[:=]|prompt|messages\s*:|role\s*:\s*['"]system|anweisung)\b/i;

  // Die Fundzeile SELBST zuerst: `const system = \`Du bist …\`` traegt den
  // Marker in derselben Zeile, nicht darueber.
  if (PROMPT.test(zeilen[zeile - 1] ?? '')) return true;

  for (let n = zeile - 2; n >= 0 && n >= zeile - 26; n--) {
    const z = zeilen[n] ?? '';
    if (PROMPT.test(z)) return true;
    if (ENDE.test(z)) return false;
  }
  return false;
}

// --------------------------------------------------------------------------
// 5. Eine Datei bewerten
// --------------------------------------------------------------------------

export function bewerteDatei(pfad: string, quelle: string): Fund[] {
  const rolle = rolleFuer(pfad);
  const funde: Fund[] = [];
  for (const st of stellen(quelle)) {
    for (const tr of pruefeText(st.text)) {
      funde.push({
        pfad, zeile: st.zeile, art: tr.art, rolle, treffer: tr.treffer,
        text: st.text.length > 120 ? st.text.slice(0, 117) + '…' : st.text,
        kiPrompt: istKiPrompt(quelle, st.zeile),
      });
    }
  }
  return funde;
}

/**
 * Rangfolge fürs Abarbeiten. Eine Anrede-Anweisung an die KI steht ganz oben,
 * weil sie auf einen Schlag jede Ausgabe eines Bausteins betrifft.
 */
export function rang(f: Fund): number {
  if (f.art === 'anrede-anweisung') return 0;
  if (f.kiPrompt) return 5;               // sonstige Prompts: nicht anfassen
  if (f.rolle === 'betreiber') return 4;
  if (f.rolle === 'endkunde') return 1;
  if (f.rolle === 'chef') return 2;
  if (f.rolle === 'mitarbeiter') return 3;
  return 3;
}

export function sortiere(funde: Fund[]): Fund[] {
  return [...funde].sort((a, b) =>
    rang(a) - rang(b) || a.pfad.localeCompare(b.pfad) || a.zeile - b.zeile);
}
