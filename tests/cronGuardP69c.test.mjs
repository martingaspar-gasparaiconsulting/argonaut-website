// ARGONAUT OS · tests/cronGuardP69c.test.mjs — Punkt 69 Paket 3 (22.09.2026)
// Die sechs umgestellten Endpunkte gehen jetzt durch lib/cronZugang.ts.
// Geprueft wird das, worauf es ankommt: die BEIDEN bisherigen Wege muessen
// unveraendert aufgehen — sonst steht ein Zeitplan still und niemand merkt es.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cronZugang } from '../out/cronZugang.js';

const GEHEIM = 'super-geheim-123';

function zugang(ueber = {}) {
  return cronZugang({
    geheimnis: GEHEIM, altGeheimnis: null,
    authKopf: null, altKopf: null, adresse: null,
    ...ueber,
  });
}

// ---------------------------------------------------------------------------
// 1. DIE BEIDEN WEGE, DIE HEUTE SCHON GEHEN — sie MUESSEN weiter gehen
// ---------------------------------------------------------------------------

test('DER WICHTIGSTE TEST: Vercels Bearer-Kopfzeile kommt durch', () => {
  const e = zugang({ authKopf: `Bearer ${GEHEIM}` });
  assert.equal(e.frei, true, 'sonst steht jeder Zeitplan still');
  assert.equal(e.weg, 'bearer');
});

test('Martins Weg von Hand — ?secret= — kommt durch', () => {
  const e = zugang({ adresse: GEHEIM });
  assert.equal(e.frei, true);
  assert.equal(e.weg, 'adresse');
});

test('genau so verhielt sich auch die alte, eigene Pruefung', () => {
  // Die alte Formel, woertlich: auth === `Bearer ${secret}` || ?secret === secret
  const ALT = (auth, adresse) => auth === `Bearer ${GEHEIM}` || adresse === GEHEIM;
  const faelle = [
    [`Bearer ${GEHEIM}`, null],
    [null, GEHEIM],
    ['Bearer falsch', null],
    [null, 'falsch'],
    [null, null],
  ];
  for (const [auth, adresse] of faelle) {
    const neu = zugang({ authKopf: auth, adresse }).frei;
    assert.equal(neu, ALT(auth, adresse), `Abweichung bei auth=${auth} adresse=${adresse}`);
  }
});

// ---------------------------------------------------------------------------
// 2. WAS NICHT DURCHKOMMEN DARF
// ---------------------------------------------------------------------------

test('ohne Geheimnis kommt niemand durch — auch nicht mit leerem Aufruf', () => {
  assert.equal(cronZugang({ geheimnis: undefined, altGeheimnis: null, authKopf: null, altKopf: null, adresse: null }).frei, false);
  assert.equal(cronZugang({ geheimnis: '', altGeheimnis: null, authKopf: 'Bearer ', altKopf: null, adresse: '' }).frei, false);
  assert.equal(cronZugang({ geheimnis: '   ', altGeheimnis: null, authKopf: null, altKopf: null, adresse: '   ' }).frei, false);
});

test('ein falsches Geheimnis kommt nicht durch', () => {
  assert.equal(zugang({ authKopf: 'Bearer falsch' }).frei, false);
  assert.equal(zugang({ adresse: 'falsch' }).frei, false);
  assert.equal(zugang({ authKopf: `Bearer ${GEHEIM}x` }).frei, false);
  assert.equal(zugang({ authKopf: `Bearer ${GEHEIM.slice(0, -1)}` }).frei, false);
});

test('der Alt-Kopf hilft nur, wo das Alt-Geheimnis ausdruecklich erlaubt ist', () => {
  // Die sechs umgestellten Endpunkte setzen altGeheimnisNutzen NICHT.
  assert.equal(zugang({ altKopf: GEHEIM }).frei, false, 'x-cron-secret darf hier nicht genuegen');
});

test('der Adressweg laesst sich an EINER Stelle abschalten', () => {
  assert.equal(zugang({ adresse: GEHEIM, adresseErlaubt: false }).frei, false);
  // und die Kopfzeile bleibt davon unberuehrt
  assert.equal(zugang({ authKopf: `Bearer ${GEHEIM}`, adresseErlaubt: false }).frei, true);
});
