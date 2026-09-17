// ============================================================================
// ARGONAUT OS · tests/integrationenGeheim.test.mjs — Punkt 10 (17.09.2026)
//
// Der Pruefbefund vom 15.09. meldete: Zugangsdaten in betrieb_integrationen
// liegen im Klartext, lib/crypto.ts wird nicht benutzt, maskiereConfig wird
// nirgends aufgerufen. Am echten Code WIDERLEGT: app/api/schnittstellen/route.ts
// verschluesselt jedes Passwort-Feld mit AES-256-GCM und ruft maskiereConfig
// im GET auf. RLS: nur der Eigentuemer liest die Zeile.
//
// Diese Tests halten fest, WORAN die Verschluesselung haengt: am Feldtyp
// 'password' im Katalog. Ein neues Geheimfeld, das jemand als 'text' anlegt,
// wuerde still im Klartext gespeichert. Genau das faengt der erste Test.
// ============================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { KONNEKTOR_KATALOG } from '../out/konnektoren.js';
import { geheimeFeldKeys, maskiereConfig } from '../out/integrationen.js';

const SIEHT_GEHEIM_AUS = /(secret|token|api_key|password|passwort|consumer_key|pin)/i;

test('jedes Feld, das nach Geheimnis klingt, ist als password markiert', () => {
  const falsch = [];
  for (const b of KONNEKTOR_KATALOG) {
    for (const a of b.anbieter) {
      for (const f of a.felder) {
        if (SIEHT_GEHEIM_AUS.test(f.key) && f.typ !== 'password') falsch.push(`${b.typ}/${a.key}/${f.key}`);
      }
    }
  }
  assert.deepEqual(falsch, [], 'Diese Felder wuerden im Klartext gespeichert');
});

test('die bekannten Geheimfelder werden als geheim erkannt', () => {
  assert.deepEqual(geheimeFeldKeys('tse', 'fiskaly').sort(), ['api_key', 'api_secret']);
  assert.deepEqual(geheimeFeldKeys('shop', 'shopify'), ['access_token']);
  assert.deepEqual(geheimeFeldKeys('shop', 'woocommerce').sort(), ['consumer_key', 'consumer_secret']);
  assert.deepEqual(geheimeFeldKeys('marktplatz', 'amazon').sort(), ['lwa_client_secret', 'refresh_token']);
  assert.deepEqual(geheimeFeldKeys('datev', 'datev-connect'), ['client_secret']);
});

test('maskiereConfig gibt kein Geheimnis heraus, meldet es nur als gesetzt', () => {
  const { config, gesetzt } = maskiereConfig(
    { shop_url: 'meinshop.myshopify.com', access_token: 'shpat_GEHEIM123456' },
    geheimeFeldKeys('shop', 'shopify'),
  );
  assert.deepEqual(config, { shop_url: 'meinshop.myshopify.com' });
  assert.deepEqual(gesetzt, ['access_token']);
  assert.ok(!JSON.stringify(config).includes('GEHEIM'));
});

test('ein leeres Geheimfeld gilt nicht als gesetzt', () => {
  const { gesetzt } = maskiereConfig({ access_token: '' }, ['access_token']);
  assert.deepEqual(gesetzt, []);
});

test('unbekannter Anbieter ergibt keine Geheimfelder und keinen Absturz', () => {
  assert.deepEqual(geheimeFeldKeys('shop', 'gibtsnicht'), []);
  assert.deepEqual(maskiereConfig(null, []), { config: {}, gesetzt: [] });
});
