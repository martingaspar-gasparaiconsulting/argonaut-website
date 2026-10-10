// ============================================================================
// tests/fahrzeugMappeP305.test.mjs — Paket 305 (10.10.2026) · FM1 Fahrzeugmappe
// Verkäufer schickt EINEM Autohaus Fahrzeugschein, Fotos, Schäden, Videos,
// Unterlagen. Fächer, Dateiprüfung, Platz, Vollständigkeit, Schärfe-Messung,
// Angaben, Knopf für fremde Webseiten, Menüpunkt, Wächter an Routen und SQL.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  FAECHER, MIME_JE_ART, MAX_BYTES, MAX_DATEIEN, dateiPruefen, mappePfad, platzFrei, vollstaendigkeit, zusammenfassung,
  bildMesswerte, bildUrteil, pruefungSauber, angabenBereinigen, notizZusatz, wunschText, knopfHtml, verkaufenLinkGueltig,
  tokenGueltig, einwilligungText, mappeDatenschutz, mimeSauber, zielGroesse, fachZu, preisVorstellung,
} from '../out/fahrzeugMappe.js';
import { seiteHtml } from '../out/webBloecke.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const B = '11111111-1111-4111-8111-111111111111';
const M = '22222222-2222-4222-8222-222222222222';
const D = '33333333-3333-4333-8333-333333333333';
const K = 'abcdefghijklmnopqrstuvwx';

test('Fächer: eindeutig, passen zur Datenbank-Regel, 10 Pflichtteile, Summe unter dem Deckel', () => {
  const keys = FAECHER.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const k of keys) assert.match(k, /^[a-z_]{2,30}$/);
  const pflicht = FAECHER.filter((f) => f.pflicht).map((f) => f.key);
  assert.deepEqual(pflicht, ['schein', 'vorne_links', 'hinten_rechts', 'seite_links', 'seite_rechts', 'innen_vorne', 'tacho', 'reifen', 'kofferraum', 'kaltstart']);
  assert.ok(FAECHER.reduce((n, f) => n + f.max, 0) <= MAX_DATEIEN);
  assert.equal(fachZu('gibtsnicht'), null);
});

test('Dateiarten im Code = Dateiarten im SQL (Tabelle und Speicherordner), 50 MB überall', () => {
  const sql = lies('supabase-sql/p305-fahrzeugmappe.sql');
  const imCode = [...new Set(Object.values(MIME_JE_ART).flat())].sort();
  for (const m of imCode) assert.ok(sql.split(`'${m}'`).length - 1 >= 2, `${m} fehlt im SQL`);
  assert.ok(!/text\/html|image\/svg/.test(sql));
  assert.equal(Math.max(...Object.values(MAX_BYTES)), 52428800);
  assert.ok(sql.includes('52428800'));
  assert.ok(sql.includes(`n >= ${MAX_DATEIEN}`));
});

test('Dateiprüfung: richtige Art je Fach, Größe, leer, Anhängsel am Typ', () => {
  assert.equal(dateiPruefen({ fach: 'tacho', mime: 'image/jpeg', bytes: 1000 }).ok, true);
  assert.equal(dateiPruefen({ fach: 'tacho', mime: 'video/mp4', bytes: 1000 }).ok, false);
  assert.equal(dateiPruefen({ fach: 'tacho', mime: 'application/pdf', bytes: 1000 }).ok, false);
  assert.equal(dateiPruefen({ fach: 'tuev', mime: 'application/pdf', bytes: 1000 }).ok, true);
  assert.equal(dateiPruefen({ fach: 'schein', mime: 'image/heic', bytes: 1000 }).ok, true);
  assert.equal(dateiPruefen({ fach: 'kaltstart', mime: 'video/webm;codecs=vp9,opus', bytes: 1000 }).ok, true);
  assert.equal(dateiPruefen({ fach: 'kaltstart', mime: 'video/mp4', bytes: 51 * 1024 * 1024 }).ok, false);
  assert.match(dateiPruefen({ fach: 'kaltstart', mime: 'video/mp4', bytes: 80 * 1024 * 1024 }).fehler, /kürzer/);
  assert.equal(dateiPruefen({ fach: 'vorne_links', mime: 'image/jpeg', bytes: 16 * 1024 * 1024 }).ok, false);
  assert.equal(dateiPruefen({ fach: 'tuev', mime: 'application/pdf', bytes: 21 * 1024 * 1024 }).ok, false);
  for (const boese of ['text/html', 'image/svg+xml', 'application/javascript', '', null]) assert.equal(dateiPruefen({ fach: 'tuev', mime: boese, bytes: 10 }).ok, false, String(boese));
  assert.equal(dateiPruefen({ fach: 'tacho', mime: 'image/jpeg', bytes: 0 }).ok, false);
  assert.equal(dateiPruefen({ fach: 'tacho', mime: 'image/jpeg', bytes: '9' }).ok, false);
  assert.equal(dateiPruefen({ fach: 'xx', mime: 'image/jpeg', bytes: 9 }).ok, false);
  assert.equal(mimeSauber(' Video/MP4 ; codecs=avc1'), 'video/mp4');
});

test('Ablagepfad nur aus geprüften Kennungen', () => {
  assert.equal(mappePfad(B, M, D, 'jpg'), `${B}/${M}/${D}.jpg`);
  assert.equal(mappePfad('../x', M, D, 'jpg'), null);
  assert.equal(mappePfad(B, M, D, 'j/pg'), null);
  assert.equal(mappePfad(B, 'kunde-mueller', D, 'jpg'), null);
});

test('Platz im Fach: Einzelfach wird ersetzt, Sammelfach hat Grenze, Mappe hat Deckel', () => {
  const tacho = fachZu('tacho'); const weitere = fachZu('weitere');
  assert.deepEqual(platzFrei(tacho, 0, 0), { ok: true, ersetzen: false });
  assert.deepEqual(platzFrei(tacho, 1, 5), { ok: true, ersetzen: true });
  assert.equal(platzFrei(weitere, 11, 20).ok, true);
  assert.equal(platzFrei(weitere, 12, 20).ok, false);
  assert.equal(platzFrei(weitere, 0, MAX_DATEIEN).ok, false);
});

test('Vollständigkeit zählt nur fertige Dateien; Zusammenfassung je Gruppe', () => {
  const pflicht = FAECHER.filter((f) => f.pflicht);
  const alle = pflicht.map((f) => ({ fach: f.key, status: 'fertig' }));
  assert.equal(vollstaendigkeit(alle).fehlend.length, 0);
  assert.equal(vollstaendigkeit(alle).prozent, 100);
  const ohneTacho = alle.map((d) => (d.fach === 'tacho' ? { ...d, status: 'reserviert' } : d));
  assert.deepEqual(vollstaendigkeit(ohneTacho).fehlend.map((f) => f.key), ['tacho']);
  assert.equal(vollstaendigkeit([]).prozent, 0);
  const z = zusammenfassung([...alle, { fach: 'schaden', status: 'fertig' }, { fach: 'tuev', status: 'fertig' }, { fach: 'tuev', status: 'reserviert' }]);
  assert.deepEqual(z, { fotos: 8, schaeden: 1, videos: 1, unterlagen: 1, schein: 1 });
});

test('Schärfe: gleichmäßige Fläche = 0, feines Muster = hoch; Hell/Dunkel; Hinweise statt Sperre', () => {
  const w = 40, h = 30;
  const flach = new Uint8ClampedArray(w * h).fill(128);
  assert.deepEqual(bildMesswerte(flach, w, h), { schaerfe: 0, helligkeit: 128 });
  const muster = new Uint8ClampedArray(w * h).map((_, i) => (((i % w) + Math.floor(i / w)) % 2 ? 200 : 60));
  const m = bildMesswerte(muster, w, h);
  assert.ok(m.schaerfe > 1000, String(m.schaerfe));
  assert.equal(bildUrteil(m).stufe, 'gut');
  assert.equal(bildUrteil({ schaerfe: 10, helligkeit: 120 }).stufe, 'unscharf');
  assert.equal(bildUrteil({ schaerfe: 500, helligkeit: 20 }).stufe, 'dunkel');
  assert.equal(bildUrteil({ schaerfe: 500, helligkeit: 250 }).stufe, 'hell');
  assert.equal(bildUrteil(null), null);
  assert.deepEqual(bildMesswerte([1, 2], 1, 2), { schaerfe: 0, helligkeit: 0 });
  assert.deepEqual(pruefungSauber({ schaerfe: 'x', helligkeit: 900, boese: '<script>' }), {});
  assert.deepEqual(pruefungSauber({ schaerfe: 12.345, helligkeit: 100 }), { schaerfe: 12.3, helligkeit: 100, stufe: 'unscharf' });
  assert.deepEqual(zielGroesse(4000, 3000, 640), { breite: 640, hoehe: 480 });
  assert.deepEqual(zielGroesse(300, 200, 640), { breite: 300, hoehe: 200 });
});

test('Angaben: nur bekannte Felder, gekürzt, ohne Steuerzeichen; Wunsch nur zwei Werte', () => {
  const a = angabenBereinigen({ name: 'Max\u0000 Muster', marke: 'VW', fremd: 'x', owner_user_id: 'boese', wunsch: 'hack', gewerblich: 'ja', beschreibung: 'a'.repeat(5000) });
  assert.equal(a.name, 'Max  Muster');
  assert.equal(a.fremd, undefined);
  assert.equal(a.owner_user_id, undefined);
  assert.equal(a.wunsch, undefined);
  assert.equal(a.gewerblich, undefined);
  assert.equal(a.beschreibung.length, 1500);
  assert.equal(angabenBereinigen({ wunsch: 'inzahlungnahme', gewerblich: true }).wunsch, 'inzahlungnahme');
  assert.deepEqual(angabenBereinigen(null), {});
  assert.equal(preisVorstellung('14.500'), 14500);
  assert.equal(preisVorstellung('abc'), null);
});

test('Notiz am Ankauf: Wunsch und Inhalt der Mappe, Einzahl/Mehrzahl', () => {
  const t = notizZusatz('inzahlungnahme', { fotos: 1, schaeden: 2, videos: 1, unterlagen: 0, schein: 1 });
  assert.match(t, /In Zahlung geben/);
  assert.match(t, /1 Foto, 2 Schäden, 1 Video, 0 Unterlagen/);
  assert.equal(wunschText('verkauf'), 'Verkaufen');
  assert.equal(wunschText('irgendwas'), 'Verkaufen');
});

test('Knopf für fremde Webseiten: nur https-Link, maskiert, kein Skript', () => {
  const k = knopfHtml(`https://argonaut-os.com/ankauf/${K}`, '#123456');
  assert.match(k, /^<a href="https:\/\/argonaut-os\.com\/ankauf\/abcdefghijklmnopqrstuvwx"/);
  assert.ok(!/script|onclick|iframe/i.test(k));
  assert.match(knopfHtml('https://autohaus.de/fahrzeug-verkaufen', 'rot'), /background:#0A1628/);
  for (const boese of ['javascript:alert(1)', 'http://x.de/a', 'https://x.de/a"><script>', 'https://x.de/a?x=1']) assert.equal(knopfHtml(boese, '#000000'), null, boese);
});

test('Webseite: Menüpunkt „Fahrzeug verkaufen" nur mit sicherem Pfad', () => {
  const ci = { firma: 'Autohaus Test' };
  assert.ok(!/Fahrzeug verkaufen/.test(seiteHtml({ bloecke: [] }, ci, 2026, {})));
  assert.match(seiteHtml({ bloecke: [] }, ci, 2026, { verkaufenLink: '/fahrzeug-verkaufen' }), /<a href="\/fahrzeug-verkaufen">Fahrzeug verkaufen<\/a>/);
  assert.match(seiteHtml({ bloecke: [] }, ci, 2026, { verkaufenLink: `/ankauf/${K}` }), new RegExp(`<a href="/ankauf/${K}">Fahrzeug verkaufen</a>`));
  for (const boese of ['javascript:alert(1)', 'https://evil.de', '/fahrzeug-verkaufen"><script>', `/ankauf/${K}/x`]) {
    assert.ok(!/Fahrzeug verkaufen/.test(seiteHtml({ bloecke: [] }, ci, 2026, { verkaufenLink: boese })), boese);
    assert.equal(verkaufenLinkGueltig(boese), false);
  }
});

test('Link-Schlüssel, Einwilligung und Datenschutz-Hinweis', () => {
  assert.ok(tokenGueltig('A'.repeat(43)));
  for (const t of ['A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '/', null]) assert.equal(tokenGueltig(t), false);
  assert.match(einwilligungText('Autohaus Müller'), /Autohaus Müller.*widerrufen/);
  assert.match(einwilligungText(''), /das Autohaus/);
  const d = mappeDatenschutz({ name: 'Autohaus Müller', ort: 'Böblingen', email: 'info@mueller.de' });
  assert.match(d, /Verantwortlich: Autohaus Müller, Böblingen, info@mueller\.de/);
  assert.match(d, /Art\. 6 Abs\. 1 lit\. a DSGVO/);
});

test('WÄCHTER Routen: Türen gedeckelt, Betrieb nur aus Kennung, Ersetzen erst nach sicherem Upload', () => {
  const start = lies('app/api/oeffentlich/fahrzeugmappe/start/route.ts');
  const haupt = lies('app/api/oeffentlich/fahrzeugmappe/route.ts');
  const ab = lies('app/api/oeffentlich/fahrzeugmappe/absenden/route.ts');
  for (const [src, tuer] of [[start, 'oeffentlich/fahrzeugmappe/start'], [haupt, 'oeffentlich/fahrzeugmappe'], [ab, 'oeffentlich/fahrzeugmappe/absenden']]) {
    assert.ok(src.includes(`drossel(db, '${tuer}'`), tuer);
    assert.ok(src.includes('betriebZuKennung(db, k)'), tuer);
    assert.ok(!/owner_user_id:\s*b\./.test(src), `${tuer}: Betrieb nie aus der Anfrage`);
  }
  // Ersetzen des alten Fotos erst beim Melden des neuen (sonst ginge bei Abbruch das alte verloren)
  const ziel = haupt.slice(haupt.indexOf("aktion === 'ziel'"), haupt.indexOf("aktion === 'fertig'"));
  assert.ok(!/ersetzen/.test(ziel.replace(/\/\/.*$/gm, '')), 'ziel darf nichts ersetzen');
  const fertig = haupt.slice(haupt.indexOf("aktion === 'fertig'"), haupt.indexOf("aktion === 'loeschen'"));
  assert.ok(fertig.includes('objektGroesse(') && fertig.indexOf('objektGroesse(') < fertig.indexOf("status: 'fertig'"), 'erst prüfen, dann fertig');
  assert.ok(fertig.includes('p.fach.max === 1'));
  assert.ok(haupt.includes("if (!entwurf && !nachreichen) return KEIN(409"), 'nach dem Einreichen nur bei offener Rückfrage (Paket 306)');
  assert.ok(ab.includes('vollstaendigkeit(') && ab.includes("b.einwilligung !== true"));
  assert.ok(ab.includes('EINWILLIGUNG_FASSUNG'));
});

test('WÄCHTER Händler-Tür: erst Login + Datenbank-Regeln, dann signieren; Löschen nur wenn die Datenbank es zulässt', () => {
  const src = lies('app/api/kfz/fahrzeugmappe/route.ts');
  for (const teil of src.split('export async function').slice(1)) {
    assert.ok(teil.indexOf('auth.getUser()') > 0 && teil.indexOf('auth.getUser()') < teil.indexOf('createAdminClient()'), 'Login vor Dienst-Rolle');
    assert.ok(teil.indexOf("supabase.from('kfz_mappe')") < teil.indexOf('createAdminClient()'), 'erst mit Login lesen');
  }
  assert.ok(src.includes("(weg as unknown[]).length !== 1"));
  const seite = lies('app/dashboard/kfz/ankauf/[id]/page.tsx');
  const iMappe = seite.indexOf('/api/kfz/fahrzeugmappe?ankauf=');
  assert.ok(iMappe > 0 && iMappe < seite.indexOf("from('kfz_ankauf').delete()"), 'Mappe vor dem Ankauf löschen');
  assert.ok(/if \(!mr \|\| !mr\.ok\) \{[^}]*return; \}/.test(seite), 'ohne gelöschte Mappe bleibt der Ankauf');
});

test('WÄCHTER Kunden-Seite: kein Supabase im Browser, Kamera direkt, Link-Schlüssel nur im #', () => {
  const src = lies('app/ankauf/FahrzeugMappe.tsx') + lies('app/ankauf/VideoAufnahme.tsx');
  assert.ok(!/@supabase|createBrowserClient|SERVICE_ROLE/.test(src));
  assert.ok(src.includes("setAttribute('capture'"));
  assert.ok(src.includes('getUserMedia'));
  assert.ok(src.includes('#m=${token}'));
  assert.ok(src.includes('history.replaceState'));
  const proxy = lies('proxy.ts');
  assert.ok(proxy.indexOf("pfad === '/fahrzeug-verkaufen'") > 0 && proxy.indexOf("pfad === '/fahrzeug-verkaufen'") < proxy.indexOf('/p-domain/${'), 'Weiche vor der Kundenseite');
  assert.match(lies('app/robots.ts'), /'\/ankauf-domain\/'/);
});
