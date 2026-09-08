import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUSSAGEKRAEFTIG_AB, zugestellt, quoten, messHinweis, vergleiche,
  pixelUrl, pixelHtml, istUmleitbar, klickUrl, biegeLinksUm, messeMit,
  sicheresZiel, topZiele, kurzeAdresse,
} from '../out/mailMessung.js';

const V = (x = {}) => ({ id: 'v1', empfaenger_anzahl: 100, erfolg_anzahl: 100, ...x });

// ---------- Grundlage ----------

test('zugestellt nimmt die Erfolgszahl, nicht die Empfängerzahl', () => {
  assert.equal(zugestellt(V({ empfaenger_anzahl: 100, erfolg_anzahl: 92 })), 92);
  assert.equal(zugestellt(V({ erfolg_anzahl: 0 })), 100, 'ohne Erfolgszahl die Empfängerzahl');
  assert.equal(zugestellt(null), 0);
});

// ---------- Quoten ----------

test('quoten rechnen die drei Zahlen aus', () => {
  const q = quoten(V({ erfolg_anzahl: 100, geoeffnet_anzahl: 40, geklickt_anzahl: 10 }));
  assert.equal(q.oeffnung, 40);
  assert.equal(q.klick, 10);
  assert.equal(q.klickAusOeffnung, 25);
});

test('ohne Grundlage bleibt es null — nicht 0 Prozent', () => {
  const leer = quoten(V({ empfaenger_anzahl: 0, erfolg_anzahl: 0 }));
  assert.equal(leer.oeffnung, null);
  assert.equal(leer.klick, null);
  assert.equal(leer.klickAusOeffnung, null);

  // Versendet, aber noch nichts geöffnet: DAS ist echte 0 %.
  const nix = quoten(V({ erfolg_anzahl: 50, geoeffnet_anzahl: 0 }));
  assert.equal(nix.oeffnung, 0);
  assert.equal(nix.klickAusOeffnung, null, 'ohne Öffnungen keine Ableitung');
});

test('quoten verträgt Unsinn in den Zahlen', () => {
  const q = quoten(V({ erfolg_anzahl: 'viele', geoeffnet_anzahl: -3, empfaenger_anzahl: null }));
  assert.equal(q.oeffnung, null);
  assert.equal(quoten(null).oeffnung, null);
});

// ---------- Einordnung ----------

test('der Hinweis warnt bei kleiner Grundlage', () => {
  const h = messHinweis(V({ erfolg_anzahl: 8 }));
  assert.match(h, /8 Empfängern/);
  assert.match(h, /schwankt/);
});

test('der Hinweis nennt die Schwäche der Öffnungsmessung', () => {
  const h = messHinweis(V({ erfolg_anzahl: 500 }));
  assert.match(h, /Untergrenze/);
  assert.match(h, /Bilder/);
  assert.match(h, /Klicks/);
});

test('jeder Hinweis siezt und trägt echte Umlaute', () => {
  for (const n of [0, 5, 50, 5000]) {
    const h = messHinweis(V({ erfolg_anzahl: n, empfaenger_anzahl: n }));
    assert.ok(!/\bdu\b|\bdein/i.test(h), `duzt bei ${n}`);
    assert.ok(!/fuer|ueber|koennen|Oeffnung/.test(h), `Ersatzschreibung bei ${n}`);
  }
});

// ---------- Vergleich ----------

test('vergleiche kürt keinen Sieger bei dünner Grundlage', () => {
  const r = vergleiche(
    V({ erfolg_anzahl: 10, geoeffnet_anzahl: 8 }),
    V({ erfolg_anzahl: 10, geoeffnet_anzahl: 2 }),
  );
  assert.equal(r.sicher, false);
  assert.match(r.satz, /Zu wenige Empfänger/);
});

test('vergleiche nennt einen knappen Unterschied als möglichen Zufall', () => {
  const r = vergleiche(
    V({ erfolg_anzahl: 200, geoeffnet_anzahl: 60 }),
    V({ erfolg_anzahl: 200, geoeffnet_anzahl: 64 }),
  );
  assert.equal(r.sicher, false);
  assert.match(r.satz, /Zufall/);
});

test('vergleiche benennt einen deutlichen Unterschied', () => {
  const r = vergleiche(
    V({ erfolg_anzahl: 200, geoeffnet_anzahl: 80 }),
    V({ erfolg_anzahl: 200, geoeffnet_anzahl: 40 }),
  );
  assert.equal(r.sicher, true);
  assert.match(r.satz, /erste/);
  assert.match(r.satz, /20 Prozentpunkte/);
});

test('vergleiche ohne Zahlen bleibt still', () => {
  const r = vergleiche(null, null);
  assert.equal(r.sicher, false);
  assert.match(r.satz, /fehlen/);
});

// ---------- Messpunkte ----------

test('das Zählbild ist unsichtbar und hat leeren alt-Text', () => {
  const h = pixelHtml('https://x.de', 'v1', 'k1');
  assert.match(h, /width="1"/);
  assert.match(h, /alt=""/);
  assert.match(h, /mail-pixel/);
});

test('die Mess-Adressen tragen Versand UND Schlüssel', () => {
  const u = pixelUrl('https://x.de/', 'v1', 'geheim');
  assert.equal(u, 'https://x.de/api/oeffentlich/mail-pixel?v=v1&s=geheim');
});

test('der Abmeldelink wird NIEMALS umgeleitet', () => {
  assert.equal(istUmleitbar('https://x.de/api/newsletter/abmelden?token=abc'), false);
  assert.equal(istUmleitbar('https://x.de/api/oeffentlich/abmelden?token=abc'), false);
});

test('nur http und https werden umgeleitet', () => {
  assert.equal(istUmleitbar('https://x.de/angebot'), true);
  assert.equal(istUmleitbar('http://x.de/angebot'), true);
  assert.equal(istUmleitbar('mailto:info@x.de'), false);
  assert.equal(istUmleitbar('tel:+4971112345'), false);
  assert.equal(istUmleitbar('#anker'), false);
  assert.equal(istUmleitbar(null), false);
});

test('biegeLinksUm fasst nur die zählbaren Links an', () => {
  const html = '<a href="https://x.de/a">A</a>'
    + '<a href="mailto:info@x.de">Mail</a>'
    + '<a href="https://x.de/api/newsletter/abmelden?token=t">Abmelden</a>';
  const raus = biegeLinksUm(html, 'https://x.de', 'v1', 'k1');
  assert.match(raus, /mail-klick/);
  assert.match(raus, /href="mailto:info@x\.de"/, 'mailto bleibt');
  assert.match(raus, /href="https:\/\/x\.de\/api\/newsletter\/abmelden\?token=t"/, 'Abmeldung bleibt');
  assert.equal((raus.match(/mail-klick/g) || []).length, 1);
});

test('messeMit hängt das Zählbild genau einmal an', () => {
  const raus = messeMit('<p>Hallo</p>', 'https://x.de', 'v1', 'k1');
  assert.equal((raus.match(/mail-pixel/g) || []).length, 1);
  assert.ok(raus.indexOf('<p>Hallo</p>') < raus.indexOf('mail-pixel'), 'Bild kommt ans Ende');
});

test('klickUrl kodiert das Ziel, damit Parameter nicht verlorengehen', () => {
  const u = klickUrl('https://x.de', 'v1', 'k1', 'https://ziel.de/a?b=1&c=2');
  assert.match(u, /u=https%3A%2F%2Fziel\.de%2Fa%3Fb%3D1%26c%3D2/);
});

// ---------- Offene Umleitung verhindern ----------

test('sicheresZiel lässt nur http und https durch', () => {
  assert.ok(sicheresZiel('https://ziel.de/a'));
  assert.ok(sicheresZiel('http://ziel.de/a'));
  assert.equal(sicheresZiel('javascript:alert(1)'), null);
  assert.equal(sicheresZiel('data:text/html,<script>'), null);
  assert.equal(sicheresZiel('file:///etc/passwd'), null);
  assert.equal(sicheresZiel('//ziel.de/a'), null);
  assert.equal(sicheresZiel(''), null);
  assert.equal(sicheresZiel(null), null);
});

test('sicheresZiel weist absurd lange Adressen ab', () => {
  assert.equal(sicheresZiel('https://x.de/' + 'a'.repeat(3000)), null);
});

// ---------- Anzeige ----------

test('topZiele sortiert absteigend und wirft Leeres weg', () => {
  const t = topZiele([
    { ziel_url: 'https://a.de', anzahl: 3 },
    { ziel_url: 'https://b.de', anzahl: 9 },
    { ziel_url: '', anzahl: 5 },
    { ziel_url: 'https://c.de', anzahl: 0 },
  ]);
  assert.deepEqual(t.map((x) => x.ziel), ['https://b.de', 'https://a.de']);
});

test('topZiele begrenzt die Anzahl', () => {
  const viele = Array.from({ length: 20 }, (_, i) => ({ ziel_url: `https://x.de/${i}`, anzahl: i + 1 }));
  assert.equal(topZiele(viele, 3).length, 3);
  assert.equal(topZiele(null).length, 0);
});

test('kurzeAdresse kürzt, bleibt aber erkennbar', () => {
  assert.equal(kurzeAdresse('https://beispiel.de/angebot/'), 'beispiel.de/angebot');
  const lang = kurzeAdresse('https://beispiel.de/' + 'x'.repeat(80), 20);
  assert.equal(lang.length, 20);
  assert.match(lang, /^beispiel\.de/);
});
