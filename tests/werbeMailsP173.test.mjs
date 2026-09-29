// Paket 173 (29.09.2026) — Werbe-Mails rechtssicher: K6 Autoresponder, H7 Bewertungen,
// H8 Website-Anfrage, H9 Termin-Nachfass, H10 Ablaeufe/Automationen, M7 Abmeldung
// kanaluebergreifend, M8 Newsletter nur bestaetigt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { entscheideWerbung, teileEmpfaenger, aboBestaetigtAm, ablehnungsHinweis, normMail, istMail, DOI_QUELLEN } from '../out/werbeErlaubnis.js';
import {
  werbeAbmeldeLink, abmeldeParameterLesen, abmeldeSignatur, mailVerpacken, mailEntpacken, werbeVersandTeile, ABMELDE_PFAD,
} from '../out/werbeAbmeldeLink.js';
import { werbePrueferLaden, werbeFaktenLaden, widerspruchEintragen, erlaubteEmpfaenger, betreiberKennung, betriebDerSitzung } from '../out/werbeErlaubnisServer.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const GH = 'test-geheimnis';
const leer = { sperren: [], kontakte: [], abos: [] };

// ---------------------------------------------------------------- Entscheidung
test('Ohne jede Einwilligung: keine Werbung (frei getippte Adresse)', () => {
  assert.deepEqual(entscheideWerbung('frei@getippt.de', leer), { erlaubt: false, grund: 'ohne_einwilligung' });
});

test('Einwilligung am Kontakt erlaubt, Gross-/Kleinschreibung egal', () => {
  const f = { ...leer, kontakte: [{ email: 'Maria@X.de', werbe_einwilligung: true }] };
  assert.equal(entscheideWerbung(' maria@x.DE ', f).erlaubt, true);
});

test('Newsletter nur bestaetigt UND aus Double-Opt-in-Quelle (M8)', () => {
  const bestaetigt = { email: 'a@x.de', status: 'aktiv', quelle: 'opt-in', bestaetigt_am: '2026-09-01T10:00:00Z' };
  assert.equal(entscheideWerbung('a@x.de', { ...leer, abos: [bestaetigt] }).erlaubt, true);
  // aktiv, aber nie bestaetigt
  assert.equal(entscheideWerbung('a@x.de', { ...leer, abos: [{ ...bestaetigt, bestaetigt_am: null }] }).erlaubt, false);
  // von Hand eingetragen — auch mit (Standardwert-)Datum kein Nachweis
  assert.equal(entscheideWerbung('a@x.de', { ...leer, abos: [{ ...bestaetigt, quelle: 'manuell' }] }).erlaubt, false);
  assert.equal(entscheideWerbung('a@x.de', { ...leer, abos: [{ ...bestaetigt, quelle: 'crm-zielgruppe' }] }).erlaubt, false);
  // unbestaetigt
  assert.equal(entscheideWerbung('a@x.de', { ...leer, abos: [{ ...bestaetigt, status: 'unbestaetigt' }] }).erlaubt, false);
  assert.deepEqual([...DOI_QUELLEN].sort(), ['landingpage', 'opt-in', 'website']);
});

test('Von Hand eingetragen + Einwilligung am Kontakt = erlaubt (CRM-Zielgruppe)', () => {
  const f = { ...leer, abos: [{ email: 'a@x.de', status: 'aktiv', quelle: 'crm-zielgruppe', bestaetigt_am: null }], kontakte: [{ email: 'a@x.de', werbe_einwilligung: true }] };
  assert.equal(entscheideWerbung('a@x.de', f).erlaubt, true);
});

test('Widerspruch aus JEDEM Kanal schlaegt die Einwilligung (M7)', () => {
  const ok = { email: 'a@x.de', status: 'aktiv', quelle: 'opt-in', bestaetigt_am: '2026-09-01T10:00:00Z' };
  // Sperrliste neuer als Bestaetigung
  assert.equal(entscheideWerbung('a@x.de', { ...leer, abos: [ok], sperren: [{ email: 'A@x.de', am: '2026-09-10T10:00:00Z' }] }).grund, 'widersprochen');
  // Widerspruch am Kontakt schlaegt die Kontakt-Einwilligung eines ANDEREN Kontakts mit gleicher Adresse
  assert.equal(entscheideWerbung('a@x.de', { ...leer, kontakte: [{ email: 'a@x.de', werbe_einwilligung: true }, { email: 'a@x.de', werbe_widerspruch_am: '2026-01-01' }] }).erlaubt, false);
  // Newsletter-Abmeldung stoppt auch die Kontakt-Einwilligung
  assert.equal(entscheideWerbung('a@x.de', { ...leer, kontakte: [{ email: 'a@x.de', werbe_einwilligung: true }], abos: [{ email: 'a@x.de', status: 'abgemeldet', abgemeldet_am: '2026-09-02' }] }).erlaubt, false);
  // Abmeldung ohne Datum gilt immer
  assert.equal(entscheideWerbung('a@x.de', { ...leer, abos: [{ email: 'a@x.de', status: 'abgemeldet' }] }, { kanalBestaetigtAm: '2030-01-01' }).erlaubt, false);
});

test('Spaetere bestaetigte Anmeldung hebt einen alten Widerspruch auf — eine undatierte Einwilligung nie', () => {
  const sperre = { email: 'a@x.de', am: '2026-05-01T00:00:00Z' };
  const neu = { email: 'a@x.de', status: 'aktiv', quelle: 'website', bestaetigt_am: '2026-06-01T00:00:00Z', abgemeldet_am: '2026-05-01T00:00:00Z' };
  assert.equal(entscheideWerbung('a@x.de', { ...leer, sperren: [sperre], abos: [neu] }).erlaubt, true);
  assert.equal(entscheideWerbung('a@x.de', { ...leer, sperren: [sperre], kontakte: [{ email: 'a@x.de', werbe_einwilligung: true }] }).erlaubt, false);
  // Kanal-Bestaetigung (Freebie/Webinar/Dossier) juenger als Widerspruch
  assert.equal(entscheideWerbung('a@x.de', { ...leer, sperren: [sperre] }, { nurWiderspruch: true, kanalBestaetigtAm: '2026-07-01' }).erlaubt, true);
  assert.equal(entscheideWerbung('a@x.de', { ...leer, sperren: [sperre] }, { nurWiderspruch: true, kanalBestaetigtAm: '2026-04-01' }).erlaubt, false);
});

test('Wiederangemeldet: Bestaetigung muss nach der alten Abmeldung liegen', () => {
  assert.equal(aboBestaetigtAm({ status: 'aktiv', quelle: 'opt-in', bestaetigt_am: '2026-01-01', abgemeldet_am: '2026-02-01' }), null);
  assert.ok(aboBestaetigtAm({ status: 'aktiv', quelle: 'opt-in', bestaetigt_am: '2026-03-01', abgemeldet_am: '2026-02-01' }) > 0);
});

test('nurWiderspruch (Rueckholung, Nachfass): ohne Einwilligung erlaubt, mit Widerspruch nicht', () => {
  assert.equal(entscheideWerbung('a@x.de', leer, { nurWiderspruch: true }).erlaubt, true);
  assert.equal(entscheideWerbung('a@x.de', { ...leer, sperren: [{ email: 'a@x.de', am: '2026-01-01' }] }, { nurWiderspruch: true }).erlaubt, false);
});

test('Fakten nicht ladbar = keine Werbung (fail-closed), kaputte Adresse nie', () => {
  assert.deepEqual(entscheideWerbung('a@x.de', null), { erlaubt: false, grund: 'unbekannt' });
  assert.equal(entscheideWerbung('a@x.de', null, { nurWiderspruch: true }).erlaubt, false);
  assert.equal(entscheideWerbung('kein-mail', { ...leer, kontakte: [{ email: 'kein-mail', werbe_einwilligung: true }] }).erlaubt, false);
  assert.equal(istMail('a@b.de'), true);
  assert.equal(istMail('a@b'), false);
  assert.equal(istMail('a b@c.de'), false);
  assert.equal(normMail(' A@B.DE '), 'a@b.de');
});

test('teileEmpfaenger: Doppelte fallen weg, Gruende stehen dabei; Hinweistext zaehlt', () => {
  const f = { ...leer, kontakte: [{ email: 'ok@x.de', werbe_einwilligung: true }], sperren: [{ email: 'weg@x.de', am: '2026-01-01' }] };
  const r = teileEmpfaenger(['ok@x.de', 'OK@x.de', 'weg@x.de', 'frei@x.de'], f);
  assert.deepEqual(r.erlaubt, ['ok@x.de']);
  assert.deepEqual(r.abgelehnt, [{ email: 'weg@x.de', grund: 'widersprochen' }, { email: 'frei@x.de', grund: 'ohne_einwilligung' }]);
  const h = ablehnungsHinweis(r.abgelehnt);
  assert.match(h, /^2 Adressen nicht angeschrieben/);
  assert.match(h, /1 abgemeldet bzw\. widersprochen/);
  assert.match(h, /1 ohne bestätigte Einwilligung/);
  assert.equal(ablehnungsHinweis([]), '');
});

// ---------------------------------------------------------------- Abmeldelink
test('Abmeldelink: signiert, entpackbar, jede Aenderung macht ihn ungueltig', () => {
  const link = werbeAbmeldeLink('https://argonaut-os.com/', A, 'Maria@X.de', GH);
  assert.ok(link.startsWith(`https://argonaut-os.com${ABMELDE_PFAD}?b=${A}&e=`));
  const p = new URL(link).searchParams;
  assert.deepEqual(abmeldeParameterLesen(p, GH), { betrieb: A, email: 'maria@x.de' });
  // andere Adresse, anderer Betrieb, andere Unterschrift, anderes Geheimnis
  const q1 = new URLSearchParams(p); q1.set('e', mailVerpacken('fremd@x.de'));
  const q2 = new URLSearchParams(p); q2.set('b', B);
  const q3 = new URLSearchParams(p); q3.set('h', '0'.repeat(32));
  assert.equal(abmeldeParameterLesen(q1, GH), null);
  assert.equal(abmeldeParameterLesen(q2, GH), null);
  assert.equal(abmeldeParameterLesen(q3, GH), null);
  assert.equal(abmeldeParameterLesen(p, 'anderes'), null);
  assert.equal(mailEntpacken(mailVerpacken('a@b.de')), 'a@b.de');
  assert.equal(mailEntpacken('../etc'), '');
});

test('Abmeldelink: ohne Geheimnis, Betrieb oder gueltige Adresse entsteht KEINER', () => {
  assert.equal(werbeAbmeldeLink('https://x.de', A, 'a@x.de', ''), '');
  assert.equal(werbeAbmeldeLink('https://x.de', 'kein-uuid', 'a@x.de', GH), '');
  assert.equal(werbeAbmeldeLink('https://x.de', A, 'kaputt', GH), '');
  assert.equal(werbeAbmeldeLink('javascript:alert(1)', A, 'a@x.de', GH), '');
  assert.equal(abmeldeSignatur(A, 'a@x.de', ''), '');
});

test('werbeVersandTeile: Fuss-Link + List-Unsubscribe mit One-Click, sonst null', () => {
  const t = werbeVersandTeile('https://argonaut-os.com', A, 'a@x.de', GH);
  assert.ok(t);
  assert.equal(t.kopfzeilen['List-Unsubscribe'], `<${t.abmeldeLink}>`);
  assert.equal(t.kopfzeilen['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.equal(werbeVersandTeile('https://argonaut-os.com', A, 'a@x.de', ''), null);
});

// ---------------------------------------------------------------- Server-Teil
function fakeDb({ rpcFehler = false, antwort = null } = {}) {
  const log = [];
  const kette = (tabelle, art, daten) => {
    const eintrag = { tabelle, art, daten, filter: [] };
    log.push(eintrag);
    const k = {
      eq: (s, v) => { eintrag.filter.push(['eq', s, v]); return k; },
      neq: (s, v) => { eintrag.filter.push(['neq', s, v]); return k; },
      ilike: (s, v) => { eintrag.filter.push(['ilike', s, v]); return k; },
      is: (s, v) => { eintrag.filter.push(['is', s, v]); return k; },
      then: (f) => Promise.resolve({ error: null }).then(f),
    };
    return k;
  };
  const rpcs = [];
  return {
    log, rpcs,
    from: (t) => ({
      update: (d) => kette(t, 'update', d),
      upsert: (d, o) => { log.push({ tabelle: t, art: 'upsert', daten: d, optionen: o, filter: [] }); return Promise.resolve({ error: null }); },
    }),
    rpc: async (fn, args) => {
      rpcs.push({ fn, args });
      if (rpcFehler) return { data: null, error: { message: 'fehlt' } };
      return { data: antwort ?? { sperren: [], kontakte: [], abos: [] }, error: null };
    },
  };
}

test('widerspruchEintragen: Sperrliste + alle Kanaele, JEDE Aenderung auf den Betrieb gefiltert', async () => {
  const db = fakeDb();
  assert.equal(await widerspruchEintragen(db, A, ' Maria@X.de ', 'newsletter'), true);
  const ups = db.log.find((e) => e.art === 'upsert');
  assert.equal(ups.tabelle, 'werbe_sperre');
  assert.equal(ups.daten.owner_user_id, A);
  assert.equal(ups.daten.email, 'maria@x.de');
  assert.equal(ups.optionen.onConflict, 'owner_user_id,email');
  const tabellen = db.log.filter((e) => e.art === 'update').map((e) => e.tabelle);
  assert.deepEqual(tabellen, ['kontakte', 'newsletter_abonnenten', 'autoresponder_lauf', 'rueckhol_lauf']);
  for (const e of db.log.filter((x) => x.art === 'update')) {
    assert.ok(e.filter.some(([a, s, v]) => a === 'eq' && s === 'owner_user_id' && v === A), `${e.tabelle} ohne Betriebs-Filter`);
  }
  // Kontakt: erster Widerspruch bleibt stehen; ilike mit entschaerften Platzhaltern
  const k = db.log.find((e) => e.tabelle === 'kontakte');
  assert.ok(k.filter.some(([a, s]) => a === 'is' && s === 'werbe_widerspruch_am'));
  const db2 = fakeDb();
  await widerspruchEintragen(db2, A, 'a_b%c@x.de', 'x');
  assert.ok(db2.log.find((e) => e.tabelle === 'kontakte').filter.some(([a, , v]) => a === 'ilike' && v === 'a\\_b\\%c@x.de'));
});

test('widerspruchEintragen: ohne Betrieb/Adresse passiert nichts', async () => {
  const db = fakeDb();
  assert.equal(await widerspruchEintragen(db, 'kein-uuid', 'a@x.de', 'x'), false);
  assert.equal(await widerspruchEintragen(db, A, 'kaputt', 'x'), false);
  assert.equal(db.log.length, 0);
});

test('werbePrueferLaden: je Betrieb eigene Fakten, rpc-Fehler = Nein', async () => {
  const db = fakeDb({ antwort: { sperren: [], kontakte: [{ email: 'a@x.de', werbe_einwilligung: true }], abos: [] } });
  const darf = await werbePrueferLaden(db, [{ betrieb: A, email: 'a@x.de' }, { betrieb: B, email: 'b@x.de' }, { betrieb: A, email: 'A@x.de' }]);
  assert.equal(db.rpcs.length, 2);
  assert.deepEqual(db.rpcs.map((r) => r.args.p_owner).sort(), [A, B]);
  assert.equal(darf(A, 'a@x.de').erlaubt, true);
  assert.equal(darf('33333333-3333-4333-8333-333333333333', 'a@x.de').grund, 'unbekannt');
  const kaputt = fakeDb({ rpcFehler: true });
  const nein = await werbePrueferLaden(kaputt, [{ betrieb: A, email: 'a@x.de' }]);
  assert.equal(nein(A, 'a@x.de', { nurWiderspruch: true }).erlaubt, false);
  assert.equal(await werbeFaktenLaden(kaputt, A, ['a@x.de']), null);
});

test('werbeFaktenLaden: hoechstens 500 Adressen je Aufruf', async () => {
  const db = fakeDb();
  const viele = Array.from({ length: 1201 }, (_, i) => `m${i}@x.de`);
  await werbeFaktenLaden(db, A, viele);
  assert.deepEqual(db.rpcs.map((r) => r.args.p_emails.length), [500, 500, 201]);
});

test('erlaubteEmpfaenger + betriebDerSitzung + betreiberKennung', async () => {
  const db = fakeDb({ antwort: { sperren: [], kontakte: [{ email: 'a@x.de', werbe_einwilligung: true }], abos: [] } });
  const r = await erlaubteEmpfaenger(db, A, [{ email: 'a@x.de', id: 1 }, { email: 'b@x.de', id: 2 }]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.erlaubt.map((z) => z.id), [1]);
  assert.equal((await erlaubteEmpfaenger(fakeDb({ rpcFehler: true }), A, [{ email: 'a@x.de' }])).ok, false);
  assert.equal(await betriebDerSitzung({ rpc: async () => ({ data: B }) }, A), B);
  assert.equal(await betriebDerSitzung({ rpc: async () => ({ data: null }) }, A), A);
  assert.equal(betreiberKennung({ ANALYSE_BETREIBER_ID: A.toUpperCase() }), A);
  assert.equal(betreiberKennung({}), null);
});

// ---------------------------------------------------------------- Waechter im Code
test('K6 Autoresponder: Eintragen prueft Einwilligung, Versand prueft vor JEDER Mail', () => {
  const e = ohneKommentare(lies('app/api/autoresponder/eintragen/route.ts'));
  assert.match(e, /werbeFaktenLaden\(admin, betrieb/);
  assert.match(e, /teileEmpfaenger\(/);
  assert.match(e, /if \(!fakten\)[\s\S]{0,220}status: 503/);
  assert.ok(e.indexOf('teileEmpfaenger(') < e.indexOf("from('autoresponder_lauf').insert"), 'Pruefung muss VOR dem Eintragen stehen');
  const v = ohneKommentare(lies('lib/autoresponderVersand.ts'));
  assert.match(v, /werbePrueferLaden\(admin/);
  assert.ok(v.indexOf('erlaubnis.erlaubt') < v.indexOf('sendeMail('), 'Pruefung muss VOR dem Versand stehen');
});

test('H7 Bewertungen: Einwilligung, Werbe-Fuss, List-Unsubscribe, Betrieb als Absender, kein fremder Link', () => {
  for (const p of ['app/api/marketing/bewertung-kampagne/route.ts', 'app/api/bewertung-senden/route.ts']) {
    const s = ohneKommentare(lies(p));
    assert.match(s, /werbeVersandTeile\(/, p);
    assert.match(s, /werbung: true/, p);
    assert.match(s, /kopfzeilen: teile\.kopfzeilen/, p);
    assert.match(s, /kundenPost: true/, p);
    assert.match(s, /betriebDerSitzung\(/, p);
    assert.doesNotMatch(s, /absenderBranding\(supabase, user\.id\)/, p);
  }
  const k = ohneKommentare(lies('app/api/marketing/bewertung-kampagne/route.ts'));
  assert.match(k, /erlaubteEmpfaenger\(admin, betrieb, offen\)/);
  assert.match(k, /owner_user_id: betrieb/);
  const s = ohneKommentare(lies('app/api/bewertung-senden/route.ts'));
  assert.match(s, /werbungErlaubt\(admin, betrieb, an\)/);
  assert.match(s, /\.eq\('token', token\)/);
  assert.doesNotMatch(s, /body\?\.betrieb/);
});

test('H8 Website-Anfrage: Dossier nur mit eigenem Haekchen, alle drei Formulare senden es', () => {
  const r = ohneKommentare(lies('app/api/website-anfrage/route.ts'));
  assert.match(r, /\.dossierSerie === true/);
  assert.match(r, /if \(email && dossierGewuenscht\)/);
  for (const p of ['app/testen/page.tsx', 'app/vorschau/_components/AnfrageFormular.tsx', 'app/vorschau/_components/AngebotAnfrage.tsx']) {
    const s = lies(p);
    assert.match(s, /useState\(false\)/, p);
    assert.match(s, /dossierSerie/, p);
    assert.match(s, /type="checkbox" checked=\{dossierSerie\}/, p);
    assert.doesNotMatch(s, /verwenden wir ausschließlich/, p);
  }
});

test('H9 Termin-Nachfass: Name entschaerft, Abmeldelink + Kopfzeilen, ohne Betreiber keine Mail', () => {
  const s = ohneKommentare(lies('app/api/cron/termin-nachfass/route.ts'));
  assert.match(s, /escapeHtml\(sauber\)/);
  assert.doesNotMatch(s, /Guten Tag \$\{name\}/);
  assert.match(s, /kopfzeilen: teile\.kopfzeilen/);
  assert.match(s, /if \(!betreiber\)/);
  assert.match(s, /FUSS_WIDERSPRUCH/);
});

test('H10 Automationen + Ablaeufe: Betrieb als Absender, Antwort nie an ARGONAUT, Text entschaerft, Werbe-Fuss', () => {
  for (const p of ['app/api/cron/automationen/route.ts', 'lib/ablaufAusfuehren.ts']) {
    const s = ohneKommentare(lies(p));
    assert.match(s, /absenderName: marke\.firma, antwortAn: marke\.email, kundenPost: true/, p);
    assert.match(s, /escapeHtml\(z\)/, p);
    assert.match(s, /werbungErlaubt\(/, p);
    assert.match(s, /werbung: true, abmeldeLink: teile\.abmeldeLink/, p);
    assert.doesNotMatch(s, /sendeMail\(\{ an, betreff, html \}\)/, p);
  }
  assert.match(ohneKommentare(lies('lib/ablaufMotor.ts')), /meldung: `Mail an \$\{an\}`, werbung \}/);
});

test('M7 Abmeldung kanaluebergreifend: jede Abmelde-Route traegt den Widerspruch ueberall ein', () => {
  for (const p of [
    'app/api/newsletter/abmelden/route.ts', 'app/api/autoresponder/abmelden/route.ts',
    'app/api/oeffentlich/freebie-abmelden/route.ts', 'app/api/oeffentlich/rueckhol-abmelden/route.ts',
    'app/api/oeffentlich/dossier-abmelden/route.ts', 'app/api/oeffentlich/werbung-abmelden/route.ts',
    'app/api/marketing/zielgruppe/route.ts',
  ]) assert.match(ohneKommentare(lies(p)), /widerspruchEintragen\(/, p);
  // Newsletter und Serie: GET und POST (One-Click) beide
  for (const p of ['app/api/newsletter/abmelden/route.ts', 'app/api/autoresponder/abmelden/route.ts']) {
    assert.equal((ohneKommentare(lies(p)).match(/widerspruchEintragen\(/g) || []).length, 2, p);
  }
  const w = ohneKommentare(lies('app/api/oeffentlich/werbung-abmelden/route.ts'));
  assert.match(w, /export async function GET/);
  assert.match(w, /export async function POST/);
  assert.match(w, /abmeldeParameterLesen\(/);
});

test('M7 Werbe-Fuss + Sperrliste in Rueckholung, Freebie, Webinar-Nachbereitung, Dossier, Lead-Nachfass', () => {
  for (const p of ['app/api/cron/rueckholung/route.ts', 'app/api/cron/freebie-strecke/route.ts', 'app/api/cron/webinar/route.ts', 'app/api/cron/lead-nachfass/route.ts', 'app/api/cron/dossier-sequenz/route.ts']) {
    const s = ohneKommentare(lies(p));
    assert.match(s, /werbePrueferLaden\(/, p);
    assert.match(s, /kopfzeilen: /, p);
  }
  for (const p of ['app/api/cron/rueckholung/route.ts', 'app/api/cron/freebie-strecke/route.ts', 'app/api/cron/webinar/route.ts', 'app/api/cron/lead-nachfass/route.ts']) {
    const s = ohneKommentare(lies(p));
    assert.match(s, /werbung: true/, p);
    assert.match(s, /kundenPost: true/, p);
  }
  assert.match(lies('lib/dossierSequenz.ts'), /jederzeit widersprechen/);
  assert.doesNotMatch(ohneKommentare(lies('app/api/cron/webinar/route.ts')), /widerspruch\.has\(/);
});

test('M8 Newsletter + A/B-Test: nur erlaubte Empfaenger, A/B mit Kopfzeilen', () => {
  const n = ohneKommentare(lies('app/api/newsletter-versand/route.ts'));
  assert.match(n, /erlaubteEmpfaenger\(createAdminClient\(\), betrieb, alle\)/);
  assert.match(n, /const empfaenger = pruefung\.erlaubt/);
  const ab = ohneKommentare(lies('app/api/newsletter-ab-test/route.ts'));
  assert.match(ab, /erlaubteEmpfaenger\(createAdminClient\(\), betrieb, gruppeRoh\)/);
  assert.match(ab, /kopfzeilen: werbeKopfzeilen\(abmelde, \{ einKlick: true \}\)/);
  assert.match(ab, /kundenPost: true/);
});

test('SQL p173: Sperrliste nur vom Server beschreibbar, werbe_fakten nur service_role, idempotent', () => {
  const s = lies('supabase-sql/p173-werbe-sperre.sql');
  assert.match(s, /create table if not exists public\.werbe_sperre/);
  assert.match(s, /enable row level security/);
  assert.doesNotMatch(s, /for (insert|update|delete|all)/i);
  assert.match(s, /revoke all on function public\.werbe_fakten\(uuid, text\[\]\) from anon;/);
  assert.match(s, /revoke all on function public\.werbe_fakten\(uuid, text\[\]\) from authenticated;/);
  assert.match(s, /grant execute on function public\.werbe_fakten\(uuid, text\[\]\) to service_role;/);
  assert.match(s, /security definer\s+set search_path = public, pg_temp/);
  assert.doesNotMatch(s, /\bdrop table\b|\bdelete from\b|^\s*truncate\b/im);
});
