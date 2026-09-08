import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WERBE_CRONS, WERBE_ANTEIL, werbeDeckel, mengeFuerWerbelauf, MINDESTMENGE, tagesBudget,
} from '../out/mailBudget.js';

test('Alle Werbe-Crons sind eingetragen — sonst reißen sie zusammen den Anteil', () => {
  // Autoresponder · Dossier-Sequenz · Lead-Nachfass (07.09.) · Freebie-Strecke (08.09.)
  assert.equal(WERBE_CRONS, 4);
});

test('Beim kostenlosen Tarif bleibt die Hälfte für Betriebspost reserviert', () => {
  // 100 Mails/Tag × 0,5 Werbe-Anteil ÷ 4 Crons = 12 je Durchgang
  assert.equal(werbeDeckel(100), 12);
  assert.equal(werbeDeckel(undefined), 12);
});

test('Die Werbepost kann die Betriebspost nie ganz verdrängen', () => {
  const budget = 100;
  const proCron = werbeDeckel(budget);
  assert.ok(proCron * WERBE_CRONS <= budget * WERBE_ANTEIL,
    'Alle Werbe-Crons zusammen dürfen den Werbe-Anteil nicht überschreiten');
});

test('Bei Resend Pro wächst der Deckel mit', () => {
  assert.equal(werbeDeckel(50000), Math.floor((50000 * 0.5) / WERBE_CRONS));
});

test('Auch bei winzigem Budget richtet ein Durchgang etwas aus', () => {
  assert.equal(mengeFuerWerbelauf(4), MINDESTMENGE);
});

test('tagesBudget fällt bei Unsinn auf den sicheren Wert zurück', () => {
  assert.equal(tagesBudget('viel'), 100);
  assert.equal(tagesBudget(-5), 100);
  assert.equal(tagesBudget(null), 100);
  assert.equal(tagesBudget(9_000_000), 50_000);
});
