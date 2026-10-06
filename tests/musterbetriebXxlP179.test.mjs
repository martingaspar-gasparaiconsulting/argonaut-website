// Paket 179 (30.09.2026) — Musterbetrieb XXL: ein Konto mit allen Modulen und
// Beispieldaten in jedem Modul, per Knopf im Command Center anlegbar und
// vollstaendig loeschbar. Die Spalten jeder Tabelle wurden gegen den LIVE-Aufbau
// (information_schema, CSV von Martin) in PGlite geprueft (Baulog).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  XXL_SEEDER, XXL_LOESCH_ORDER, XXL_EMAIL, XXL_KENNZEICHEN, alleModuleXxl, xxlPasswort, istXxlKonto,
  loeschPlan, zeilenSichern, neuerKontext, kontextErgaenzen, berlinVersatz, berlinZeit, tagPlus,
  wochenMontag, letzteWerktage, adresseEntschaerfen, gruppenZaehlung,
} from '../out/musterbetriebXxl.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const UID = '11111111-1111-4111-8111-111111111111';
const HEUTE = '2026-09-30';

/** Den ganzen Lauf simulieren: jede Zeile bekommt eine fortlaufende Kennung. */
function simuliere(heute = HEUTE) {
  const ctx = neuerKontext(UID, heute);
  const lauf = [];
  let n = 0;
  for (const s of XXL_SEEDER) {
    const zeilen = zeilenSichern(s.baue(ctx), UID);
    lauf.push({ s, zeilen });
    if (!zeilen.length || s.zugang) continue;
    const ids = zeilen.map(() => `${s.tabelle}-${++n}`);
    kontextErgaenzen(ctx, s.tabelle, ids, zeilen);
  }
  return { ctx, lauf };
}

test('jeder XXL-Seeder liefert Zeilen (kein Modul bleibt leer)', () => {
  const { lauf } = simuliere();
  const leer = lauf.filter((l) => l.zeilen.length === 0).map((l) => l.s.key);
  assert.deepEqual(leer, []);
  const gruppen = new Set(XXL_SEEDER.map((s) => s.gruppe));
  for (const g of ['basis', 'personal', 'auftraege', 'finanzen', 'crm', 'lager', 'bau']) assert.ok(gruppen.has(g), g);
});

test('Besitzer: jede Zeile der neuen Seeder traegt owner_user_id = Musterbetrieb (Service-Schluessel kennt kein auth.uid())', () => {
  const { lauf } = simuliere();
  for (const { s, zeilen } of lauf) {
    for (const z of zeilen) assert.equal(z.owner_user_id, UID, `${s.key} ohne Besitzer`);
  }
});

test('keine zustellbare Adresse: jede E-Mail liegt auf example.com', () => {
  const { lauf } = simuliere();
  let gezaehlt = 0;
  for (const { s, zeilen } of lauf) {
    for (const z of zeilen) {
      for (const [k, v] of Object.entries(z)) {
        if (typeof v === 'string' && v.includes('@')) {
          gezaehlt += 1;
          assert.match(v, /@example\.com$/, `${s.key}.${k} = ${v}`);
        }
      }
    }
  }
  assert.ok(gezaehlt > 10, 'es gibt Adressen, und alle sind entschaerft');
  assert.equal(adresseEntschaerfen('kontakt@muster-gmbh.de'), 'kontakt.muster-gmbh-de@example.com');
  assert.equal(adresseEntschaerfen('A.B@Example.com'), 'a.b@example.com');
});

test('Mitarbeiter: keine Sozialversicherungs-, Steuer-, Bank- oder Geburtsdaten, kein Konto-Verweis', () => {
  const { lauf } = simuliere();
  const ma = lauf.find((l) => l.s.tabelle === 'mitarbeiter').zeilen;
  assert.ok(ma.length >= 5);
  for (const z of ma) {
    for (const k of ['sv_nummer', 'steuer_id', 'iban', 'geburtsdatum', 'adresse', 'auth_user_id', 'notfall_kontakt']) {
      assert.ok(!(k in z) || z[k] == null, `mitarbeiter.${k}`);
    }
  }
});

test('Verweise zeigen nur auf Zeilen, die der Musterbetrieb selbst angelegt hat', () => {
  const { ctx, lauf } = simuliere();
  const ZIEL = {
    mitarbeiter_id: 'mitarbeiter', auftrag_id: 'auftraege', projekt_id: 'projekte', kontakt_id: 'kontakte',
    rechnung_id: 'rechnungen', angebot_id: 'angebote', bestellung_id: 'bestellung', aufmass_id: 'aufmasse',
    lv_id: 'bau_lv', kampagne_id: 'marketing_kampagnen',
  };
  for (const { s, zeilen } of lauf) {
    for (const z of zeilen) {
      for (const [spalte, tab] of Object.entries(ZIEL)) {
        if (z[spalte] == null) continue;
        assert.ok((ctx.ids[tab] || []).includes(z[spalte]), `${s.key}.${spalte} -> ${z[spalte]}`);
      }
    }
  }
  // Positionen haengen wirklich an ihren Koepfen.
  const aufgaben = lauf.find((l) => l.s.key === 'aufgaben').zeilen;
  assert.ok(aufgaben.every((a) => a.projekt_id === ctx.ids.projekte[0]));
  const rp = lauf.find((l) => l.s.key === 'rechnung_positionen').zeilen;
  assert.equal(rp.length, ctx.ids.rechnungen.length);
});

test('Werte passen zu den Auswahllisten der Seiten', () => {
  const { lauf } = simuliere();
  const zeilen = (key) => lauf.find((l) => l.s.key === key).zeilen;
  const erlaubt = (key, spalte, werte) => {
    for (const z of zeilen(key)) assert.ok(werte.includes(z[spalte]), `${key}.${spalte} = ${z[spalte]}`);
  };
  erlaubt('mitarbeiter', 'status', ['aktiv', 'inaktiv', 'beurlaubt']);
  erlaubt('mitarbeiter', 'arbeitszeit_modell', ['vollzeit', 'teilzeit', 'minijob', 'midijob']);
  erlaubt('abwesenheiten', 'typ', ['urlaub', 'krankheit']);
  erlaubt('abwesenheiten', 'status', ['beantragt', 'erfasst', 'genehmigt', 'abgelehnt']);
  erlaubt('schulungen', 'kategorie', ['arbeitsschutz', 'mutterschutz', 'brandschutz', 'datenschutz', 'erste_hilfe', 'sonstiges']);
  erlaubt('bewerber', 'status', ['neu', 'in_pruefung', 'eingeladen', 'abgesagt', 'eingestellt']);
  erlaubt('auftraege', 'status', ['entwurf', 'beauftragt', 'in_bearbeitung', 'abgeschlossen', 'storniert']);
  erlaubt('einsaetze', 'status', ['geplant', 'unterwegs', 'vor_ort', 'erledigt', 'abgesagt']);
  erlaubt('aufgaben', 'status', ['todo', 'in_arbeit', 'review', 'fertig']);
  erlaubt('aufgaben', 'prioritaet', ['niedrig', 'normal', 'hoch', 'dringend']);
  erlaubt('erinnerung', 'kanal', ['telefon', 'email', 'sms', 'whatsapp', 'brief', 'persoenlich']);
  erlaubt('leads', 'status', ['neu', 'offen', 'gewonnen', 'verloren']);
  erlaubt('leads', 'stufe', ['eintragung', 'termin_gebucht', 'termin_gehalten', 'kunde', 'verloren']);
  erlaubt('kontakt_aktivitaeten', 'typ', ['anruf', 'email', 'termin', 'notiz']);
  erlaubt('verkaufschancen', 'phase', ['erstkontakt', 'qualifiziert', 'angebot', 'verhandlung', 'gewonnen', 'verloren']);
  erlaubt('marketing_kampagnen', 'status', ['entwurf', 'aktiv', 'pausiert', 'abgeschlossen']);
  erlaubt('marketing_kalender', 'status', ['geplant', 'entwurf', 'veroeffentlicht']);
  erlaubt('leistungskatalog', 'erfassungsart', ['stunden', 'minuten', 'aw', 'stueck']);
  erlaubt('bestellung', 'status', ['entwurf', 'bestellt', 'teilgeliefert', 'geliefert', 'storniert']);
  erlaubt('inventar', 'zustand', ['neu', 'gut', 'gebraucht', 'defekt', 'ausgemustert']);
  erlaubt('fahrzeuge', 'kraftstoff', ['Diesel', 'Benzin', 'Elektro', 'Hybrid', 'Gas', 'Sonstige']);
  erlaubt('maengel', 'status', ['offen', 'in_arbeit', 'behoben', 'abgenommen']);
  erlaubt('aufmasse', 'status', ['entwurf', 'fertig', 'abgerechnet']);
  erlaubt('bau_nachtrag', 'art', ['zusaetzlich', 'geaendert', 'menge', 'behinderung', 'stundenlohn']);
  erlaubt('bau_nachtrag', 'status', ['entdeckt', 'angekuendigt', 'angeboten', 'beauftragt', 'abgelehnt', 'abgerechnet']);
  // Aufgaben: erledigt genau dann, wenn fertig.
  for (const a of zeilen('aufgaben')) assert.equal(a.erledigt, a.status === 'fertig');
  // Termine/Einsaetze: Ende nach Beginn, keine Kunden-Adresse, keine Erinnerungs-Mail.
  for (const k of ['termine', 'einsaetze']) {
    for (const z of zeilen(k)) {
      assert.ok(new Date(z.ende_am) > new Date(z.beginn_am), k);
      assert.equal(z.kunde_email, null);
    }
  }
  for (const t of zeilen('termine')) assert.equal(t.erinnerung_min, null);
  // Einsatz des Inhabers hat keinen Mitarbeiter.
  for (const e of zeilen('einsaetze')) if (e.inhaber_einsatz) assert.equal(e.mitarbeiter_id, null);
  // Leads ohne Werbe-Einwilligung.
  for (const l of zeilen('leads')) assert.equal(l.werbung_einwilligung, false);
});

test('Summen: Auftrag, LV und Rechnungsposition stimmen mit ihren Positionen', () => {
  const { lauf, ctx } = simuliere();
  const z = (key) => lauf.find((l) => l.s.key === key).zeilen;
  const cent = (x) => Math.round(x * 100);
  z('auftraege').forEach((a, i) => {
    const pos = z('auftrag_positionen').filter((p) => p.auftrag_id === ctx.ids.auftraege[i]);
    assert.equal(cent(pos.reduce((s, p) => s + p.gesamt_netto, 0)), cent(a.netto_summe), a.titel);
    assert.equal(cent(a.netto_summe + a.mwst_summe), cent(a.brutto_summe));
  });
  const lv = z('bau_lv')[0];
  assert.equal(cent(z('bau_lv_positionen').reduce((s, p) => s + p.gesamt_netto, 0)), cent(lv.netto_summe));
  z('rechnung_positionen').forEach((p, i) => assert.equal(p.gesamt_netto, ctx.zeilen.rechnungen[i].netto_summe));
});

test('Loesch-Reihenfolge: jede XXL-Tabelle drin, Kinder vor Eltern, nichts ausserhalb des Registers', () => {
  for (const s of XXL_SEEDER) {
    if (s.zugang) continue;
    assert.ok(XXL_LOESCH_ORDER.includes(s.tabelle), `${s.tabelle} fehlt in XXL_LOESCH_ORDER`);
  }
  const vor = (kind, eltern) => assert.ok(XXL_LOESCH_ORDER.indexOf(kind) < XXL_LOESCH_ORDER.indexOf(eltern), `${kind} vor ${eltern}`);
  vor('auftrag_positionen', 'auftraege'); vor('einsaetze', 'auftraege'); vor('einsaetze', 'mitarbeiter');
  vor('hr_zeiterfassung', 'mitarbeiter'); vor('hr_abwesenheiten', 'mitarbeiter'); vor('hr_schichten', 'mitarbeiter');
  vor('aufgaben', 'projekte'); vor('aufgaben', 'mitarbeiter'); vor('bautagebuch', 'projekte'); vor('maengel', 'projekte');
  vor('bau_lv_positionen', 'bau_lv'); vor('bau_nachtrag', 'bau_lv'); vor('bau_lv', 'projekte'); vor('bau_lv', 'kontakte');
  vor('aufmass_positionen', 'aufmasse'); vor('bestellung_position', 'bestellung');
  vor('marketing_kalender', 'marketing_kampagnen'); vor('rechnung_positionen', 'rechnungen');
  vor('kontakt_aktivitaeten', 'kontakte'); vor('verkaufschancen', 'kontakte'); vor('termine', 'kontakte');
  vor('auftraege', 'kontakte'); vor('angebot_positionen', 'angebote');

  const plan = loeschPlan([
    { tabelle: 'kontakte', datensatz_id: 'k1' }, { tabelle: 'auftraege', datensatz_id: 'a1' },
    { tabelle: 'auftrag_positionen', datensatz_id: 'p1' }, { tabelle: 'unbekannt', datensatz_id: 'u1' },
    { tabelle: '', datensatz_id: 'x' }, { tabelle: 'kontakte', datensatz_id: '' },
  ]);
  assert.deepEqual(plan.map((p) => p.tabelle), ['auftrag_positionen', 'auftraege', 'kontakte', 'unbekannt']);
  assert.deepEqual(plan.find((p) => p.tabelle === 'kontakte').ids, ['k1']);
});

test('Konto-Schutz: geloescht wird nur mit fester Adresse UND Kennzeichen', () => {
  assert.equal(istXxlKonto({ email: XXL_EMAIL, app_metadata: { [XXL_KENNZEICHEN]: true } }), true);
  assert.equal(istXxlKonto({ email: XXL_EMAIL.toUpperCase(), app_metadata: { [XXL_KENNZEICHEN]: true } }), true);
  assert.equal(istXxlKonto({ email: XXL_EMAIL, app_metadata: {} }), false);
  assert.equal(istXxlKonto({ email: XXL_EMAIL, app_metadata: { [XXL_KENNZEICHEN]: 'true' } }), false);
  assert.equal(istXxlKonto({ email: 'kunde@firma.de', app_metadata: { [XXL_KENNZEICHEN]: true } }), false);
  assert.equal(istXxlKonto(null), false);
  assert.match(XXL_EMAIL, /@demo\.argonaut-os\.com$/);
});

test('Module, Passwort, Datum', () => {
  const m = alleModuleXxl();
  assert.equal(new Set(m).size, m.length);
  for (const k of ['bau-lv', 'aufmass', 'bautagebuch', 'schichtplan', 'einkauf', 'einsaetze', 'marketing', 'leads', 'erinnerungen', 'automatisierungen']) {
    assert.ok(m.includes(k), k);
  }
  const p = xxlPasswort();
  assert.ok(p.length >= 24 && /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p));
  assert.notEqual(xxlPasswort(), xxlPasswort());
  assert.equal(xxlPasswort(() => 0), 'Xxl-' + 'a'.repeat(19) + '2');
  // Paket 217: nie ohne Ziffer — auch nicht im ungünstigsten Zufall
  for (let i = 0; i < 2000; i += 1) assert.match(xxlPasswort(), /\d/);

  assert.equal(berlinVersatz('2026-07-01'), '+02:00');
  assert.equal(berlinVersatz('2026-12-01'), '+01:00');
  assert.equal(berlinVersatz('2026-03-29'), '+02:00');
  assert.equal(berlinVersatz('2026-03-28'), '+01:00');
  assert.equal(berlinVersatz('2026-10-25'), '+01:00');
  assert.equal(berlinVersatz('2026-10-24'), '+02:00');
  assert.equal(new Date(berlinZeit('2026-09-30', '08:00')).toISOString(), '2026-09-30T06:00:00.000Z');
  assert.equal(tagPlus('2026-09-30', 2), '2026-10-02');
  assert.equal(tagPlus('2026-03-01', -1), '2026-02-28');
  assert.equal(wochenMontag('2026-09-30'), '2026-09-28');
  assert.equal(wochenMontag('2026-10-04'), '2026-09-28');
  const w = letzteWerktage('2026-09-30', 5);
  assert.deepEqual(w, ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29']);
  assert.deepEqual(gruppenZaehlung([{ gruppe: 'bau', anzahl: 2 }, { gruppe: 'bau', anzahl: 3 }]).bau, 5);
});

test('Lauf an jedem Wochentag und im Winter: Schichten in dieser + naechster Woche, Zeiten nur an Werktagen', () => {
  for (const heute of ['2026-10-04', '2026-12-31', '2027-03-28']) {
    const { lauf } = simuliere(heute);
    const sch = lauf.find((l) => l.s.key === 'schichten').zeilen;
    assert.ok(sch.some((z) => z.datum >= wochenMontag(heute) && z.datum <= tagPlus(wochenMontag(heute), 6)));
    for (const z of lauf.find((l) => l.s.key === 'zeiterfassung').zeilen) {
      const wt = new Date(`${z.datum}T12:00:00Z`).getUTCDay();
      assert.ok(wt !== 0 && wt !== 6 && z.datum < heute);
      assert.ok(new Date(z.gehen_um) > new Date(z.kommen_um));
    }
  }
});

test('Route: nur Betreiber, Loeschen nur mit Kennzeichen und immer mit Besitzer-Filter, kein festes Passwort', () => {
  const r = ohneKommentare(lies('app/api/admin/musterbetrieb-xxl/route.ts'));
  assert.match(r, /const gesperrt = await betreiberGuard\(\);\s*if \(gesperrt\) return gesperrt;/);
  assert.match(r, /if \(!k\.gueltig\)/);
  assert.match(r, /\.delete\(\)\.in\('id', teil\)\.eq\('owner_user_id', uid\)/);
  assert.match(r, /app_metadata: \{ \[XXL_KENNZEICHEN\]: true \}/);
  assert.match(r, /email_confirm: true/);
  assert.match(r, /zeilenSichern\(s\.baue\(ctx\), uid\)/);
  assert.match(r, /const passwort = xxlPasswort\(\);/);
  // Jeder delete in der Route ist auf den Musterbetrieb begrenzt.
  for (const zeile of r.split('\n').filter((z) => z.includes('.delete()'))) {
    assert.match(zeile, /owner_user_id', uid\)|\.eq\('id', uid\)/, zeile.trim());
  }
  const seite = lies('app/admin/command-center/page.tsx');
  assert.match(seite, /import MusterbetriebXxl from '\.\/MusterbetriebXxl';/);
  assert.match(seite, /<MusterbetriebXxl \/>/);
  const kachel = ohneKommentare(lies('app/admin/command-center/MusterbetriebXxl.tsx'));
  assert.doesNotMatch(kachel, /window\.confirm|confirm\(/);
  assert.doesNotMatch(kachel, /localStorage/);
});
