// ============================================================================
// tests/kfzAnfrageP271.test.mjs — Paket 271 (08.10.2026) · K10 Anfragen und Suchaufträge
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  naechsteNr, faelligkeit, startFaellig, anfragePruefen, statusFelder, auswertung, kriterienBereinigen, kriterienText,
  passt, treffer, passendeSuchen, laeuft, istOffen,
} from '../out/kfzAnfrage.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const HEUTE = '2026-10-08';
const fz = (x = {}) => ({ id: 'f1', status: 'bestand', marke: 'Volkswagen', modell: 'Golf Variant', vk_brutto: 18900, erstzulassung: '2020-05-01', km_stand: 62000, kraftstoff: 'Diesel', sparte: 'Pkw', erstellt_am: '2026-10-05T10:00:00Z', ...x });

test('Nummern, Fälligkeit, Start-Termin', () => {
  assert.equal(naechsteNr('A', ['A-0009', 'S-0050', null]), 'A-0010');
  assert.equal(naechsteNr('S', ['A-0009', 'S-0050']), 'S-0051');
  assert.equal(faelligkeit({ status: 'neu', faellig_am: '2026-10-07' }, HEUTE), 'ueberfaellig');
  assert.equal(faelligkeit({ status: 'neu', faellig_am: '2026-10-08' }, HEUTE), 'heute');
  assert.equal(faelligkeit({ status: 'termin', faellig_am: '2026-10-10' }, HEUTE), 'bald');
  assert.equal(faelligkeit({ status: 'termin', faellig_am: '2026-10-11' }, HEUTE), 'spaeter');
  assert.equal(faelligkeit({ status: 'in_arbeit', faellig_am: null }, HEUTE), 'ohne');
  assert.equal(faelligkeit({ status: 'verloren', faellig_am: '2026-10-01' }, HEUTE), 'zu');
  assert.equal(startFaellig('boerse', HEUTE), HEUTE);
  assert.equal(startFaellig('telefon', HEUTE), '2026-10-09');
});

test('Prüfen: Kontaktweg Pflicht, Abschluss braucht passenden Grund', () => {
  assert.deepEqual(anfragePruefen({ name: 'Max', tel: '0170', email: null, status: 'neu', abschluss_grund: null }).fehler, []);
  assert.ok(anfragePruefen({ name: 'Max', tel: '', email: '', status: 'neu', abschluss_grund: null }).fehler.some((f) => /Telefon oder E-Mail/.test(f)));
  assert.ok(anfragePruefen({ name: '', tel: '1', email: null, status: 'neu', abschluss_grund: null }).fehler.some((f) => /Name/.test(f)));
  assert.ok(anfragePruefen({ name: 'M', tel: null, email: 'kaputt@', status: 'neu', abschluss_grund: null }).fehler.some((f) => /E-Mail-Adresse/.test(f)));
  assert.ok(anfragePruefen({ name: 'M', tel: '1', email: null, status: 'verloren', abschluss_grund: null }).fehler.some((f) => /Abschlussgrund/.test(f)));
  assert.ok(anfragePruefen({ name: 'M', tel: '1', email: null, status: 'verloren', abschluss_grund: 'gekauft' }).fehler.length === 1);
  assert.ok(anfragePruefen({ name: 'M', tel: '1', email: null, status: 'gewonnen', abschluss_grund: 'preis' }).fehler.length === 1);
  assert.deepEqual(statusFelder('in_arbeit', 'T'), { status: 'in_arbeit', abgeschlossen_am: null, abschluss_grund: null });
  assert.deepEqual(statusFelder('gewonnen', 'T'), { status: 'gewonnen', abgeschlossen_am: 'T', faellig_am: null, abschluss_grund: 'gekauft' });
  assert.equal(statusFelder('verloren', 'T').abschluss_grund, undefined);
  assert.equal(istOffen('angebot'), true);
});

test('Auswertung: Quote, Gründe, Quellen', () => {
  const l = [
    { status: 'gewonnen', faellig_am: null, abschluss_grund: 'gekauft', quelle: 'boerse' },
    { status: 'verloren', faellig_am: null, abschluss_grund: 'preis', quelle: 'boerse' },
    { status: 'verloren', faellig_am: null, abschluss_grund: 'preis', quelle: 'telefon' },
    { status: 'verloren', faellig_am: null, abschluss_grund: 'kein_kontakt', quelle: 'telefon' },
    { status: 'neu', faellig_am: '2026-10-01', abschluss_grund: null, quelle: 'mail' },
    { status: 'neu', faellig_am: HEUTE, abschluss_grund: null, quelle: 'mail' },
  ];
  const a = auswertung(l, HEUTE);
  assert.equal(a.offen, 2); assert.equal(a.ueberfaellig, 1); assert.equal(a.heute, 1);
  assert.equal(a.quote, 25);
  assert.deepEqual(a.gruende.map((g) => [g.key, g.anzahl]), [['preis', 2], ['kein_kontakt', 1]]);
  assert.deepEqual(a.quellen.find((q) => q.key === 'boerse'), { key: 'boerse', label: 'Fahrzeugbörse', anzahl: 2, gewonnen: 1 });
  assert.equal(auswertung([], HEUTE).quote, null);
});

test('Suchaufträge: Kriterien, Treffer nur verkaufsfähig, neu seit letztem Blick, Laufzeit', () => {
  const k = kriterienBereinigen({ marke: ' volkswagen ', modell: '', preis_max: '20.000', ez_ab: '2019', km_max: '80000', kraftstoff: 'diesel', ez_quatsch: 'x' });
  assert.deepEqual(k, { marke: 'volkswagen', preis_max: 20000, ez_ab: 2019, km_max: 80000, kraftstoff: 'diesel' });
  assert.equal(kriterienBereinigen({ ez_ab: '19' }).ez_ab, undefined);
  assert.match(kriterienText(k), /volkswagen · bis 20\.000 € · ab EZ 2019 · bis 80\.000 km · diesel/);
  assert.equal(kriterienText({}), 'ohne Einschränkung');
  assert.equal(passt(k, fz()), true);
  assert.equal(passt(k, fz({ vk_brutto: 21000 })), false);
  assert.equal(passt(k, fz({ vk_brutto: null })), false);
  assert.equal(passt(k, fz({ erstzulassung: '2018-12-01' })), false);
  assert.equal(passt(k, fz({ km_stand: 90000 })), false);
  assert.equal(passt(k, fz({ kraftstoff: 'Benzin' })), false);
  assert.equal(passt(k, fz({ status: 'reserviert' })), false);
  assert.equal(passt(k, fz({ status: 'verkauft' })), false);
  const s = { kriterien: k, aktiv: true, gueltig_bis: '2026-12-31', gesehen_bis: '2026-10-06T00:00:00Z' };
  const t = treffer(s, [fz(), fz({ id: 'f2', erstellt_am: '2026-10-07T09:00:00Z' }), fz({ id: 'f3', status: 'verkauft' })], HEUTE);
  assert.deepEqual(t.alle.map((x) => x.id), ['f1', 'f2']);
  assert.deepEqual(t.neu.map((x) => x.id), ['f2']);
  assert.deepEqual(treffer({ ...s, gueltig_bis: '2026-10-07' }, [fz()], HEUTE).alle, []);
  assert.deepEqual(treffer({ ...s, aktiv: false }, [fz()], HEUTE).alle, []);
  assert.equal(laeuft({ aktiv: true, gueltig_bis: HEUTE }, HEUTE), true);
  assert.equal(passendeSuchen(fz(), [s, { ...s, kriterien: { marke: 'BMW' } }], HEUTE).length, 1);
});

test('Verdrahtung: eigene Tabellen (nicht leads), Menü, Akte-Hinweis, SQL additiv', () => {
  const seite = lies('app/dashboard/kfz/anfragen/page.tsx');
  assert.ok(!/from\(['"]leads['"]\)/.test(seite));
  assert.ok(seite.includes("from('kfz_anfrage').insert(") && seite.includes("from('kfz_suchauftrag').insert("));
  assert.ok(lies('app/dashboard/kfz/bestand/[id]/page.tsx').includes('<KfzAnfrageHinweis '));
  assert.ok(lies('app/dashboard/kfz/bestand/KfzAnfrageHinweis.tsx').includes('}, [schluessel]);'), 'kein Dauer-Laden');
  assert.ok(lies('lib/rechte.ts').includes("href: '/dashboard/kfz/anfragen'"));
  assert.ok(lies('lib/guideWissen.ts').includes("'/dashboard/kfz/anfragen': {"));
  const sql = lies('supabase-sql/p271-kfz-anfragen.sql');
  assert.doesNotMatch(sql, /drop table|drop column|delete from|truncate/i);
  assert.match(sql, /bestand_id\s+uuid references public\.kfz_bestand\(id\) on delete set null/);
});
