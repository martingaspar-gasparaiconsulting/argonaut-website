// Paket PC (24.09.2026) — EIN Text-Motor: E-Book, Ratgeber (SEO), Presse, Strategie.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEXT_ARTEN, istTextArt, pruefeEingabe, promptGliederung, promptKapitel, promptEinzel,
  leseJson, leseGliederung, leseEinzeltext, saubererMarkdown, platzhalter, seoPruefung,
  pruefeText, ratgeberSlug, ratgeberBloecke, dokumentHtml, pdfName, modellFuer, maxTokensFuer,
  MIN_KAPITEL, MAX_KAPITEL,
} from '../out/textMotor.js';

const FIRMA = { name: 'Bad & Wärme Muster', branche: 'Sanitär', ort: 'Böblingen' };
const eingabe = (x = {}) => {
  const r = pruefeEingabe({ thema: 'Die häufigsten Fehler beim Badumbau', ...x });
  assert.equal(r.ok, true);
  return r.eingabe;
};

test('vier Arten, eindeutig', () => {
  assert.deepEqual(TEXT_ARTEN.map((a) => a.art), ['ebook', 'ratgeber', 'presse', 'strategie']);
  assert.equal(istTextArt('presse'), true);
  assert.equal(istTextArt('gedicht'), false);
});

test('Eingabe: Thema Pflicht, Kapitelzahl wird begrenzt', () => {
  assert.equal(pruefeEingabe({ thema: 'kurz' }).ok, false);
  assert.equal(eingabe({ kapitelZahl: 50 }).kapitelZahl, MAX_KAPITEL);
  assert.equal(eingabe({ kapitelZahl: 1 }).kapitelZahl, MIN_KAPITEL);
  assert.equal(eingabe({ kapitelZahl: 'abc' }).kapitelZahl, 6);
});

test('jeder Prompt verbietet erfundene Fakten und verlangt die Sie-Form', () => {
  const e = eingabe({ keyword: 'Badumbau Kosten' });
  const alle = [
    promptGliederung(e, FIRMA).system,
    promptKapitel(e, FIRMA, { titel: 'T', untertitel: 'U', kapitel: [{ titel: 'A', punkte: ['x'] }, { titel: 'B', punkte: [] }, { titel: 'C', punkte: [] }] }, 1).system,
    promptEinzel('ratgeber', e, FIRMA, '24.09.2026').system,
    promptEinzel('presse', e, FIRMA, '24.09.2026').system,
    promptEinzel('strategie', e, FIRMA, '24.09.2026').system,
  ];
  for (const s of alle) {
    assert.match(s, /Erfinden Sie KEINE Fakten/);
    assert.match(s, /„Sie"/);
    assert.match(s, /nicht, dass der Text von einer KI stammt/);
    assert.doesNotMatch(s, /KI-Agent/);
  }
});

test('Presse: Ortsmarke mit Datum, Zitat nur als Platzhalter', () => {
  const s = promptEinzel('presse', eingabe(), FIRMA, '24.09.2026').system;
  assert.match(s, /„Böblingen, 24\.09\.2026 — "/);
  assert.match(s, /\[Name, Funktion\]/);
  assert.match(s, /## Über Bad & Wärme Muster/);
});

test('Kapitel-Prompt nennt das richtige Kapitel und die Gesamtgliederung', () => {
  const g = { titel: 'Badumbau', untertitel: 'ohne Reue', kapitel: [{ titel: 'Planung', punkte: ['a'] }, { titel: 'Kosten', punkte: ['b', 'c'] }, { titel: 'Termin', punkte: [] }] };
  const p = promptKapitel(eingabe(), FIRMA, g, 1);
  assert.match(p.nutzer, /Schreiben Sie jetzt Kapitel 2: „Kosten"/);
  assert.match(p.nutzer, /1\. Planung\n2\. Kosten\n3\. Termin/);
});

test('JSON wird auch mit Zaun und Vorrede gelesen', () => {
  assert.deepEqual(leseJson('Gern!\n```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(leseJson('nichts'), null);
});

test('Gliederung: Nummern weg, zu wenige Kapitel = null', () => {
  const g = leseGliederung(JSON.stringify({
    titel: 'Badumbau ohne Reue', untertitel: 'Ein Ratgeber',
    kapitel: [{ titel: '1. Planung', punkte: ['a', 'b'] }, { titel: '2) Kosten', punkte: [] }, { titel: 'Handwerker finden', punkte: ['c'] }, { titel: '', punkte: [] }],
  }), 3);
  assert.deepEqual(g.kapitel.map((k) => k.titel), ['Planung', 'Kosten', 'Handwerker finden']);
  assert.equal(leseGliederung(JSON.stringify({ titel: 'X', kapitel: [{ titel: 'A' }, { titel: 'B' }] }), 3), null);
  assert.equal(leseGliederung('kaputt', 3), null);
});

test('Markdown wird von Zaun, Vorrede und H1 befreit', () => {
  assert.equal(saubererMarkdown('```markdown\n# Kapitel 1\n\nText hier.\n```'), 'Text hier.');
  assert.equal(saubererMarkdown('Hier ist das Kapitel:\n\n## Punkt\nText'), '## Punkt\nText');
});

test('Einzeltext: FAQ gefiltert, Unterzeile der Presse landet in beschreibung', () => {
  const e = leseEinzeltext(JSON.stringify({ titel: 'T', unterzeile: 'U', text: 'Absatz', faq: [{ frage: 'F?', antwort: 'A' }, { frage: '', antwort: 'x' }] }));
  assert.equal(e.beschreibung, 'U');
  assert.equal(e.faq.length, 1);
  assert.equal(leseEinzeltext(JSON.stringify({ titel: '', text: 'x' })), null);
});

test('Platzhalter werden gefunden und einmal gezaehlt', () => {
  assert.deepEqual(platzhalter('Seit [Jahr] … [Jahr] … [Name, Funktion]'), ['[Jahr]', '[Name, Funktion]']);
  const h = pruefeText('Wir bieten ab [Preis ab] Euro.');
  assert.match(h[0], /1 Platzhalter noch offen: \[Preis ab\]/);
});

test('pruefeText: Werbeversprechen, KI-Nennung, Duzen', () => {
  const h = pruefeText('Wir sind garantiert die Besten. Dein Bad wird schön. Geschrieben mit ChatGPT.');
  assert.equal(h.length, 3);
  assert.deepEqual(pruefeText('Ihr Bad wird schön. Rufen Sie uns an.'), []);
});

test('SEO-Pruefung rechnet selbst', () => {
  const absatz = 'Ein Badumbau braucht gute und ruhige Planung. '.repeat(25);
  const text = `Badumbau Kosten sind der Anfang. ${absatz}\n\n## Planung\n${absatz}\n\n## Kosten\n${absatz}\n\n## Ablauf\n${absatz}`;
  const e = { titel: 'Badumbau Kosten: womit Sie rechnen müssen', beschreibung: 'x'.repeat(140), text, faq: [{ frage: 'a', antwort: 'b' }, { frage: 'c', antwort: 'd' }, { frage: 'e', antwort: 'f' }] };
  const p = seoPruefung(e, 'Badumbau Kosten');
  assert.ok(p.every((x) => x.ok), JSON.stringify(p.filter((x) => !x.ok)));
  const schlecht = seoPruefung({ ...e, titel: 'Ein viel zu langer Titel, der bei Google abgeschnitten wird, weil er über sechzig Zeichen hat', beschreibung: 'kurz' }, 'Wärmepumpe');
  assert.ok(schlecht.filter((x) => !x.ok).length >= 4);
});

test('Schluesselwort-Stopfen wird erkannt', () => {
  const e = { titel: 'Dachrinne reinigen', beschreibung: '', text: 'Dachrinne reinigen Dachrinne reinigen Dachrinne reinigen. Mehr Text hier.', faq: [] };
  const p = seoPruefung(e, 'Dachrinne reinigen');
  assert.equal(p.find((x) => /Dichte/.test(x.text)).ok, false);
});

test('Ratgeber-Seite: Slug und Bausteine', () => {
  assert.equal(ratgeberSlug('Was kostet eine Wärmepumpe im Altbau?'), 'ratgeber-was-kostet-eine-waermepumpe-im-altbau');
  assert.equal(ratgeberSlug(''), 'ratgeber-artikel');
  assert.ok(ratgeberSlug('x'.repeat(200)).length <= 59);
  const b = ratgeberBloecke({ titel: 'T', beschreibung: '', text: 'Text', faq: [{ frage: 'F', antwort: 'A' }] });
  assert.deepEqual(b.map((x) => x.typ), ['artikel', 'faq', 'kontakt']);
  assert.deepEqual(ratgeberBloecke({ titel: 'T', beschreibung: '', text: 'Text', faq: [] }).map((x) => x.typ), ['artikel', 'kontakt']);
});

test('PDF-HTML maskiert alles, Farbe nur als echter Hex-Wert', () => {
  const h = dokumentHtml({ titel: '<script>x</script>', firma: 'A & B', farbe: 'red;} body{display:none', kapitel: [{ titel: 'K1', text: '## Zwischen\nText <b>fett</b>' }, { titel: 'K2', text: 'x' }] });
  assert.doesNotMatch(h, /<script>x/);
  assert.match(h, /&lt;script&gt;/);
  assert.match(h, /A &amp; B/);
  assert.match(h, /#C9A84C/);
  assert.doesNotMatch(h, /display:none/);
  assert.match(h, /<h3 class="kh">Zwischen<\/h3>/);
  assert.match(h, /Kapitel 2/);
  assert.match(h, /class="toc"/);
  const einzeln = dokumentHtml({ titel: 'T', firma: 'F', farbe: '#112233', kapitel: [{ titel: 'Nur einer', text: 'x' }] });
  assert.doesNotMatch(einzeln, /class="toc"/);
  assert.match(einzeln, /#112233/);
});

test('PDF-Dateiname ohne Umlaute und Sonderzeichen', () => {
  assert.equal(pdfName('Wärmepumpe: Kosten & Förderung 2026!'), 'Waermepumpe-Kosten-Foerderung-2026.pdf');
  assert.equal(pdfName(''), 'Dokument.pdf');
});

test('Modellwahl: Gliederung Haiku, lange Texte Sonnet 5 — nie Opus', () => {
  assert.equal(modellFuer('gliederung'), 'claude-haiku-4-5');
  assert.equal(modellFuer('kapitel'), 'claude-sonnet-5');
  assert.equal(modellFuer('einzel'), 'claude-sonnet-5');
  for (const s of ['gliederung', 'kapitel', 'einzel']) assert.doesNotMatch(modellFuer(s), /opus/);
  assert.equal(maxTokensFuer('einzel', 'presse'), 2000);
});

// --- Website-Baustein 'artikel' (lib/webBloecke) ---------------------------
import { blockHtml, BAUSTEIN_KATALOG } from '../out/webBloecke.js';

test('Baustein artikel: steht im Katalog, rendert H1 und maskiert fremdes HTML', () => {
  assert.ok(BAUSTEIN_KATALOG.some((k) => k.typ === 'artikel'));
  const h = blockHtml({ typ: 'artikel', eyebrow: 'Ratgeber', titel: 'Kosten <b>2026</b>', text: '## Planung\nText <script>alert(1)</script>\n\n- Punkt' }, {});
  assert.match(h, /<h1>Kosten &lt;b&gt;2026&lt;\/b&gt;<\/h1>/);
  assert.match(h, /<h3 class="kh">Planung<\/h3>/);
  assert.doesNotMatch(h, /<script>/);
  assert.match(h, /<li>Punkt<\/li>/);
});
