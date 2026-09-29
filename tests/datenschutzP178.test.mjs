// Paket 178 (29.09.2026) — Datenschutzerklaerung passt zum Code:
// keine falschen Zusicherungen, jeder genutzte Dienst genannt, Kundenseiten-Vorlage
// je Baustein, Videos erst nach Klick, Server-Funktionen in Frankfurt.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DSE_ABSCHNITTE, DSE_EMPFAENGER, DSE_STAND } from '../out/datenschutzInhalt.js';
import { datenschutzText } from '../out/webRecht.js';
import { seiteHtml, webDiensteDerSeite } from '../out/webBloecke.js';
import { videoEinbettung } from '../out/landingpages.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const alsText = () => JSON.stringify(DSE_ABSCHNITTE);
const empfaenger = () => DSE_EMPFAENGER.zeilen.map((z) => z[0]).join(' | ');

test('Keine falschen Zusicherungen mehr (Anonymisierung, Personenbezug entfernt, 10 Jahre)', () => {
  const t = alsText();
  assert.doesNotMatch(t, /\(anonymisiert/i);
  assert.doesNotMatch(t, /Personenbezogene Daten werden vor der Übermittlung entfernt/);
  assert.doesNotMatch(t, /anonymisierte Chunks|anonymisierte Textfragmente/i);
  assert.doesNotMatch(t, /Rückführung .* technisch ausgeschlossen/);
  assert.match(t, /werden nicht anonymisiert/);
  assert.match(t, /Buchungsbelege und Rechnungen 8 Jahre/);
  assert.doesNotMatch(t, /KI-Agenten|KI-Crew/);
});

test('Jeder Dienst, den der Code anspricht, steht in der Empfaengerliste', () => {
  const e = empfaenger();
  const pflicht = [
    [/Supabase/, 'lib/supabase-server.ts'],
    [/Vercel/, 'vercel.json'],
    [/Hostinger/, 'lib/dossierPdf.ts'],
    [/Resend/, 'lib/mail.ts'],
    [/Anthropic/, 'lib/ki.ts'],
    [/Voyage/, 'app/api/crm-followup/route.ts'],
    [/Ersatz-KI/, 'lib/kiRueckfall.ts'],
    [/360dialog/, 'lib/whatsapp.ts'],
  ];
  for (const [muster, datei] of pflicht) {
    assert.ok(fs.existsSync(path.join(WURZEL, datei)), datei);
    assert.match(e, muster, `${muster} fehlt in der Empfaengerliste`);
  }
  // Belege im Code: Voyage, Resend, Ersatz-KI werden wirklich genutzt.
  assert.match(lies('app/api/crm-followup/route.ts'), /api\.voyageai\.com/);
  assert.match(lies('lib/kiRueckfall.ts'), /KI_RUECKFALL_URL/);
});

test('Voyage: Widerspruch gegen Training steht drin (Martin setzt das Opt-out vor dem Push)', () => {
  assert.match(alsText(), /Der Nutzung dieser Inhalte zum Training haben wir widersprochen/);
});

test('Pflichtabschnitte vorhanden: Rollen, Messung, Werbung, KI-Berater, Gesundheit, Rechte, Drittland', () => {
  const ids = DSE_ABSCHNITTE.map((a) => a.id);
  for (const id of ['verantwortlicher', 'rollen', 'besuch', 'messung', 'cookies', 'anfragen', 'werbung', 'ki-berater', 'konto', 'ki', 'gesundheit', 'empfaenger', 'speicherdauer', 'rechte', 'sicherheit']) {
    assert.ok(ids.includes(id), id);
  }
  assert.equal(new Set(ids).size, ids.length, 'jede Kennung nur einmal');
  const t = alsText();
  assert.match(t, /Art\. 28 DSGVO/);
  assert.match(t, /Double-Opt-in/);
  assert.match(t, /Art\. 21 DSGVO/);
  assert.match(t, /Art\. 77 DSGVO/);
  assert.match(t, /Art\. 46 Abs\. 2 lit\. c DSGVO/);
  assert.match(t, /§ 25 Abs\. 2 Nr\. 2 TDDDG/);
  assert.match(t, /Art\. 9 DSGVO/);
  assert.match(DSE_STAND, /2026/);
});

test('Messung wie beschrieben: kein Cookie, kein Speicher auf dem Geraet, IP nicht gespeichert', () => {
  const js = lies('public/analyse.js');
  assert.doesNotMatch(js.replace(/\/\*[\s\S]*?\*\//g, ''), /localStorage|sessionStorage|document\.cookie/);
  const r = lies('app/api/oeffentlich/analyse/route.ts');
  assert.match(r, /createHash\('sha256'\)/);
  assert.doesNotMatch(r, /ip:\s*ipRoh|ip_adresse:\s*ipRoh/);
});

test('Server-Funktionen fest in Frankfurt (sonst stimmt die Erklaerung nicht)', () => {
  const v = JSON.parse(lies('vercel.json'));
  assert.deepEqual(v.regions, ['fra1']);
  assert.ok(Array.isArray(v.crons) && v.crons.length > 0, 'Zeitplaene bleiben erhalten');
  assert.match(empfaenger() + JSON.stringify(DSE_EMPFAENGER.zeilen), /Frankfurt/);
});

test('Seite zeigt nur den ausgelagerten Inhalt an', () => {
  const s = lies('app/datenschutz/page.tsx');
  assert.match(s, /from '@\/lib\/datenschutzInhalt'/);
  assert.match(s, /DSE_ABSCHNITTE\.map\(\(a, i\) => \([\s\S]{0,260}a\.teile\.map\(\(t, j\) => <Teil key=\{j\} teil=\{t\} \/>\)/);
  assert.doesNotMatch(s, /anonymisiert/);
});

test('Kundenseiten-Vorlage: ohne Angaben alle Abschnitte mit „falls eingebaut"', () => {
  const t = datenschutzText({ firma: 'Muster GmbH', email: 'info@muster.de' });
  for (const w of ['Cookiefreie Reichweitenmessung', 'Newsletter', 'KI-Berater', 'YouTube', 'Google Maps', 'WhatsApp', 'Shop', 'Art. 28 DSGVO']) {
    assert.ok(t.includes(w), w);
  }
  assert.match(t, /\(falls auf dieser Website eingebaut\)/);
  assert.match(t, /Muster GmbH, E-Mail: info@muster\.de/);
});

test('Kundenseiten-Vorlage: nur die Bausteine, die auf der Seite stehen', () => {
  const d = webDiensteDerSeite([{ typ: 'hero' }, { typ: 'kontakt' }, { typ: 'video' }]);
  assert.deepEqual(d, { kontakt: true, newsletter: false, termine: false, shop: false, chatbot: false, video: true, karte: false, whatsapp: false });
  const t = datenschutzText({ firma: 'Muster' }, d);
  assert.match(t, /Kontakt- und Anfrageformular/);
  assert.match(t, /Videos von YouTube und Vimeo/);
  assert.doesNotMatch(t, /KI-Berater|Newsletter|Google Maps|Bestellungen im Shop/);
  assert.doesNotMatch(t, /falls auf dieser Website eingebaut/);
  // Nummerierung laeuft ohne Luecken
  const nummern = [...t.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(nummern, nummern.map((_, i) => i + 1));
  assert.deepEqual(webDiensteDerSeite([{ typ: 'einblendung' }]).newsletter, true);
});

test('Veroeffentlichte Kundenseite: Datenschutz passt zu den Bausteinen, Video erst nach Klick', () => {
  const html = seiteHtml({ bloecke: [
    { typ: 'video', titel: 'Film', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { typ: 'video', titel: 'Film 2', url: 'https://vimeo.com/123456' },
  ] }, { firma: 'Muster' }, 2026, { oeffentlichId: 'abc' });
  assert.doesNotMatch(html, /i\.ytimg\.com/, 'kein Vorschaubild von Google beim Laden');
  assert.doesNotMatch(html, /<iframe[^>]+vimeo/, 'kein Vimeo-Player beim Laden');
  assert.match(html, /data-embed="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?autoplay=1"/);
  assert.match(html, /data-embed="https:\/\/player\.vimeo\.com\/video\/123456\?autoplay=1&amp;dnt=1"/);
  assert.match(html, /Videos von YouTube und Vimeo/);
  assert.doesNotMatch(html, /KI-Berater im Chat/);
});

test('Landingpages: YouTube im erweiterten Datenschutzmodus, Player erst nach Klick', () => {
  assert.equal(videoEinbettung('https://youtu.be/dQw4w9WgXcQ').embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(videoEinbettung('https://vimeo.com/123456').embedUrl, 'https://player.vimeo.com/video/123456?dnt=1');
  const s = lies('app/lp/[slug]/page.tsx');
  assert.match(s, /videoFrei \? \(\s*<iframe/);
  assert.match(s, /onClick=\{\(\) => setVideoFrei\(true\)\}/);
});
