// ============================================================================
// ARGONAUT OS · tests/whatsappEingang.test.mjs
//
// Der Webhook ist eine offene Tuer ins System: jeder im Internet kann die
// Adresse aufrufen. Was ihn schuetzt, ist allein die Signatur — deshalb steht
// hier der Faelschungsversuch mit im Test, nicht nur der Normalfall.
//
// Zweiter Schwerpunkt: eine kaputte Nutzlast darf NIE werfen. Wirft sie,
// antwortet die Route mit 500, und Meta stellt dieselbe Nachricht immer wieder
// zu — bis der Betrieb sie dutzendfach im Posteingang hat.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  FENSTER_STUNDEN,
  signaturGueltig,
  pruefeEinrichtung,
  leseEingang,
  fensterStand,
  baueWebhookToken,
} from '../out/whatsappEingang.js';

const SECRET = 'geheimes-app-secret';
const sig = (body, secret = SECRET) => 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex');

// --- 1) Signatur ------------------------------------------------------------

test('die echte Signatur wird angenommen', () => {
  const body = '{"entry":[{"changes":[]}]}';
  assert.equal(signaturGueltig(body, sig(body), SECRET), true);
});

test('ANGRIFF: falsches Secret wird abgewiesen', () => {
  const body = '{"a":1}';
  assert.equal(signaturGueltig(body, sig(body, 'anderes-secret'), SECRET), false);
});

test('ANGRIFF: veränderter Body wird abgewiesen', () => {
  const echt = '{"betrag":10}';
  const gefaelscht = '{"betrag":9999}';
  assert.equal(signaturGueltig(gefaelscht, sig(echt), SECRET), false);
});

test('ANGRIFF: fehlende, leere oder unsinnige Signatur wird abgewiesen', () => {
  const body = '{"a":1}';
  for (const k of [null, undefined, '', '   ', 'sha256=', 'sha1=' + 'a'.repeat(40), 'a'.repeat(64), 'sha256=zz']) {
    assert.equal(signaturGueltig(body, k, SECRET), false, `sollte sperren: ${String(k)}`);
  }
});

test('ohne hinterlegtes Secret wird NICHTS durchgelassen', () => {
  const body = '{"a":1}';
  assert.equal(signaturGueltig(body, sig(body), ''), false);
  assert.equal(signaturGueltig(body, sig(body), null), false);
});

test('ein einziges verändertes Zeichen genügt', () => {
  const body = '{"a":1}';
  const echt = sig(body);
  const kaputt = echt.slice(0, -1) + (echt.endsWith('a') ? 'b' : 'a');
  assert.equal(signaturGueltig(body, kaputt, SECRET), false);
});

// --- 2) Einrichtungs-Handschlag --------------------------------------------

test('der Handschlag gibt die challenge nur bei richtigem Token zurück', () => {
  const p = { mode: 'subscribe', token: 'mein-token', challenge: '12345' };
  assert.equal(pruefeEinrichtung(p, 'mein-token'), '12345');
});

test('ANGRIFF: falscher, leerer oder fehlender Token gibt nichts zurück', () => {
  const p = (t) => ({ mode: 'subscribe', token: t, challenge: '12345' });
  assert.equal(pruefeEinrichtung(p('falsch'), 'mein-token'), null);
  assert.equal(pruefeEinrichtung(p('mein-token-laenger'), 'mein-token'), null);
  assert.equal(pruefeEinrichtung(p(''), 'mein-token'), null);
  assert.equal(pruefeEinrichtung(p('mein-token'), ''), null);
  assert.equal(pruefeEinrichtung(p('mein-token'), null), null);
});

test('ein anderer mode wird abgewiesen', () => {
  assert.equal(pruefeEinrichtung({ mode: 'unsubscribe', token: 'x', challenge: '1' }, 'x'), null);
  assert.equal(pruefeEinrichtung({ token: 'x', challenge: '1' }, 'x'), null);
});

// --- 3) Nutzlast zerlegen ---------------------------------------------------

const echteNutzlast = {
  object: 'whatsapp_business_account',
  entry: [{
    id: '123',
    changes: [{
      field: 'messages',
      value: {
        messaging_product: 'whatsapp',
        metadata: { display_phone_number: '4971112345', phone_number_id: '99887766' },
        contacts: [{ profile: { name: 'Petra Wagner' }, wa_id: '4917612345678' }],
        messages: [{
          from: '4917612345678',
          id: 'wamid.ABC123',
          timestamp: '1757404800',
          type: 'text',
          text: { body: 'Guten Tag, haben Sie die Dichtung noch da?' },
        }],
      },
    }],
  }],
};

test('eine echte Textnachricht wird sauber zerlegt', () => {
  const l = leseEingang(echteNutzlast);
  assert.equal(l.length, 1);
  assert.equal(l[0].phoneNumberId, '99887766');
  assert.equal(l[0].von, '+4917612345678', 'die Nummer muss international mit + stehen');
  assert.equal(l[0].name, 'Petra Wagner');
  assert.equal(l[0].text, 'Guten Tag, haben Sie die Dichtung noch da?');
  assert.equal(l[0].art, 'text');
  assert.equal(l[0].providerId, 'wamid.ABC123');
  assert.ok(l[0].zeitpunktIso.startsWith('2025-') || l[0].zeitpunktIso.includes('T'));
});

test('eine kaputte Nutzlast wirft NIE — sonst stellt Meta endlos erneut zu', () => {
  for (const mist of [null, undefined, {}, [], 'text', 42, { entry: null }, { entry: [null] },
                      { entry: [{ changes: 'quatsch' }] }, { entry: [{ changes: [{}] }] },
                      { entry: [{ changes: [{ value: { messages: [null, {}, { from: 'x' }] } }] }] }]) {
    assert.doesNotThrow(() => leseEingang(mist), `warf bei: ${JSON.stringify(mist)}`);
    assert.ok(Array.isArray(leseEingang(mist)));
  }
});

test('eine Nachricht ohne Absender oder Kennung wird übersprungen', () => {
  const p = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '1' }, messages: [
    { id: 'nur-id' }, { from: 'nur-von' }, { from: '49176', id: 'gut', type: 'text', text: { body: 'ja' } },
  ] } }] }] };
  const l = leseEingang(p);
  assert.equal(l.length, 1);
  assert.equal(l[0].providerId, 'gut');
});

test('Bild, Sprachnachricht, Datei und Standort werden in Klartext beschrieben', () => {
  const bau = (m) => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '1' }, messages: [{ from: '49176', id: 'x', ...m }] } }] }] });
  assert.equal(leseEingang(bau({ type: 'image', image: { caption: 'Das Teil hier' } }))[0].text, '[Bild] — „Das Teil hier“');
  assert.equal(leseEingang(bau({ type: 'image' }))[0].text, '[Bild]');
  assert.equal(leseEingang(bau({ type: 'audio' }))[0].text, '[Sprachnachricht]');
  assert.equal(leseEingang(bau({ type: 'document', document: { filename: 'Angebot.pdf' } }))[0].text, '[Datei: Angebot.pdf]');
  assert.equal(leseEingang(bau({ type: 'location', location: { name: 'Baustelle Nord' } }))[0].text, '[Standort: Baustelle Nord]');
  assert.equal(leseEingang(bau({ type: 'interactive', interactive: { button_reply: { title: 'Termin buchen' } } }))[0].text, 'Termin buchen');
});

test('Statusmeldungen (zugestellt/gelesen) landen NICHT im Eingang', () => {
  const p = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '1' },
    statuses: [{ id: 'wamid.X', status: 'delivered', recipient_id: '49176' }] } }] }] };
  assert.deepEqual(leseEingang(p), []);
});

test('mehrere Nachrichten in einer Zustellung kommen alle an', () => {
  const p = { entry: [{ changes: [{ value: { metadata: { phone_number_id: '7' }, messages: [
    { from: '49176', id: 'a', type: 'text', text: { body: 'eins' } },
    { from: '49176', id: 'b', type: 'text', text: { body: 'zwei' } },
  ] } }] }] };
  assert.deepEqual(leseEingang(p).map((x) => x.text), ['eins', 'zwei']);
});

// --- 4) 24-Stunden-Fenster --------------------------------------------------

test('frisch geschrieben heißt Fenster offen', () => {
  const jetzt = new Date('2026-09-09T12:00:00Z');
  const f = fensterStand('2026-09-09T11:00:00Z', jetzt);
  assert.equal(f.offen, true);
  assert.equal(f.restMinuten, 23 * 60);
  assert.equal(f.text, 'noch 23 Std. 0 Min.');
});

test('genau nach 24 Stunden ist das Fenster zu', () => {
  const jetzt = new Date('2026-09-09T12:00:00Z');
  assert.equal(fensterStand('2026-09-08T12:00:00Z', jetzt).offen, false);
  assert.equal(fensterStand('2026-09-08T11:59:00Z', jetzt).offen, false);
  assert.equal(fensterStand('2026-09-08T12:01:00Z', jetzt).offen, true);
});

test('die letzte Minute wird noch als offen gezeigt', () => {
  const jetzt = new Date('2026-09-09T12:00:00Z');
  const f = fensterStand('2026-09-08T12:30:00Z', jetzt);
  assert.equal(f.offen, true);
  assert.equal(f.text, 'noch 30 Min.');
});

test('ohne oder mit unsinnigem Datum gilt das Fenster als zu', () => {
  for (const d of [null, undefined, '', '   ', 'kein datum', '99.99.9999']) {
    const f = fensterStand(d);
    assert.equal(f.offen, false, `sollte zu sein: ${String(d)}`);
    assert.equal(f.restMinuten, 0);
  }
});

test('das Fenster ist 24 Stunden — nicht 23, nicht 48', () => {
  assert.equal(FENSTER_STUNDEN, 24);
});

// --- 5) Verify-Token --------------------------------------------------------

test('der Token ist lang genug und ohne verwechselbare Zeichen', () => {
  const t = baueWebhookToken();
  assert.equal(t.length, 24);
  assert.match(t, /^[a-z2-9]+$/);
  assert.ok(!/[l1o0]/.test(t), 'l, 1, o und 0 sind beim Abtippen zu leicht zu verwechseln');
});

test('zwei Token sind nicht gleich', () => {
  assert.notEqual(baueWebhookToken(), baueWebhookToken());
});
