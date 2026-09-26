// Paket G, Punkte G9 bis G14 (26.09.2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { imEinzug, laeuftAus } from '../out/mitgliedEinzug.js';
import { afaMitAbgang, zaehltAlsEinnahme, istAbgegangen } from '../out/euerRegeln.js';
import { pruefeEmpfaenger, reservierteZeiten } from '../out/objektzeitRechnung.js';
import { lvGesperrt, pruefePosition } from '../out/bauLvRegeln.js';
import { schadenStatusNachZahlungen } from '../out/kundenVorgaenge.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('G9 Gekuendigte zahlen bis zum Vertragsende weiter', () => {
  assert.equal(imEinzug({ status: 'aktiv' }, '2026-10-01'), true);
  assert.equal(imEinzug({ status: 'gekuendigt', kuendigung_zum: '2026-12-31' }, '2026-10-01'), true);
  assert.equal(imEinzug({ status: 'gekuendigt', kuendigung_zum: '2026-10-01' }, '2026-10-01'), true);
  assert.equal(imEinzug({ status: 'gekuendigt', kuendigung_zum: '2026-09-30' }, '2026-10-01'), false);
  assert.equal(imEinzug({ status: 'gekuendigt', kuendigung_zum: null }, '2026-10-01'), false);
  assert.equal(imEinzug({ status: 'pausiert', kuendigung_zum: '2027-01-01' }, '2026-10-01'), false);
  assert.equal(laeuftAus({ status: 'gekuendigt', kuendigung_zum: '2026-12-31' }, '2026-10-01'), true);
  assert.equal(laeuftAus({ status: 'aktiv' }, '2026-10-01'), false);
  const s = lies('app/dashboard/mitglieder/page.tsx');
  assert.ok(s.includes('liste.filter((m) => imEinzug(m, ausfuehrung) && m.iban'));
  assert.ok(!s.includes("aktive.filter((m) => m.iban && m.mandatsreferenz"));
});

test('G10 EUeR: Storno zaehlt nicht, AfA endet mit dem Abgang', () => {
  assert.equal(zaehltAlsEinnahme({ zahlungsstatus: 'storniert' }), false);
  assert.equal(zaehltAlsEinnahme({ zahlungsstatus: 'Storniert ' }), false);
  assert.equal(zaehltAlsEinnahme({ zahlungsstatus: 'bezahlt' }), true);
  assert.equal(istAbgegangen({ status: 'ausgemustert' }), true);
  assert.equal(istAbgegangen({ status: 'aktiv' }), false);
  // 6.000 EUR, 6 Jahre, angeschafft 01.01.2024 -> 1.000 je Jahr
  const basis = { anschaffungskosten: 6000, nutzungsdauer_jahre: 6, anschaffungsdatum: '2024-01-15' };
  assert.equal(afaMitAbgang({ ...basis, status: 'aktiv' }, 2026).afa, 1000);
  // ausgemustert 30.06.2026: 2025 normal, 2026 halbe AfA + Restbuchwert, 2027 nichts
  const weg = { ...basis, status: 'ausgemustert', abgang_am: '2026-06-30' };
  assert.equal(afaMitAbgang(weg, 2025).afa, 1000);
  const j26 = afaMitAbgang(weg, 2026);
  assert.equal(j26.afa, 500);
  assert.equal(j26.restbuchwertAbgang, 3500);
  assert.deepEqual(afaMitAbgang(weg, 2027), { afa: 0, restbuchwertAbgang: 0, ohneAbgangsdatum: false, zaehlt: false });
  // Abgang im Anschaffungsjahr: Monate ab Anschaffung
  const frueh = afaMitAbgang({ anschaffungskosten: 1200, nutzungsdauer_jahre: 1 * 10, anschaffungsdatum: '2026-03-10', status: 'verkauft', abgang_am: '2026-08-01' }, 2026);
  assert.equal(frueh.afa, 60); // 120/Jahr * 6/12
  assert.equal(frueh.restbuchwertAbgang, 1140);
  // GWG: schon voll abgezogen, kein Restbuchwert
  const gwg = afaMitAbgang({ anschaffungskosten: 500, nutzungsdauer_jahre: 5, anschaffungsdatum: '2025-02-01', status: 'ausgemustert', abgang_am: '2026-05-01' }, 2026);
  assert.equal(gwg.afa + gwg.restbuchwertAbgang, 0);
  // ohne Datum: nicht gerechnet, aber gemeldet
  assert.equal(afaMitAbgang({ ...basis, status: 'verkauft' }, 2026).ohneAbgangsdatum, true);
  assert.equal(afaMitAbgang({ ...basis, status: 'verkauft' }, 2026).afa, 0);
  const e = lies('app/dashboard/euer/page.tsx');
  assert.ok(e.includes('if (!zaehltAlsEinnahme(r as'));
  assert.ok(e.includes('agg.afa + agg.restbuchwertAbgang + num(sonstAus)'));
  const a = lies('app/dashboard/anlagen/page.tsx');
  assert.ok(a.includes("abgang_am: abgegangen ? form.abgang_am : null"));
  assert.ok(a.includes('Bitte das Abgangsdatum angeben'));
});

test('G11 Objektzeiten: erst reservieren, nie ohne Empfaenger', () => {
  assert.equal(pruefeEmpfaenger({}).ok, false);
  assert.equal(pruefeEmpfaenger({ empfaengerName: '   ' }).ok, false);
  assert.deepEqual(pruefeEmpfaenger({ empfaengerName: ' Müller GmbH ' }), { ok: true, kontaktId: null, name: 'Müller GmbH' });
  assert.deepEqual(pruefeEmpfaenger({ kontaktId: 'k1' }), { ok: true, kontaktId: 'k1', name: null });
  const k = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(reservierteZeiten(k, [{ id: 'c' }, { id: 'a' }]).map((z) => z.id), ['a', 'c']);
  assert.deepEqual(reservierteZeiten(k, []), []);
  assert.deepEqual(reservierteZeiten(k, null), []);
  const r = lies('app/api/rechnung-aus-objektzeit/route.ts');
  const reservieren = r.indexOf('.update({ abgerechnet: true })');
  const anlegen = r.indexOf('.from("rechnungen")\n      .insert(');
  assert.ok(reservieren > 0 && anlegen > reservieren, 'Reservieren muss VOR dem Anlegen der Rechnung stehen');
  assert.ok(r.includes('.eq("abgerechnet", false)\n      .select("id")'));
  assert.ok(r.includes('empfaenger_name: empfaengerName') && !r.includes('empfaenger_name: null'));
  assert.equal((r.match(/await freigeben\(\);/g) || []).length, 2);
  const p = lies('app/dashboard/objektzeiten/page.tsx');
  assert.ok(p.includes('kontaktId: empfKontakt || null, empfaengerName: empfName.trim() || null'));
});

test('G12 Bau & LV: abgerechnet ist gesperrt, nichts wird still 0', () => {
  assert.equal(lvGesperrt({ rechnung_id: 'r1', status: 'entwurf' }), true);
  assert.equal(lvGesperrt({ rechnung_id: null, status: 'abgerechnet' }), true);
  assert.equal(lvGesperrt({ rechnung_id: null, status: 'beauftragt' }), false);
  assert.equal(lvGesperrt(null), false);
  assert.deepEqual(pruefePosition('12,5', '48,90'), { ok: true, menge: 12.5, einzelpreis: 48.9, gesamt: 611.25 });
  assert.match(pruefePosition('12 m', '10').fehler, /keine Zahl/);
  assert.match(pruefePosition('3', 'zehn').fehler, /keine Zahl/);
  assert.equal(pruefePosition('ca. 40', '10').ok, false);
  assert.equal(pruefePosition('', '10').ok, false);
  assert.equal(pruefePosition('0', '10').ok, false);
  assert.equal(pruefePosition('3', '').ok, false);
  assert.equal(pruefePosition('3', 'zehn').ok, false);
  assert.deepEqual(pruefePosition('3', '0'), { ok: true, menge: 3, einzelpreis: 0, gesamt: 0 });
  const s = lies('app/dashboard/bau-lv/page.tsx');
  assert.ok(s.includes('const pruefung = pruefePosition(pos.menge, pos.einzelpreis);'));
  assert.ok(!s.includes('Math.round(num(pos.menge) * num(pos.einzelpreis) * 100) / 100'));
  assert.ok(s.includes("{!lvGesperrt(aktivLv) && <button style={styles.wegBtn}"));
  const r = lies('app/api/rechnung-aus-lv/route.ts');
  assert.ok(r.includes('vorhanden.zahlungsstatus !== "storniert"'));
  const sql = lies('supabase-sql/g-paket-g9-g14.sql').replace(/--[^\n]*/g, '');
  assert.ok(/before insert or update or delete on public\.bau_lv_positionen/.test(sql));
  assert.ok(/if not exists \(\s*select 1 from pg_trigger/.test(sql));
});

test('G13 Schaden: offene SB ist keine Kuerzung, Zahlung entfernbar', () => {
  const kasko = { art: 'vollkasko', status: 'abgerechnet', rechnung_betrag: 2000, selbstbeteiligung: 300, zahlungen: [] };
  // Versicherer zahlt korrekt Rechnung minus SB -> nicht gekuerzt
  assert.equal(schadenStatusNachZahlungen({ ...kasko, zahlungen: [{ am: '2026-09-01', betrag: 1700, von: 'versicherer' }] }), 'abgerechnet');
  // Versicherer zahlt zu wenig -> gekuerzt
  assert.equal(schadenStatusNachZahlungen({ ...kasko, zahlungen: [{ am: '2026-09-01', betrag: 1500, von: 'versicherer' }] }), 'gekuerzt');
  // Kunde zahlt SB dazu -> bezahlt
  assert.equal(schadenStatusNachZahlungen({ ...kasko, zahlungen: [{ am: '2026-09-01', betrag: 1700, von: 'versicherer' }, { am: '2026-09-05', betrag: 300, von: 'kunde' }] }), 'bezahlt');
  // Zahlung entfernt: bezahlt faellt zurueck
  assert.equal(schadenStatusNachZahlungen({ ...kasko, status: 'bezahlt', zahlungen: [] }), 'abgerechnet');
  assert.equal(schadenStatusNachZahlungen({ ...kasko, status: 'gekuerzt', zahlungen: [{ am: '2026-09-01', betrag: 1700, von: 'versicherer' }] }), 'abgerechnet');
  // abgeschlossen bleibt, ohne Rechnung bleibt
  assert.equal(schadenStatusNachZahlungen({ ...kasko, status: 'abgeschlossen', zahlungen: [] }), 'abgeschlossen');
  assert.equal(schadenStatusNachZahlungen({ ...kasko, rechnung_betrag: null, status: 'reparatur' }), 'reparatur');
  const s = lies('app/dashboard/kfz/schaden/page.tsx');
  assert.ok(s.includes('async function zahlungEntfernen(i: number)'));
  assert.equal((s.match(/schadenStatusNachZahlungen\(\{ \.\.\.aktuell, zahlungen: liste \}\)/g) || []).length, 2);
  assert.ok(!s.includes("zahlung.von === 'versicherer' ? 'gekuerzt'"));
});

test('G14 Foerder-Angebot ohne ARGONAUT-Pakete', () => {
  const s = lies('app/dashboard/foerder-angebot/page.tsx');
  const pakete = s.slice(s.indexOf('const PAKETE'), s.indexOf('const LEER_POS'));
  assert.ok(pakete.length > 100);
  assert.ok(!/ARGONAUT|Lizenz/i.test(pakete));
  assert.ok(!s.includes("'ARGONAUT Einführungspaket'"));
  assert.ok(s.includes("leistungsbeschreibung: beschreibung.trim() || null"));
  assert.ok(s.includes("window.confirm('Dieses Förder-Angebot löschen?')"));
  const r = lies('app/api/foerder-angebot-pdf/route.ts');
  assert.ok(!r.includes('ARGONAUT OS ist ein betriebliches Software-System'));
  assert.ok(!r.includes('Angebot erstellt mit ARGONAUT OS'));
  assert.ok(!r.includes("'ARGONAUT Einführungspaket'"));
  const sql = lies('supabase-sql/g-paket-g9-g14.sql').replace(/--[^\n]*/g, '');
  assert.ok(/add column if not exists leistungsbeschreibung text/.test(sql));
  assert.ok(/add column if not exists abgang_am date/.test(sql));
  assert.ok(!/drop /i.test(sql));
});
