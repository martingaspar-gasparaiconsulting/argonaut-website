import test from 'node:test';
import assert from 'node:assert/strict';
import { icsZeit, icsText, falte, icsTermin, icsDateiname, icsAnhang } from '../out/ics.js';

const BEGINN = '2026-09-22T12:00:00.000Z';
const ENDE = '2026-09-22T13:30:00.000Z';
const BASIS = {
  uid: 'abc-123@argonaut-os.com',
  beginn: BEGINN, ende: ENDE,
  titel: 'Steuern 2027',
};

function zeilen(s) { return s.split('\r\n'); }

// ── Zeit ────────────────────────────────────────────────────────────────────

test('Die Zeit wird ins Kalenderformat gebracht, immer UTC', () => {
  assert.equal(icsZeit(BEGINN), '20260922T120000Z');
  assert.equal(icsZeit('2026-01-05T08:07:06Z'), '20260105T080706Z');
});

test('Eine kaputte Zeit ergibt LEER, nie „Invalid Date"', () => {
  for (const x of ['', null, undefined, 'morgen', '2026-13-45']) {
    assert.equal(icsZeit(x), '');
  }
});

// ── Maskierung ──────────────────────────────────────────────────────────────

test('Komma und Semikolon werden maskiert — sonst verschwindet der Rest der Zeile', () => {
  assert.equal(icsText('Steuern, Recht; Praxis'), 'Steuern\\, Recht\\; Praxis');
});

test('Der Backslash wird ZUERST maskiert', () => {
  // Sonst würde die eigene Maskierung gleich wieder mitmaskiert.
  assert.equal(icsText('a\\b'), 'a\\\\b');
  assert.equal(icsText('a\\,b'), 'a\\\\\\,b');
});

test('Zeilenumbrüche werden zu \\n, in jeder Schreibweise', () => {
  assert.equal(icsText('a\nb'), 'a\\nb');
  assert.equal(icsText('a\r\nb'), 'a\\nb');
  assert.equal(icsText('a\rb'), 'a\\nb');
});

test('Nichts kippt bei leerer Eingabe', () => {
  assert.equal(icsText(null), '');
  assert.equal(icsText(undefined), '');
});

// ── Falten ──────────────────────────────────────────────────────────────────

test('Kurze Zeilen bleiben unangetastet', () => {
  assert.deepEqual(falte('SUMMARY:kurz'), ['SUMMARY:kurz']);
});

test('Lange Zeilen werden gefaltet, Folgezeilen beginnen mit Leerzeichen', () => {
  const lang = 'DESCRIPTION:' + 'x'.repeat(200);
  const teile = falte(lang);
  assert.ok(teile.length > 1);
  assert.equal(teile[0].startsWith(' '), false);
  for (const t of teile.slice(1)) assert.equal(t.startsWith(' '), true);
  // Zusammengesetzt muss wieder das Original herauskommen
  assert.equal(teile.map((t, i) => (i === 0 ? t : t.slice(1))).join(''), lang);
});

test('KEINE Zeile überschreitet 75 Oktett — auch nicht mit Umlauten', () => {
  // Der eigentliche Grund für diese Datei: „ä" braucht zwei Oktett. Wer nach
  // ZEICHEN faltet, schneidet Umlaute mitten durch und Outlook zeigt Salat.
  const lang = 'SUMMARY:' + 'ä'.repeat(120);
  for (const t of falte(lang)) {
    assert.ok(Buffer.byteLength(t, 'utf8') <= 75, `zu lang: ${Buffer.byteLength(t, 'utf8')} Oktett`);
  }
});

test('Beim Falten geht kein Zeichen verloren und keines wird zerschnitten', () => {
  const lang = 'DESCRIPTION:' + 'Grüße aus Böblingen — '.repeat(20);
  const teile = falte(lang);
  const wieder = teile.map((t, i) => (i === 0 ? t : t.slice(1))).join('');
  assert.equal(wieder, lang);
  assert.ok(!wieder.includes('�'), 'kein zerschnittenes Zeichen');
});

// ── Der ganze Eintrag ───────────────────────────────────────────────────────

test('Der Eintrag hat Kopf, Ereignis und Abschluss', () => {
  const z = zeilen(icsTermin(BASIS, BEGINN));
  assert.equal(z[0], 'BEGIN:VCALENDAR');
  assert.ok(z.includes('BEGIN:VEVENT'));
  assert.ok(z.includes('END:VEVENT'));
  assert.ok(z.includes('END:VCALENDAR'));
  assert.ok(z.includes('VERSION:2.0'));
});

test('Zeilenenden sind CRLF, nicht LF', () => {
  const s = icsTermin(BASIS, BEGINN);
  assert.ok(s.includes('\r\n'));
  // Kein einzelnes LF ohne vorangehendes CR
  assert.equal(/[^\r]\n/.test(s), false);
  assert.ok(s.endsWith('\r\n'), 'die Datei endet mit einem Zeilenende');
});

test('METHOD ist PUBLISH, nicht REQUEST', () => {
  // REQUEST macht daraus eine Einladung mit Zusagen, die niemand liest.
  const z = zeilen(icsTermin(BASIS, BEGINN));
  assert.ok(z.includes('METHOD:PUBLISH'));
  assert.ok(!z.includes('METHOD:REQUEST'));
});

test('Beginn, Ende und Titel stehen drin', () => {
  const z = zeilen(icsTermin(BASIS, BEGINN));
  assert.ok(z.includes('DTSTART:20260922T120000Z'));
  assert.ok(z.includes('DTEND:20260922T133000Z'));
  assert.ok(z.includes('SUMMARY:Steuern 2027'));
  assert.ok(z.includes('UID:abc-123@argonaut-os.com'));
  assert.ok(z.some((x) => x.startsWith('DTSTAMP:')));
});

test('Der Zugangslink landet im Ort — Kalender machen daraus einen Klick', () => {
  const z = zeilen(icsTermin({ ...BASIS, ort: 'https://meet.example/abc' }, BEGINN));
  assert.ok(z.includes('LOCATION:https://meet.example/abc'));
});

test('Der Organisator wird mit Namen gesetzt', () => {
  const z = zeilen(icsTermin({ ...BASIS, organisatorName: 'Muster GmbH', organisatorMail: 'info@muster.de' }, BEGINN));
  assert.ok(z.includes('ORGANIZER;CN=Muster GmbH:mailto:info@muster.de'));
});

test('Ohne E-Mail gibt es keinen halben Organisator', () => {
  const z = zeilen(icsTermin({ ...BASIS, organisatorName: 'Muster GmbH' }, BEGINN));
  assert.ok(!z.some((x) => x.startsWith('ORGANIZER')));
});

test('Eine Absage streicht den Eintrag durch statt einen neuen anzulegen', () => {
  const z = zeilen(icsTermin({ ...BASIS, abgesagt: true, sequenz: 1 }, BEGINN));
  assert.ok(z.includes('METHOD:CANCEL'));
  assert.ok(z.includes('STATUS:CANCELLED'));
  assert.ok(z.includes('SEQUENCE:1'));
  // Dieselbe UID — sonst legt der Kalender einen zweiten Eintrag an
  assert.ok(z.includes('UID:abc-123@argonaut-os.com'));
});

test('Die Folgenummer fällt bei Unsinn auf 0 zurück', () => {
  for (const s of [undefined, null, 'zwei', -5, NaN]) {
    assert.ok(zeilen(icsTermin({ ...BASIS, sequenz: s }, BEGINN)).includes('SEQUENCE:0'));
  }
});

test('Ohne Zeit oder ohne Kennung entsteht GAR KEINE Datei', () => {
  // Ein Kalendereintrag ohne Zeit ist schlimmer als keiner.
  assert.equal(icsTermin({ ...BASIS, beginn: null }, BEGINN), '');
  assert.equal(icsTermin({ ...BASIS, ende: 'kaputt' }, BEGINN), '');
  assert.equal(icsTermin({ ...BASIS, uid: '' }, BEGINN), '');
});

test('Ein Komma im Titel zerschießt die Datei nicht', () => {
  const z = zeilen(icsTermin({ ...BASIS, titel: 'Steuern, Recht und Praxis' }, BEGINN));
  assert.ok(z.includes('SUMMARY:Steuern\\, Recht und Praxis'));
});

test('Eine mehrzeilige Beschreibung bleibt EINE Zeile mit \\n', () => {
  const s = icsTermin({ ...BASIS, beschreibung: 'Zeile eins\nZeile zwei' }, BEGINN);
  const beschreibung = zeilen(s).filter((z) => z.startsWith('DESCRIPTION:'));
  assert.equal(beschreibung.length, 1);
  assert.ok(beschreibung[0].includes('\\n'));
});

test('Auch im ganzen Eintrag ist keine Zeile länger als 75 Oktett', () => {
  const s = icsTermin({
    ...BASIS,
    titel: 'Die fünf teuersten Fehler bei der Betriebsübergabe — und wie Sie sie vermeiden',
    beschreibung: 'Ein längerer Text über Grundstücksübertragungen, Erbschaftsteuer und Schenkungen. '.repeat(4),
    ort: 'https://meet.example.com/ein-sehr-langer-raumname-mit-vielen-zeichen-darin-12345',
  }, BEGINN);
  for (const z of zeilen(s)) {
    assert.ok(Buffer.byteLength(z, 'utf8') <= 75, `zu lang (${Buffer.byteLength(z, 'utf8')}): ${z.slice(0, 40)}…`);
  }
});

// ── Dateiname und Anhang ────────────────────────────────────────────────────

test('Der Dateiname verträgt Umlaute und wird nie zum Pfad', () => {
  assert.equal(icsDateiname('Betriebsübergabe'), 'Betriebsuebergabe.ics');
  assert.equal(icsDateiname('../../etc/passwd'), 'etc-passwd.ics');
  assert.equal(icsDateiname(''), 'Termin.ics');
  assert.equal(icsDateiname(null), 'Termin.ics');
  assert.ok(!icsDateiname('a/b\\c').includes('/'));
});

test('Der Anhang passt auf den Typ, den sendeMail erwartet', () => {
  const a = icsAnhang(BASIS, BEGINN);
  assert.equal(typeof a.dateiname, 'string');
  assert.equal(typeof a.inhalt, 'string');
  assert.ok(a.dateiname.endsWith('.ics'));
  assert.ok(a.typ.startsWith('text/calendar'));
  assert.ok(a.typ.includes('method=PUBLISH'), 'ohne method behandelt Outlook die Datei als Einladung');
});

test('Ohne gültigen Termin gibt es keinen Anhang statt eines leeren', () => {
  assert.equal(icsAnhang({ ...BASIS, beginn: null }, BEGINN), null);
});
