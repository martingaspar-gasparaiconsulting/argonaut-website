// Paket F (26.09.2026) — Abläufe und Fehler F2 bis F22 (F1 in fPaketF1.test.mjs).
// Reine Logik über ../out/, Seiten-Fixes über den Quelltext (Wächter).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { monatsFristEnde } from '../out/fristen.js';
import { DUENGE_FRIST_TAGE, PSM_FRIST_TAGE } from '../out/schlagkartei.js';
import { alleSicherungsBereiche, istZugangsTabelle, NIE_SICHERN, HAUPT_BEREICHE, blattName } from '../out/sicherungTabellen.js';
import { pruefeAlles } from '../out/importParser.js';
import { kennzahlBuchung, zaehleBde, stoerzeitSumme, geplanteZeitSumme } from '../out/bde.js';
import { topIstBeschluss, TOP_VORSCHLAEGE } from '../out/versammlungObjekte.js';
import { istAktuellBelegt, zaehleBelegung } from '../out/belegung.js';
import { nichtsGeschrieben } from '../out/speichernPruefen.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ---------------------------------------------------------------- F2
test('F2 Website-Bauer: Speichern nimmt die Seite nicht offline, Bausteine werden geladen', () => {
  const s = lies('app/dashboard/webseiten/page.tsx');
  assert.ok(!/upsert\(row/.test(s), 'kein upsert mit status mehr');
  assert.equal((s.match(/status: 'entwurf'/g) || []).length, 1, 'status entwurf nur beim ersten Anlegen');
  assert.ok(/insert\(\{ \.\.\.inhalt, owner_user_id: uid, slug: zweck, zweck, status: 'entwurf' \}\)/.test(s));
  assert.ok(/select\('oeffentlich_id, status, domain, chat_domains, bloecke'\)/.test(s));
  assert.equal((s.match(/await zeileSicherstellen\(\)/g) || []).length, 2, 'Domain und Berater überschreiben keine Seite');
});

// ---------------------------------------------------------------- F3
test('F3 kein Link mehr auf /login (gibt es nicht)', () => {
  const treffer = [];
  const lauf = (dir) => {
    for (const e of fs.readdirSync(new URL('../' + dir, import.meta.url), { withFileTypes: true })) {
      const p = dir + '/' + e.name;
      if (e.isDirectory()) { if (e.name !== 'node_modules') lauf(p); continue; }
      if (!/\.(tsx?|jsx?)$/.test(e.name)) continue;
      if (/['"`]\/login['"`]/.test(lies(p))) treffer.push(p);
    }
  };
  lauf('app'); lauf('lib');
  assert.deepEqual(treffer, []);
});

// ---------------------------------------------------------------- F4 + F5
test('F4 Filialvergleich liest die Leitungs-Zuordnung, F5 Hauptsitz nicht löschbar', () => {
  const v = lies('app/dashboard/filialvergleich/page.tsx');
  assert.ok(v.includes("from('mitarbeiter_standorte')"));
  assert.ok(/abgedeckt\[m\.id\]\?\.has\(s\.id\)/.test(v));
  const st = lies('app/dashboard/standorte/page.tsx');
  assert.ok(/if \(s\.ist_hauptsitz\) \{ setFehler\('Der Hauptsitz kann nicht gelöscht werden/.test(st));
  assert.ok(st.includes('Hauptsitz · nicht löschbar'));
});

// ---------------------------------------------------------------- F6
test('F6 Import: echte Dateizeile je Satz, auch nach fehlerhaften Zeilen', () => {
  const kopf = ['Firma', 'E-Mail'];
  const zeilen = [['A GmbH', 'a@x.de'], ['', ''], ['B GmbH', 'b@x.de'], ['A GmbH', 'a@x.de'], ['C GmbH', 'c@x.de']];
  const mapping = { Firma: 'firma', 'E-Mail': 'email' };
  const b = pruefeAlles('kontakte', mapping, kopf, zeilen);
  assert.equal(b.saetze.length, b.zeilenNummern.length);
  // Datei: Kopf = 1, A = 2, leer = 3, B = 4, A doppelt = 5, C = 6
  const nachFirma = Object.fromEntries(b.saetze.map((s, i) => [String(s.firma ?? s.name ?? ''), b.zeilenNummern[i]]));
  assert.equal(nachFirma['C GmbH'], 6);
  assert.equal(nachFirma['B GmbH'], 4);
  const s = lies('app/dashboard/import/page.tsx');
  assert.ok(!/zeile: i \+ j \+ 2/.test(s), 'alte, falsche Nummerierung ist weg');
  assert.ok(s.includes('async function rueckgaengig('));
  assert.ok(/z\.tabelle === 'rechnungen'\) return;/.test(s), 'Offene Posten nie per Knopf löschen');
});

// ---------------------------------------------------------------- F7
test('F7 Automation startet pausiert', () => {
  const s = lies('app/dashboard/automationen/page.tsx');
  assert.ok(s.includes("insert({ ...satz, aktiv: false })"));
  assert.ok(!s.includes("insert({ ...satz, aktiv: true })"));
});

// ---------------------------------------------------------------- F8
test('F8 Datensicherung: alle Bereiche, keine Zugangsdaten', () => {
  const b = alleSicherungsBereiche();
  assert.ok(b.length > 300, 'mehr als 300 Bereiche, nicht mehr nur 8');
  assert.deepEqual(b.slice(0, HAUPT_BEREICHE.length).map((x) => x.table), HAUPT_BEREICHE.map((x) => x.table));
  for (const x of b) {
    assert.ok(!istZugangsTabelle(x.table), 'Zugangsdaten in der Sicherung: ' + x.table);
    assert.ok(x.blatt.length <= 31, 'Blattname zu lang: ' + x.blatt);
  }
  for (const t of ['bank_zugang', 'elster_zugang', 'mail_zugang', 'api_schluessel', 'social_zugang']) {
    assert.ok(NIE_SICHERN.includes(t), t);
    assert.ok(!b.some((x) => x.table === t), t);
  }
  const blaetter = new Set(b.map((x) => x.blatt.toLowerCase()));
  assert.equal(blaetter.size, b.length, 'Blattnamen eindeutig');
  const v = new Set();
  assert.equal(blattName('a'.repeat(40), v).length, 31);
  assert.equal(blattName('a'.repeat(40), v), 'a'.repeat(29) + '_2');
});

// ---------------------------------------------------------------- F9 + F10 + F19
test('F9/F10/F19 Zahlen: mit Komma vorbelegen, km deutsch lesen, Zutaten nicht zuerst löschen', () => {
  const r = lies('app/dashboard/rezeptur/page.tsx');
  assert.ok(r.includes('menge: zahlFeld(z.menge)'));
  assert.ok(!/menge: z\.menge != null \? String\(z\.menge\)/.test(r));
  const iIns = r.indexOf("from('rezeptur_zutaten').insert(rows)");
  const iDel = r.indexOf("from('rezeptur_zutaten').delete().in('id', altIds)");
  assert.ok(iIns > 0 && iDel > iIns, 'erst einfügen, dann alte löschen');
  assert.ok(!/value=\{eck\.basis_menge \?\? ''\}/.test(r), 'Komma muss tippbar sein');
  const k = lies('app/dashboard/kfz/page.tsx');
  assert.ok(!/parseInt\(fz\.km_stand/.test(k));
  assert.ok(/window\.confirm\(`Fahrzeug/.test(k));
  const a = lies('app/dashboard/aufmass/page.tsx');
  assert.ok(a.includes('zahlFeld(p.einzelpreis_netto)'));
  assert.ok(!/String\(p\.einzelpreis_netto\)/.test(a));
});

// ---------------------------------------------------------------- F11
test('F11 Rückruf: Sperren speichert den Haken sofort', () => {
  const s = lies('app/dashboard/chargen/qualitaet/page.tsx');
  const i = s.indexOf('async function sperren()');
  const teil = s.slice(i, s.indexOf('const fertig =', i));
  assert.ok(/from\('qs_rueckruf'\)\.update\(\{ schritte: neu \}\)/.test(teil));
  assert.ok(teil.indexOf("update({ schritte: neu })") < teil.indexOf('await neuLaden()'));
});

// ---------------------------------------------------------------- F12
test('F12 BDE: Pause senkt die OEE nicht', () => {
  const b = { planbelegung_min: 480, menge_gesamt: 900, menge_gut: 900, ideal_takt_sek: 30 };
  const ohne = kennzahlBuchung(b, 0, 30);
  assert.equal(ohne.planbelegung_min, 450);
  assert.equal(ohne.verfuegbarkeit, 1);
  const stoer = [{ buchung_id: 'x', kategorie: 'pause', dauer_min: 30 }, { buchung_id: 'x', kategorie: 'technik', dauer_min: 45 }];
  assert.equal(stoerzeitSumme(stoer), 45);
  assert.equal(geplanteZeitSumme(stoer), 30);
  const kpi = zaehleBde([{ status: 'aktiv' }], [{ id: 'x', ...b }], stoer);
  assert.equal(Math.round(kpi.verfuegbarkeit * 1000), Math.round((405 / 450) * 1000));
  assert.notEqual(kpi.topStoerLabel, 'Pause / geplant');
  // Nur Pause: volle Verfügbarkeit
  const nurPause = zaehleBde([], [{ id: 'y', ...b }], [{ buchung_id: 'y', kategorie: 'pause', dauer_min: 60 }]);
  assert.equal(nurPause.verfuegbarkeit, 1);
});

// ---------------------------------------------------------------- F13
test('F13 Versammlung: „Verschiedenes" und Beschlussfähigkeit sind kein Beschluss', () => {
  assert.equal(topIstBeschluss('Verschiedenes (ohne Beschluss)'), false);
  assert.equal(topIstBeschluss('Verschiedenes'), false);
  assert.equal(topIstBeschluss('Begrüßung, Feststellung der ordnungsgemäßen Einladung und Beschlussfähigkeit'), false);
  assert.equal(topIstBeschluss('Beschluss über den Wirtschaftsplan'), true);
  assert.equal(topIstBeschluss('Entlastung des Vorstands'), true);
  assert.equal(topIstBeschluss('Wahlen'), true);
  const weg = TOP_VORSCHLAEGE.weg.filter(topIstBeschluss);
  assert.ok(!weg.some((t) => /Verschiedenes/.test(t)));
});

// ---------------------------------------------------------------- F14
test('F14 Belegung: eingecheckt = belegt, auch nach Mitternacht am Abreisetag', () => {
  const v = { von: '2026-09-20', bis: '2026-09-26', status: 'eingecheckt' };
  assert.equal(istAktuellBelegt(v, '2026-09-26T08:30:00Z'), true);
  assert.equal(istAktuellBelegt({ ...v, status: 'ausgecheckt' }, '2026-09-24T08:30:00Z'), false);
  assert.equal(istAktuellBelegt({ ...v, status: 'bestaetigt' }, '2026-09-26T08:30:00Z'), false);
  const k = zaehleBelegung([{ status: 'aktiv' }], [{ von: '2026-09-26', bis: '2026-09-28', status: 'eingecheckt' }], '2026-09-26T12:00:00Z');
  assert.equal(k.anreisenHeute, 0, 'schon eingecheckt = keine offene Anreise');
  assert.equal(k.belegtJetzt, 1);
});

// ---------------------------------------------------------------- F15 F16 F18
test('F15 Gastro, F16 Tierbestand, F18 Tour', () => {
  const g = lies('app/dashboard/gastro/page.tsx');
  assert.ok(!/\(r\.status \|\| 'offen'\) === 'offen'/.test(g));
  assert.ok(/value=\{nr\.telefon\}/.test(g));
  const t = lies('app/dashboard/tierbestand/page.tsx');
  assert.ok(/from\('tier_gruppe'\)\.update\(\{ aktueller_bestand: Math\.max\(0, neuBestand\) \}\)/.test(t));
  const to = lies('app/dashboard/tour/page.tsx');
  assert.ok(/async function tourStatus\(/.test(to));
  assert.ok(/from\('tour'\)\.update\(\{ status \}\)/.test(to));
});

// ---------------------------------------------------------------- F17
test('F17 Dünge-Aufzeichnung 2 Tage (DüV § 10 Abs. 2), Pflanzenschutz 30', () => {
  assert.equal(DUENGE_FRIST_TAGE, 2);
  assert.equal(PSM_FRIST_TAGE, 30);
  assert.ok(!/Düngung 14 Tage/.test(lies('lib/guideWissen.ts')));
  assert.ok(!/Frist 14 Tage/.test(lies('app/dashboard/schlagkartei/page.tsx')));
});

// ---------------------------------------------------------------- F20
test('F20 Speichern meldet 0 geänderte Zeilen', () => {
  assert.equal(nichtsGeschrieben([]), true);
  assert.equal(nichtsGeschrieben(null), true);
  assert.equal(nichtsGeschrieben([{ id: 'a' }]), false);
  for (const p of ['app/dashboard/werkstatt/page.tsx', 'app/dashboard/_components/VersammlungenSeite.tsx', 'app/dashboard/holz/page.tsx', 'app/dashboard/holz/auftraege/page.tsx', 'app/dashboard/holz/pakete/page.tsx']) {
    const s = lies(p);
    assert.ok(s.includes('nichtsGeschrieben('), p);
    // jedes update(...).eq('id', …) prüft das Ergebnis
    const ohne = [...s.matchAll(/\.update\([^;]*?\)\s*\.eq\('id', [^)]*\);/g)].map((m) => m[0]);
    assert.deepEqual(ohne, [], p + ': update ohne .select');
  }
  const w = lies('app/dashboard/werkstatt/page.tsx');
  assert.ok(!w.includes('Feld-Fehler still'));
});

// ---------------------------------------------------------------- F21
test('F21 DSGVO-Monatsfrist ohne Zeitzonen-Fehler, Monatsende', () => {
  assert.equal(monatsFristEnde('2026-09-26'), '2026-10-26');
  assert.equal(monatsFristEnde('2026-01-31'), '2026-02-28');
  assert.equal(monatsFristEnde('2028-01-31'), '2028-02-29');
  assert.equal(monatsFristEnde('2026-12-15'), '2027-01-15');
  assert.equal(monatsFristEnde('2026-03-31'), '2026-04-30');
  assert.equal(monatsFristEnde('2026-05-10', 3), '2026-08-10');
  assert.equal(monatsFristEnde('kaputt'), '');
  const s = lies('app/dashboard/dsgvo/page.tsx');
  assert.ok(!/d\.setMonth\(d\.getMonth\(\) \+ 1\)/.test(s));
});

// ---------------------------------------------------------------- F22
test('F22 Zeit-Nachweis und GoBD für Mitarbeiter', () => {
  const z = lies('app/dashboard/arbeitszeit-nachweis/page.tsx');
  assert.ok(/eq\('auth_user_id', uid\)/.test(z));
  assert.ok(z.includes('Das PDF mit Unterschrift erstellt der Inhaber.'));
  const g = lies('app/dashboard/gobd/page.tsx');
  assert.ok(/if \(binMitarbeiter\) return \(/.test(g));
});
