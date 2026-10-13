// ============================================================================
// tests/bestattungP352.test.mjs — Paket 352 (13.10.2026)
// A4a Fachpaket Bestatter: Sterbefall-Akte, Checkliste, Kostenvoranschlag
// mit Auslagen für Dritte, Partner, Vollmacht nur mit eigenem Text.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BESTATTUNGSARTEN, STANDARD_AUFGABEN, LAUFEND, istArt, bestattungZusatz, aktePruefen, aufgabenFuerFall, aufgabeLage, aufgabenStand,
  vorlagePruefen, postenAusKatalog, postenPruefen, zeilenBetrag, kvSumme, kvHtml, vollmachtHtml, platzhalterWerte, fallUebersicht,
  verstorbenName, datumDe, esc, plusTage,
} from '../out/bestattung.js';
import { brancheModule, brancheZusatz } from '../out/branchenkatalog.js';
import { eintragFuer, textPruefen, geruest } from '../out/rechtsTexte.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentar = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const HEUTE = '2026-10-13';
const FALL = {
  nummer: '2026-007', verstorben_vorname: 'Erika', verstorben_nachname: 'Muster', geburtsname: 'Beispiel', geburtsdatum: '1940-03-02',
  sterbedatum: '2026-10-11', sterbeort: 'Böblingen', bestattungsart: 'feuer', auftraggeber_name: 'Hans <Muster>', auftraggeber_anschrift: 'Weg 1\n71032 Böblingen',
};
const FIRMA = { name: 'Bestattungen Ruhe & Frieden', strasse: 'Allee 3', plz: '71032', ort: 'Böblingen', telefon: '07031 1', email: 'info@example.de' };

test('Branchen: nur Bestattungsunternehmen bekommen Akte und Leistungskatalog, Tierbestattung nicht', () => {
  assert.equal(bestattungZusatz('Bestattungsunternehmen'), true);
  assert.equal(bestattungZusatz('Tierbestattung & Tierkrematorien'), false);
  assert.equal(bestattungZusatz('Reinigungsunternehmen'), false);
  assert.equal(bestattungZusatz(null), false);
  const m = brancheModule('Dienstleistungen', 'Bestattungsunternehmen');
  assert.ok(m.includes('bestattung') && m.includes('leistungskatalog'));
  assert.equal(new Set(m).size, m.length, 'keine Doppelten');
  assert.ok(brancheZusatz('Dienstleistungen', 'Bestattungsunternehmen').includes('bestattung'));
  assert.ok(!brancheModule('Dienstleistungen', 'Reinigungsunternehmen').includes('bestattung'));
  assert.ok(!brancheModule('Tiere', 'Tierbestattung & Tierkrematorien').includes('bestattung'));
});

test('Akte prüfen: Pflichtfelder, Längen, Daten, E-Mail', () => {
  const gut = { verstorben_nachname: 'Muster', auftraggeber_name: 'Hans', bestattungsart: 'erd', sterbedatum: '2026-10-11', geburtsdatum: '1940-01-01' };
  assert.deepEqual(aktePruefen(gut, HEUTE), { ok: true });
  const r = aktePruefen({ verstorben_nachname: ' ', auftraggeber_name: '', bestattungsart: 'mond' }, HEUTE);
  assert.equal(r.ok, false);
  assert.equal(r.fehler.length, 3);
  assert.match(aktePruefen({ ...gut, sterbedatum: '2026-10-14' }, HEUTE).fehler.join(' '), /Zukunft/);
  assert.match(aktePruefen({ ...gut, sterbedatum: '1930-01-01' }, HEUTE).fehler.join(' '), /vor dem Geburtsdatum/);
  assert.match(aktePruefen({ ...gut, sterbedatum: '2026-02-30' }, HEUTE).fehler.join(' '), /gültiges Datum/);
  assert.match(aktePruefen({ ...gut, auftraggeber_mail: 'keine-mail' }, HEUTE).fehler.join(' '), /E-Mail/);
  assert.match(aktePruefen({ ...gut, notiz: 'x'.repeat(1001) }, HEUTE).fehler.join(' '), /Notiz: höchstens 1000/);
  assert.equal(verstorbenName(FALL), 'Erika Muster geb. Beispiel');
  assert.equal(verstorbenName({ verstorben_nachname: '' }), 'Ohne Namen');
  for (const a of BESTATTUNGSARTEN) assert.ok(istArt(a.key));
});

test('Checkliste: ARGONAUT-Stationen ohne Fristen, passend zur Bestattungsart; eigene Checkliste mit eigenen Fristen', () => {
  assert.ok(STANDARD_AUFGABEN.every((a) => a.tage_nach_tod === null), 'ARGONAUT gibt keine Fristen vor (Landesrecht)');
  assert.ok(Object.isFrozen(STANDARD_AUFGABEN));
  const feuer = aufgabenFuerFall(null, 'feuer', '2026-10-11');
  assert.equal(feuer.quelle, 'standard');
  assert.ok(feuer.aufgaben.some((a) => /Einäscherung/.test(a.titel)));
  assert.ok(feuer.aufgaben.every((a) => a.faellig_am === null));
  assert.deepEqual(feuer.aufgaben.map((a) => a.position), feuer.aufgaben.map((_, i) => i + 1));
  const erd = aufgabenFuerFall([], 'erd', null);
  assert.ok(!erd.aufgaben.some((a) => /Einäscherung|Reederei/.test(a.titel)));
  assert.ok(erd.aufgaben.some((a) => /Standesamt/.test(a.titel)) && erd.aufgaben.some((a) => /Rentenversicherung/.test(a.titel)) && erd.aufgaben.some((a) => /Krankenkasse/.test(a.titel)));
  const eigene = [
    { titel: 'B', stelle: 'Friedhof', tage_nach_tod: 3, nur_bei: null, position: 2, aktiv: true },
    { titel: 'A', stelle: 'Standesamt', tage_nach_tod: 0, nur_bei: null, position: 1, aktiv: true },
    { titel: 'Krematorium', stelle: null, tage_nach_tod: 2, nur_bei: ['feuer'], position: 3, aktiv: true },
    { titel: 'Alt', stelle: null, tage_nach_tod: 1, nur_bei: null, position: 4, aktiv: false },
  ];
  const e = aufgabenFuerFall(eigene, 'erd', '2026-10-11');
  assert.equal(e.quelle, 'eigen');
  assert.deepEqual(e.aufgaben.map((a) => [a.titel, a.faellig_am]), [['A', '2026-10-11'], ['B', '2026-10-14']]);
  assert.equal(aufgabenFuerFall(eigene, 'feuer', null).aufgaben.length, 3);
  assert.equal(aufgabenFuerFall(eigene.map((x) => ({ ...x, aktiv: false })), 'erd', null).quelle, 'standard', 'nur ausgeblendete = ARGONAUT-Stationen');
  assert.equal(plusTage('2026-12-30', 3), '2027-01-02');
});

test('Checkliste: Lage, Stand, Vorlage prüfen', () => {
  assert.equal(aufgabeLage({ titel: 'x', faellig_am: '2026-10-12', erledigt_am: null }, HEUTE), 'ueberfaellig');
  assert.equal(aufgabeLage({ titel: 'x', faellig_am: HEUTE, erledigt_am: null }, HEUTE), 'heute');
  assert.equal(aufgabeLage({ titel: 'x', faellig_am: '2026-10-12', erledigt_am: '2026-10-12T10:00:00Z' }, HEUTE), 'erledigt');
  assert.equal(aufgabeLage({ titel: 'x', faellig_am: null, erledigt_am: null }, HEUTE), 'offen');
  assert.deepEqual(aufgabenStand([
    { titel: 'a', faellig_am: '2026-10-01', erledigt_am: null }, { titel: 'b', faellig_am: null, erledigt_am: 'x' }, { titel: 'c', faellig_am: null, erledigt_am: null },
  ], HEUTE), { gesamt: 3, erledigt: 1, offen: 2, ueberfaellig: 1 });
  assert.deepEqual(vorlagePruefen({ titel: 'Standesamt', tage_nach_tod: 3, nur_bei: ['erd'] }), { ok: true });
  assert.equal(vorlagePruefen({ titel: '' }).ok, false);
  assert.equal(vorlagePruefen({ titel: 'x', tage_nach_tod: 366 }).ok, false);
  assert.equal(vorlagePruefen({ titel: 'x', tage_nach_tod: 1.5 }).ok, false);
  assert.equal(vorlagePruefen({ titel: 'x', nur_bei: ['mond'] }).ok, false);
});

test('Kostenvoranschlag: Leistung aus dem Katalog übernehmen — nie 0,00 € ohne Preis', () => {
  const basis = { id: 'k1', bezeichnung: 'Überführung', erfassungsart: 'stunden', standard_wert: 2, aw_minuten: null, stundensatz_netto: 60, festpreis_netto: 0, einheit: null, einheitspreis_netto: null, mwst_satz: 19 };
  assert.deepEqual(postenAusKatalog({ ...basis, festpreis_netto: 350 }), { art: 'leistung', leistung_id: 'k1', bezeichnung: 'Überführung', mwst_satz: 19, menge: 1, einheit: 'pauschal', einzelpreis_netto: 350 });
  assert.deepEqual(postenAusKatalog(basis), { art: 'leistung', leistung_id: 'k1', bezeichnung: 'Überführung', mwst_satz: 19, menge: 2, einheit: 'Std.', einzelpreis_netto: 60 }, 'Pauschale 0 gilt nicht als Pauschale');
  assert.equal(postenAusKatalog({ ...basis, erfassungsart: 'minuten', standard_wert: 90 }).menge, 1.5);
  assert.equal(postenAusKatalog({ ...basis, erfassungsart: 'aw', standard_wert: 10, aw_minuten: 6 }).menge, 1);
  assert.deepEqual(postenAusKatalog({ ...basis, erfassungsart: 'stueck', standard_wert: 1, einheit: 'Stück', einheitspreis_netto: 890 }).einheit, 'Stück');
  assert.equal(postenAusKatalog({ ...basis, stundensatz_netto: null }), null);
  assert.equal(postenAusKatalog({ ...basis, erfassungsart: 'stueck', einheitspreis_netto: null }), null);
  assert.equal(postenAusKatalog({ ...basis, mwst_satz: 16 }).mwst_satz, 19, 'unbekannter Satz → 19');
  assert.deepEqual(postenPruefen({ art: 'auslage', bezeichnung: 'Friedhofsgebühr', menge: 1, einheit: 'pauschal', einzelpreis_netto: 850, mwst_satz: 0 }), { ok: true });
  assert.equal(postenPruefen({ art: 'leistung', bezeichnung: 'x', menge: 0, einheit: 'Stk', einzelpreis_netto: 1, mwst_satz: 19 }).ok, false);
  assert.equal(postenPruefen({ art: 'leistung', bezeichnung: 'x', menge: 1, einheit: 'Stk', einzelpreis_netto: null, mwst_satz: 19 }).ok, false);
  assert.equal(postenPruefen({ art: 'leistung', bezeichnung: 'x', menge: 1, einheit: 'Stk', einzelpreis_netto: 1, mwst_satz: 16 }).ok, false);
});

test('Kostenvoranschlag: Betrag je Zeile wie die Datenbank, Summen in Cent, Auslagen getrennt ohne USt', () => {
  assert.equal(zeilenBetrag({ menge: 2.5, einzelpreis_netto: 120.33 }), 300.83, 'wie round(2.5 * 120.33, 2) in Postgres');
  assert.equal(zeilenBetrag({ menge: 0.1, einzelpreis_netto: 0.05 }), 0.01);
  assert.equal(zeilenBetrag({ menge: 0.25, einzelpreis_netto: 1.14 }), 0.29, 'Kommazahl-Rechnung ergäbe 0,28 — Postgres 0,29');
  assert.equal(zeilenBetrag({ menge: 0.25, einzelpreis_netto: 2.3 }), 0.58);
  assert.equal(zeilenBetrag({ menge: 3, einzelpreis_netto: 0.1 }), 0.3);
  const s = kvSumme([
    { art: 'leistung', bezeichnung: 'Überführung', menge: 1, einheit: 'pauschal', einzelpreis_netto: 350, mwst_satz: 19 },
    { art: 'ware', bezeichnung: 'Urne', menge: 1, einheit: 'Stk', einzelpreis_netto: 199.99, mwst_satz: 19 },
    { art: 'ware', bezeichnung: 'Trauerkarten', menge: 50, einheit: 'Stk', einzelpreis_netto: 1.1, mwst_satz: 7 },
    { art: 'auslage', bezeichnung: 'Friedhofsgebühr', menge: 1, einheit: 'pauschal', einzelpreis_netto: 850, mwst_satz: 19 },
  ]);
  assert.deepEqual(s.gruppen, [{ satz: 19, netto: 549.99, steuer: 104.5 }, { satz: 7, netto: 55, steuer: 3.85 }]);
  assert.equal(s.netto, 604.99);
  assert.equal(s.steuer, 108.35);
  assert.equal(s.brutto, 713.34);
  assert.equal(s.auslagen, 850, 'Auslage ohne USt — auch wenn 19 % mitgegeben wird');
  assert.equal(s.anzahlAuslagen, 1);
  assert.equal(s.gesamt, 1563.34);
  assert.deepEqual(kvSumme([]), { gruppen: [], netto: 0, steuer: 0, brutto: 0, auslagen: 0, gesamt: 0, anzahlAuslagen: 0 });
});

test('Druck: Kostenvoranschlag maskiert, Auslagen getrennt, Bedingungen nur mit eigenem Text', () => {
  const posten = [
    { art: 'leistung', bezeichnung: 'Sarg <Eiche>', menge: 1, einheit: 'Stk', einzelpreis_netto: 1000, mwst_satz: 19, position: 1 },
    { art: 'auslage', bezeichnung: 'Friedhofsgebühr', menge: 1, einheit: 'pauschal', einzelpreis_netto: 850, mwst_satz: 0, position: 2 },
  ];
  const ohne = kvHtml(FALL, posten, FIRMA, HEUTE, { eigen: false, hinweis: 'kein Text' });
  assert.ok(!ohne.includes('<Eiche>') && ohne.includes('Sarg &lt;Eiche&gt;'));
  assert.ok(ohne.includes('Hans &lt;Muster&gt;'));
  assert.ok(ohne.includes('Kostenvoranschlag Nr. 2026-007'));
  assert.ok(ohne.includes('Auslagen für Dritte (ohne Umsatzsteuer)'));
  assert.ok(ohne.includes('Erika Muster geb. Beispiel'));
  assert.ok(ohne.includes('Feuerbestattung'));
  assert.ok(!ohne.includes('Bedingungen'), 'ohne eigenen Text kein Abschnitt Bedingungen');
  assert.ok(!ohne.includes('kein Text'));
  assert.match(ohne, /Voraussichtlicher Gesamtbetrag<\/td><td class="r">2\.040,00/);
  const mit = kvHtml(FALL, posten, FIRMA, HEUTE, { eigen: true, text: 'Zahlung binnen 14 Tagen.\n\nAuslagen <nach Bescheid>.', stand: 'Fassung 2 vom 13.10.2026' });
  assert.ok(mit.includes('Bedingungen') && mit.includes('Auslagen &lt;nach Bescheid&gt;') && mit.includes('Fassung 2'));
  assert.match(kvHtml(FALL, posten, null, HEUTE, null), /Firmendaten fehlen/);
  assert.equal(esc(`"'&`), '&quot;&#39;&amp;');
  assert.equal(datumDe('2026-10-13T08:00:00Z'), '13.10.2026');
});

test('Druck: Vollmacht NUR mit eigenem Text — nie ein ARGONAUT-Wortlaut', () => {
  const ohne = vollmachtHtml(FALL, FIRMA, HEUTE, { eigen: false, hinweis: 'Für „Vollmacht der Angehörigen" ist kein eigener Text des Betriebs hinterlegt.' });
  assert.equal(ohne.ok, false);
  assert.match(ohne.hinweis, /kein eigener Text/);
  const mit = vollmachtHtml(FALL, FIRMA, HEUTE, { eigen: true, text: 'MEIN-EIGENER-WORTLAUT', stand: 'Fassung 1 vom 13.10.2026' });
  assert.equal(mit.ok, true);
  assert.ok(mit.html.includes('MEIN-EIGENER-WORTLAUT'));
  // ausser Kopfangaben und Unterschriftszeilen steht kein Satz von ARGONAUT drin
  const sichtbar = mit.html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
  assert.ok(!/bevollmächtige|ermächtige|hiermit|berechtigt|erteile/i.test(sichtbar), 'kein Vollmachts-Wortlaut von ARGONAUT');
  assert.deepEqual(platzhalterWerte(FALL, FIRMA, HEUTE), { betrieb: FIRMA.name, kunde: 'Hans <Muster>', datum: '13.10.2026', verstorben: 'Erika Muster geb. Beispiel' });
});

test('Rechtstexte: Vollmacht und Bedingungen im Katalog, angebunden, nur Gerüst', () => {
  for (const k of ['bestattung.vollmacht', 'bestattung.auftrag']) {
    const e = eintragFuer(k);
    assert.ok(e, k);
    assert.equal(e.angebunden, true);
    assert.equal(e.bereich, 'Bestattung');
    assert.ok(e.platzhalter.some((p) => p.key === 'verstorben'));
    assert.ok(textPruefen(e, geruest(e)).length > 0, 'Gerüst allein ist nicht speicherbar');
    assert.deepEqual(textPruefen(e, 'Wir handeln für {{kunde}} in der Sache {{verstorben}}, Betrieb {{betrieb}}, am {{datum}} — eigener Text.'), []);
  }
});

test('Übersicht: laufende Fälle, Termine der nächsten 7 Tage, überfällige Aufgaben nur laufender Fälle', () => {
  const faelle = [
    { id: 'a', status: 'vorbereitung', trauerfeier_am: '2026-10-15T09:00:00Z', beisetzung_am: '2026-10-15T11:00:00Z' },
    { id: 'b', status: 'abgeschlossen', trauerfeier_am: '2026-10-14T09:00:00Z', beisetzung_am: null },
    { id: 'c', status: 'aufgenommen', trauerfeier_am: '2026-10-30T09:00:00Z', beisetzung_am: null },
  ];
  const aufg = [
    { sterbefall_id: 'a', titel: 'x', faellig_am: '2026-10-12', erledigt_am: null },
    { sterbefall_id: 'b', titel: 'y', faellig_am: '2026-10-01', erledigt_am: null },
  ];
  assert.deepEqual(fallUebersicht(faelle, aufg, HEUTE), { laufend: 2, termineWoche: 2, aufgabenUeberfaellig: 1, aufgabenOffen: 1 });
  assert.ok(!LAUFEND.includes('abgeschlossen') && !LAUFEND.includes('storniert'));
});

test('SQL p352: Rechte, Wächter, Nummer gesperrt, Auslage 0 %, Betrag aus der Datenbank, mehrfach ausführbar', () => {
  const s = lies('supabase-sql/p352-bestattung.sql').replace(/--.*$/gm, '');
  for (const t of ['sterbefall', 'sterbefall_aufgabe', 'sterbefall_posten', 'sterbefall_partner', 'bestattung_aufgabe_vorlage']) {
    assert.match(s, new RegExp(`create table if not exists public\\.${t} \\(`), t);
  }
  assert.match(s, /pg_advisory_xact_lock\(hashtext\('p352_nummer_'/);
  assert.match(s, /new\.nummer := old\.nummer/);
  assert.match(s, /if new\.art = 'auslage' then new\.mwst_satz := 0; end if;/);
  assert.match(s, /new\.gesamt_netto := round\(new\.menge \* new\.einzelpreis_netto, 2\)/);
  assert.match(s, /darf_ich_modul_aendern\(''bestattung''\)/);
  assert.ok(!/for delete to authenticated/.test(s), 'Mitarbeiter löschen nicht');
  assert.match(s, /revoke all on public\.%I from anon/);
  assert.ok(!/drop table|truncate|delete from/i.test(s), 'nie destruktiv');
  assert.match(s, /p352_posten_loeschwaechter/);
});

test('Quelltext: Seite, Menü, Rechte, Guide, DSGVO, Sicherung', () => {
  const seite = lies('app/dashboard/bestattung/page.tsx');
  const akte = ohneKommentar(lies('app/dashboard/bestattung/SterbefallAkte.tsx'));
  assert.deepEqual([...seite.matchAll(/^export\s+(?!default)/gm)].length, 0, 'page.tsx exportiert nur die Seite');
  assert.match(akte, /ladeDokumentText\(supabase, ich, 'bestattung\.vollmacht'/);
  assert.match(akte, /ladeDokumentText\(supabase, ich, 'bestattung\.auftrag'/);
  const einfuegen = akte.match(/from\('sterbefall_posten'\)\.insert\(\{[\s\S]*?\}\)/)?.[0] ?? '';
  assert.ok(einfuegen.includes('einzelpreis_netto') && !einfuegen.includes('gesamt_netto'), 'Betrag je Zeile rechnet die Datenbank');
  assert.match(akte, /vollmachtHtml\(/);
  assert.match(seite, /aufgabenFuerFall\(vorlagen/);
  assert.match(lies('lib/rechte.ts'), /href: '\/dashboard\/bestattung', modul: 'bestattung'/);
  assert.match(lies('lib/guideWissen.ts'), /'\/dashboard\/bestattung': \{/);
  assert.match(lies('lib/dsgvoDaten.ts'), /tabelle: 'sterbefall', label: .*art: 'behalten'/);
  const sich = lies('lib/sicherungTabellen.ts');
  for (const t of ['sterbefall', 'sterbefall_aufgabe', 'sterbefall_posten', 'sterbefall_partner', 'bestattung_aufgabe_vorlage']) assert.match(sich, new RegExp(`'${t}'`));
  assert.ok(!/KI-Agent|KI-Crew/.test(seite + akte));
  assert.ok(!/\b(du|dein|deine|dir)\b/i.test(seite.replace(/\/\/.*$/gm, '') + akte), 'Sie-Form');
});
