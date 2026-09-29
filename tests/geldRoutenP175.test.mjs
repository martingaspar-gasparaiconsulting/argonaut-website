// Paket 175 (29.09.2026) — Geld-Routen absichern: H4 PDF-Routen nur mit Login,
// H3 Kasse nur eigene Artikel, M6 Rechnung senden nur mit Abrechnungsrecht + Deckel,
// M12 ARGONAUT-Abo nur durch die Geschaeftsleitung, SQL p175 Besitzer-Pruefung.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('H4: Rechnungs-, Mahnungs- und AB-PDF verlangen den Login VOR allem anderen', () => {
  for (const p of ['app/api/rechnung-pdf/route.ts', 'app/api/mahnung-pdf/route.ts', 'app/api/auftragsbestaetigung-pdf/route.ts']) {
    const s = ohneKommentare(lies(p));
    const post = s.indexOf('export async function POST');
    assert.ok(post >= 0, p);
    const absage = s.indexOf('const absage = await nurAngemeldet();', post);
    assert.ok(absage > post, `${p}: nurAngemeldet fehlt`);
    assert.ok(absage < s.indexOf('await req.json()', post), `${p}: Login-Pruefung muss vor dem Lesen der Anfrage stehen`);
    assert.match(s.slice(absage, absage + 80), /if \(absage\) return absage;/, p);
  }
});

test('H4: ZUGFeRD reicht die Sitzung an die PDF-Route weiter (sonst 401)', () => {
  const s = ohneKommentare(lies('app/api/rechnung-zugferd/route.ts'));
  assert.match(s, /cookie: req\.headers\.get\('cookie'\) \|\| ''/);
});

test('H3 Kasse: Artikel werden VOR der TSE-Signatur gegen den eigenen Betrieb geprueft', () => {
  const s = ohneKommentare(lies('app/api/kasse-beleg/route.ts'));
  const pruef = s.indexOf(".from('artikel').select('id')");
  assert.ok(pruef > 0, 'Artikel-Pruefung fehlt');
  assert.match(s.slice(pruef, pruef + 120), /\.eq\('owner_user_id', ownerId\)\.in\('id', artikelIds\)/);
  assert.ok(pruef < s.indexOf('signiereBeleg('), 'Pruefung muss vor dem Signieren stehen');
  assert.ok(pruef < s.indexOf("from('kassen_belege').insert"), 'Pruefung muss vor dem Beleg stehen');
  assert.match(s, /gehört nicht zu Ihrem Betrieb/);
  // Betrieb: erst die Mitarbeiter-Zeile, dann das eigene Profil.
  assert.ok(s.indexOf(".from('mitarbeiter')") < s.indexOf(".from('profiles')"));
});

test('M6 Rechnung senden: nur mit Abrechnungsrecht, nur PDF/XML bis 10 MB, Tagesdeckel', () => {
  const s = ohneKommentare(lies('app/api/rechnung-senden/route.ts'));
  assert.match(s, /const abr = await abrechnungPruefen\(supabase, user\.id/);
  assert.match(s, /if \(!abr\.ok\) return NextResponse\.json\(\{ error: abr\.fehler \}, \{ status: 403 \}\)/);
  assert.match(s, /const absenderId = abr\.betrieb;/);
  assert.match(s, /ERLAUBTE_TYPEN\.includes\(typ\)/);
  assert.match(s, /MAX_ANHANG_BYTES = 10 \* 1024 \* 1024/);
  assert.match(s, /deckelErreicht\(absenderId\)[\s\S]{0,260}status: 429/);
  assert.ok(s.indexOf('abrechnungPruefen(') < s.indexOf('sendeMail('));
});

test('M12 ARGONAUT-Abo: Mitarbeiter werden abgewiesen, bevor irgendetwas gespeichert wird', () => {
  const s = ohneKommentare(lies('app/api/kunde-abo/route.ts'));
  const pruef = s.indexOf('if (istMitarbeiterKennung(chef))');
  assert.ok(pruef > 0);
  assert.match(s.slice(pruef, pruef + 200), /status: 403/);
  assert.ok(pruef < s.indexOf('await req.json()'), 'vor dem Lesen der IBAN');
  assert.match(s, /supabase\.rpc\('mein_chef_id'\)/);
});

test('SQL p175: Besitzer-Pruefung wird in den LIVE-Rumpf eingesetzt, idempotent, nie blind', () => {
  const s = lies('supabase-sql/p175-rechnung-besitzer.sql');
  assert.match(s, /pg_get_functiondef\('public\.rechnung_zahlbetrag_neu_berechnen\(uuid\)'::regprocedure\)/);
  assert.match(s, /position\('p175_besitzer' in v_def\) > 0/);
  assert.match(s, /r_p175\.owner_user_id in \(auth\.uid\(\), public\.mein_chef_id\(\)\)/);
  assert.match(s, /if auth\.uid\(\) is not null and not exists/);
  assert.match(s, /raise exception 'p175: Funktion hat eine unerwartete Form/);
  assert.match(s, /raise exception 'p175: Rumpfbeginn nicht gefunden/);
  assert.doesNotMatch(s, /\bdrop (table|function)\b|\bdelete from\b|\btruncate\b/i);
});
