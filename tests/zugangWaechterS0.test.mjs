// Paket S0 (28.09.2026) — Login-Pflicht: keine Schnittstelle ohne Login, ausser sie steht
// mit Grund in lib/offeneTueren.ts (Webseite, Shop, Double-Opt-in, Abmelden, Portal-Link …).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { OFFENE_TUEREN, istOffeneTuer } from '../out/offeneTueren.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const API = path.join(WURZEL, 'app', 'api');

function routen(dir) {
  const aus = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) aus.push(...routen(p));
    else if (e.name === 'route.ts') aus.push(path.relative(API, dir).split(path.sep).join('/'));
  }
  return aus;
}
// Nur was im Repo ist, wird auch ausgeliefert: lokale, per .gitignore ausgeschlossene
// Dateien (z. B. **/test-pptx/) zaehlen nicht. Ohne git: alles auf der Platte (strenger).
function imRepo() {
  try {
    const liste = execFileSync('git', ['ls-files', '--', 'app/api'], { cwd: WURZEL, encoding: 'utf8' })
      .split(/\r?\n/).filter((z) => z.endsWith('/route.ts'))
      .map((z) => z.slice('app/api/'.length, -'/route.ts'.length));
    return liste.length > 0 ? new Set(liste) : null;
  } catch { return null; }
}
const REPO = imRepo();
const ALLE = routen(API).filter((r) => !REPO || REPO.has(r) || !gitIgnoriert(r));
function gitIgnoriert(r) {
  try { execFileSync('git', ['check-ignore', '-q', `app/api/${r}/route.ts`], { cwd: WURZEL }); return true; } catch { return false; }
}
const lies = (r) => fs.readFileSync(path.join(API, ...r.split('/'), 'route.ts'), 'utf8');

// Was als Zugangs-Pruefung zaehlt: Login, Zeitplan-Geheimnis, Betreiber-Doppelschloss, Signatur eines Dienstes.
const PRUEFUNG = /nurAngemeldet\(\)|auth\.getUser\(|cronGuard\(|cronPruefung\(|betreiberGuard|betreiberPruefung|nurGeschaeftsleitung|abrechnungPruefen|CRON_SECRET|verifyWebhook|svix|stripe\.webhooks|[Ss]ignatur/;

test('Jede Schnittstelle hat eine Zugangs-Pruefung oder steht mit Grund auf der Liste der offenen Tueren', () => {
  assert.ok(ALLE.length > 200, `nur ${ALLE.length} Routen gefunden`);
  const offen = ALLE.filter((r) => !PRUEFUNG.test(lies(r)) && !istOffeneTuer(r));
  assert.deepEqual(offen, [], `Ohne Login und nicht auf lib/offeneTueren.ts: ${offen.join(', ')}`);
});

test('Die Liste ist sauber: jede Tuer gibt es, keine doppelt, jede mit Grund und Schutz', () => {
  const pfade = OFFENE_TUEREN.map((t) => t.pfad);
  assert.equal(new Set(pfade).size, pfade.length, 'doppelt');
  for (const t of OFFENE_TUEREN) {
    assert.ok(ALLE.includes(t.pfad), `gibt es nicht (mehr): ${t.pfad}`);
    assert.ok(t.grund.length > 10, t.pfad);
    assert.ok(['token', 'seite', 'formular', 'nur-lesen', 'deckel', 'abgeschaltet'].includes(t.schutz), t.pfad);
  }
});

test('Interne Arbeit nur mit Login: KI, Mahnung, Personal, E-Rechnung, Bestellvorschlag, Korrespondenz, Vertrag', () => {
  for (const r of ['chat', 'erechnung-lesen', 'erp-bestellvorschlag', 'hr/ki-auswertung', 'ki-auge', 'korrespondenz-ki', 'korrespondenz-pdf',
    'mahnung-ki', 'projekt-ki-setup', 'projekt-statusbericht', 'rechnung-e', 'rechnung-zugferd', 'vertrag-kuendigung']) {
    const s = lies(r);
    assert.ok(!istOffeneTuer(r), `${r} darf keine offene Tuer sein`);
    // die Pruefung steht VOR dem ersten Lesen des Aufrufs
    const i = s.indexOf('const absage = await nurAngemeldet();');
    assert.ok(i > 0, r);
    assert.ok(i < s.indexOf('await req.'), `${r}: Login-Pruefung muss zuerst kommen`);
    assert.match(s.slice(i, i + 80), /if \(absage\) return absage;/, r);
  }
});

test('Offene Tueren nie fuer interne Arbeit: keine Rechnung schreiben, kein Personal', () => {
  for (const t of OFFENE_TUEREN) {
    assert.doesNotMatch(t.pfad, /^(rechnung|mahnung|hr|personal|lohn|mitarbeiter|admin|cron)/, t.pfad);
  }
  assert.ok(!ALLE.some((r) => r.startsWith('document-engine/test')), 'alte Test-Routen sind geloescht');
  const preis = lies('preisauskunft');
  assert.match(preis, /const VON_AUSSEN_OFFEN = false as boolean;/);
  assert.ok(preis.indexOf('if (!VON_AUSSEN_OFFEN)') < preis.indexOf('await req.') || !preis.includes('await req.'), 'Abschaltung zuerst');
});

test('Login-Helfer: ohne Anmeldung 401, prueft mit getUser (nicht getSession)', () => {
  const h = fs.readFileSync(path.join(WURZEL, 'lib', 'nurAngemeldet.ts'), 'utf8');
  assert.match(h, /auth\.getUser\(\)/);
  assert.doesNotMatch(h, /getSession/);
  assert.match(h, /status: 401/);
});
