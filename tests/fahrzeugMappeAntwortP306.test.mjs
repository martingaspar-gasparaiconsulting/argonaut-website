// ============================================================================
// tests/fahrzeugMappeAntwortP306.test.mjs — Paket 306 (10.10.2026) · FM2
// Fahrzeugmappe: Händler antwortet (Angebot unter Vorbehalt, Einladung, Rückfrage,
// Absage), Verkäufer sieht den Stand, Fahrzeughistorie, Löschfrist, Wächter.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  antwortPruefen, kundeAntwortPruefen, berlinZuIso, nachrichtInhalt, standFuerKunde, befundBereinigen, befundAmpel,
  loeschGrund, VORBEHALT_TEXT, NACHREICHEN_TAGE, LOESCHEN_ENTWURF_TAGE, LOESCHEN_ABGELEHNT_TAGE, euroText, tagText,
} from '../out/fahrzeugMappeAntwort.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-10';
const JETZT = Date.parse('2026-10-10T15:00:00Z');
const TAG = 86_400_000;

test('Berliner Zeit -> UTC: Sommer, Winter, Zeitumstellung, Unsinn', () => {
  assert.equal(berlinZuIso('2026-10-14', '10:00'), '2026-10-14T08:00:00.000Z');
  assert.equal(berlinZuIso('2026-12-14', '10:00'), '2026-12-14T09:00:00.000Z');
  assert.equal(berlinZuIso('2026-03-29', '02:30'), null, 'gibt es nicht (Uhr springt vor)');
  assert.equal(berlinZuIso('2026-02-30', '10:00'), null);
  assert.equal(berlinZuIso('2026-10-14', '25:00'), null);
  assert.equal(berlinZuIso('14.10.2026', '10:00'), null);
});

test('Angebot: Betrag deutsch, gültig bis Pflicht und nicht vorbei', () => {
  const a = antwortPruefen({ art: 'angebot', betrag: '13.800,50', gueltig_bis: '2026-10-17', text: ' gern ' }, HEUTE, JETZT);
  assert.deepEqual(a, { ok: true, daten: { art: 'angebot', text: 'gern', betrag: 13800.5, gueltig_bis: '2026-10-17', termin: null } });
  assert.equal(antwortPruefen({ art: 'angebot', betrag: '0', gueltig_bis: '2026-10-17' }, HEUTE, JETZT).ok, false);
  assert.equal(antwortPruefen({ art: 'angebot', betrag: 'abc', gueltig_bis: '2026-10-17' }, HEUTE, JETZT).ok, false);
  assert.equal(antwortPruefen({ art: 'angebot', betrag: '1000' }, HEUTE, JETZT).ok, false);
  assert.equal(antwortPruefen({ art: 'angebot', betrag: '1000', gueltig_bis: '2026-10-09' }, HEUTE, JETZT).ok, false);
  assert.equal(antwortPruefen({ art: 'angebot', betrag: '1000', gueltig_bis: HEUTE }, HEUTE, JETZT).ok, true, 'heute gilt noch');
});

test('Einladung nur in der Zukunft, Rückfrage braucht Text, Absage ohne Text, Unbekanntes nie', () => {
  const e = antwortPruefen({ art: 'einladung', tag: '2026-10-14', uhr: '10:00' }, HEUTE, JETZT);
  assert.equal(e.ok && e.daten.termin, '2026-10-14T08:00:00.000Z');
  assert.equal(antwortPruefen({ art: 'einladung', tag: '2026-10-10', uhr: '16:00' }, HEUTE, JETZT).ok, false, '16:00 Berlin = 14:00 UTC, schon vorbei');
  assert.equal(antwortPruefen({ art: 'einladung', tag: '', uhr: '10:00' }, HEUTE, JETZT).ok, false);
  assert.equal(antwortPruefen({ art: 'rueckfrage', text: 'Foto' }, HEUTE, JETZT).ok, false);
  assert.equal(antwortPruefen({ art: 'rueckfrage', text: 'Bitte Foto vom Unterboden' }, HEUTE, JETZT).ok, true);
  assert.equal(antwortPruefen({ art: 'absage' }, HEUTE, JETZT).ok, true);
  for (const x of ['antwort', 'termin_ok', 'loeschen', null]) assert.equal(antwortPruefen({ art: x }, HEUTE, JETZT).ok, false, String(x));
});

test('Verkäufer: Nachricht braucht Text, Termin passt geht ohne, sonst nichts', () => {
  assert.deepEqual(kundeAntwortPruefen({ art: 'termin_ok' }), { ok: true, art: 'termin_ok', text: null });
  assert.equal(kundeAntwortPruefen({ art: 'antwort', text: '  ' }).ok, false);
  assert.equal(kundeAntwortPruefen({ art: 'antwort', text: 'Mittwoch?' }).ok, true);
  assert.equal(kundeAntwortPruefen({ art: 'angebot', text: 'x' }).ok, false, 'Verkäufer kann kein Angebot fälschen');
  assert.equal(kundeAntwortPruefen({ art: 'nachgereicht' }).ok, false, 'nachgereicht nur über die eigene Aktion');
});

test('Texte: Angebot immer mit Vorbehalt, Einladung mit Termin, Rückfrage mit Frist', () => {
  const a = nachrichtInhalt({ art: 'angebot', betrag: 13800, gueltig_bis: '2026-10-17', text: null, termin: null }, 'Autohaus Müller');
  assert.equal(a.titel, `Angebot: ${euroText(13800)}`);
  assert.ok(a.zeilen.includes(VORBEHALT_TEXT));
  assert.match(a.zeilen[0], /Autohaus Müller bietet Ihnen 13\.800 € .* gültig bis 17\.10\.2026/);
  assert.match(VORBEHALT_TEXT, /vorbehaltlich der Besichtigung/);
  const e = nachrichtInhalt({ art: 'einladung', termin: '2026-10-14T08:00:00.000Z', text: null, betrag: null, gueltig_bis: null }, '');
  assert.match(e.zeilen[0], /Das Autohaus schlägt Ihnen einen Termin vor: .*14\.10\.2026.*10:00 Uhr/);
  assert.match(nachrichtInhalt({ art: 'rueckfrage', text: 'Unterboden', betrag: null, gueltig_bis: null, termin: null }, 'X').zeilen.join(' '), new RegExp(`Unterboden.*${NACHREICHEN_TAGE} Tage`));
  assert.equal(tagText('2026-01-05'), '05.01.2026');
});

test('Stand für den Verkäufer folgt der letzten Antwort des Händlers', () => {
  const n = (von, art, t) => ({ von, art, erstellt_am: t });
  assert.equal(standFuerKunde([], null, JETZT).stufe, 'pruefung');
  assert.equal(standFuerKunde([n('haendler', 'rueckfrage', '2026-10-10T10:00Z')], new Date(JETZT + TAG).toISOString(), JETZT).stufe, 'rueckfrage');
  assert.equal(standFuerKunde([n('haendler', 'rueckfrage', '2026-10-10T10:00Z')], new Date(JETZT - 1).toISOString(), JETZT).stufe, 'pruefung', 'Frist vorbei');
  assert.equal(standFuerKunde([n('haendler', 'angebot', '2026-10-10T10:00Z'), n('kunde', 'antwort', '2026-10-10T11:00Z')], null, JETZT).stufe, 'angebot');
  assert.equal(standFuerKunde([n('haendler', 'angebot', '2026-10-10T10:00Z'), n('haendler', 'einladung', '2026-10-10T12:00Z')], null, JETZT).stufe, 'einladung');
  assert.equal(standFuerKunde([n('haendler', 'einladung', '2026-10-10T12:00Z'), n('haendler', 'absage', '2026-10-10T13:00Z')], null, JETZT).stufe, 'absage');
});

test('Befund der Fahrzeughistorie: nur bekannte Werte, Ampel kritisch vor auffällig', () => {
  assert.deepEqual(befundBereinigen({ km: 'ok', unfall: 'hack', x: 1, notiz: ' Hagel 2022 ' }), { km: 'ok', unfall: 'offen', diebstahl: 'offen', notiz: 'Hagel 2022' });
  assert.deepEqual(befundBereinigen([]), { km: 'offen', unfall: 'offen', diebstahl: 'offen' });
  assert.equal(befundAmpel({ km: 'ok', unfall: 'ok', diebstahl: 'ok' }), 'ok');
  assert.equal(befundAmpel({ km: 'ok', unfall: 'auffaellig', diebstahl: 'ok' }), 'warn');
  assert.equal(befundAmpel({ km: 'auffaellig', unfall: 'kritisch', diebstahl: 'ok' }), 'bad');
  assert.equal(befundAmpel({ km: 'ok', unfall: 'offen', diebstahl: 'ok' }), 'dim');
});

test('Löschfrist: Entwurf 30 Tage, Ankauf weg sofort, Absage 90 Tage, sonst nie', () => {
  assert.equal(LOESCHEN_ENTWURF_TAGE, 30, 'Frist steht so im Hilfetext und bei der Absage');
  assert.equal(LOESCHEN_ABGELEHNT_TAGE, 90);
  assert.match(lies('lib/guideWissen.ts'), /nie abgeschickte Mappen nach 30 Tagen, Mappen zu „Nicht angekauft" 90 Tage/);
  assert.match(lies('app/dashboard/kfz/ankauf/[id]/MappeAntwort.tsx'), /nach 90 Tagen automatisch gelöscht/);
  const alt = (tage) => new Date(JETZT - tage * TAG).toISOString();
  assert.equal(loeschGrund({ id: '1', status: 'entwurf', erstellt_am: alt(LOESCHEN_ENTWURF_TAGE + 1), ankauf_id: null }, JETZT), 'entwurf');
  assert.equal(loeschGrund({ id: '1', status: 'entwurf', erstellt_am: alt(LOESCHEN_ENTWURF_TAGE - 1), ankauf_id: null }, JETZT), null);
  assert.equal(loeschGrund({ id: '1', status: 'eingereicht', erstellt_am: alt(1), ankauf_id: null }, JETZT), 'ohne_ankauf');
  assert.equal(loeschGrund({ id: '1', status: 'eingereicht', erstellt_am: alt(200), ankauf_id: 'a', ankauf_status: 'abgelehnt', ankauf_geaendert: alt(LOESCHEN_ABGELEHNT_TAGE + 1) }, JETZT), 'abgelehnt');
  assert.equal(loeschGrund({ id: '1', status: 'eingereicht', erstellt_am: alt(200), ankauf_id: 'a', ankauf_status: 'abgelehnt', ankauf_geaendert: alt(LOESCHEN_ABGELEHNT_TAGE - 1) }, JETZT), null);
  for (const st of ['offen', 'angeboten', 'angekauft']) assert.equal(loeschGrund({ id: '1', status: 'eingereicht', erstellt_am: alt(999), ankauf_id: 'a', ankauf_status: st, ankauf_geaendert: alt(999) }, JETZT), null, st);
});

test('WÄCHTER SQL: Händler/Verkäufer getrennt, Vorbehalt-Pflichtfelder, Nachziehen in der Datenbank', () => {
  const sql = lies('supabase-sql/p306-fahrzeugmappe-antwort.sql');
  assert.match(sql, /von = 'haendler' and art in \('angebot', 'rueckfrage', 'einladung', 'absage'\)/);
  assert.match(sql, /art <> 'angebot' or \(betrag is not null and gueltig_bis is not null\)/);
  assert.match(sql, /with check \(auth\.uid\(\) = owner_user_id and von = 'haendler'\)/);
  assert.match(sql, /darf_ich_modul_aendern\('kfz'\) and von = 'haendler'\)/);
  assert.ok(!/for update to authenticated|for delete to authenticated/.test(sql.split('kfz_mappe_nachricht').slice(1).join('')), 'Verlauf nicht änderbar/löschbar');
  assert.match(sql, /interval '14 days'/);
  assert.equal(NACHREICHEN_TAGE, 14);
  assert.match(sql, /status in \('offen', 'angeboten'\)/, 'angekaufte Fahrzeuge fasst die Antwort nie an');
  assert.match(sql, /m\.status = 'eingereicht' and m\.nachreichen_bis is not null and m\.nachreichen_bis > now\(\)/);
});

test('WÄCHTER Routen: Händler nur mit Login + Datenbank, Verkäufer nur Kunden-Arten, Cron mit Schloss', () => {
  const h = lies('app/api/kfz/fahrzeugmappe/route.ts');
  const post = h.slice(h.indexOf('export async function POST'));
  assert.ok(post.indexOf('auth.getUser()') < post.indexOf("from('kfz_mappe_nachricht').insert"), 'Login vor dem Eintrag');
  assert.ok(post.indexOf("from('kfz_mappe_nachricht').insert") < post.indexOf('createAdminClient()'), 'Eintrag mit Login, Dienst-Rolle erst danach');
  assert.ok(post.includes("von: 'haendler'"));
  const k = lies('app/api/oeffentlich/fahrzeugmappe/route.ts');
  assert.ok(k.includes("von: 'kunde'") && !/von: 'haendler'/.test(k));
  assert.ok(k.includes('kundeAntwortPruefen(b)'));
  assert.ok(k.includes("if (!entwurf && p.fach.max === 1) return KEIN(409"), 'Nachreichen ersetzt nie ein Foto');
  assert.ok(k.includes("if (!entwurf && Date.parse(d.erstellt_am) < nachreichenAb) return KEIN(409"), 'Eingereichtes löscht nur das Autohaus');
  const c = lies('app/api/cron/fahrzeugmappe-loeschen/route.ts');
  assert.ok(c.indexOf('cronGuard(req)') > 0 && c.indexOf('cronGuard(req)') < c.indexOf('createAdminClient()'));
  assert.ok(c.indexOf('.storage.from(MAPPE_BUCKET).remove') < c.indexOf("from('kfz_mappe').delete()"), 'erst Dateien, dann Eintrag');
  const v = JSON.parse(lies('vercel.json'));
  assert.ok(v.crons.some((x) => x.path === '/api/cron/fahrzeugmappe-loeschen' && /^\d+ \d+ \* \* \*$/.test(x.schedule)));
  const start = lies('app/api/oeffentlich/fahrzeugmappe/start/route.ts');
  assert.ok(start.includes('token_verschluesselt: verschluessele(token)'));
  assert.ok(!/token_verschluesselt/.test(k.replace(/\/\/.*$/gm, '')), 'Verkäufer-Tür gibt den verschlüsselten Schlüssel nie heraus');
});
