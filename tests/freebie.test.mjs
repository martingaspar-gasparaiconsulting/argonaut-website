import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATEI_MAX_BYTES, BESTAETIGUNG_GUELTIG_TAGE, STANDARD_STRECKE,
  STATUS_UNBESTAETIGT, STATUS_AKTIV, STATUS_ABGEMELDET,
  endungVon, pruefeDatei, sichererName, pfadFuer,
  seitenUrl, bestaetigenUrl, abmeldenUrl,
  standardStreckeFuer, setzePlatzhalter, anrede,
  faelligAm, entscheide, nachVersandWerte, bestaetigungVerfallen,
  fehltZumStart, zaehleLeads, pruefeAnmeldung,
} from '../out/freebie.js';

const JETZT = '2026-09-08T10:00:00.000Z';
const TAG = 86400000;
const vorTagen = (n) => new Date(new Date(JETZT).getTime() - n * TAG).toISOString();

// ---------- Datei ----------

test('endungVon ist robust', () => {
  assert.equal(endungVon('Ratgeber.PDF'), 'pdf');
  assert.equal(endungVon('a.b.pdf'), 'pdf');
  assert.equal(endungVon('ohnepunkt'), '');
  assert.equal(endungVon(null), '');
});

test('pruefeDatei nimmt nur PDF', () => {
  assert.equal(pruefeDatei('a.pdf', 'application/pdf', 1000).ok, true);
  assert.equal(pruefeDatei('a.pdf', '', 1000).ok, true);
  const docx = pruefeDatei('a.docx', 'application/msword', 1000);
  assert.equal(docx.ok, false);
  assert.match(docx.fehler, /PDF/);
});

test('pruefeDatei achtet auf die Größe', () => {
  assert.equal(pruefeDatei('a.pdf', 'application/pdf', 0).ok, false);
  assert.equal(pruefeDatei('a.pdf', 'application/pdf', DATEI_MAX_BYTES).ok, true);
  const zuGross = pruefeDatei('a.pdf', 'application/pdf', DATEI_MAX_BYTES + 1);
  assert.equal(zuGross.ok, false);
  assert.match(zuGross.fehler, /25 MB/);
});

test('sichererName entschärft Umlaute und Leerzeichen', () => {
  assert.equal(sichererName('Grüße vom Dach.pdf'), 'Gruesse_vom_Dach.pdf');
  assert.equal(sichererName('Maß & Zahl.pdf'), 'Mass_Zahl.pdf');
});

test('sichererName lässt keinen Pfad durch — im Zweifel Ersatzname', () => {
  for (const boese of ['../../etc/passwd.pdf', '/etc/passwd.pdf', '..\\..\\win.pdf', '.pdf', '', '   ', null]) {
    const n = sichererName(boese);
    assert.ok(!n.includes('/'), `Schrägstrich in ${n}`);
    assert.ok(!n.includes('\\'), `Backslash in ${n}`);
    assert.ok(!n.startsWith('.'), `führender Punkt in ${n}`);
    assert.ok(n.length > 0);
  }
  assert.equal(sichererName('../../etc/passwd.pdf'), 'ratgeber.pdf');
});

test('pfadFuer legt immer im eigenen Ordner ab — sonst greift die Eimer-Regel nicht', () => {
  assert.equal(pfadFuer('u-1', 'f-1', 'a.pdf', 1000), 'u-1/f-1/1000_a.pdf');
  assert.equal(pfadFuer('', 'f-1', 'a.pdf'), null);
  assert.equal(pfadFuer('u-1', '', 'a.pdf'), null);
});

// ---------- Adressen ----------

test('die öffentlichen Adressen hängen keine doppelten Schrägstriche an', () => {
  assert.equal(seitenUrl('https://x.de/', 'abc123'), 'https://x.de/f/abc123');
  assert.equal(bestaetigenUrl('https://x.de', 't1'), 'https://x.de/api/oeffentlich/freebie-bestaetigen?token=t1');
  assert.equal(abmeldenUrl('https://x.de', 't2'), 'https://x.de/api/oeffentlich/freebie-abmelden?token=t2');
});

test('Bestätigen und Abmelden nutzen NIE denselben Schlüssel', () => {
  const b = bestaetigenUrl('https://x.de', 'gleich');
  const a = abmeldenUrl('https://x.de', 'gleich');
  assert.notEqual(b, a);
  assert.match(b, /bestaetigen/);
  assert.match(a, /abmelden/);
});

// ---------- Strecke ----------

test('die Standard-Strecke hat fünf Schritte in aufsteigender Reihenfolge', () => {
  assert.equal(STANDARD_STRECKE.length, 5);
  const schritte = STANDARD_STRECKE.map((s) => s.schritt);
  assert.deepEqual(schritte, [1, 2, 3, 4, 5]);
  const tage = STANDARD_STRECKE.map((s) => s.tag);
  assert.deepEqual(tage, [...tage].sort((a, b) => a - b));
  assert.ok(tage[0] >= 1, 'kein Schritt am Tag der Bestätigung — die Datei kommt dort schon');
});

test('die Texte siezen und tragen echte Umlaute', () => {
  const alle = STANDARD_STRECKE.map((s) => s.betreff + ' ' + s.text).join(' ');
  assert.match(alle, /Sie/);
  assert.ok(!/\bdu\b|\bdich\b|\bdein/i.test(alle), 'keine Du-Ansprache in Kundentexten');
  assert.ok(/[äöüßÄÖÜ]/.test(alle), 'echte Umlaute, keine Ersatzschreibung');
  assert.ok(!/fuer|ueber|koennen|muessen|groesse/.test(alle));
});

test('standardStreckeFuer hängt Betrieb und Freebie an jede Zeile', () => {
  const rows = standardStreckeFuer('f-1', 'u-1');
  assert.equal(rows.length, 5);
  for (const r of rows) {
    assert.equal(r.owner_user_id, 'u-1');
    assert.equal(r.freebie_id, 'f-1');
    assert.equal(r.aktiv, true);
  }
});

test('setzePlatzhalter füllt, was da ist — und hinterlässt nie "undefined"', () => {
  const t = setzePlatzhalter('{{firma}} · {{name}} · {{titel}}', { firma: 'Meier', name: 'Frau Koch', titel: 'Dach-Ratgeber' });
  assert.equal(t, 'Meier · Frau Koch · Dach-Ratgeber');
  const leer = setzePlatzhalter('[{{firma}}][{{name}}]', {});
  assert.equal(leer, '[][]');
  assert.ok(!leer.includes('undefined'));
});

test('setzePlatzhalter ist tolerant bei Schreibweisen', () => {
  assert.equal(setzePlatzhalter('{{ Firma }}', { firma: 'X' }), 'X');
});

test('anrede: mit Namen und ohne, immer mit Sie-Form', () => {
  assert.equal(anrede('Herr Meier'), 'Guten Tag Herr Meier,');
  assert.equal(anrede(''), 'Guten Tag,');
  assert.equal(anrede(null), 'Guten Tag,');
});

// ---------- Fälligkeit und Entscheidung ----------

test('faelligAm rechnet ab der Bestätigung', () => {
  assert.equal(faelligAm('2026-09-01T10:00:00.000Z', 2), '2026-09-03T10:00:00.000Z');
  assert.equal(faelligAm('2026-09-01T10:00:00.000Z', 0), '2026-09-01T10:00:00.000Z');
  assert.equal(faelligAm('Unsinn', 2), null);
});

const S = STANDARD_STRECKE;

test('entscheide: abgemeldet schlägt alles', () => {
  const e = entscheide(
    { status: STATUS_ABGEMELDET, email: 'a@b.de', schritt: 0, faellig_am: vorTagen(5) },
    S, JETZT,
  );
  assert.equal(e.tun, 'nichts');
  assert.equal(e.grund, 'abgemeldet');
});

test('entscheide: ohne Bestätigung geht nichts raus', () => {
  const e = entscheide(
    { status: STATUS_UNBESTAETIGT, email: 'a@b.de', schritt: 0, faellig_am: vorTagen(5) },
    S, JETZT,
  );
  assert.equal(e.tun, 'nichts');
  assert.match(e.grund, /bestätigt/);
});

test('entscheide: fällig und bestätigt → senden', () => {
  const e = entscheide(
    { status: STATUS_AKTIV, email: 'a@b.de', schritt: 0, faellig_am: vorTagen(1) },
    S, JETZT,
  );
  assert.equal(e.tun, 'senden');
  assert.equal(e.schritt, 1);
});

test('entscheide: noch nicht fällig → nichts', () => {
  const e = entscheide(
    { status: STATUS_AKTIV, email: 'a@b.de', schritt: 0, faellig_am: '2026-09-20T10:00:00.000Z' },
    S, JETZT,
  );
  assert.equal(e.tun, 'nichts');
  assert.match(e.grund, /fällig/);
});

test('entscheide: OHNE Termin wird nicht "dann eben sofort" gesendet', () => {
  const e = entscheide(
    { status: STATUS_AKTIV, email: 'a@b.de', schritt: 0, faellig_am: null },
    S, JETZT,
  );
  assert.equal(e.tun, 'nichts');
  assert.match(e.grund, /Termin/);
});

test('entscheide: nach dem letzten Schritt ist fertig', () => {
  const e = entscheide(
    { status: STATUS_AKTIV, email: 'a@b.de', schritt: 5, faellig_am: vorTagen(1) },
    S, JETZT,
  );
  assert.equal(e.tun, 'fertig');
});

test('entscheide: kaputte Adresse hält den Versand an', () => {
  const e = entscheide(
    { status: STATUS_AKTIV, email: 'keine-adresse', schritt: 0, faellig_am: vorTagen(1) },
    S, JETZT,
  );
  assert.equal(e.tun, 'nichts');
});

test('entscheide: leere Strecke sendet nichts', () => {
  const e = entscheide({ status: STATUS_AKTIV, email: 'a@b.de', schritt: 0, faellig_am: vorTagen(1) }, [], JETZT);
  assert.equal(e.tun, 'nichts');
  assert.match(e.grund, /Strecke/);
});

test('entscheide überspringt keinen Schritt, wenn einer nachgetragen wird', () => {
  const kurz = [{ schritt: 2, tag: 5, betreff: '', text: '' }, { schritt: 4, tag: 14, betreff: '', text: '' }];
  const e = entscheide({ status: STATUS_AKTIV, email: 'a@b.de', schritt: 2, faellig_am: vorTagen(1) }, kurz, JETZT);
  assert.equal(e.tun, 'senden');
  assert.equal(e.schritt, 4);
});

test('nachVersandWerte setzt den nächsten Termin ab der Bestätigung', () => {
  const b = '2026-09-01T10:00:00.000Z';
  const w = nachVersandWerte(1, S, b);
  assert.equal(w.schritt, 1);
  assert.equal(w.faellig_am, faelligAm(b, S[1].tag));
});

test('nachVersandWerte: nach dem letzten Schritt kein Termin mehr', () => {
  const w = nachVersandWerte(5, S, '2026-09-01T10:00:00.000Z');
  assert.equal(w.faellig_am, null);
});

test('bestaetigungVerfallen greift erst nach der Frist', () => {
  assert.equal(bestaetigungVerfallen(vorTagen(3), JETZT), false);
  assert.equal(bestaetigungVerfallen(vorTagen(20), JETZT), true);
  assert.equal(bestaetigungVerfallen(null, JETZT), false);
  assert.equal(BESTAETIGUNG_GUELTIG_TAGE, 14);
});

// ---------- Startbereitschaft ----------

test('fehltZumStart nennt Klartext, kein Feldname', () => {
  const fehlt = fehltZumStart({}, [], ['PLZ']);
  assert.ok(fehlt.some((f) => /Titel/.test(f)));
  assert.ok(fehlt.some((f) => /PDF/.test(f)));
  assert.ok(fehlt.some((f) => /Strecke/.test(f)));
  assert.ok(fehlt.some((f) => /Impressum: PLZ/.test(f)));
});

test('fehltZumStart ist leer, wenn alles da ist', () => {
  const fehlt = fehltZumStart(
    { titel: 'Dach-Ratgeber', beschreibung: 'Zehn Seiten', datei_pfad: 'u/f/x.pdf' },
    [{ aktiv: true }],
    [],
  );
  assert.deepEqual(fehlt, []);
});

test('fehltZumStart: eine Strecke aus lauter abgeschalteten Mails zählt nicht', () => {
  const fehlt = fehltZumStart(
    { titel: 'T', beschreibung: 'B', datei_pfad: 'p' },
    [{ aktiv: false }, { aktiv: false }],
    [],
  );
  assert.equal(fehlt.length, 1);
  assert.match(fehlt[0], /Strecke/);
});

// ---------- Zahlen ----------

test('zaehleLeads: Abgemeldete zählen in die Bestätigungsquote', () => {
  const z = zaehleLeads([
    { status: STATUS_AKTIV }, { status: STATUS_AKTIV },
    { status: STATUS_ABGEMELDET },
    { status: STATUS_UNBESTAETIGT },
  ]);
  assert.equal(z.gesamt, 4);
  assert.equal(z.aktiv, 2);
  assert.equal(z.abgemeldet, 1);
  assert.equal(z.unbestaetigt, 1);
  assert.equal(z.bestaetigungsquote, 75);
});

test('zaehleLeads ohne Grundlage gibt null statt 0 %', () => {
  const z = zaehleLeads([]);
  assert.equal(z.gesamt, 0);
  assert.equal(z.bestaetigungsquote, null);
  assert.equal(zaehleLeads(null).gesamt, 0);
});

test('unbekannter Status gilt als unbestätigt — im Zweifel nichts senden', () => {
  const z = zaehleLeads([{ status: 'quatsch' }, { status: null }]);
  assert.equal(z.unbestaetigt, 2);
  assert.equal(z.aktiv, 0);
});

// ---------- Anmeldung ----------

test('pruefeAnmeldung vereinheitlicht und weist Unsinn ab', () => {
  const ok = pruefeAnmeldung('  Anna@Beispiel.DE ', '  Anna Meier  ');
  assert.equal(ok.ok, true);
  assert.equal(ok.email, 'anna@beispiel.de');
  assert.equal(ok.name, 'Anna Meier');

  assert.equal(pruefeAnmeldung('anna@', 'x').ok, false);
  assert.equal(pruefeAnmeldung('', '').ok, false);
  assert.equal(pruefeAnmeldung(null, null).ok, false);
});

test('pruefeAnmeldung: leerer Name wird null, nicht ""', () => {
  const r = pruefeAnmeldung('a@b.de', '   ');
  assert.equal(r.ok, true);
  assert.equal(r.name, null);
});
