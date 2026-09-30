// Paket 168 (29.09.2026) — Ablauf per Knopf direkt in den Modulen (mit Vorgang).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pruefeAblauf, KNOPF_MODULE, knopfModul, ausloeserHatVorgang, ausloeserText, ausloeserIstWerbung } from '../out/ablauf.js';
import { ausloeserZiel, aktionPlanen, laufbereit } from '../out/ablaufMotor.js';
import { aktionenFuer } from '../out/ablaufEditor.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const JETZT = new Date('2026-09-29T10:00:00Z');
const knopf = (modul) => ({ art: 'knopf', modul });
const akt = (aktion, config, id = 's1') => ({ id, typ: 'aktion', aktion, config });
const ablauf = (a, schritte) => ({ name: 'K', ausloeser: a, schritte, aktiv: true });

test('Module: Kunde, Anfrage, Auftrag, Projekt — nie Rechnung oder Angebot', () => {
  assert.deepEqual(KNOPF_MODULE.map((k) => k.modul), ['kontakte', 'leads', 'auftraege', 'projekte']);
  for (const m of ['rechnungen', 'angebote', 'rechnung', 'angebot', '']) assert.equal(knopfModul(m), undefined, m);
  assert.ok(pruefeAblauf(ablauf(knopf('angebote'), [akt('glocke', { text: 'x' })])).fehler.some((f) => /keinen Ablauf-Knopf/.test(f)));
  assert.equal(ausloeserHatVorgang(knopf('auftraege')), true);
  assert.equal(ausloeserText(knopf('auftraege')), 'Per Knopf auf der Seite Auftrag');
});

test('Einschaltbar mit Vorgang: Status, Notiz, Mail an den Kunden, Wenn — Mahnstufe nie', () => {
  const a = ablauf(knopf('auftraege'), [
    akt('status_aendern', { neuer_status: 'in_arbeit' }, 'a'),
    akt('notiz_anhaengen', { text: 'per Knopf' }, 'b'),
    { id: 'w', typ: 'wenn', bedingung: { verknuepfung: 'und', regeln: [{ feld: 'status', operator: 'nicht_leer' }] }, dann: [akt('glocke', { text: '{{nummer}}' }, 'c')], sonst: [] },
  ]);
  const p = pruefeAblauf(a);
  assert.deepEqual(p.fehler, []);
  assert.equal(p.aktivierbar, true);
  assert.equal(laufbereit(a), true);
  assert.ok(!aktionenFuer(knopf('auftraege')).some((x) => x.key === 'mahnstufe_erhoehen'), 'Mahnstufe nur bei Rechnungen');
  assert.ok(aktionenFuer(knopf('kontakte')).some((x) => x.key === 'status_aendern'));
});

test('Ziel des Knopfs = Datensatz der Seite; Anfragen ohne Notizfeld', () => {
  assert.deepEqual(ausloeserZiel(knopf('kontakte')), { tabelle: 'kontakte', zielTyp: 'kontakt', datumFeld: '' });
  assert.deepEqual(ausloeserZiel(knopf('projekte')), { tabelle: 'projekte', zielTyp: 'projekt', datumFeld: '' });
  assert.equal(ausloeserZiel(knopf('rechnungen')), null);
  assert.equal(ausloeserZiel({ art: 'knopf' }), null);
  const z = ausloeserZiel(knopf('auftraege'));
  const n = aktionPlanen(akt('notiz_anhaengen', { text: 'x' }), { name: 'K', ausloeser: knopf('auftraege') }, z, 'chef1', { id: 'a1', notizen: 'alt' }, JETZT);
  assert.deepEqual(n.daten, { notizen: 'alt\nx' }, 'Aufträge: Spalte notizen');
  const l = aktionPlanen(akt('notiz_anhaengen', { text: 'x' }), { name: 'K', ausloeser: knopf('leads') }, ausloeserZiel(knopf('leads')), 'chef1', { id: 'l1', nachricht: 'Bitte Rückruf' }, JETZT);
  assert.equal(l.art, 'fehler', 'die Nachricht des Anfragenden wird nie überschrieben');
  assert.ok(pruefeAblauf(ablauf(knopf('leads'), [akt('notiz_anhaengen', { text: 'x' })])).fehler.some((f) => /kein Notizfeld/.test(f)));
  assert.ok(pruefeAblauf(ablauf({ art: 'ereignis', ereignis: 'lead_eingegangen', filter: null }, [akt('notiz_anhaengen', { text: 'x' })])).fehler.some((f) => /kein Notizfeld/.test(f)), 'auch beim Ereignis');
});

test('Werbung: Mail aus dem Kunden-Knopf nur mit Einwilligung, aus dem Auftrag nicht', () => {
  assert.equal(ausloeserIstWerbung(knopf('kontakte')), true);
  assert.equal(ausloeserIstWerbung(knopf('auftraege')), false);
  const z = ausloeserZiel(knopf('kontakte'));
  const m = aktionPlanen(akt('mail_senden', { an: 'kunde', betreff: 'Hallo', text: 'x' }), { name: 'K', ausloeser: knopf('kontakte') }, z, 'chef1', { id: 'k1', email: 'a@b.de' }, JETZT);
  assert.equal(m.art, 'uebersprungen', 'ohne Einwilligung keine Mail');
  const za = ausloeserZiel(knopf('auftraege'));
  const ma = aktionPlanen(akt('mail_senden', { an: 'kunde', betreff: 'Auftrag', text: 'x' }), { name: 'K', ausloeser: knopf('auftraege') }, za, 'chef1', { id: 'a1', email: 'a@b.de' }, JETZT);
  assert.equal(ma.art, 'mail');
});

test('Code-Wächter: Start lädt den Vorgang selbst, nur Chef, einmal je Vorgang; Knöpfe nur für den Chef; Rechnung/Angebot unberührt', () => {
  const s = lies('app/api/ablaeufe/start/route.ts');
  assert.match(s, /auth\.getUser\(\)/);
  // Paket 192 (bewusste Aenderung, Martin 29.09.): auch Mitarbeiter mit Schreibrecht, wenn der Ablauf es erlaubt.
  assert.match(s, /darfKnopfStarten\(ablauf, wer, /);
  assert.match(s, /if \(!recht\.ja\) return NextResponse\.json\(\{ ok: false, error: recht\.grund \}, \{ status: 403 \}\)/);
  assert.match(s, /\.from\('ablaeufe'\)\.select\('\*'\)\.eq\('id', body\.id\)\.eq\('owner_user_id', betrieb\)/);
  assert.match(s, /\.from\(ziel\.tabelle\)\.select\('\*'\)\.eq\('id', vorgangId\)\.eq\('owner_user_id', betrieb\)/, 'Vorgang serverseitig, nur des Betriebs');
  assert.match(s, /lief für diesen Vorgang schon/);
  assert.match(s, /freieStarts\(count \?\? 0\) <= 0/, 'Deckel');
  assert.match(s, /const db = recht\.alsMitarbeiter \? admin : supabase;/, 'Chef weiter mit Anmeldung (RLS), Service-Schluessel nur fuer Mitarbeiter');
  const k = lies('app/api/ablaeufe/knoepfe/route.ts');
  assert.match(k, /auth\.getUser\(\)/);
  assert.match(k, /\.eq\('owner_user_id', betrieb\)\.eq\('aktiv', true\)/, 'nur des eigenen Betriebs, eingeschaltete');
  assert.match(k, /darfKnopfStarten\(a, wer, heute\)\.ja/, 'dieselbe Regel wie beim Start');
  assert.match(k, /laufbereit\(a\)/);
  assert.ok(!/schritte:/.test(k.slice(k.indexOf('.map(('))), 'keine Schritte nach außen');
  for (const [datei, modul] of [['app/dashboard/crm/[id]/page.tsx', 'kontakte'], ['app/dashboard/auftraege/[id]/page.tsx', 'auftraege'], ['app/dashboard/projekte/[id]/page.tsx', 'projekte'], ['app/dashboard/leads/[id]/page.tsx', 'leads']]) {
    assert.match(lies(datei), new RegExp(`<AblaufKnoepfe modul="${modul}"`), datei);
  }
  for (const d of ['app/dashboard/rechnungen', 'app/dashboard/angebote']) {
    if (!fs.existsSync(path.join(WURZEL, d))) continue;
    const alle = fs.readdirSync(path.join(WURZEL, d), { recursive: true }).filter((f) => String(f).endsWith('.tsx'));
    for (const f of alle) assert.ok(!/AblaufKnoepfe/.test(lies(path.join(d, String(f)))), `${d}/${f} bleibt unberührt`);
  }
});
