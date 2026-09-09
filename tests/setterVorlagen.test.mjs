// ============================================================================
// ARGONAUT OS · tests/setterVorlagen.test.mjs
//
// Die Vorlagen bestimmen, was ein Bot im Namen eines Betriebs fragt. Drei
// Dinge müssen deshalb stimmen:
//
//   · Jede Vorlage ist für sich lauffähig — sonst steht ein Kunde mit einem
//     Bot da, der nie fertig wird.
//   · Die Prüfung lässt nichts durch, was das Gedächtnis zerlegt.
//   · Die Warnung schlägt bei Gesundheits- und Zahlungsdaten an.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import { istVollstaendig, naechsteFrage, baueMarke, leseErfasst } from '../out/setter.js';
import {
  VORLAGEN,
  vorlage,
  normalisiereFragen,
  pruefeFragen,
  heikleFragen,
  MAX_FRAGEN,
  GESPERRTE_SCHLUESSEL,
} from '../out/setterVorlagen.js';

// --- 1) Jede Vorlage ist in sich stimmig ------------------------------------

test('jede Vorlage besteht ihre eigene Prüfung', () => {
  for (const v of VORLAGEN) {
    assert.deepEqual(pruefeFragen(v.fragen), [], `Vorlage ${v.schluessel} ist fehlerhaft`);
  }
});

test('jede Vorlage lässt sich zu Ende führen', () => {
  for (const v of VORLAGEN) {
    const erfasst = {};
    let runden = 0;
    let offen;
    while ((offen = naechsteFrage(v.fragen, erfasst)) && runden < 50) {
      erfasst[offen.schluessel] = 'Antwort';
      runden++;
    }
    assert.equal(offen, null, `Vorlage ${v.schluessel} kommt nie zum Ende`);
    assert.equal(istVollstaendig(v.fragen, erfasst), true);
    assert.ok(runden <= MAX_FRAGEN, `Vorlage ${v.schluessel} braucht zu viele Runden`);
  }
});

test('jede Vorlage fragt nach einem Weg zurück', () => {
  for (const v of VORLAGEN) {
    const schluessel = v.fragen.map((f) => f.schluessel);
    assert.ok(
      schluessel.includes('kontakt') || schluessel.includes('email') || schluessel.includes('telefon'),
      `Vorlage ${v.schluessel} sammelt Angaben, aber niemand kann zurückrufen`,
    );
    assert.ok(schluessel.includes('name'), `Vorlage ${v.schluessel} fragt nie nach dem Namen`);
  }
});

test('jede Vorlage siezt', () => {
  for (const v of VORLAGEN) {
    for (const f of v.fragen) {
      assert.ok(!/\bdu\b|\bdein|\bdir\b|\bdich\b/i.test(f.frage), `duzt in ${v.schluessel}: ${f.frage}`);
    }
  }
});

test('die Schlüssel überleben die Markierung unbeschadet', () => {
  for (const v of VORLAGEN) {
    const erfasst = Object.fromEntries(v.fragen.map((f) => [f.schluessel, 'Wert ' + f.schluessel]));
    const zurueck = leseErfasst([{ role: 'assistant', text: baueMarke(erfasst) }]);
    assert.deepEqual(zurueck, erfasst, `Vorlage ${v.schluessel} verliert Angaben beim Merken`);
  }
});

test('keine Vorlage fragt nach heiklen Daten', () => {
  for (const v of VORLAGEN) {
    assert.deepEqual(heikleFragen(v.fragen), [], `Vorlage ${v.schluessel} fragt etwas Heikles ab`);
  }
});

test('die Praxis-Vorlage fragt bewusst NICHT nach Beschwerden', () => {
  const p = vorlage('praxis');
  const alles = p.fragen.map((f) => f.frage).join(' ').toLowerCase();
  for (const wort of ['symptom', 'beschwerde', 'schmerz', 'diagnose', 'krankenkasse', 'versicher']) {
    assert.ok(!alles.includes(wort), `Praxis-Vorlage fragt nach „${wort}" — das ist Art. 9 DSGVO`);
  }
});

test('die Schlüssel der Vorlagen sind eindeutig', () => {
  const s = VORLAGEN.map((v) => v.schluessel);
  assert.equal(new Set(s).size, s.length);
});

test('vorlage() findet und findet nicht', () => {
  assert.equal(vorlage('handwerk')?.name, 'Handwerk vor Ort');
  assert.equal(vorlage('HANDWERK')?.schluessel, 'handwerk');
  assert.equal(vorlage('  kfz  ')?.schluessel, 'kfz');
  assert.equal(vorlage('gibtsnicht'), null);
  assert.equal(vorlage(''), null);
  assert.equal(vorlage(null), null);
});

// --- 2) Die Prüfung lässt nichts durch --------------------------------------

test('ohne Frage geht nichts', () => {
  assert.deepEqual(pruefeFragen([]), ['Mindestens eine Frage wird gebraucht.']);
  assert.equal(pruefeFragen(null).length, 1);
});

test('ohne Pflichtfrage wäre das Gespräch sofort fertig', () => {
  const f = pruefeFragen([{ schluessel: 'a', frage: 'Und?' }]);
  assert.ok(f.some((x) => /Pflichtfrage/.test(x)));
});

test('ein Schlüssel, der die Markierung sprengen würde, wird abgewiesen', () => {
  for (const boese of ['a;b', 'a=b', 'a]]b', 'a b', 'Ä', '1abc', '_lead', '', 'A_GROSS', 'a-b', 'a.b']) {
    const f = pruefeFragen([{ schluessel: boese, frage: 'Frage?', pflicht: true }]);
    assert.ok(f.length > 0, `Schlüssel „${boese}" haette abgewiesen werden muessen`);
  }
});

test('Grossbuchstaben sind kein Fehler — sie werden vorher glattgezogen', () => {
  const roh = [{ schluessel: '  Anliegen ', frage: '  Worum geht es?  ', pflicht: 'ja' }];
  const sauber = normalisiereFragen(roh);
  assert.deepEqual(sauber, [{ schluessel: 'anliegen', frage: 'Worum geht es?', pflicht: false }],
    'pflicht darf nur bei echtem true true sein');
  assert.ok(pruefeFragen(roh).length > 0, 'ungeputzt muss die Pruefung anschlagen');
  assert.deepEqual(pruefeFragen([{ ...sauber[0], pflicht: true }]), [], 'geputzt muss sie durchgehen');
});

test('normalisieren macht aus Unsinn keine gueltige Frage', () => {
  assert.deepEqual(normalisiereFragen(null), []);
  assert.deepEqual(normalisiereFragen([{}]), [{ schluessel: '', frage: '', pflicht: false }]);
  assert.ok(pruefeFragen(normalisiereFragen([{}])).length > 0);
});

test('jeder gesperrte Schlüssel ist wirklich gesperrt', () => {
  for (const s of GESPERRTE_SCHLUESSEL) {
    const f = pruefeFragen([{ schluessel: s, frage: 'Frage?', pflicht: true }]);
    assert.ok(f.some((x) => /reserviert/.test(x)), `${s} ist nicht gesperrt`);
  }
});

test('derselbe Schlüssel zweimal überschriebe die erste Antwort', () => {
  const f = pruefeFragen([
    { schluessel: 'name', frage: 'Ihr Name?', pflicht: true },
    { schluessel: 'name', frage: 'Und der Nachname?' },
  ]);
  assert.ok(f.some((x) => /gibt es schon/.test(x)));
});

test('leerer oder zu langer Fragetext wird abgewiesen', () => {
  assert.ok(pruefeFragen([{ schluessel: 'a', frage: '   ', pflicht: true }]).some((x) => /Fragetext fehlt/.test(x)));
  assert.ok(pruefeFragen([{ schluessel: 'a', frage: 'x'.repeat(201), pflicht: true }]).some((x) => /zu lang/.test(x)));
});

test('zu viele Fragen sind ein Verhör', () => {
  const viele = [];
  for (let i = 0; i < MAX_FRAGEN + 1; i++) viele.push({ schluessel: 'f' + i, frage: 'Frage?', pflicht: i === 0 });
  assert.ok(pruefeFragen(viele).some((x) => /Verhör/.test(x)));
});

test('eine saubere Liste ergibt keine Fehler', () => {
  assert.deepEqual(pruefeFragen([
    { schluessel: 'anliegen', frage: 'Worum geht es?', pflicht: true },
    { schluessel: 'wunsch_termin', frage: 'Wann passt es?' },
  ]), []);
});

// --- 3) Die Warnung ---------------------------------------------------------

test('Gesundheitsdaten werden gemeldet', () => {
  const w = heikleFragen([{ schluessel: 'beschwerden', frage: 'Welche Beschwerden haben Sie?', pflicht: true }]);
  assert.equal(w.length, 1);
  assert.match(w[0], /Art\. 9/);
});

test('auch wenn nur der Fragetext verräterisch ist', () => {
  const w = heikleFragen([{ schluessel: 'info', frage: 'Bei welcher Krankenkasse sind Sie?', pflicht: true }]);
  assert.equal(w.length, 1);
});

test('Zahlungs- und Ausweisdaten werden gemeldet', () => {
  assert.match(heikleFragen([{ schluessel: 'iban', frage: 'Ihre IBAN?' }])[0], /Zahlungsdaten/);
  assert.match(heikleFragen([{ schluessel: 'ausweis', frage: 'Ausweisnummer?' }])[0], /Identifikationsnummern/);
});

test('harmlose Fragen lösen keine Warnung aus', () => {
  assert.deepEqual(heikleFragen([
    { schluessel: 'anliegen', frage: 'Worum geht es?', pflicht: true },
    { schluessel: 'ort', frage: 'In welchem Ort?', pflicht: true },
    { schluessel: 'name', frage: 'Wie ist Ihr Name?', pflicht: true },
  ]), []);
});

test('dieselbe Frage wird nicht doppelt gemeldet', () => {
  const w = heikleFragen([{ schluessel: 'diagnose', frage: 'Welche Diagnose und welche Medikamente?', pflicht: true }]);
  assert.equal(w.length, 1, 'zwei Treffer in einer Frage bleiben eine Warnung');
});

test('leere Eingaben werfen nicht', () => {
  for (const x of [null, undefined, [], [{}], [null]]) {
    assert.doesNotThrow(() => heikleFragen(x));
    assert.doesNotThrow(() => pruefeFragen(x));
  }
});
