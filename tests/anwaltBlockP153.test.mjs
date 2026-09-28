// Paket 153 (28.09.2026) — Anwalt-Block Gesundheit & Tier: VORGEBAUT, GESPERRT.
// Patienten, Praxis-Behandlungen, Tiere, Tier-Behandlungen laufen durch den
// Import-Motor, aber erst nach der Anwalt-Freigabe (lib/anwaltFreigabe.ts).
// Gesundheitsangaben nie im Klartext: verschluesselt nach gesundheit_notiz.
// Katalog nach dem LIVE-Schema vom 28.09.2026 (Nur-Lese-Abfrage).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ANWALT_FREIGABE, anwaltSperrGrund, KI_NIE_GRUND } from '../out/anwaltFreigabe.js';
import { pruefeAlles, leseCsv, zielDef, ZIELE } from '../out/importParser.js';
import {
  katalogFuerZiel, vorschlagMapping, spaltenBilanz, EIGEN, MOTOR_TABELLEN, sperrGrund,
  baueKundenIndex, verknuepfeKunde, verweisAusTieren, verweisAusPatienten,
} from '../out/importMotor.js';
import { importErlaubt } from '../out/importRechte.js';
import { aufraeumerErlaubt } from '../out/importAufraeumer.js';
import { notizenFuerSatz, pruefeStapel, behandlungUeberschrift, teileText, anzahlJePatient, STAPEL_MAX } from '../out/gesundheitImport.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

// Live-Schema 28.09.2026 (Spalte Typ [NN] [=Standard]) — pflicht = NN ohne Standard.
const LIVE = {
  wellness_kunden: 'id uuid NN =gen_random_uuid() | owner_user_id uuid NN | name text NN =x | telefon text | email text | geburtsdatum date | hinweise text | erstellt_am timestamp with time zone NN =now()',
  wellness_behandlungen: 'id uuid NN =g | owner_user_id uuid NN | kunde_id uuid NN | datum date NN =d | behandlung text NN =x | dauer_min integer | preis numeric NN =0 | notiz text | erstellt_am timestamp with time zone NN =now() | abgerechnet boolean NN =false | rechnung_id uuid',
  tier_tiere: 'id uuid NN =g | owner_user_id uuid NN | kontakt_id uuid | halter text | name text NN =x | art text | rasse text | geburtsdatum date | chip_nr text | notiz text | erstellt_am timestamp with time zone NN =now() | halter_email text | halter_telefon text | erinnerung_ok boolean NN =false | erinnerung_ok_am date | erinnerung_widerruf_am date',
  tier_behandlungen: 'id uuid NN =g | owner_user_id uuid NN | tier_id uuid NN | datum date NN =d | art text NN =x | bezeichnung text NN =x | naechste_faellig date | preis numeric NN =0 | notiz text | erstellt_am timestamp with time zone NN =now() | abgerechnet boolean NN =false | rechnung_id uuid',
};
function dbFuer(tabelle) {
  return LIVE[tabelle].split(' | ').map((t) => {
    const [spalte, ...rest] = t.split(' ');
    const r = rest.join(' ');
    const datentyp = r.replace(/ NN.*$/, '').replace(/ =.*$/, '');
    return { tabelle, spalte, datentyp, pflicht: / NN/.test(r) && !/=/.test(r) };
  });
}
function durch(key, text) {
  const z = katalogFuerZiel(key, dbFuer(zielDef(key).tabelle)).ziel;
  const t = leseCsv(text);
  const map = vorschlagMapping(t.kopf, t.zeilen, z);
  return { z, t, map, b: pruefeAlles(key, map, t.kopf, t.zeilen, { ziel: z }), bil: spaltenBilanz(t.kopf, t.zeilen, map, z) };
}
const NEU = ['patienten', 'praxis_behandlungen', 'tiere', 'tier_behandlungen'];
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';

test('Schalter: alle vier Bereiche gesperrt; frei nur mit ausdruecklichem true; Tippfehler bleibt zu', () => {
  assert.deepEqual({ ...ANWALT_FREIGABE }, { gesundheit: false, tier: false, hilfsmittel: false, kanzlei: false });
  assert.ok(Object.isFrozen(ANWALT_FREIGABE));
  for (const b of ['gesundheit', 'tier', 'hilfsmittel', 'kanzlei']) assert.ok(anwaltSperrGrund(b), b);
  assert.equal(anwaltSperrGrund(null), null);
  assert.equal(anwaltSperrGrund('gesundheit', { gesundheit: true, tier: false, hilfsmittel: false, kanzlei: false }), null);
  assert.ok(anwaltSperrGrund('tier', { gesundheit: true, tier: false, hilfsmittel: false, kanzlei: false }));
  assert.ok(anwaltSperrGrund('patient'));
  // Nur ein echtes true schaltet frei — ein versehentlicher Text „false" nie.
  assert.ok(anwaltSperrGrund('gesundheit', { gesundheit: 'false', tier: false, hilfsmittel: false, kanzlei: false }));
  assert.match(anwaltSperrGrund('gesundheit'), /Art\. 9 DSGVO/);
});

test('Vier Ziele: gesperrt fuer ALLE (auch den Chef), nur Chef, nie an die KI', () => {
  const chef = { chef: true, module: [], schreibModule: null };
  const ma = { chef: false, module: ['wellness', 'tier'], schreibModule: ['wellness', 'tier'] };
  assert.equal(zielDef('patienten').anwalt, 'gesundheit');
  assert.equal(zielDef('praxis_behandlungen').anwalt, 'gesundheit');
  assert.equal(zielDef('tiere').anwalt, 'tier');
  assert.equal(zielDef('tier_behandlungen').anwalt, 'tier');
  for (const k of NEU) {
    const z = zielDef(k);
    assert.equal(z.nurChef, true, k);
    assert.equal(z.nurMitKatalog, true, k);
    for (const s of [chef, ma]) {
      const r = importErlaubt(k, s);
      assert.equal(r.ok, false, k);
      assert.equal(r.grund, anwaltSperrGrund(z.anwalt));
    }
    assert.deepEqual(aufraeumerErlaubt(k), { ok: false, grund: KI_NIE_GRUND });
  }
  // Ohne Anwalt-Kennzeichen bleibt alles wie vorher
  assert.deepEqual(importErlaubt('kontakte', chef), { ok: true });
  assert.deepEqual(aufraeumerErlaubt('artikel'), { ok: true });
  assert.ok(ZIELE.filter((z) => z.anwalt).length >= 4); // Paket 154: + Hilfsmittel, Akten, Fristen
});

test('SQL p153: Feldkatalog kennt die vier Tabellen, sonst nichts geaendert', () => {
  for (const t of ['wellness_kunden', 'wellness_behandlungen', 'tier_tiere', 'tier_behandlungen']) assert.ok(MOTOR_TABELLEN.includes(t), t);
  const sql = lies('supabase-sql/p153-import-anwaltblock.sql');
  const block = sql.match(/c\.table_name = any \(array\[([\s\S]*?)\]\)/)[1];
  const whitelist = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  // Paket 154: die Liste waechst — p153 bleibt Teilmenge; gleich ist sie mit dem neuesten SQL (anwaltBlockP154).
  for (const t of whitelist) assert.ok(MOTOR_TABELLEN.includes(t), t);
  assert.equal(whitelist.length, 77);
  assert.ok(!/\b(drop table|delete from|truncate|alter table|create table|create policy)\b/i.test(sql));
  assert.match(sql, /revoke all on function public\.import_feldkatalog\(text\[\]\) from anon/);
  assert.match(sql, /security invoker/);
});

test('Patienten: Gesundheitsangaben nie in eine Spalte, hinweise (Klartext) nie beschrieben, nichts verschluckt', () => {
  const r = durch('patienten',
    'Vorname;Nachname;Geburtsdatum;E-Mail;Telefon;Allergien;Medikation;Diagnose;Hinweise;Patienten-Nr\n'
    + 'Anna;Muster;03.04.1971;anna@example.de;0711 1;Penicillin;Ramipril 5 mg;Hypertonie;Rückenschmerzen;P-100\n'
    + 'Bernd;Beispiel;1980-12-01;;;;;;;P-101\n');
  assert.ok(!r.z.felder.some((f) => f.key === 'hinweise'), 'Klartext-Spalte hinweise wird nie angeboten');
  assert.equal(r.map['Allergien'], 'ge_allergie');
  assert.equal(r.map['Medikation'], 'ge_medikation');
  assert.equal(r.map['Diagnose'], 'ge_hinweis');
  assert.equal(r.map['Patienten-Nr'], EIGEN);
  assert.equal(r.bil.verschluckt, 0);
  assert.equal(r.b.gut, 2);
  const [a, b] = r.b.saetze;
  assert.equal(a.name, 'Anna Muster');
  assert.equal(a.geburtsdatum, '1971-04-03');
  for (const k of Object.keys(a)) assert.ok(!/^ge_|^hinweise$|allerg|medik/i.test(k), `keine Gesundheitsspalte im Satz: ${k}`);
  // „Hinweise" ist entweder zweite Hinweis-Spalte oder Eigene Spalte — beides geht verschluesselt, nie in hinweise.
  assert.ok(['ge_hinweis', EIGEN].includes(r.map['Hinweise']));
  assert.ok(a.__gesundheit.some((g) => g.art === 'allergie' && g.text === 'Penicillin'));
  assert.ok(a.__gesundheit.some((g) => g.art === 'medikation' && g.text === 'Ramipril 5 mg'));
  assert.ok(a.__gesundheit.some((g) => g.art === 'hinweis' && g.text === 'Hypertonie'));
  assert.equal(b.__gesundheit, undefined);
  // Nur Vorname (Klient ohne Nachname) reicht fuer den Namen
  const nurVor = durch('patienten', 'Vorname;E-Mail\nAnna;anna@example.de\n');
  assert.equal(nurVor.b.gut, 1);
  assert.equal(nurVor.b.saetze[0].name, 'Anna');
  assert.equal(zielDef('patienten').nurNeu, true);
  assert.equal(zielDef('patienten').gesundheitNotizen, true);
  assert.equal(zielDef('patienten').eigeneFelderModul, undefined);
});

test('Praxis-Behandlungen: Notiz verschluesselt statt Klartext-Spalte, alte Behandlungen abgerechnet, Patient Pflicht', () => {
  const r = durch('praxis_behandlungen',
    'Patient;Datum;Behandlung;Dauer;Preis;Notiz;Raum\n'
    + 'Anna Muster;12.03.2025;Manuelle Therapie;30;45,00;Schmerz 6/10 LWS;R2\n');
  assert.ok(!r.z.felder.some((f) => f.key === 'notiz' || f.key === 'rechnung_id'));
  assert.equal(r.map['Notiz'], 'ge_notiz');
  assert.equal(r.map['Raum'], EIGEN);
  const s = r.b.saetze[0];
  assert.equal(s.abgerechnet, true);
  assert.equal(s.__kunde, 'Anna Muster');
  assert.equal(s.notiz, undefined);
  assert.deepEqual(s.__gesundheit, [{ art: 'hinweis', text: 'Schmerz 6/10 LWS' }]);
  assert.equal(behandlungUeberschrift(s), 'Behandlung am 12.03.2025 · Manuelle Therapie');
  const kv = zielDef('praxis_behandlungen').kundeVerweis;
  assert.equal(kv.quelle, 'wellness_kunden');
  assert.equal(kv.pflicht, true);
  // Patienten-Index: E-Mail und genauer Name
  const idx = baueKundenIndex(verweisAusPatienten([{ id: U1, name: 'Anna Muster', email: 'anna@example.de' }]));
  assert.equal(verknuepfeKunde({ __kunde: 'anna@example.de' }, kv, idx).treffer.art, 'gefunden');
  assert.equal(verknuepfeKunde({ __kunde: 'Anna Muster' }, kv, idx).satz.kunde_id, U1);
});

test('Tiere: Einwilligung zur Erinnerung wird NIE uebernommen, Chip-Nr. erkannt, Halter verknuepft', () => {
  const r = durch('tiere',
    'Tiername;Tierart;Rasse;Chipnummer;Halter;E-Mail;Impferinnerung erlaubt\n'
    + 'Bello;Hund;Labrador;276098100000001;Müller;mueller@example.de;ja\n');
  for (const k of ['erinnerung_ok', 'erinnerung_ok_am', 'erinnerung_widerruf_am']) assert.ok(!r.z.felder.some((f) => f.key === k), k);
  assert.equal(r.map['Chipnummer'], 'chip_nr');
  assert.equal(r.map['Tiername'], 'name');
  assert.match(sperrGrund('Impferinnerung erlaubt', r.z), /neu einholen/);
  assert.notEqual(r.map['Impferinnerung erlaubt'], EIGEN);
  const s = r.b.saetze[0];
  assert.equal(s.erinnerung_ok, undefined);
  assert.equal(s.chip_nr, '276098100000001');
});

test('Tier-Behandlungen: Art-Liste, Verweis ueber Chip / Name / „Name Halter", doppelter Name wird nie geraten', () => {
  const r = durch('tier_behandlungen',
    'Tier;Chip;Datum;Art;Bezeichnung;Wiederimpfung;Preis\n'
    + 'Bello;276098100000001;01.02.2026;Schutzimpfung;SHPPiL;01.02.2027;55\n'
    + 'Minka;;02.02.2026;Kontrolle;Zahnkontrolle;;20\n');
  const [a, b] = r.b.saetze;
  assert.equal(a.art, 'impfung');
  assert.equal(a.naechste_faellig, '2027-02-01');
  assert.equal(a.abgerechnet, true);
  assert.equal(b.art, 'untersuchung');
  const kv = zielDef('tier_behandlungen').kundeVerweis;
  const idx = baueKundenIndex(verweisAusTieren([
    { id: U1, name: 'Bello', halter: 'Müller', chip_nr: '276098100000001' },
    { id: U2, name: 'Bello', halter: 'Schmidt', chip_nr: null },
  ]));
  assert.equal(verknuepfeKunde({ __kunde: '276098100000001', __kunde2: 'Bello' }, kv, idx).satz.tier_id, U1);
  assert.equal(verknuepfeKunde({ __kunde: 'Bello' }, kv, idx).treffer.art, 'mehrdeutig');
  assert.equal(verknuepfeKunde({ __kunde: 'Bello Schmidt' }, kv, idx).satz.tier_id, U2);
});

test('Notizen je Zeile: je Art eine Notiz, Rest als EIN Hinweis, kurz mit Bezeichnung, lang in Teilen', () => {
  const n = notizenFuerSatz({
    kundeId: U1,
    gesundheit: [{ art: 'allergie', text: 'Nüsse' }, { art: 'medikation', text: 'x' }, { art: 'unbekannt', text: 'weg' }, { art: 'hinweis', text: '  ' }],
    weitere: [{ spalte: 'Patienten-Nr', wert: 'P-100' }, { spalte: 'Leer', wert: ' ' }, { spalte: 'Kasse', wert: 'AOK' }],
  });
  assert.deepEqual(n, [
    { kunde_id: U1, art: 'allergie', text: 'Nüsse' },
    { kunde_id: U1, art: 'medikation', text: 'Medikation: x' },
    { kunde_id: U1, art: 'hinweis', text: 'Weitere Angaben aus dem Altsystem:\nPatienten-Nr: P-100\nKasse: AOK' },
  ]);
  assert.deepEqual(notizenFuerSatz({ kundeId: 'kein-uuid', gesundheit: [{ art: 'allergie', text: 'Nüsse' }] }), []);
  const mitKopf = notizenFuerSatz({ kundeId: U2, gesundheit: [{ art: 'hinweis', text: 'Verlauf gut' }], ueberschrift: 'Behandlung am 12.03.2025 · Massage' });
  assert.equal(mitKopf[0].text, 'Behandlung am 12.03.2025 · Massage\nVerlauf gut');
  const lang = 'Zeile mit Text.\n'.repeat(600);
  const teile = teileText(lang);
  assert.ok(teile.length >= 3);
  for (const t of teile) assert.ok(t.length <= 4000, String(t.length));
  assert.match(teile[0], /^\(Teil 1\/\d\) /);
  // geschnitten wird an Zeilenenden, nicht mitten im Wort
  for (const t of teile.slice(0, -1)) assert.ok(t.endsWith('Text.'), t.slice(-20));
  // ohne Zeilenumbruch (ein langer Block) wird hart geschnitten — nichts geht verloren
  const block = 'x'.repeat(9000);
  const bt = teileText(block);
  assert.equal(bt.length, 3);
  assert.equal(bt.map((t) => t.replace(/^\(Teil \d+\/\d+\) /, '')).join(''), block);
  assert.equal(teile.map((t) => t.replace(/^\(Teil \d+\/\d+\) /, '')).join('\n').replace(/\s+/g, ''), lang.replace(/\s+/g, ''));
  for (const x of notizenFuerSatz({ kundeId: U1, weitere: [{ spalte: 'Anamnese', wert: lang }] })) assert.ok(pruefeStapel({ notizen: [x] }).ok);
});

test('Route-Eingang: alles oder nichts, hoechstens 200, nur gueltige Arten; Protokoll je Patient', () => {
  const gut = { notizen: [{ kunde_id: U1, art: 'allergie', text: 'Nüsse' }, { kunde_id: U1, art: 'hinweis', text: 'ok ok' }, { kunde_id: U2, art: 'medikation', text: 'ASS' }] };
  const p = pruefeStapel(gut);
  assert.equal(p.ok, true);
  assert.deepEqual([...anzahlJePatient(p.notizen)], [[U1, 2], [U2, 1]]);
  assert.equal(pruefeStapel({ notizen: [] }).ok, false);
  assert.equal(pruefeStapel(null).ok, false);
  assert.equal(pruefeStapel({ notizen: Array.from({ length: STAPEL_MAX + 1 }, () => gut.notizen[0]) }).ok, false);
  assert.match(pruefeStapel({ notizen: [gut.notizen[0], { kunde_id: 'x', art: 'allergie', text: 'ab' }] }).fehler, /Angabe 2: ungültiger Patient/);
  assert.match(pruefeStapel({ notizen: [{ kunde_id: U1, art: 'diagnose', text: 'ab' }] }).fehler, /Unbekannte Art/);
  assert.match(pruefeStapel({ notizen: [{ kunde_id: U1, art: 'hinweis', text: 'a' }] }).fehler, /Text/);
});

test('Quelltext: Route sperrt serverseitig VOR allem anderen, Seite schreibt keine Eigenen Felder bei Gesundheitszielen', () => {
  const route = lies('app/api/gesundheit-notiz/stapel/route.ts');
  const iSperre = route.indexOf("anwaltSperrGrund('gesundheit')");
  assert.ok(iSperre > 0 && iSperre < route.indexOf('req.json()'));
  assert.ok(route.indexOf("from('gesundheit_zugriff')") < route.indexOf("from('gesundheit_notiz')"), 'Protokoll vor dem Speichern');
  assert.ok(!/SERVICE_ROLE|service_role/.test(route));
  assert.match(route, /owner_user_id === user\.id/);
  const seite = lies('app/dashboard/import/page.tsx');
  assert.match(seite, /const eigene: EigeneSpalte\[\] = ziel\.gesundheitNotizen \? \[\] : eigeneSpalten/);
  assert.match(seite, /if \(gesFehler && ids0\.length > 0\) await supabase\.from\(ziel\.tabelle\)\.delete\(\)\.in\('id', ids0\)/);
  assert.match(seite, /\/api\/gesundheit-notiz\/stapel/);
});
