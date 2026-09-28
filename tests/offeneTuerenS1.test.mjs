// Paket 161 (S1, 28.09.2026) — die offenen Tueren einzeln geprueft:
// Mengen-Deckel, keine offene Umleitung, keine Kalender-Blockade, keine
// wiederbelebte Abmeldung, keine eingeschleusten Links in Mails.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DROSSEL, drossel, drosselSchluessel, drosselText, drosselIp, ZU_VIEL_TEXT, SCHON_GESCHICKT_TEXT } from '../out/drossel.js';
import { OFFENE_TUEREN } from '../out/offeneTueren.js';
import { klickSignatur, klickSignaturGueltig, zwischenseiteHtml } from '../out/mailKlickSignatur.js';
import { klickUrl, messeMit } from '../out/mailMessung.js';
import { dossierBestaetigenHtml, dossierAusliefernHtml } from '../out/dossierMail.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const quelle = (pfad) => fs.readFileSync(path.join(WURZEL, 'app', 'api', pfad, 'route.ts'), 'utf8');

// ---------- lib/drossel.ts ----------

test('Schluessel: Einweg-Hash, nie Klartext, Gross/Klein egal', () => {
  const r = { art: 'ziel', max: 3, fensterSek: 86400 };
  const a = drosselSchluessel('oeffentlich/optin', r, 'Max@Beispiel.de ', 'salz');
  const b = drosselSchluessel('oeffentlich/optin', r, 'max@beispiel.de', 'salz');
  assert.equal(a, b);
  assert.ok(!a.includes('beispiel'), 'keine Mail-Adresse im Schluessel');
  assert.ok(a.length <= 100);
  assert.notEqual(a, drosselSchluessel('oeffentlich/optin', r, 'max@beispiel.de', 'anderes-salz'), 'Salz zaehlt');
  assert.notEqual(a, drosselSchluessel('oeffentlich/lp', r, 'max@beispiel.de', 'salz'), 'je Tuer getrennt');
  assert.equal(drosselSchluessel('oeffentlich/optin', r, '', 'salz'), null, 'ohne Wert nicht zaehlen');
  const g = { art: 'gesamt', max: 5, fensterSek: 60 };
  assert.equal(drosselSchluessel('x', g, null, 's'), drosselSchluessel('x', g, 'egal', 's'));
});

function fakeDb(erlaubtBis = Infinity) {
  const zaehler = new Map();
  const aufrufe = [];
  return {
    aufrufe,
    rpc: async (fn, args) => {
      aufrufe.push({ fn, args });
      const n = (zaehler.get(args.p_schluessel) || 0) + 1;
      zaehler.set(args.p_schluessel, n);
      return { data: n <= Math.min(args.p_max, erlaubtBis), error: null };
    },
  };
}

test('drossel: zaehlt jede Regel, meldet die Art, die greift', async () => {
  const db = fakeDb();
  const werte = { ip: '1.2.3.4', ziel: 'seite|a@b.de' };
  for (let i = 0; i < 5; i++) assert.equal(await drossel(db, 'oeffentlich/web-anfrage', werte, 's'), i < 3 ? null : 'ziel');
  assert.ok(db.aufrufe.every((a) => a.fn === 'drossel_zaehlen'));
  // IP-Deckel 5/Std: sechster Aufruf mit anderer Mail -> ip
  assert.equal(await drossel(db, 'oeffentlich/web-anfrage', { ip: '1.2.3.4', ziel: 'x|y@z.de' }, 's'), 'ip');
  assert.equal(drosselText('ip'), ZU_VIEL_TEXT);
  assert.equal(drosselText('ziel'), SCHON_GESCHICKT_TEXT);
});

test('drossel: kaputter Zaehler sperrt NIE aus (Fehler, Wurf, unbekannte Tuer)', async () => {
  const mitFehler = { rpc: async () => ({ data: null, error: { message: 'function does not exist' } }) };
  const wirft = { rpc: async () => { throw new Error('netz'); } };
  const w = { ip: '1.1.1.1', ziel: 'a@b.de' };
  assert.equal(await drossel(mitFehler, 'oeffentlich/optin', w, 's'), null);
  assert.equal(await drossel(wirft, 'oeffentlich/optin', w, 's'), null);
  assert.equal(await drossel(fakeDb(0), 'gibt-es-nicht', w, 's'), null);
  // ohne IP/Mail wird nicht gezaehlt (statt alle unter „leer" zusammenzuwerfen)
  const db = fakeDb(0);
  assert.equal(await drossel(db, 'oeffentlich/optin', {}, 's'), null);
  assert.equal(db.aufrufe.length, 0);
});

test('drossel: branchen-chat hat einen Gesamt-Deckel (ARGONAUT traegt die KI-Kosten)', async () => {
  assert.ok(DROSSEL['oeffentlich/branchen-chat'].some((r) => r.art === 'gesamt'));
  const db = fakeDb();
  await drossel(db, 'oeffentlich/branchen-chat', { ip: '9.9.9.9' }, 's');
  assert.equal(db.aufrufe.length, DROSSEL['oeffentlich/branchen-chat'].length);
});

test('drosselIp liest den ersten Eintrag von x-forwarded-for', () => {
  assert.equal(drosselIp(new Headers({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' })), '5.6.7.8');
  assert.equal(drosselIp(new Headers({ 'x-real-ip': '5.6.7.9' })), '5.6.7.9');
  assert.equal(drosselIp(null), '');
});

// ---------- Waechter: jede Tuer, die Mails/KI/Buchungen ausloest, hat einen Deckel ----------

const OHNE_DECKEL_ERLAUBT = new Set([
  'bestellung', // dunkel bis BESTELLSTRECKE_LIVE (403) — vor dem Scharfschalten Deckel noetig
]);

test('WAECHTER: Formular- und KI-Tueren haben einen Deckel', () => {
  for (const t of OFFENE_TUEREN) {
    if (t.schutz !== 'formular' && t.schutz !== 'deckel') continue;
    if (OHNE_DECKEL_ERLAUBT.has(t.pfad)) continue;
    assert.ok(DROSSEL[t.pfad], `${t.pfad} ist ${t.schutz}, hat aber keinen Deckel in lib/drossel.ts`);
  }
});

test('WAECHTER: jeder Deckel ist auch wirklich in seiner Route eingebaut', () => {
  const liste = new Set(OFFENE_TUEREN.map((t) => t.pfad));
  for (const pfad of Object.keys(DROSSEL)) {
    assert.ok(liste.has(pfad), `${pfad} steht nicht in lib/offeneTueren.ts`);
    const src = quelle(pfad);
    assert.ok(src.includes("from '@/lib/drossel'"), `${pfad}: lib/drossel wird nicht importiert`);
    assert.ok(src.includes(`drossel(`) && src.includes(`'${pfad}'`), `${pfad}: drossel('${pfad}', …) fehlt`);
    assert.ok(/status:\s*429/.test(src), `${pfad}: keine 429-Antwort`);
  }
});

test('offeneTueren: geprueft=false nur mit Befund, Befund nur bei geprueft=false', () => {
  for (const t of OFFENE_TUEREN) {
    if (t.geprueft) assert.equal(t.offen, undefined, t.pfad);
    else assert.ok(typeof t.offen === 'string' && t.offen.length > 20, `${t.pfad}: geprueft=false ohne Befund`);
  }
  const offen = OFFENE_TUEREN.filter((t) => !t.geprueft).map((t) => t.pfad).sort();
  assert.deepEqual(offen, ['oeffentlich/angebot', 'oeffentlich/portal', 'oeffentlich/whatsapp-optin']);
});

// ---------- mail-klick: keine offene Umleitung mehr ----------

test('Klick-Unterschrift: gueltig nur fuer genau v|s|u und nur mit Geheimnis', () => {
  const h = klickSignatur('v1', 'k1', 'https://ziel.de/a', 'geheim');
  assert.match(h, /^[0-9a-f]{32}$/);
  assert.ok(klickSignaturGueltig('v1', 'k1', 'https://ziel.de/a', h, 'geheim'));
  assert.ok(!klickSignaturGueltig('v1', 'k1', 'https://betrug.example/', h, 'geheim'), 'anderes Ziel');
  assert.ok(!klickSignaturGueltig('v2', 'k1', 'https://ziel.de/a', h, 'geheim'), 'anderer Versand');
  assert.ok(!klickSignaturGueltig('v1', 'k1', 'https://ziel.de/a', h, 'anderes'), 'anderes Geheimnis');
  assert.ok(!klickSignaturGueltig('v1', 'k1', 'https://ziel.de/a', '', 'geheim'));
  assert.equal(klickSignatur('v1', 'k1', 'https://ziel.de/a', ''), '', 'ohne Geheimnis keine Unterschrift');
  assert.ok(!klickSignaturGueltig('v1', 'k1', 'https://ziel.de/a', '', ''));
});

test('klickUrl/messeMit haengen die Unterschrift an, wenn ein Signierer mitkommt', () => {
  const sig = (v, s, u) => klickSignatur(v, s, u, 'geheim');
  const u = klickUrl('https://x.de', 'v1', 'k1', 'https://ziel.de/a?b=1&c=2', sig);
  const p = new URL(u).searchParams;
  assert.ok(klickSignaturGueltig(p.get('v'), p.get('s'), p.get('u'), p.get('h'), 'geheim'), 'Rundreise durch die URL');
  assert.ok(!klickUrl('https://x.de', 'v1', 'k1', 'https://ziel.de/').includes('&h='), 'ohne Signierer wie bisher');
  const html = messeMit('<a href="https://ziel.de/x">x</a>', 'https://x.de', 'v1', 'k1', sig);
  assert.match(html, /&amp;h=|&h=/);
});

test('mail-klick-Route: ohne gueltige Unterschrift Zwischenseite, keine Umleitung, kein Zaehlen', () => {
  const src = quelle('oeffentlich/mail-klick');
  const iPruef = src.indexOf('klickSignaturGueltig(');
  const iZwischen = src.indexOf('zwischenseiteHtml(ziel)');
  const iZaehlen = src.indexOf("rpc('mail_klick_zaehlen'");
  const iUmleiten = src.lastIndexOf('NextResponse.redirect(ziel');
  assert.ok(iPruef > 0 && iZwischen > iPruef && iZaehlen > iZwischen && iUmleiten > iZaehlen, 'Reihenfolge Pruefen -> Zwischenseite -> Zaehlen -> Umleiten');
  assert.ok(src.includes('if (!signiert)'));
  // beide Versand-Routen signieren
  assert.match(quelle('newsletter-versand'), /messeMit\([^)]*klickSignatur\)/);
  assert.match(quelle('newsletter-ab-test'), /messeMit\([^)]*klickSignatur\)/);
});

test('Zwischenseite maskiert das Ziel und leitet nicht selbst weiter', () => {
  const h = zwischenseiteHtml('https://ziel.de/a?x="><script>alert(1)</script>');
  assert.ok(!h.includes('<script>alert'), 'kein eingeschleustes Skript');
  assert.ok(h.includes('ziel.de'));
  assert.ok(!/http-equiv=["']?refresh/i.test(h), 'kein automatisches Weiterleiten');
  assert.ok(!/location\s*=|location\.href/.test(h));
});

// ---------- Einzel-Befunde ----------

test('Dossier-Mails maskieren Name und Branche (kein Link-Einschleusen)', () => {
  const boese = '<a href="https://betrug.example">Jetzt bestätigen</a>';
  const a = dossierBestaetigenHtml(boese, 'https://argonaut-os.com/ok');
  const b = dossierAusliefernHtml(boese, boese);
  for (const html of [a, b]) {
    assert.ok(!html.includes('href="https://betrug.example"'), 'fremder Link darf nicht als Link ankommen');
    assert.ok(html.includes('&lt;a href='), 'als Text sichtbar');
  }
  assert.ok(quelle('oeffentlich/dossier-bestaetigen').includes('escapeHtml(l.name)'));
});

test('Buchung: Ende kommt aus dem Slot, nie vom Browser; Laengen begrenzt', () => {
  const src = quelle('oeffentlich/buchung');
  assert.ok(src.includes('ende_am: endeSlot.toISOString()'));
  assert.ok(!src.includes('ende_am: endeD.toISOString()'));
  assert.ok(src.includes("body.kunde_name : '').trim().slice(0, 120)"));
});

test('Abmeldungen werden nicht von Dritten wiederbelebt', () => {
  const opt = quelle('oeffentlich/optin-bestaetigen');
  const iCheck = opt.indexOf("ab.status === 'abgemeldet'");
  const iAktiv = opt.indexOf("update({ status: 'aktiv'");
  assert.ok(iCheck > 0 && iCheck < iAktiv, 'optin-bestaetigen: abgemeldet vor dem Aktivieren abfangen');
  const wa = quelle('oeffentlich/whatsapp-optin');
  assert.ok(wa.indexOf("v.status === 'abgemeldet'") > 0 && wa.indexOf("v.status === 'abgemeldet'") < wa.indexOf("update({ status: 'aktiv'"));
});

test('Widerruf: erst speichern, nie eine falsche Eingangsbestaetigung', () => {
  const src = quelle('oeffentlich/widerruf');
  const iSpeichern = src.indexOf("from('shop_widerrufe').insert(");
  const i503 = src.indexOf('status: 503');
  const iKaeufer = src.indexOf('Eingangsbestätigung Ihres Widerrufs');
  assert.ok(iSpeichern > 0 && i503 > iSpeichern && iKaeufer > i503);
  assert.ok(src.includes("from('profiles').select('firma_email')"), 'Rueckfall auf die Firmen-Mail');
});

test('keine internen Fehlertexte nach aussen (lp, optin, whatsapp-optin)', () => {
  for (const p of ['oeffentlich/lp', 'oeffentlich/optin', 'oeffentlich/whatsapp-optin']) {
    assert.ok(!/error:\s*msg\b/.test(quelle(p)), p);
  }
});

test('toter Verkaufs-Chat ist weg', () => {
  assert.ok(!fs.existsSync(path.join(WURZEL, 'app', 'components', 'WebsiteChat.tsx')));
  assert.ok(!fs.existsSync(path.join(WURZEL, 'app', 'components', 'WebsiteChatGate.tsx')));
});
