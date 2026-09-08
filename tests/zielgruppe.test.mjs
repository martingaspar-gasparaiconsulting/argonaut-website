import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BESTANDSKUNDE_MONATE, istEmail, rechtsgrundFuer, darfWerbung, grundText,
  tageSeitKontakt, passt, teileAuf, adressenVon, versandSatz, bestandskundenHinweis,
} from '../out/zielgruppe.js';

const JETZT = '2026-09-08T12:00:00.000Z';
const TAG = 86400000;
const vorTagen = (n) => new Date(new Date(JETZT).getTime() - n * TAG).toISOString();
const vorMonaten = (m) => new Date(new Date(JETZT).getTime() - m * 30.44 * TAG).toISOString().slice(0, 10);

const K = (x = {}) => ({ id: 'k1', email: 'a@b.de', ...x });

// ---------- Rechtsgrundlage ----------

test('Widerspruch schlägt ALLES — auch eine spätere Einwilligung', () => {
  const k = K({ werbe_einwilligung: true, kunde_seit: vorMonaten(1), werbe_widerspruch_am: vorTagen(3) });
  assert.equal(rechtsgrundFuer(k, JETZT), 'widerspruch');
  assert.equal(darfWerbung(k, JETZT), false);
});

test('Ausdrückliche Einwilligung reicht', () => {
  const k = K({ werbe_einwilligung: true });
  assert.equal(rechtsgrundFuer(k, JETZT), 'einwilligung');
  assert.equal(darfWerbung(k, JETZT), true);
});

test('Bestandskunde: frischer Kauf ja, alter Kauf nein', () => {
  assert.equal(rechtsgrundFuer(K({ kunde_seit: vorMonaten(3) }), JETZT), 'bestandskunde');
  assert.equal(rechtsgrundFuer(K({ kunde_seit: vorMonaten(BESTANDSKUNDE_MONATE + 6) }), JETZT), 'keine');
  assert.equal(BESTANDSKUNDE_MONATE, 24);
});

test('Ein Kaufdatum in der Zukunft öffnet keine Tür', () => {
  const morgen = new Date(new Date(JETZT).getTime() + 10 * TAG).toISOString().slice(0, 10);
  assert.equal(rechtsgrundFuer(K({ kunde_seit: morgen }), JETZT), 'keine');
});

test('Ohne gültige Adresse gibt es nichts zu senden', () => {
  assert.equal(rechtsgrundFuer(K({ email: null, werbe_einwilligung: true }), JETZT), 'keine_adresse');
  assert.equal(rechtsgrundFuer(K({ email: 'kaputt', werbe_einwilligung: true }), JETZT), 'keine_adresse');
  assert.equal(darfWerbung(K({ email: '', werbe_einwilligung: true }), JETZT), false);
});

test('Ein blanker CRM-Kontakt bekommt KEINE Werbung — der Kern des Ganzen', () => {
  assert.equal(rechtsgrundFuer(K(), JETZT), 'keine');
  assert.equal(darfWerbung(K(), JETZT), false);
  assert.equal(darfWerbung(null, JETZT), false);
});

test('werbe_einwilligung zählt nur als echtes true, nicht als "ja" oder 1', () => {
  assert.equal(rechtsgrundFuer(K({ werbe_einwilligung: 'ja' }), JETZT), 'keine');
  assert.equal(rechtsgrundFuer(K({ werbe_einwilligung: 1 }), JETZT), 'keine');
});

test('istEmail ist robust', () => {
  assert.equal(istEmail('Anna@Beispiel.DE '), true);
  assert.equal(istEmail('anna@'), false);
  assert.equal(istEmail(null), false);
});

// ---------- Klartext ----------

test('jeder Grund hat Klartext, siezt und hat eine Farbe', () => {
  for (const g of ['einwilligung', 'bestandskunde', 'widerspruch', 'keine_adresse', 'keine']) {
    const t = grundText(g);
    assert.ok(t.kurz.length > 3, g);
    assert.ok(t.lang.length > 20, g);
    assert.ok(['gruen', 'gelb', 'rot', 'grau'].includes(t.farbe), g);
    assert.ok(!/\bdu\b|\bdir\b|\bdein/i.test(t.lang), `duzt bei ${g}`);
    assert.ok(!/fuer|ueber|koennen|muessen|zulaessig/.test(t.lang), `Ersatzschreibung bei ${g}`);
  }
});

test('der Bestandskunden-Text nennt die Einschränkung, nicht nur die Erlaubnis', () => {
  const t = grundText('bestandskunde');
  assert.match(t.lang, /ähnliche/);
  assert.match(t.lang, /Widerspruch/);
});

// ---------- Regeln ----------

test('leere Regeln lassen alles durch', () => {
  assert.equal(passt(K({ status: 'offen' }), {}, JETZT), true);
  assert.equal(passt(K(), null, JETZT), true);
});

test('Suche greift über Name, Firma und Adresse', () => {
  const k = K({ vorname: 'Anna', nachname: 'Meier', firma: 'Dachbau GmbH', email: 'anna@dachbau.de' });
  assert.equal(passt(k, { suche: 'dachbau' }, JETZT), true);
  assert.equal(passt(k, { suche: 'MEIER' }, JETZT), true);
  assert.equal(passt(k, { suche: 'Schmidt' }, JETZT), false);
});

test('Status- und Quellenfilter sind Mengen, kein Einzelwert', () => {
  const k = K({ status: 'offen', quelle: 'messe' });
  assert.equal(passt(k, { status: ['offen', 'neu'] }, JETZT), true);
  assert.equal(passt(k, { status: ['gewonnen'] }, JETZT), false);
  assert.equal(passt(k, { quelle: ['messe'] }, JETZT), true);
  assert.equal(passt(k, { status: [] }, JETZT), true, 'leere Liste = kein Filter');
});

test('stillSeitTagen: wer NIE Kontakt hatte, ist erst recht still', () => {
  assert.equal(passt(K({ letzter_kontakt_am: vorTagen(200) }), { stillSeitTagen: 90 }, JETZT), true);
  assert.equal(passt(K({ letzter_kontakt_am: vorTagen(10) }), { stillSeitTagen: 90 }, JETZT), false);
  assert.equal(passt(K({ letzter_kontakt_am: null }), { stillSeitTagen: 90 }, JETZT), true);
});

test('nurKunden und nurEinwilligung greifen', () => {
  assert.equal(passt(K({ kunde_seit: vorMonaten(2) }), { nurKunden: true }, JETZT), true);
  assert.equal(passt(K(), { nurKunden: true }, JETZT), false);
  assert.equal(passt(K({ werbe_einwilligung: true }), { nurEinwilligung: true }, JETZT), true);
  assert.equal(passt(K(), { nurEinwilligung: true }, JETZT), false);
});

test('tageSeitKontakt rechnet und bleibt bei fehlendem Datum null', () => {
  assert.equal(tageSeitKontakt(K({ letzter_kontakt_am: vorTagen(5) }), JETZT), 5);
  assert.equal(tageSeitKontakt(K({ letzter_kontakt_am: null }), JETZT), null);
});

// ---------- Aufteilung ----------

const LISTE = [
  K({ id: 'ja-einwilligung', email: 'a@x.de', werbe_einwilligung: true, status: 'offen' }),
  K({ id: 'ja-bestandskunde', email: 'b@x.de', kunde_seit: vorMonaten(2), status: 'offen' }),
  K({ id: 'nein-widerspruch', email: 'c@x.de', werbe_einwilligung: true, werbe_widerspruch_am: vorTagen(1), status: 'offen' }),
  K({ id: 'nein-blank', email: 'd@x.de', status: 'offen' }),
  K({ id: 'nein-adresse', email: null, werbe_einwilligung: true, status: 'offen' }),
  K({ id: 'anderer-status', email: 'f@x.de', werbe_einwilligung: true, status: 'gewonnen' }),
];

test('teileAuf trennt passen und dürfen sauber', () => {
  const a = teileAuf(LISTE, { status: ['offen'] }, JETZT);
  assert.deepEqual(a.erlaubt.map((k) => k.id), ['ja-einwilligung', 'ja-bestandskunde']);
  assert.equal(a.ausserhalb, 1, 'der mit anderem Status');
  assert.equal(a.gesperrt.length, 3);
  assert.equal(a.gruende.widerspruch, 1);
  assert.equal(a.gruende.keine, 1);
  assert.equal(a.gruende.keine_adresse, 1);
  assert.equal(a.gruende.einwilligung, 1);
  assert.equal(a.gruende.bestandskunde, 1);
});

test('teileAuf verträgt leere und kaputte Eingaben', () => {
  const a = teileAuf(null, null, JETZT);
  assert.equal(a.erlaubt.length, 0);
  assert.equal(a.gesperrt.length, 0);
  assert.equal(a.ausserhalb, 0);
});

test('ohne Regeln bleibt die Rechtsprüfung trotzdem der Filter', () => {
  const a = teileAuf(LISTE, {}, JETZT);
  assert.equal(a.erlaubt.length, 3, 'einwilligung, bestandskunde, gewonnen-mit-einwilligung');
  assert.equal(a.ausserhalb, 0);
});

test('adressenVon vereinheitlicht und entdoppelt', () => {
  const raus = adressenVon([
    { email: 'A@X.de' }, { email: ' a@x.de ' }, { email: 'b@x.de' },
    { email: 'kaputt' }, { email: null },
  ]);
  assert.deepEqual(raus, ['a@x.de', 'b@x.de']);
});

// ---------- Anzeige ----------

test('versandSatz nennt IMMER beide Zahlen', () => {
  const a = teileAuf(LISTE, { status: ['offen'] }, JETZT);
  const satz = versandSatz(a);
  assert.match(satz, /2 Empfänger/);
  assert.match(satz, /3 bleiben/);
});

test('versandSatz beschönigt den leeren Fall nicht', () => {
  const nur = teileAuf([K({ email: 'x@x.de' })], {}, JETZT);
  assert.match(versandSatz(nur), /Kein Empfänger zulässig/);
  assert.match(versandSatz(teileAuf([], {}, JETZT)), /Keine Kontakte/);
});

test('versandSatz im Einzahl-Fall', () => {
  const einer = teileAuf([K({ email: 'x@x.de', werbe_einwilligung: true })], {}, JETZT);
  assert.match(versandSatz(einer), /1 Empfänger darf/);
});

test('der Bestandskunden-Hinweis nennt Firma, Widerspruch und Kostenfreiheit', () => {
  const h = bestandskundenHinweis('Meier Bedachungen');
  assert.match(h, /Meier Bedachungen/);
  assert.match(h, /widersprechen/);
  assert.match(h, /keine Kosten/);
  assert.ok(!/\bdu\b|\bdein/i.test(h));
  assert.match(bestandskundenHinweis(null), /^Wir /);
});
