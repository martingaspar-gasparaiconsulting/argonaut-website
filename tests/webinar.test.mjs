import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUS_UNBESTAETIGT, STATUS_AKTIV, STATUS_ABGEMELDET,
  TERMIN_GEPLANT, TERMIN_ABGESAGT,
  TEILNAHME_OFFEN, TEILNAHME_TEILGENOMMEN, TEILNAHME_GEFEHLT,
  ERINNERUNGEN, NACHHOLFENSTER_MINUTEN, NACHBEREITUNG_STUNDEN,
  formatiereTermin, dauerText, endetAm,
  seitenUrl, bestaetigenUrl, abmeldenUrl,
  platzZahlen, kannAnmelden, naechsterTermin,
  erinnerungFaellig, nachbereitungFaellig, nachbereitungFuer, istWerbung,
  setzePlatzhalter, anrede, pruefeAnmeldung, bestaetigungVerfallen,
  fehltZumStart, zaehleAnmeldungen,
} from '../out/webinar.js';

const STD = 3_600_000;
const MIN = 60_000;

/** Ein Termin am 22.09.2026 um 14:00 deutscher Zeit. */
const BEGINN = '2026-09-22T12:00:00.000Z';   // 14:00 MESZ
const TERMIN = { status: TERMIN_GEPLANT, beginnt_am: BEGINN, dauer_minuten: 90, kapazitaet: 100, zugang_url: 'https://meet.example/abc' };
const AKTIV = { status: STATUS_AKTIV, email: 'kunde@example.de' };

function vor(stunden, minuten = 0) {
  return new Date(new Date(BEGINN).getTime() - stunden * STD - minuten * MIN).toISOString();
}
function nach(stunden) {
  return new Date(new Date(BEGINN).getTime() + stunden * STD).toISOString();
}

// ── Zeit und Darstellung ────────────────────────────────────────────────────

test('Ein Termin wird in DEUTSCHER Ortszeit angezeigt, nicht in UTC', () => {
  // 12:00 UTC im September ist 14:00 in Deutschland (Sommerzeit).
  const s = formatiereTermin(BEGINN);
  assert.ok(s.includes('14:00'), `erwartet 14:00, bekommen: ${s}`);
  assert.ok(s.includes('22. September 2026'), s);
  assert.ok(s.startsWith('Dienstag'), s);
});

test('Die Sommerzeit-Umstellung wird mitgerechnet', () => {
  // 12:00 UTC im Januar ist 13:00 in Deutschland (Winterzeit).
  assert.ok(formatiereTermin('2026-01-20T12:00:00.000Z').includes('13:00'));
});

test('Ein kaputtes Datum ergibt LEER, nie „Invalid Date"', () => {
  for (const x of ['', null, undefined, 'morgen', '2026-13-45']) {
    assert.equal(formatiereTermin(x), '');
  }
});

test('Die Dauer wird lesbar ausgeschrieben', () => {
  assert.equal(dauerText(45), '45 Minuten');
  assert.equal(dauerText(60), '1 Stunde');
  assert.equal(dauerText(120), '2 Stunden');
  assert.equal(dauerText(90), '1,5 Stunden');
  assert.equal(dauerText(0), '');
  assert.equal(dauerText('abc'), '');
});

test('Das Ende ergibt sich aus Beginn und Dauer', () => {
  assert.equal(endetAm(BEGINN, 90), '2026-09-22T13:30:00.000Z');
  assert.equal(endetAm('kaputt', 90), null);
  // Fehlende Dauer -> 60 Minuten, nie 0
  assert.equal(endetAm(BEGINN, null), '2026-09-22T13:00:00.000Z');
});

// ── Adressen ────────────────────────────────────────────────────────────────

test('Die öffentlichen Adressen sind sauber zusammengesetzt', () => {
  assert.equal(seitenUrl('https://argonaut-os.com/', 'sommer-webinar'), 'https://argonaut-os.com/w/sommer-webinar');
  assert.ok(bestaetigenUrl('https://x.de', 'a b').includes('token=a%20b'));
  assert.ok(abmeldenUrl('https://x.de', 'tok').endsWith('webinar-abmelden?token=tok'));
});

// ── Plätze ──────────────────────────────────────────────────────────────────

test('Keine Kapazität heißt UNBEGRENZT, nicht „kein Platz"', () => {
  // Ein vergessenes Feld darf keine Anmeldung verhindern.
  for (const k of [0, null, undefined, '', 'viele', -5]) {
    const p = platzZahlen(k, 12);
    assert.equal(p.kapazitaet, null, `bei ${String(k)}`);
    assert.equal(p.ausgebucht, false);
    assert.equal(p.frei, null);
  }
});

test('Bei gesetzter Kapazität wird richtig gezählt', () => {
  assert.deepEqual(platzZahlen(100, 40), { kapazitaet: 100, belegt: 40, frei: 60, ausgebucht: false });
  assert.deepEqual(platzZahlen(100, 100), { kapazitaet: 100, belegt: 100, frei: 0, ausgebucht: true });
  // Überbelegt darf nie eine negative Zahl freier Plätze ergeben
  assert.deepEqual(platzZahlen(100, 130), { kapazitaet: 100, belegt: 130, frei: 0, ausgebucht: true });
});

// ── Anmeldung möglich? ──────────────────────────────────────────────────────

test('Anmelden geht bis unmittelbar vor Beginn', () => {
  assert.deepEqual(kannAnmelden(TERMIN, 10, vor(0, 10)), { ok: true });
});

test('Nach dem Beginn ist Schluss', () => {
  const r = kannAnmelden(TERMIN, 10, nach(0.5));
  assert.equal(r.ok, false);
  assert.ok(r.grund.includes('begonnen'));
});

test('Ein abgesagter Termin nimmt keine Anmeldung mehr', () => {
  const r = kannAnmelden({ ...TERMIN, status: TERMIN_ABGESAGT }, 0, vor(24));
  assert.equal(r.ok, false);
  assert.ok(r.grund.includes('abgesagt'));
});

test('Ausgebucht ist ausgebucht', () => {
  const r = kannAnmelden({ ...TERMIN, kapazitaet: 20 }, 20, vor(24));
  assert.equal(r.ok, false);
  assert.ok(r.grund.includes('ausgebucht'));
});

test('Ohne Datum keine Anmeldung — im Zweifel NEIN', () => {
  assert.equal(kannAnmelden({ ...TERMIN, beginnt_am: null }, 0, vor(24)).ok, false);
});

test('naechsterTermin überspringt Vergangenes und Abgesagtes', () => {
  const liste = [
    { status: TERMIN_GEPLANT, beginnt_am: '2026-09-01T10:00:00Z' },              // vorbei
    { status: TERMIN_ABGESAGT, beginnt_am: '2026-09-23T10:00:00Z' },             // abgesagt
    { status: TERMIN_GEPLANT, beginnt_am: '2026-10-05T10:00:00Z' },              // später
    { status: TERMIN_GEPLANT, beginnt_am: '2026-09-25T10:00:00Z' },              // der nächste
  ];
  assert.equal(naechsterTermin(liste, '2026-09-20T00:00:00Z').beginnt_am, '2026-09-25T10:00:00Z');
  assert.equal(naechsterTermin([], '2026-09-20T00:00:00Z'), null);
  assert.equal(naechsterTermin(null, '2026-09-20T00:00:00Z'), null);
});

// ── Erinnerungen ────────────────────────────────────────────────────────────

test('Abgemeldet und unbestätigt schlagen ALLES andere', () => {
  assert.equal(erinnerungFaellig({ status: STATUS_ABGEMELDET, email: 'a@b.de' }, TERMIN, [], vor(24)).grund, 'abgemeldet');
  assert.equal(erinnerungFaellig({ status: STATUS_UNBESTAETIGT, email: 'a@b.de' }, TERMIN, [], vor(24)).grund, 'nicht bestätigt');
});

test('Eine kaputte Adresse bekommt nichts', () => {
  assert.equal(erinnerungFaellig({ status: STATUS_AKTIV, email: 'keine-adresse' }, TERMIN, [], vor(24)).tun, 'nichts');
});

test('Die Wochen-Erinnerung geht 7 Tage vorher raus', () => {
  const e = erinnerungFaellig(AKTIV, TERMIN, [], vor(168));
  assert.equal(e.tun, 'senden');
  assert.equal(e.stufe, 1);
  assert.equal(e.mitZugang, false, 'der Zugangslink gehört NICHT in die Wochen-Mail');
});

test('Die Tages-Erinnerung trägt den Zugangslink', () => {
  const e = erinnerungFaellig(AKTIV, TERMIN, [1], vor(24));
  assert.equal(e.tun, 'senden');
  assert.equal(e.stufe, 2);
  assert.equal(e.mitZugang, true);
});

test('Die letzte Erinnerung kommt eine Stunde vorher', () => {
  const e = erinnerungFaellig(AKTIV, TERMIN, [1, 2], vor(1));
  assert.equal(e.tun, 'senden');
  assert.equal(e.stufe, 3);
  assert.equal(e.mitZugang, true);
});

test('Eine bereits gesendete Stufe wird nie wiederholt', () => {
  assert.equal(erinnerungFaellig(AKTIV, TERMIN, [1], vor(168)).tun, 'nichts');
  assert.equal(erinnerungFaellig(AKTIV, TERMIN, [1, 2, 3], vor(1)).tun, 'nichts');
});

test('WICHTIG: Wer kurz vor Beginn dazukommt, bekommt NUR die letzte Erinnerung', () => {
  // Ohne diese Regel bekäme er drei Mails auf einmal: „in 7 Tagen", „morgen",
  // „gleich" — alle innerhalb einer Minute.
  const e = erinnerungFaellig(AKTIV, TERMIN, [], vor(0, 30));
  assert.equal(e.tun, 'senden');
  assert.equal(e.stufe, 3, 'die nächstgelegene Stufe, nicht die erste');
});

test('Eine überfällige Stufe wird ÜBERSPRUNGEN, nicht nachgeschickt', () => {
  // 5 Stunden vor Beginn ist die 24-Stunden-Mail 19 Stunden überfällig und
  // die 168er noch viel länger. Beide fallen ersatzlos aus.
  const e = erinnerungFaellig(AKTIV, TERMIN, [], vor(5));
  assert.equal(e.tun, 'nichts');
  assert.equal(e.grund, 'nichts fällig');
});

test('Das Nachholfenster ist groß genug für den 15-Minuten-Cron', () => {
  assert.ok(NACHHOLFENSTER_MINUTEN >= 30, 'sonst rutscht eine Erinnerung zwischen zwei Cron-Läufen durch');
  // Kurz nach dem Zeitpunkt läuft es noch
  const e = erinnerungFaellig(AKTIV, TERMIN, [], vor(168 - 0.5));  // 30 Min nach fällig
  assert.equal(e.tun, 'senden');
  assert.equal(e.stufe, 1);
});

test('Vor dem ersten Zeitpunkt passiert gar nichts', () => {
  const e = erinnerungFaellig(AKTIV, TERMIN, [], vor(300));
  assert.equal(e.tun, 'nichts');
  assert.equal(e.grund, 'nichts fällig');
});

test('Nach dem Beginn geht keine Erinnerung mehr raus', () => {
  assert.equal(erinnerungFaellig(AKTIV, TERMIN, [], nach(0.1)).grund, 'Termin läuft oder ist vorbei');
});

test('Für einen abgesagten Termin wird nicht erinnert', () => {
  assert.equal(erinnerungFaellig(AKTIV, { ...TERMIN, status: TERMIN_ABGESAGT }, [], vor(24)).grund, 'Termin abgesagt');
});

test('Ohne Datum wird nicht erinnert', () => {
  assert.equal(erinnerungFaellig(AKTIV, { ...TERMIN, beginnt_am: null }, [], vor(24)).grund, 'kein Termin gesetzt');
});

test('Bei zwei gleichzeitig fälligen Stufen gewinnt die NÄCHSTGELEGENE', () => {
  // Mit den drei Standardstufen (168 h / 24 h / 1 h) liegen die Zeitpunkte so
  // weit auseinander, dass immer nur eine im Nachholfenster liegt — die
  // Sortierung fällt dort gar nicht auf. Erst bei eng gesetzten Stufen wird
  // sie tragend, und genau das prüft dieser Test: wer zwei Stufen dicht
  // hintereinander legt, muss die spätere (dringendere) bekommen.
  const eng = [
    { stufe: 1, stundenVorher: 2, betreff: 'A {{titel}}', mitZugang: false },
    { stufe: 2, stundenVorher: 1.5, betreff: 'B {{titel}}', mitZugang: true },
  ];
  const e = erinnerungFaellig(AKTIV, TERMIN, [], vor(1.4), eng);
  assert.equal(e.tun, 'senden');
  assert.equal(e.stufe, 2, 'die nähere Stufe, nicht die frühere');
  assert.equal(e.mitZugang, true);
});

test('Alle Erinnerungsstufen haben eindeutige Nummern und fallende Vorlaufzeit', () => {
  const nummern = ERINNERUNGEN.map((e) => e.stufe);
  assert.equal(new Set(nummern).size, nummern.length, 'Stufennummern müssen eindeutig sein');
  for (const e of ERINNERUNGEN) {
    assert.ok(e.stundenVorher > 0);
    assert.ok(e.betreff.includes('{{titel}}'), 'jeder Betreff nennt das Webinar');
  }
});

// ── Nachbereitung ───────────────────────────────────────────────────────────

test('Die Nachbereitung kommt erst NACH dem Ende', () => {
  // Termin 14:00 + 90 Min = 15:30, plus 2 Stunden Abstand = 17:30
  assert.equal(nachbereitungFaellig({ ...AKTIV, teilnahme: TEILNAHME_TEILGENOMMEN }, TERMIN, vor(1)).tun, 'nichts');
  assert.equal(nachbereitungFaellig({ ...AKTIV, teilnahme: TEILNAHME_TEILGENOMMEN }, TERMIN, nach(1)).grund, 'noch nicht fällig');
  const e = nachbereitungFaellig({ ...AKTIV, teilnahme: TEILNAHME_TEILGENOMMEN }, TERMIN, nach(1.5 + NACHBEREITUNG_STUNDEN + 0.1));
  assert.equal(e.tun, 'senden');
});

test('Die Nachbereitung ist als WERBUNG gekennzeichnet', () => {
  // Damit die Route Werbe-Deckel und Werbe-Widerspruch prüft, bevor sie sendet.
  const e = nachbereitungFaellig({ ...AKTIV, teilnahme: TEILNAHME_GEFEHLT }, TERMIN, nach(4));
  assert.equal(e.tun, 'senden');
  assert.equal(e.werbung, true);
});

test('Die Nachbereitung geht nur EINMAL raus', () => {
  const e = nachbereitungFaellig({ ...AKTIV, nachbereitung_am: '2026-09-22T18:00:00Z' }, TERMIN, nach(4));
  assert.equal(e.grund, 'bereits verschickt');
});

test('Nach drei Tagen ist die Nachbereitung vom Tisch', () => {
  const e = nachbereitungFaellig(AKTIV, TERMIN, nach(24 * 5));
  assert.equal(e.grund, 'zu lange her');
});

test('Für einen abgesagten Termin gibt es keine Nachbereitung', () => {
  assert.equal(nachbereitungFaellig(AKTIV, { ...TERMIN, status: TERMIN_ABGESAGT }, nach(4)).grund, 'Termin abgesagt');
});

test('Teilnehmer und Fehlende bekommen VERSCHIEDENE Mails', () => {
  const da = nachbereitungFuer(TEILNAHME_TEILGENOMMEN);
  const weg = nachbereitungFuer(TEILNAHME_GEFEHLT);
  const offen = nachbereitungFuer(TEILNAHME_OFFEN);
  assert.notEqual(da.betreff, weg.betreff);
  assert.ok(da.betreff.includes('Danke'));
  assert.ok(weg.betreff.includes('verpasst'));
  // Ohne erfasste Teilnahme der neutrale Text — nie „Sie haben verpasst"
  assert.ok(!offen.betreff.includes('verpasst'));
  for (const m of [da, weg, offen]) assert.ok(m.betreff.includes('{{titel}}'));
});

test('Nur die Nachbereitung gilt als Werbung', () => {
  assert.equal(istWerbung('bestaetigung'), false);
  assert.equal(istWerbung('erinnerung'), false);
  assert.equal(istWerbung('absage'), false);
  assert.equal(istWerbung('nachbereitung'), true);
  // Eine unbekannte Art gilt vorsichtshalber ALS Werbung
  assert.equal(istWerbung('irgendwas-neues'), true);
  assert.equal(istWerbung(undefined), true);
});

// ── Texte ───────────────────────────────────────────────────────────────────

test('Platzhalter werden ersetzt, fehlende Werte werden LEER statt „undefined"', () => {
  const t = setzePlatzhalter('{{titel}} bei {{firma}} am {{termin}} ({{dauer}}) — {{name}}',
    { titel: 'Steuern 2027', firma: 'Muster GmbH', termin: 'Dienstag', dauer: '1 Stunde' });
  assert.equal(t, 'Steuern 2027 bei Muster GmbH am Dienstag (1 Stunde) — ');
  assert.ok(!t.includes('undefined'));
});

test('Die Anrede siezt immer', () => {
  assert.equal(anrede('Frau Müller'), 'Guten Tag Frau Müller,');
  assert.equal(anrede(''), 'Guten Tag,');
  assert.equal(anrede(null), 'Guten Tag,');
});

// ── Anmeldung prüfen ────────────────────────────────────────────────────────

test('Die Adresse wird geprüft und vereinheitlicht', () => {
  const r = pruefeAnmeldung('  Kunde@Example.DE ', '  Max Muster  ', ' Muster GmbH ');
  assert.equal(r.ok, true);
  assert.equal(r.email, 'kunde@example.de');
  assert.equal(r.name, 'Max Muster');
  assert.equal(r.firma, 'Muster GmbH');
});

test('Ohne gültige Adresse keine Anmeldung', () => {
  for (const x of ['', 'abc', 'a@', null, undefined, 42]) {
    assert.equal(pruefeAnmeldung(x, 'Max').ok, false, `bei ${String(x)}`);
  }
});

test('Leere Zusatzfelder werden zu null, nicht zu Leerzeichen', () => {
  const r = pruefeAnmeldung('a@b.de', '   ', '');
  assert.equal(r.name, null);
  assert.equal(r.firma, null);
});

test('Eine Bestätigungsanfrage verfällt nach 14 Tagen', () => {
  assert.equal(bestaetigungVerfallen('2026-09-01T00:00:00Z', '2026-09-10T00:00:00Z'), false);
  assert.equal(bestaetigungVerfallen('2026-09-01T00:00:00Z', '2026-09-20T00:00:00Z'), true);
  // Unsinn darf nichts verfallen lassen
  assert.equal(bestaetigungVerfallen('kaputt', '2026-09-20T00:00:00Z'), false);
});

// ── Startbereit? ────────────────────────────────────────────────────────────

test('Ohne Zugangslink darf ein Webinar nicht öffentlich gehen', () => {
  // Der peinlichste denkbare Fehler: ein Webinar ohne Raum, und es fällt erst
  // eine Stunde vorher auf.
  const fehlt = fehltZumStart(
    { titel: 'T', beschreibung: 'B', referent: 'R' },
    [{ status: TERMIN_GEPLANT, beginnt_am: BEGINN, zugang_url: '' }],
    [],
  );
  assert.ok(fehlt.some((f) => f.includes('Zugangslink')), fehlt.join(' | '));
});

test('Ohne Termin darf ein Webinar nicht öffentlich gehen', () => {
  const fehlt = fehltZumStart({ titel: 'T', beschreibung: 'B', referent: 'R' }, [], []);
  assert.ok(fehlt.some((f) => f.includes('Termin')));
});

test('Ein abgesagter Termin zählt nicht als Termin', () => {
  const fehlt = fehltZumStart(
    { titel: 'T', beschreibung: 'B', referent: 'R' },
    [{ status: TERMIN_ABGESAGT, beginnt_am: BEGINN, zugang_url: 'https://x' }],
    [],
  );
  assert.ok(fehlt.some((f) => f.includes('Mindestens ein Termin')));
});

test('Das Impressum steht in derselben Liste wie der Rest', () => {
  const fehlt = fehltZumStart(
    { titel: 'T', beschreibung: 'B', referent: 'R' },
    [{ status: TERMIN_GEPLANT, beginnt_am: BEGINN, zugang_url: 'https://x' }],
    ['Telefonnummer'],
  );
  assert.deepEqual(fehlt, ['Impressum: Telefonnummer']);
});

test('Ein vollständiges Webinar meldet nichts Fehlendes', () => {
  const fehlt = fehltZumStart(
    { titel: 'Steuern 2027', beschreibung: 'Worum es geht', referent: 'M. Gaspar' },
    [{ status: TERMIN_GEPLANT, beginnt_am: BEGINN, zugang_url: 'https://meet.example/abc' }],
    [],
  );
  assert.deepEqual(fehlt, []);
});

test('Ein leeres Webinar meldet alles auf einmal, in Klartext', () => {
  const fehlt = fehltZumStart({}, [], []);
  assert.equal(fehlt.length, 4);
  for (const f of fehlt) assert.ok(!f.includes('_'), `kein Feldname in der Ausgabe: ${f}`);
});

// ── Zahlen ──────────────────────────────────────────────────────────────────

test('Die Übersicht trennt Status und Teilnahme', () => {
  const z = zaehleAnmeldungen([
    { status: STATUS_AKTIV, teilnahme: TEILNAHME_TEILGENOMMEN },
    { status: STATUS_AKTIV, teilnahme: TEILNAHME_TEILGENOMMEN },
    { status: STATUS_AKTIV, teilnahme: TEILNAHME_GEFEHLT },
    { status: STATUS_ABGEMELDET, teilnahme: TEILNAHME_OFFEN },
    { status: STATUS_UNBESTAETIGT },
  ]);
  assert.equal(z.gesamt, 5);
  assert.equal(z.aktiv, 3);
  assert.equal(z.abgemeldet, 1);
  assert.equal(z.unbestaetigt, 1);
  assert.equal(z.teilgenommen, 2);
  assert.equal(z.gefehlt, 1);
  assert.equal(z.bestaetigungsquote, 80);     // 4 von 5 haben bestätigt
  assert.equal(z.teilnahmequote, 66.7);       // 2 von 3 erfassten waren da
});

test('Ohne Grundlage gibt es keine erfundene Quote', () => {
  const leer = zaehleAnmeldungen([]);
  assert.equal(leer.bestaetigungsquote, null);
  assert.equal(leer.teilnahmequote, null);
  // Angemeldet, aber Teilnahme noch nicht erfasst -> keine Teilnahmequote
  const offen = zaehleAnmeldungen([{ status: STATUS_AKTIV, teilnahme: TEILNAHME_OFFEN }]);
  assert.equal(offen.teilnahmequote, null);
  assert.equal(offen.bestaetigungsquote, 100);
});

test('zaehleAnmeldungen verträgt Müll ohne zu werfen', () => {
  const z = zaehleAnmeldungen([null, undefined, {}, { status: 'quatsch' }]);
  assert.equal(z.gesamt, 4);
  assert.equal(z.unbestaetigt, 4);
});

// ── Öffentlicher Schlüssel ──────────────────────────────────────────────────

test('Der Schlüssel hat die richtige Länge und den richtigen Zeichenvorrat', async () => {
  const { neuerSchluessel, SCHLUESSEL_LAENGE } = await import('../out/webinar.js');
  for (let i = 0; i < 200; i++) {
    const s = neuerSchluessel();
    assert.equal(s.length, SCHLUESSEL_LAENGE);
    assert.match(s, /^[a-z0-9]+$/);
  }
});

test('Der Zeichenvorrat enthält keine Verwechsler', async () => {
  const { neuerSchluessel } = await import('../out/webinar.js');
  // Kein 0/O, kein 1/l/I — der Schlüssel wird abgetippt und durchgegeben.
  let alle = '';
  for (let i = 0; i < 500; i++) alle += neuerSchluessel();
  for (const c of ['0', 'o', '1', 'l', 'i']) {
    assert.ok(!alle.includes(c), `„${c}" darf nicht im Vorrat sein`);
  }
});

test('Zwei Schlüssel sind praktisch nie gleich', async () => {
  const { neuerSchluessel } = await import('../out/webinar.js');
  const menge = new Set();
  for (let i = 0; i < 2000; i++) menge.add(neuerSchluessel());
  assert.equal(menge.size, 2000, 'ein Zusammenstoß bei 2000 Ziehungen wäre ein Fehler im Zufall');
});

test('Die Länge lässt sich nicht auf einen unsicheren Wert drücken', async () => {
  const { neuerSchluessel } = await import('../out/webinar.js');
  // Ein 3-Zeichen-Schlüssel wäre in Minuten durchprobiert.
  assert.equal(neuerSchluessel(3).length, 8);
  assert.equal(neuerSchluessel(0).length, 12);
  assert.equal(neuerSchluessel(-5).length, 8);
  assert.equal(neuerSchluessel(9999).length, 64);
  assert.equal(neuerSchluessel('abc').length, 12);
});

test('schluesselGueltig lässt nur brauchbare Adressen durch', async () => {
  const { schluesselGueltig, neuerSchluessel } = await import('../out/webinar.js');
  assert.equal(schluesselGueltig(neuerSchluessel()), true);
  assert.equal(schluesselGueltig('sommer-webinar-2026'), true);
  assert.equal(schluesselGueltig('kurz'), false);           // zu kurz
  assert.equal(schluesselGueltig('Mit GROSS'), false);      // Leerzeichen und Großbuchstaben
  assert.equal(schluesselGueltig('../../etc/passwd'), false);
  assert.equal(schluesselGueltig(''), false);
  assert.equal(schluesselGueltig(null), false);
});
