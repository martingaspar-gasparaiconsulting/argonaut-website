import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_SEKUNDEN, MAX_NEUSTARTS, KEIN_DIKTAT_HINWEIS,
  wendeBefehleAn, saeubere, verbinde, uebernimm,
  sollNeuStarten, fehlerText, wirdUnterstuetzt,
  restSekunden, alsUhr, woerter,
} from '../out/diktat.js';

// ---------- Sprechbefehle ----------

test('Satzzeichen kleben am Wort davor', () => {
  assert.equal(wendeBefehleAn('Heizung geprüft Punkt'), 'Heizung geprüft.');
  assert.equal(wendeBefehleAn('Ventil undicht Komma Dichtung getauscht Punkt'),
    'Ventil undicht, Dichtung getauscht.');
});

test('Befehle greifen nur als eigenes Wort — nicht mitten im Wort', () => {
  assert.equal(wendeBefehleAn('Rohrbruch am Knotenpunkt'), 'Rohrbruch am Knotenpunkt');
  assert.equal(wendeBefehleAn('Kommastelle geprüft'), 'Kommastelle geprüft');
  assert.equal(wendeBefehleAn('Der Absatzplan liegt vor'), 'Der Absatzplan liegt vor');
});

test('Absatz und Aufzählung erzeugen echte Zeilenumbrüche', () => {
  assert.match(wendeBefehleAn('Erledigt neuer Absatz Weiter geht es'), /\n/);
  assert.match(wendeBefehleAn('Material Aufzählung Dichtung'), /\n- /);
});

test('Groß- und Kleinschreibung der Befehle ist egal', () => {
  assert.equal(wendeBefehleAn('fertig PUNKT'), 'fertig.');
  assert.equal(wendeBefehleAn('fertig Punkt'), 'fertig.');
});

// ---------- Aufräumen ----------

test('saeubere räumt Leerzeichen um Satzzeichen auf', () => {
  assert.equal(saeubere('Heizung geprüft . Alles dicht .'), 'Heizung geprüft. Alles dicht.');
  assert.equal(saeubere('a  b   c'), 'A b c');
});

test('saeubere schreibt Satzanfänge groß — und NUR die', () => {
  assert.equal(saeubere('ventil getauscht. alles dicht.'), 'Ventil getauscht. Alles dicht.');
  assert.equal(saeubere('erste zeile\nzweite zeile'), 'Erste zeile\nZweite zeile');
  // Nach einem Komma geht der Satz weiter — da wird nichts großgeschrieben.
  assert.equal(saeubere('ventil undicht, dichtung getauscht.'), 'Ventil undicht, dichtung getauscht.');
});

test('saeubere lässt Zahlen in Ruhe — 3.5 bleibt 3.5', () => {
  assert.equal(saeubere('Menge 3.5 Meter'), 'Menge 3.5 Meter');
});

test('saeubere formuliert nichts um', () => {
  const roh = 'Kunde war nicht da, Zettel hinterlassen.';
  assert.equal(saeubere(roh), roh);
});

test('saeubere ist robust gegen Unsinn', () => {
  assert.equal(saeubere(null), '');
  assert.equal(saeubere(''), '');
  assert.equal(saeubere('   '), '');
});

// ---------- Verbinden ----------

test('verbinde überschreibt getippten Text NIE', () => {
  assert.equal(verbinde('Schon getippt.', 'Und diktiert'), 'Schon getippt. Und diktiert');
  assert.equal(verbinde('', 'Nur diktiert'), 'Nur diktiert');
  assert.equal(verbinde('Nur getippt', ''), 'Nur getippt');
  assert.equal(verbinde('Nur getippt', '   '), 'Nur getippt');
});

test('verbinde hängt kein Leerzeichen an, wenn nichts kommt', () => {
  assert.equal(verbinde('Text', null), 'Text');
  assert.equal(verbinde(null, null), '');
});

test('uebernimm macht den ganzen Weg in einem Schritt', () => {
  const raus = uebernimm('Vorgefunden:', 'ventil undicht Komma dichtung getauscht Punkt');
  assert.equal(raus, 'Vorgefunden: Ventil undicht, dichtung getauscht.');
});

test('uebernimm korrigiert bewusst KEINE Rechtschreibung', () => {
  // Nur Form, nie Inhalt: Wer diktiert hat, soll seinen Text wiedererkennen.
  assert.equal(uebernimm('', 'der kunde war nicht da Punkt'), 'Der kunde war nicht da.');
});

// ---------- Neustart nach Sprechpause ----------

test('nach einer Sprechpause wird weitergehört — der Kern von D4', () => {
  assert.equal(sollNeuStarten('stille', false, 0, 10), true);
  assert.equal(sollNeuStarten('stille', false, 5, 120), true);
});

test('wer auf Stopp drückt, wird nicht überstimmt', () => {
  assert.equal(sollNeuStarten('stille', true, 0, 10), false);
  assert.equal(sollNeuStarten('gewollt', false, 0, 10), false);
});

test('bei einem echten Fehler wird nicht endlos neu gestartet', () => {
  assert.equal(sollNeuStarten('fehler', false, 0, 10), false);
});

test('die Grenzen halten — Zeit und Anzahl', () => {
  assert.equal(sollNeuStarten('stille', false, MAX_NEUSTARTS, 10), false);
  assert.equal(sollNeuStarten('stille', false, 0, MAX_SEKUNDEN), false);
  assert.equal(sollNeuStarten('zeit', false, 0, 10), false);
  assert.equal(MAX_SEKUNDEN, 600);
});

// ---------- Fehlertexte ----------

test('der häufigste Fehler sagt, wo man ihn behebt', () => {
  const t = fehlerText('not-allowed');
  assert.match(t, /Mikrofon/);
  assert.match(t, /Schloss/);
});

test('jeder Fehlertext ist deutsch, siezt und endet nie in einer Sackgasse', () => {
  for (const code of ['not-allowed', 'no-speech', 'audio-capture', 'network', 'aborted', 'irgendwas', null]) {
    const t = fehlerText(code);
    assert.ok(t.length > 10, `zu kurz für ${code}`);
    assert.ok(!/\bdu\b|\bdir\b|\bdein/i.test(t), `duzt bei ${code}`);
    assert.ok(!/fuer|ueber|koennen|muessen/.test(t), `Ersatzschreibung bei ${code}`);
  }
});

test('der Hinweis ohne Diktat bietet immer den Tipp-Weg an', () => {
  assert.match(KEIN_DIKTAT_HINWEIS, /[Tt]ippen/);
  assert.ok(!/\bdu\b|\bdein/i.test(KEIN_DIKTAT_HINWEIS));
});

// ---------- Unterstützung ----------

test('wirdUnterstuetzt erkennt beide Schreibweisen', () => {
  assert.equal(wirdUnterstuetzt({ SpeechRecognition: () => {} }), true);
  assert.equal(wirdUnterstuetzt({ webkitSpeechRecognition: () => {} }), true);
  assert.equal(wirdUnterstuetzt({}), false);
  assert.equal(wirdUnterstuetzt(null), false);
  assert.equal(wirdUnterstuetzt(undefined), false);
  // Ein Feld, das nur zufällig so heißt, aber keine Funktion ist, zählt nicht.
  assert.equal(wirdUnterstuetzt({ SpeechRecognition: 'ja' }), false);
});

// ---------- Anzeige ----------

test('restSekunden zählt herunter und wird nie negativ', () => {
  assert.equal(restSekunden(0), MAX_SEKUNDEN);
  assert.equal(restSekunden(60), MAX_SEKUNDEN - 60);
  assert.equal(restSekunden(99999), 0);
  assert.equal(restSekunden(null), MAX_SEKUNDEN);
});

test('alsUhr zeigt mm:ss mit führender Null', () => {
  assert.equal(alsUhr(0), '0:00');
  assert.equal(alsUhr(9), '0:09');
  assert.equal(alsUhr(65), '1:05');
  assert.equal(alsUhr(600), '10:00');
  assert.equal(alsUhr(-5), '0:00');
});

test('woerter zählt, was ankommt', () => {
  assert.equal(woerter('Heizung geprüft, alles dicht'), 4);
  assert.equal(woerter('   '), 0);
  assert.equal(woerter(null), 0);
});
