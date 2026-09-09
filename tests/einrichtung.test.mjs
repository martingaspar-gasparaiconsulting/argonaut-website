// ============================================================================
// ARGONAUT OS · tests/einrichtung.test.mjs
//
// Diese Liste sagt dem Betreiber, was bei einem Kunden noch zu tun ist. Sie
// darf sich in genau zwei Richtungen nicht irren:
//
//   · Nichts als „erledigt" zeigen, was offen ist  → der Kunde wartet.
//   · Nichts als „offen" zeigen, was erledigt ist  → Arbeit wird doppelt gemacht,
//     und nach dem dritten Fehlalarm glaubt niemand mehr der Liste.
//
// Dazu ein Wächter, der die Modul-Schlüssel gegen die echte Rechte-Ebene
// prüft: Ein umbenanntes Modul würde sonst still Punkte verschwinden lassen.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PUNKTE,
  baueCheckliste,
  fortschritt,
  offeneFuer,
  istFertig,
  STATUS_TEXT,
} from '../out/einrichtung.js';
import { NAV_LINKS } from '../out/rechte.js';

const ALLE_FELDER = Object.fromEntries(PUNKTE.map((p) => [p.feld, false]));
const zeile = (liste, id) => liste.find((z) => z.id === id);

// --- 1) Die Punkte selbst ---------------------------------------------------

test('jeder Punkt hat id, Feld, Zuständigkeit und eine Begründung', () => {
  for (const p of PUNKTE) {
    assert.ok(p.id, 'id fehlt');
    assert.ok(p.feld, `${p.id}: feld fehlt`);
    assert.ok(p.name && p.name.length > 3, `${p.id}: name fehlt`);
    assert.ok(p.warum && p.warum.length > 20, `${p.id}: ohne Begründung weiss niemand, warum er das tun soll`);
    assert.ok(['betreiber', 'kunde', 'automatisch'].includes(p.zustaendig), `${p.id}: zustaendig unbekannt`);
  }
});

test('ids und Felder sind eindeutig', () => {
  const ids = PUNKTE.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'doppelte id');
  const felder = PUNKTE.map((p) => p.feld);
  assert.equal(new Set(felder).size, felder.length, 'zwei Punkte lesen dasselbe Feld');
});

test('jedes braucht zeigt auf einen Punkt, den es gibt', () => {
  const ids = new Set(PUNKTE.map((p) => p.id));
  for (const p of PUNKTE) {
    if (p.braucht) assert.ok(ids.has(p.braucht), `${p.id} braucht „${p.braucht}" — den gibt es nicht`);
  }
});

test('kein Punkt wartet im Kreis auf sich selbst', () => {
  for (const p of PUNKTE) {
    const gesehen = new Set([p.id]);
    let lauf = p;
    while (lauf?.braucht) {
      assert.ok(!gesehen.has(lauf.braucht), `Kreis über ${p.id} → ${lauf.braucht}`);
      gesehen.add(lauf.braucht);
      lauf = PUNKTE.find((x) => x.id === lauf.braucht);
    }
  }
});

test('WÄCHTER: jeder Modul-Schlüssel existiert wirklich', () => {
  const echte = new Set(NAV_LINKS.map((l) => l.modul).filter(Boolean));
  for (const p of PUNKTE) {
    if (!p.modul) continue;
    assert.ok(
      echte.has(p.modul),
      `Punkt „${p.id}" haengt am Modul „${p.modul}" — das gibt es in NAV_LINKS nicht. `
      + 'Der Punkt wuerde bei jedem Kunden still als „nicht gebucht" verschwinden.',
    );
  }
});

test('für jeden Status gibt es einen Anzeigetext', () => {
  for (const s of ['erledigt', 'offen', 'wartet', 'nicht_gebucht', 'geplant', 'unbekannt']) {
    assert.ok(STATUS_TEXT[s], `Text fuer ${s} fehlt`);
  }
});

// --- 2) Der Status ----------------------------------------------------------

test('was die Daten als erledigt melden, ist erledigt', () => {
  const l = baueCheckliste({ ...ALLE_FELDER, webLive: true }, null);
  assert.equal(zeile(l, 'web_live').status, 'erledigt');
});

test('unbekannt ist NICHT offen', () => {
  const l = baueCheckliste({}, null);
  assert.equal(zeile(l, 'web_live').status, 'unbekannt',
    'eine fehlgeschlagene Abfrage darf keine Arbeit erfinden');
  assert.equal(zeile(l, 'ci_firma').status, 'unbekannt');
});

test('ein Punkt wartet, solange seine Voraussetzung offen ist', () => {
  const ohne = baueCheckliste(ALLE_FELDER, null);
  assert.equal(zeile(ohne, 'setter_rolle').status, 'wartet', 'ohne Website kein Berater');

  const mit = baueCheckliste({ ...ALLE_FELDER, webLive: true }, null);
  assert.equal(zeile(mit, 'setter_rolle').status, 'offen', 'mit Website wird er faellig');
});

test('nicht gebuchte Module verschwinden aus der Arbeit', () => {
  const nurBasis = baueCheckliste(ALLE_FELDER, new Set(['crm']));
  assert.equal(zeile(nurBasis, 'shop_artikel').status, 'nicht_gebucht');
  assert.equal(zeile(nurBasis, 'wa_token').status, 'nicht_gebucht');
  assert.equal(zeile(nurBasis, 'ci_firma').status, 'offen', 'Punkte ohne Modul gelten immer');
});

test('FAIL-OPEN: ohne Buchungszeilen ist alles gebucht', () => {
  for (const g of [null, undefined]) {
    const l = baueCheckliste(ALLE_FELDER, g);
    assert.notEqual(zeile(l, 'shop_artikel').status, 'nicht_gebucht',
      'ein Betrieb ohne tenant_module-Zeilen bekaeme sonst eine fast leere Liste');
  }
});

test('erledigte Arbeit bleibt sichtbar, auch wenn das Modul wegfällt', () => {
  const l = baueCheckliste({ ...ALLE_FELDER, waToken: true }, new Set(['crm']));
  assert.equal(zeile(l, 'wa_token').status, 'erledigt',
    'die Spur getaner Arbeit darf nicht verschwinden');
});

test('Geplantes ist keine Arbeit, sondern eine Notiz', () => {
  const l = baueCheckliste(ALLE_FELDER, null);
  assert.equal(zeile(l, 'bank_zugang').status, 'geplant');
});

// --- 3) Fortschritt und offene Arbeit ---------------------------------------

test('Ungebuchtes und Geplantes drücken die Quote nicht', () => {
  const l = baueCheckliste(ALLE_FELDER, new Set(['crm']));
  const f = fortschritt(l);
  assert.ok(!l.filter((z) => z.status === 'nicht_gebucht' || z.status === 'geplant')
    .some((z) => f.gesamt === PUNKTE.length), 'ungebuchte Punkte zaehlen mit');
  assert.equal(f.erledigt + f.offen, f.gesamt);
});

test('alles erledigt sind 100 Prozent', () => {
  const alles = Object.fromEntries(PUNKTE.map((p) => [p.feld, true]));
  const l = baueCheckliste(alles, null);
  const f = fortschritt(l);
  assert.equal(f.prozent, 100);
  assert.equal(f.offen, 0);
  assert.equal(istFertig(l), true);
});

test('ein leerer Betrieb ist nicht fertig', () => {
  const l = baueCheckliste({ ...ALLE_FELDER, webLive: true }, null);
  assert.ok(fortschritt(l).offen > 0);
  assert.equal(istFertig(l), false);
});

test('offeneFuer trennt Martins Arbeit von der des Kunden', () => {
  const l = baueCheckliste({ ...ALLE_FELDER, webLive: true }, null);
  const meins = offeneFuer(l, 'betreiber');
  const kunde = offeneFuer(l, 'kunde');
  assert.ok(meins.length > 0 && kunde.length > 0);
  assert.ok(meins.every((z) => z.zustaendig === 'betreiber'));
  assert.ok(kunde.every((z) => z.zustaendig === 'kunde'));
  assert.ok(!meins.some((z) => z.id === 'ci_firma'), 'Firmendaten sind Sache des Kunden');
});

test('wartende Punkte stehen nicht auf der Arbeitsliste', () => {
  const l = baueCheckliste(ALLE_FELDER, null);
  assert.ok(!offeneFuer(l, 'betreiber').some((z) => z.status === 'wartet'),
    'was auf einen anderen Punkt wartet, ist noch nicht zu tun');
});

test('jeder Betreiber-Punkt sagt auch, wo man ihn erledigt', () => {
  for (const p of PUNKTE) {
    if (p.zustaendig === 'betreiber' && !p.geplant) {
      assert.ok(p.wo, `${p.id}: ohne Link sucht der Betreiber die Seite selbst`);
    }
  }
});

test('leere Eingaben werfen nicht', () => {
  for (const b of [null, undefined, {}]) {
    assert.doesNotThrow(() => baueCheckliste(b, null));
    assert.equal(baueCheckliste(b, null).length, PUNKTE.length);
  }
  assert.deepEqual(fortschritt(null), { erledigt: 0, offen: 0, gesamt: 0, prozent: 100 });
  assert.deepEqual(offeneFuer(null, 'betreiber'), []);
});
