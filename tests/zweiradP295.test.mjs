// Paket 295 (09.10.2026): Z1 Zweirad, E-Bike und Dienstrad-Leasing
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  RAD_ARTEN, MIT_MOTOR, statusErlaubt, rahmennummerPruefen, teilNummer, radPruefen, radName, plusMonate, tageBis, inspektionFaellig, garantieAmpel,
  gewaehrleistungBis, annahmeAuftrag, garantiePruefen, garantieWeiter, drWeiter, postenPruefen, steuer19, drSumme, nettoAusBrutto, postenAusEingabe,
  drWechselPruefen, drRechnungMoeglich, drRechnungPosten, drRechnungText, drKopfPruefen, kontaktLesen, radPasst, datumDe, MAX_POSTEN,
} from '../out/zweirad.js';
import { steuerGruppen } from '../out/steuerLogik.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ID = '11111111-1111-4111-8111-111111111111';
const SQL = lies('supabase-sql/p295-zweirad-dienstrad.sql');

const FORM = {
  herkunft: 'bestand', art: 'pedelec', marke: 'Testrad', modell: 'E1', modelljahr: '2026', farbe: 'blau', rahmengroesse: 'M', rahmennummer: ' wbk 123 45x ',
  motorHersteller: 'MotorX', motorNr: 'm-1', akkuNr: 'ak 77', akkuWh: '625', displayNr: 'd1', schluesselNr: '123', versicherungskennzeichen: 'abc',
  kontaktId: '', halterName: '', kaufdatum: '2026-03-01', garantieBis: '2028-03-01', intervallMonate: '12', letzteInspektion: '', ek: '1.800,00', vk: '2.999,00', notiz: '',
};

test('Rahmennummer: Großbuchstaben ohne Leerzeichen, Format wie die Datenbank', () => {
  assert.deepEqual(rahmennummerPruefen(' wbk 123 45x '), { ok: true, wert: 'WBK12345X' });
  assert.deepEqual(rahmennummerPruefen(''), { ok: true, wert: null });
  assert.equal(rahmennummerPruefen('a b!').ok, false);
  assert.equal(rahmennummerPruefen('ABC').ok, false);           // zu kurz
  assert.equal(rahmennummerPruefen('X'.repeat(31)).ok, false);  // zu lang
  assert.equal(rahmennummerPruefen('-ABC1').ok, false);         // muss mit Buchstabe/Ziffer beginnen
  assert.equal(rahmennummerPruefen('AB.12/3-4').ok, true);
  assert.ok(SQL.includes("rahmennummer ~ '^[A-Z0-9][A-Z0-9./-]{3,29}$'"));
  assert.ok(SQL.includes("upper(regexp_replace(coalesce(new.rahmennummer, ''), '\\s', '', 'g'))"));
  assert.equal(teilNummer('  ak 77 '), 'AK 77');
});

test('Rad-Akte: Pflichtfelder, Motorfelder nur bei E-Bikes, Preise nur im Bestand, Hinweise', () => {
  const p = radPruefen(FORM, 2026);
  assert.ok(p.ok);
  assert.equal(p.zeile.rahmennummer, 'WBK12345X');
  assert.equal(p.zeile.akku_nr, 'AK 77');
  assert.equal(p.zeile.akku_wh, 625);
  assert.equal(p.zeile.ek_cent, 180000);
  assert.equal(p.zeile.vk_cent, 299900);
  assert.equal(p.zeile.versicherungskennzeichen, null); // nur S-Pedelec
  assert.deepEqual(p.hinweise, []);
  const rad = radPruefen({ ...FORM, art: 'fahrrad' }, 2026);
  assert.ok(rad.ok);
  assert.equal(rad.zeile.akku_nr, null); assert.equal(rad.zeile.motor_nr, null); assert.equal(rad.zeile.akku_wh, null);
  const kunde = radPruefen({ ...FORM, herkunft: 'kunde' }, 2026);
  assert.ok(kunde.ok); assert.equal(kunde.zeile.vk_cent, null); assert.equal(kunde.zeile.ek_cent, null);
  const s = radPruefen({ ...FORM, art: 's_pedelec', versicherungskennzeichen: '' , rahmennummer: '', akkuNr: '' }, 2026);
  assert.ok(s.ok); assert.equal(s.hinweise.length, 3);
  assert.equal(radPruefen({ ...FORM, art: 's_pedelec' }, 2026).zeile.versicherungskennzeichen, 'ABC');
  for (const [k, v] of [['marke', 'X'], ['art', 'roller'], ['herkunft', ''], ['modelljahr', '2028'], ['akkuWh', '6000'], ['akkuWh', '1,5'], ['intervallMonate', '61'], ['kaufdatum', '2026-02-30'], ['garantieBis', '2025-01-01'], ['vk', 'abc'], ['kontaktId', 'nix']]) {
    assert.equal(radPruefen({ ...FORM, [k]: v }, 2026).ok, false, `${k}=${v}`);
  }
  assert.equal(radPruefen({ ...FORM, intervallMonate: '' }, 2026).zeile.inspektion_intervall_monate, 12);
  assert.deepEqual([...MIT_MOTOR].sort(), ['lastenrad_e', 'pedelec', 's_pedelec']);
  for (const a of RAD_ARTEN) assert.ok(SQL.includes(`'${a.key}'`), a.key);
});

test('Status je Herkunft wie der Datenbank-Check', () => {
  assert.ok(statusErlaubt('kunde', 'kunde') && statusErlaubt('kunde', 'archiv') && !statusErlaubt('kunde', 'verkauft'));
  assert.ok(statusErlaubt('bestand', 'reserviert') && statusErlaubt('bestand', 'verkauft') && !statusErlaubt('bestand', 'kunde'));
  assert.ok(SQL.includes("(herkunft = 'kunde' and status in ('kunde', 'archiv')) or (herkunft = 'bestand' and status in ('bestand', 'reserviert', 'verkauft', 'archiv'))"));
});

test('Monate addieren mit Monatsende, Tage zählen', () => {
  assert.equal(plusMonate('2026-01-31', 1), '2026-02-28');
  assert.equal(plusMonate('2028-01-31', 1), '2028-02-29');
  assert.equal(plusMonate('2026-03-15', 12), '2027-03-15');
  assert.equal(plusMonate('2026-11-30', 3), '2027-02-28');
  assert.equal(plusMonate('2026-05-10', 24), '2028-05-10');
  assert.equal(tageBis('2026-10-09', '2026-10-10'), 1);
  assert.equal(tageBis('2026-10-09', '2026-03-29'), -194); // über die Zeitumstellung hinweg ganze Tage
});

test('Inspektion: letzte Inspektion vor Kaufdatum, Ampel überfällig / 30 Tage / ok, ohne Intervall keine', () => {
  const r = { letzte_inspektion: null, kaufdatum: '2025-11-01', inspektion_intervall_monate: 12 };
  assert.deepEqual(inspektionFaellig(r, '2026-10-09'), { am: '2026-11-01', ampel: 'bald', tage: 23 });
  assert.equal(inspektionFaellig({ ...r, letzte_inspektion: '2026-05-01' }, '2026-10-09').am, '2027-05-01');
  assert.equal(inspektionFaellig({ ...r, kaufdatum: '2025-09-01' }, '2026-10-09').ampel, 'ueber');
  assert.equal(inspektionFaellig({ ...r, kaufdatum: '2026-01-01' }, '2026-10-09').ampel, 'ok');
  assert.equal(inspektionFaellig({ ...r, inspektion_intervall_monate: 0 }, '2026-10-09').ampel, 'keine');
  assert.equal(inspektionFaellig({ ...r, kaufdatum: null }, '2026-10-09').ampel, 'keine');
  assert.equal(inspektionFaellig({ ...r, status: 'archiv' }, '2026-10-09').ampel, 'keine');
  assert.equal(garantieAmpel('2026-11-30', '2026-10-09').ampel, 'bald');
  assert.equal(garantieAmpel('2026-10-08', '2026-10-09').ampel, 'ueber');
  assert.equal(garantieAmpel(null, '2026-10-09').ampel, 'keine');
  assert.equal(gewaehrleistungBis('2026-10-09'), '2028-10-09');
  assert.equal(gewaehrleistungBis(null), null);
});

test('Reparatur-Annahme: Auftrag fürs Werkstatt-Board mit Zubehör, Kostengrenze, Akku und Rad-Verknüpfung', () => {
  const rad = { id: ID, marke: 'Testrad', modell: 'E1', rahmennummer: 'WBK12345X', art: 'pedelec', halter_name: 'Anna Kunde', versicherungskennzeichen: null, akku_nr: 'AK 77' };
  const f = { art: 'reparatur', anliegen: 'Bremse schleift', zustand: 'Kratzer am Oberrohr', zubehoer: { akku: true, schluessel: true }, kostengrenze: '150', km: '1234', ladezyklen: '88', abholung: '2026-10-12' };
  const p = annahmeAuftrag(rad, f, '2026-10-09');
  assert.ok(p.ok);
  assert.equal(p.felder.zweirad_id, ID);
  assert.equal(p.felder.titel, 'Reparatur Testrad E1');
  assert.equal(p.felder.kunde_name, 'Anna Kunde');
  assert.equal(p.felder.kilometerstand, 1234);
  assert.equal(p.felder.zugesagt_am, '2026-10-12');
  assert.match(p.felder.annahme_zustand, /Abgegeben: Akku, Schlüssel/);
  assert.match(p.felder.annahme_zustand, /Kostengrenze: 150,00 € brutto/);
  assert.match(p.felder.annahme_zustand, /Ladezyklen: 88/);
  assert.match(p.felder.annahme_zustand, /Akku-Nr\.: AK 77/);
  assert.equal(p.felder.beschreibung, 'Rahmennummer WBK12345X');
  assert.ok(!('owner_user_id' in p.felder), 'Besitzer setzt die Seite aus dem Rad (Betrieb), nie die klickende Person');
  const insp = annahmeAuftrag(rad, { ...f, art: 'inspektion', anliegen: '', zubehoer: {}, kostengrenze: '' }, '2026-10-09');
  assert.ok(insp.ok);
  assert.equal(insp.felder.titel, 'Inspektion Testrad E1');
  assert.match(insp.felder.annahme_zustand, /nur das Rad/);
  assert.match(insp.felder.annahme_zustand, /Keine Kostengrenze/);
  assert.equal(annahmeAuftrag(rad, { ...f, anliegen: '' }, '2026-10-09').ok, false);
  assert.equal(annahmeAuftrag(rad, { ...f, abholung: '2026-10-01' }, '2026-10-09').ok, false);
  assert.equal(annahmeAuftrag(rad, { ...f, km: '1,5' }, '2026-10-09').ok, false);
  assert.equal(annahmeAuftrag(rad, { ...f, kostengrenze: 'viel' }, '2026-10-09').ok, false);
});

test('Garantiefall: Prüfung und Wege wie der Datenbank-Wächter', () => {
  const g = { art: 'garantie', bauteil: 'akku', fehler: 'Akku lädt nicht', herstellerNr: ' RMA-1 ', gemeldetAm: '2026-10-09' };
  const p = garantiePruefen(g, '2026-10-09');
  assert.ok(p.ok); assert.equal(p.zeile.hersteller_nr, 'RMA-1');
  assert.equal(garantiePruefen({ ...g, gemeldetAm: '2026-10-10' }, '2026-10-09').ok, false);
  assert.equal(garantiePruefen({ ...g, bauteil: 'sattel' }, '2026-10-09').ok, false);
  assert.equal(garantiePruefen({ ...g, fehler: 'x' }, '2026-10-09').ok, false);
  assert.deepEqual([...garantieWeiter('offen')], ['eingereicht', 'erledigt']);
  assert.deepEqual([...garantieWeiter('eingereicht')], ['genehmigt', 'abgelehnt']);
  assert.deepEqual([...garantieWeiter('erledigt')], []);
  assert.ok(SQL.includes("(old.status = 'offen' and new.status in ('eingereicht', 'erledigt'))"));
  assert.ok(SQL.includes("(old.status = 'eingereicht' and new.status in ('genehmigt', 'abgelehnt'))"));
});

test('Dienstrad: Statuswege wie der Datenbank-Wächter, abgerechnet nur über die Rechnung', () => {
  assert.deepEqual([...drWeiter('angebot')], ['eingereicht', 'storniert']);
  assert.deepEqual([...drWeiter('eingereicht')], ['angebot', 'genehmigt', 'storniert']);
  assert.deepEqual([...drWeiter('genehmigt')], ['uebergeben', 'storniert']);
  for (const k of ['uebergeben', 'abgerechnet', 'storniert']) assert.deepEqual([...drWeiter(k)], [], k);
  assert.ok(SQL.includes("(old.status = 'angebot' and new.status in ('eingereicht', 'storniert'))"));
  assert.ok(SQL.includes("(old.status = 'eingereicht' and new.status in ('angebot', 'genehmigt', 'storniert'))"));
  assert.ok(SQL.includes("(old.status = 'genehmigt' and new.status in ('uebergeben', 'storniert'))"));
  assert.ok(SQL.includes("new.status := 'abgerechnet';"));
});

test('Positionen: 1 bis 30, Menge 1 bis 99, ganze Cent, Summe größer null', () => {
  const ok = postenPruefen([{ bezeichnung: ' Rad ', menge: 1, netto_cent: 250000 }, { bezeichnung: 'Schloss', menge: 2, netto_cent: 4900 }]);
  assert.ok(ok.ok); assert.equal(ok.posten[0].bezeichnung, 'Rad');
  assert.equal(postenPruefen([]).ok, false);
  assert.equal(postenPruefen('x').ok, false);
  assert.equal(postenPruefen([{ bezeichnung: 'R', menge: 1, netto_cent: 1 }]).ok, false);
  assert.equal(postenPruefen([{ bezeichnung: 'Rad', menge: 0, netto_cent: 1 }]).ok, false);
  assert.equal(postenPruefen([{ bezeichnung: 'Rad', menge: 1, netto_cent: 1.5 }]).ok, false);
  assert.equal(postenPruefen([{ bezeichnung: 'Rad', menge: 1, netto_cent: 0 }]).ok, false);
  assert.equal(postenPruefen(Array.from({ length: MAX_POSTEN + 1 }, () => ({ bezeichnung: 'Rad', menge: 1, netto_cent: 1 }))).ok, false);
  assert.ok(SQL.includes('jsonb_array_length(posten) <= 30'));
});

test('Endpreis fürs Portal = Rechnung: gleiche Summe wie steuerGruppen (eine Gruppe 19 %)', () => {
  let x = 7;
  const zufall = () => { x = (x * 1103515245 + 12345) % 2147483648; return x; };
  for (let i = 0; i < 3000; i++) {
    const n = 1 + (zufall() % 6);
    const posten = Array.from({ length: n }, () => ({ bezeichnung: 'P', menge: 1 + (zufall() % 3), netto_cent: zufall() % 600000 }));
    const sm = drSumme(posten);
    // wie die Route: gesamt_netto je Position = cent(summe_cent / 100)
    const sg = steuerGruppen(posten.map((p) => ({ netto: (p.menge * p.netto_cent) / 100, satz: 19 })));
    const c = (e) => Number((e * 100).toFixed(0));
    assert.equal(sm.netto_cent, c(sg.netto), 'netto');
    assert.equal(sm.steuer_cent, c(sg.steuer), 'steuer');
    assert.equal(sm.brutto_cent, c(sg.brutto), 'brutto');
  }
  assert.equal(steuer19(100), 19);
  assert.equal(steuer19(250), 48); // 47,5 → 48 (kaufmännisch)
});

test('Brutto → Netto: centgenau zurück, wo möglich; sonst nächster Wert mit Hinweis', () => {
  let exakt = 0; let gesamt = 0;
  for (let b = 0; b <= 500000; b += 7) {
    gesamt++;
    const r = nettoAusBrutto(b);
    const zurueck = r.netto_cent + steuer19(r.netto_cent);
    if (r.exakt) { exakt++; assert.equal(zurueck, b, String(b)); } else assert.ok(Math.abs(zurueck - b) <= 1, String(b));
  }
  assert.ok(exakt / gesamt > 0.8);
  assert.deepEqual(nettoAusBrutto(299900), { netto_cent: 252017, exakt: true });
  const p = postenAusEingabe('Rad', '1', '2.999,00', true);
  assert.ok(p.ok); assert.equal(p.posten.netto_cent, 252017);
  assert.equal(postenAusEingabe('Rad', '1', '100', false).posten.netto_cent, 10000);
  assert.equal(postenAusEingabe('Rad', '0', '100', false).ok, false);
  assert.equal(postenAusEingabe('', '1', '100', false).ok, false);
  assert.equal(postenAusEingabe('Rad', '1', '', false).ok, false);
});

test('Dienstrad-Wechsel: Portal, Auftragsnummer, Rad mit Rahmennummer, Ausweis und Einweisung', () => {
  const v = { status: 'angebot', portal: null, portal_nr: null, posten: [{ bezeichnung: 'Rad', menge: 1, netto_cent: 1000 }], zweirad_id: null, arbeitnehmer_name: 'Max', arbeitgeber_name: 'AG', leasinggeber_name: null, leasinggeber_anschrift: null, uebergabe_check: {} };
  const rad = { id: ID, herkunft: 'bestand', status: 'reserviert', rahmennummer: 'WBK1' };
  assert.equal(drWechselPruefen(v, 'eingereicht', null).ok, false);
  assert.ok(drWechselPruefen({ ...v, portal: 'Portal' }, 'eingereicht', null).ok);
  assert.equal(drWechselPruefen({ ...v, portal: 'Portal', posten: [] }, 'eingereicht', null).ok, false);
  assert.equal(drWechselPruefen({ ...v, status: 'eingereicht' }, 'genehmigt', null).ok, false);
  assert.ok(drWechselPruefen({ ...v, status: 'eingereicht', portal_nr: 'P-1' }, 'genehmigt', null).ok);
  const g = { ...v, status: 'genehmigt', uebergabe_check: { ausweis: true, einweisung: true } };
  assert.equal(drWechselPruefen(g, 'uebergeben', null).ok, false);
  assert.equal(drWechselPruefen(g, 'uebergeben', { ...rad, rahmennummer: null }).ok, false);
  assert.equal(drWechselPruefen(g, 'uebergeben', { ...rad, herkunft: 'kunde' }).ok, false);
  assert.equal(drWechselPruefen(g, 'uebergeben', { ...rad, status: 'verkauft' }).ok, false);
  assert.equal(drWechselPruefen({ ...g, uebergabe_check: { ausweis: true } }, 'uebergeben', rad).ok, false);
  assert.ok(drWechselPruefen(g, 'uebergeben', rad).ok);
  assert.equal(drWechselPruefen(g, 'abgerechnet', rad).ok, false);
  assert.equal(drWechselPruefen({ ...v, status: 'angebot' }, 'genehmigt', rad).ok, false);
  assert.ok(SQL.includes("new.uebergabe_check ->> 'ausweis'") && SQL.includes("new.uebergabe_check ->> 'einweisung'"));
});

test('Rechnung an den Leasinggeber: erst nach Übergabe, Rahmennummer an der ersten Position', () => {
  assert.equal(drRechnungMoeglich({ status: 'genehmigt', leasinggeber_name: 'L' }).ok, false);
  assert.equal(drRechnungMoeglich({ status: 'uebergeben', leasinggeber_name: ' ' }).ok, false);
  assert.ok(drRechnungMoeglich({ status: 'uebergeben', leasinggeber_name: 'Leasing GmbH' }).ok);
  const rp = drRechnungPosten([{ bezeichnung: 'Testrad E1', menge: 1, netto_cent: 252017 }, { bezeichnung: 'Schloss', menge: 2, netto_cent: 4118 }], 'WBK12345X');
  assert.equal(rp[0].bezeichnung, 'Testrad E1 · Rahmennummer WBK12345X');
  assert.equal(rp[1].bezeichnung, 'Schloss');
  assert.equal(rp[1].summe_cent, 8236);
  assert.ok(rp.every((p) => p.mwst_satz === 19));
  const t = drRechnungText({ nummer: 'DR-2026-0001', portal: 'Portal X', portal_nr: 'P-777', arbeitnehmer_name: 'Max Muster', arbeitgeber_name: 'Firma AG' });
  assert.equal(t.titel, 'Dienstrad Auftrag P-777 · Nutzer Max Muster');
  assert.match(t.notiz, /über Portal X \(Auftrag P-777\)\. Nutzer: Max Muster, Arbeitgeber: Firma AG\. Vorgang DR-2026-0001\./);
});

test('Route rechnung-aus-dienstrad: Empfänger Leasinggeber, Positionen aus der Datenbank, Doppel-Schutz, Storno statt Löschen', () => {
  const r = lies('app/api/rechnung-aus-dienstrad/route.ts');
  assert.ok(r.includes('empfaenger_name: v.leasinggeber_name || null'));
  assert.ok(r.includes('kontakt_id: null'));
  assert.ok(r.includes('postenPruefen(v.posten)'));
  assert.ok(r.includes('drRechnungMoeglich(v)'));
  assert.ok(r.includes('zahlungsstatus !== "storniert"'));
  assert.ok(r.includes('zahlungsstatus: "storniert", netto_summe: 0'));
  assert.ok(!/\.delete\(/.test(r));
  assert.ok(!/body\?\.(posten|preis|betrag)/.test(r), 'keine Preise aus dem Browser');
  assert.ok(SQL.includes("raise exception 'Die Rechnung gehört nicht zu diesem Betrieb.'"));
});

test('Kopf, Kontakte, Suche, Datum', () => {
  const KOPF = { arbeitnehmerName: ' Max  Muster ', arbeitnehmerKontaktId: '', arbeitnehmerTelefon: '', arbeitgeberName: 'Firma AG', portal: '', portalNr: '', abholcode: '', leasinggeberName: '', leasinggeberAnschrift: '', notiz: '' };
  const k = drKopfPruefen(KOPF);
  assert.ok(k.ok); assert.equal(k.zeile.arbeitnehmer_name, 'Max Muster'); assert.equal(k.zeile.portal, null);
  assert.equal(drKopfPruefen({ ...KOPF, arbeitnehmerName: 'M' }).ok, false);
  assert.equal(drKopfPruefen({ ...KOPF, arbeitgeberName: '' }).ok, false);
  assert.equal(drKopfPruefen({ ...KOPF, arbeitnehmerKontaktId: 'x' }).ok, false);
  assert.deepEqual(kontaktLesen({ id: 1, vorname: 'Anna', nachname: 'Kunde', strasse: 'Weg 1', plz: '71032', ort: 'Böblingen', mobil: '0170' }), { id: '1', name: 'Anna Kunde', telefon: '0170', anschrift: 'Weg 1\n71032 Böblingen' });
  const r = { marke: 'Testrad', modell: 'E1', rahmennummer: 'WBK12345X', akku_nr: 'AK 77', motor_nr: null, schluessel_nr: null, halter_name: 'Anna', versicherungskennzeichen: null };
  assert.ok(radPasst(r, 'wbk 123')); assert.ok(radPasst(r, 'ak77')); assert.ok(radPasst(r, '')); assert.ok(!radPasst(r, 'xyz'));
  assert.equal(radName(r, true), 'Testrad E1 · RN WBK12345X');
  assert.equal(datumDe('2026-10-09T10:00:00Z'), '09.10.2026');
  assert.equal(datumDe(null), '—');
});

test('SQL: additiv, Kontrolle, Rechte „Werkstatt", Löschen nur Chef', () => {
  assert.ok(!/\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b|\bdrop\s+column\b/i.test(SQL));
  assert.ok(SQL.includes('-- KONTROLLE (nur lesen) — Erwartung: 3 | 12 | 3 | 1 | 3'));
  assert.equal((SQL.match(/darf_ich_modul_aendern\('werkstatt'\)/g) || []).length, 12);
  assert.equal((SQL.match(/for delete/g) || []).length, 0, 'keine Lösch-Regel für Mitarbeiter');
  assert.ok(SQL.includes('add column if not exists zweirad_id uuid references public.zweirad(id) on delete set null'));
  assert.ok(SQL.includes('AUSSPERR-RISIKO: keines'));
});

test('Menü, Assistent, Werkstatt-Link', () => {
  const rechte = lies('lib/rechte.ts');
  assert.ok(rechte.includes("href: '/dashboard/werkstatt/zweirad', ebene: 3"));
  assert.ok(rechte.includes("href: '/dashboard/werkstatt/zweirad/dienstrad', ebene: 3"));
  const g = lies('lib/guideWissen.ts');
  assert.ok(g.includes("'/dashboard/werkstatt/zweirad': {") && g.includes("'/dashboard/werkstatt/zweirad/dienstrad': {"));
  assert.ok(lies('app/dashboard/werkstatt/page.tsx').includes('href="/dashboard/werkstatt/zweirad"'));
  const d = lies('app/dashboard/werkstatt/zweirad/dienstrad/page.tsx');
  assert.ok(d.includes('useDarfAbrechnen') && d.includes('darfAbrechnen !== false'));
  assert.ok(!/KI-Agent|KI-Crew/.test(d + lies('app/dashboard/werkstatt/zweirad/page.tsx') + lies('app/dashboard/werkstatt/zweirad/[id]/page.tsx')));
});
