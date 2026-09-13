import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stellen, pruefeText, istLadeanzeige, rolleFuer, aufgabeFuer,
  istKiPrompt, bewerteDatei, rang, sortiere,
} from '../out/anredeScan.js';

// ============================================================================
// Punkt 3.1, Paket 9 — Tests für den eigenen Anrede-Scan.
//
// Die wichtigsten Tests hier sind die NEGATIVEN. Der alte Scan ist nicht
// daran gescheitert, dass er zu wenig fand, sondern daran, dass er 148
// Stellen meldete, von denen fast alle Code waren — und die Handvoll echter
// Stellen ging darin unter. Eine Liste, der man nicht trauen kann, kostet
// mehr Zeit als gar keine.
// ============================================================================

const treffer = (t) => pruefeText(t).map((x) => x.art);

// ------------------------------------------------- stellen(): Text vs. Code

test('Code ist kein Text — Funktionsnamen fallen weg', () => {
  // Genau das hat der alte Scan als „IMPERATIV?" gemeldet.
  const quelle = `<button onClick={() => oeffne(z)}>Mehr</button>`;
  const texte = stellen(quelle).map((s) => s.text);
  assert.equal(texte.includes('oeffne'), false);
  assert.equal(texte.some((t) => t.includes('Mehr')), true, 'der sichtbare Text bleibt');
});

test('Zeilenkommentare werden übersprungen', () => {
  const quelle = `// du kannst hier deine Notiz eintragen\nconst x = 1;`;
  assert.deepEqual(stellen(quelle), []);
});

test('Blockkommentare werden übersprungen, die Zeilenzählung stimmt danach noch', () => {
  const quelle = `/*\n dein Kommentar\n über drei Zeilen\n*/\nconst t = 'Deine Tour';`;
  const s = stellen(quelle);
  assert.equal(s.length, 1);
  assert.equal(s[0].text, 'Deine Tour');
  assert.equal(s[0].zeile, 5, 'die Zeilennummer muss nach dem Kommentar stimmen');
});

test('ein Bezeichner namens du ist kein Text', () => {
  // In app/vorschau/_lib/dossierHtml.ts gibt es ein Feld `du:` — das ist ein
  // Feldname und wird nie angezeigt.
  assert.deepEqual(stellen(`const o = { du: 'Sie tun nur noch' };`).map((x) => x.text), ['Sie tun nur noch']);
});

test('Platzhalter in Backticks sind Code, nicht Text', () => {
  const s = stellen('const m = `Hallo ${deinName}, hier ist alles fertig.`;');
  assert.equal(s.length, 1);
  assert.equal(s[0].text.includes('deinName'), false, 'der Variablenname darf nicht als Anrede zählen');
  assert.equal(s[0].text.includes('Hallo'), true);
});

test('JSX-Text wird erfasst, JSX-Ausdrücke nicht', () => {
  const s = stellen('<p>Deine Tour startet {zeit} Uhr</p>');
  assert.equal(s.some((x) => x.text.includes('Deine Tour startet')), true);
  assert.equal(s.some((x) => x.text.includes('zeit')), false);
});

test('mehrzeilige Zeichenketten verschieben die Zeilennummer nicht', () => {
  const quelle = "const a = 'eins';\nconst b = `zwei\ndrei`;\nconst c = 'Bitte versuche es erneut.';";
  const c = stellen(quelle).find((s) => s.text.startsWith('Bitte versuche'));
  assert.equal(c.zeile, 4);
});

test('maskierte Anführungszeichen beenden die Zeichenkette nicht', () => {
  const s = stellen(`const t = 'Er sagte \\'Deine Sache\\' und ging.';`);
  assert.equal(s.length, 1);
  assert.equal(s[0].text.includes('Deine Sache'), true);
});

// ------------------------------------------------------ pruefeText(): Duzen

test('Duz-Pronomen werden gefunden', () => {
  assert.equal(treffer('Du hast diesen Plan bestätigt').includes('duz'), true);
  assert.equal(treffer('Bitte wende dich an deinen Vorgesetzten').includes('duz'), true);
  assert.equal(treffer('Wir haben euer Angebot erhalten').includes('duz'), true);
});

test('Wörter, die nur zufällig so anfangen, zählen nicht', () => {
  assert.deepEqual(treffer('Die Dusche ist defekt'), []);
  assert.deepEqual(treffer('Duplikate zusammenführen'), []);
  assert.deepEqual(treffer('Eurer Firma'), ['duz'], 'echtes Pronomen zählt aber schon');
});

test('gesiezter Text ist sauber', () => {
  assert.deepEqual(treffer('Bitte versuchen Sie es später erneut.'), []);
  assert.deepEqual(treffer('Sie wurden vom Newsletter abgemeldet.'), []);
});

test('anredefreier Text ist sauber', () => {
  assert.deepEqual(treffer('Plan bestätigt'), []);
  assert.deepEqual(treffer('Bitte an den Vorgesetzten wenden'), []);
  assert.deepEqual(treffer('Bitte erneut versuchen.'), [], 'Infinitiv ist kein Imperativ');
});

// ------------------------------------------------- pruefeText(): Imperative

test('der Imperativ ohne Duz-Wort wird gefunden — die Lücke des alten Scans', () => {
  assert.equal(treffer('Bitte versuche es später erneut.').includes('imperativ'), true);
  assert.equal(treffer('Gib die Rechnungsnummer ein.').includes('imperativ'), true);
  assert.equal(treffer('Schau bei den markierten Posten nach.').includes('imperativ'), true);
  assert.equal(treffer('Lade sie hoch.').includes('imperativ'), true);
});

test('dasselbe Wort mitten im Satz ist kein Imperativ', () => {
  assert.deepEqual(treffer('Ich lade die Datei hoch'), [], 'lade als Verb in der 1. Person');
  assert.deepEqual(treffer('Der Kunde nutze das Portal selten'), []);
});

test('Ladeanzeigen sind keine Anrede', () => {
  assert.equal(istLadeanzeige('Lade Projekte…'), true);
  assert.equal(istLadeanzeige('Speichere …'), true);
  assert.equal(istLadeanzeige('Lade sie hoch.'), false, 'das ist eine Aufforderung');
  assert.deepEqual(treffer('Lade Projekte…'), []);
});

// --------------------------------------- pruefeText(): Anweisung an die KI

test('eine Anrede-Anweisung an das Modell wird erkannt', () => {
  // Der Fund vom 13.09. in app/api/ki-auge/route.ts.
  const t = "- Sprich den Unternehmer direkt an ('du'), sachlich, ohne Floskeln.";
  assert.equal(treffer(t).includes('anrede-anweisung'), true);
});

test('weitere Formulierungen derselben Anweisung', () => {
  assert.equal(treffer('Duze den Leser.').includes('anrede-anweisung'), true);
  assert.equal(treffer('Antworte in der Du-Form.').includes('anrede-anweisung'), true);
  assert.equal(treffer('Sprich den Kunden per du an.').includes('anrede-anweisung'), true);
});

test('die richtige Anweisung schlägt nicht an', () => {
  // So macht es app/api/analyse-ki — das ist der Sollzustand.
  assert.deepEqual(treffer('Sprache: Deutsch, Sie-Ansprache, konkret und ehrlich.'), []);
});

test('ein gewöhnlicher KI-Prompt ohne Anrede-Regel ist keine Anweisung zur Anrede', () => {
  const arten = treffer('Du bist ein freundlicher Verkaufsberater im Onlineshop.');
  assert.equal(arten.includes('anrede-anweisung'), false);
  assert.equal(arten.includes('duz'), true, 'als Duz-Stelle wird er trotzdem gemeldet');
});

// ----------------------------------------------------------- rolleFuer()

test('öffentliche Routen gehören dem Endkunden', () => {
  assert.equal(rolleFuer('app/api/oeffentlich/optin-bestaetigen/route.ts'), 'endkunde');
  assert.equal(rolleFuer('app/f/[key]/page.tsx'), 'endkunde');
  assert.equal(rolleFuer('app/api/newsletter/abmelden/route.ts'), 'endkunde');
});

test('was als PDF oder E-Mail rausgeht, gilt als Endkunde', () => {
  assert.equal(rolleFuer('app/api/rechnung-pdf/route.ts'), 'endkunde');
  assert.equal(rolleFuer('lib/newsletter.ts'), 'endkunde');
  assert.equal(rolleFuer('app/api/termin-erinnerung/route.ts'), 'endkunde');
});

test('die Betreiber-Oberfläche schlägt alles andere', () => {
  assert.equal(rolleFuer('app/admin/command-center/page.tsx'), 'betreiber');
  assert.equal(rolleFuer('app/api/admin/tenants/route.ts'), 'betreiber');
  assert.equal(aufgabeFuer(rolleFuer('app/admin/anfragen/page.tsx')).includes('egal'), true);
});

test('schichtplan und bde sind CHEF-Seiten, keine Mitarbeiterseiten', () => {
  // Der alte Befund führte beide unter ANREDEFREI — Mitarbeiter werden dort
  // weitergeleitet. Diese Verwechslung darf nicht wiederkommen.
  assert.equal(rolleFuer('app/dashboard/schichtplan/page.tsx'), 'chef');
  assert.equal(rolleFuer('app/dashboard/bde/page.tsx'), 'chef');
});

test('der Mitarbeiterbereich ist anredefrei', () => {
  assert.equal(rolleFuer('app/dashboard/mein-bereich/page.tsx'), 'mitarbeiter');
  assert.equal(rolleFuer('app/dashboard/meine-einsaetze/page.tsx'), 'mitarbeiter');
  assert.equal(aufgabeFuer('mitarbeiter').includes('ANREDEFREI'), true);
});

test('der Rest des Dashboards gehört dem Chef', () => {
  assert.equal(rolleFuer('app/dashboard/finanzen/kennzahlen/page.tsx'), 'chef');
  assert.equal(rolleFuer('lib/segmente.ts'), 'chef');
});

test('Windows-Pfade mit Backslash werden genauso eingeordnet', () => {
  assert.equal(rolleFuer('app\\admin\\anfragen\\page.tsx'), 'betreiber');
  assert.equal(rolleFuer('app\\dashboard\\schichtplan\\page.tsx'), 'chef');
});

// ---------------------------------------------------------- istKiPrompt()

test('eine Zeile im Umfeld eines System-Prompts wird als Prompt erkannt', () => {
  const quelle = ["const SYSTEM = [", "  'Du bist ein Berater.',", "  'Antworte kurz.',", "].join('');"].join('\n');
  assert.equal(istKiPrompt(quelle, 2), true);
});

test('eine Fehlermeldung weit weg von jedem Prompt ist keiner', () => {
  const quelle = new Array(40).fill('const x = 1;').join('\n') + "\nreturn seite('Bitte versuche es erneut.');";
  assert.equal(istKiPrompt(quelle, 41), false);
});

// -------------------------------------------------- bewerteDatei() + Rang

test('eine echte Fundstelle trägt Pfad, Zeile, Rolle und Aufgabe', () => {
  const quelle = "export function x() {\n  return seite('Bitte versuche es später erneut.');\n}";
  const funde = bewerteDatei('app/api/oeffentlich/optin-bestaetigen/route.ts', quelle);
  assert.equal(funde.length, 1);
  assert.equal(funde[0].art, 'imperativ');
  assert.equal(funde[0].rolle, 'endkunde');
  assert.equal(funde[0].zeile, 2);
  assert.equal(funde[0].kiPrompt, false);
});

test('eine saubere Datei ergibt keine Funde', () => {
  const quelle = "// Kommentar mit du und dein\nconst t = 'Bitte versuchen Sie es später erneut.';\n<button onClick={() => waehle(x)}>Weiter</button>";
  assert.deepEqual(bewerteDatei('app/dashboard/crm/page.tsx', quelle), []);
});

test('die Anrede-Anweisung steht in der Rangfolge ganz oben', () => {
  const anweisung = { art: 'anrede-anweisung', rolle: 'chef', kiPrompt: true };
  const endkunde = { art: 'duz', rolle: 'endkunde', kiPrompt: false };
  const betreiber = { art: 'duz', rolle: 'betreiber', kiPrompt: false };
  assert.equal(rang(anweisung) < rang(endkunde), true);
  assert.equal(rang(endkunde) < rang(betreiber), true);
});

test('sortiere() ändert die Eingabe nicht', () => {
  const ein = [
    { pfad: 'b.ts', zeile: 1, art: 'duz', rolle: 'betreiber', kiPrompt: false },
    { pfad: 'a.ts', zeile: 9, art: 'anrede-anweisung', rolle: 'chef', kiPrompt: true },
  ];
  const raus = sortiere(ein);
  assert.equal(raus[0].pfad, 'a.ts');
  assert.equal(ein[0].pfad, 'b.ts', 'das Original bleibt unangetastet');
});

// ------------------------------------------- Gesamtprobe an echtem Muster

test('Gesamtprobe: die fünf Stellen vom 13.09. würden alle gefunden', () => {
  const faelle = [
    ["app/api/autoresponder/abmelden/route.ts", "const a = 'Es gab ein technisches Problem. Bitte versuche es später erneut.';"],
    ["app/api/ki-auge/route.ts", `const p = "- Sprich den Unternehmer direkt an ('du'), sachlich, ohne Floskeln.";`],
    ["app/api/analyse-ki/route.ts", "const e = 'Teile den Link zu deiner Seite aktiv.';"],
    ["app/dashboard/mein-bereich/page.tsx", "const t = 'Du hast diesen Plan bestätigt';"],
    ["app/dashboard/crm/page.tsx", "const h = 'Schau bei den markierten Posten nach.';"],
  ];
  for (const [pfad, quelle] of faelle) {
    assert.equal(bewerteDatei(pfad, quelle).length > 0, true, `nicht gefunden: ${pfad}`);
  }
});

test('ein SYSTEM-Prompt oben in der Datei macht nicht alles darunter zum Prompt', () => {
  // Gefunden beim Gegentest des Scanners: eine Datei mit SYSTEM-Konstante in
  // Zeile 1 liess auch die Fehlermeldung in Zeile 6 als Prompt gelten — die
  // Stelle waere still aus der Arbeitsliste gefallen.
  const quelle = [
    `const SYSTEM = "Du bist ein Berater.";`,
    `export default function Seite() {`,
    `  return <div>`,
    `    <p>Schau bei den markierten Posten nach.</p>`,
    `  </div>;`,
    `}`,
  ].join('\n');
  assert.equal(istKiPrompt(quelle, 4), false);
  const funde = bewerteDatei('app/dashboard/probe/page.tsx', quelle);
  const echt = funde.filter((f) => !f.kiPrompt && f.art === 'imperativ');
  assert.equal(echt.length, 1, 'der Imperativ muss in der Arbeitsliste landen');
  assert.equal(echt[0].rolle, 'chef');
});

test('ein Prompt, dessen Marker in derselben Zeile steht, wird erkannt', () => {
  // `const system = ` + Prompt in einer Zeile — kommt in app/api/oeffentlich/
  // branchen-chat und /chat so vor.
  const quelle = 'const system = `Du bist ein freundlicher KI-Berater fuer die Branche.`;';
  assert.equal(istKiPrompt(quelle, 1), true);
  assert.equal(bewerteDatei('app/api/oeffentlich/branchen-chat/route.ts', quelle).every((f) => f.kiPrompt), true);
});
