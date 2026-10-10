// Paket 298 (10.10.2026): Premium-Autohaus „Valtier Automobile", ein Jahr im Betrieb.
// Werte gegen die Prüfregeln aus p259–p296 (in der Test-Datenbank eingespielt: 5.162 Zeilen, 0 Fehler,
// Löschen in PREMIUM_LOESCH_ORDER restlos).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PREMIUM_SEEDER, PREMIUM_LOESCH_ORDER, PREMIUM_BESITZER_TABELLEN, PREMIUM_NOTIZ, TEAM, VERKAEUFER_IDX, MODELLE, MIETFLOTTE,
  fahrzeugPlan, premiumFin, zufall, wochentag, werkstattPlan, KAMPAGNEN, INTERESSENTEN,
} from '../out/demoFachdatenKfzPremium.js';
import { FACHDATEN, FACH_LEITTABELLE } from '../out/demoFachdatenKfz.js';
import { DEMO_BETRIEBE, demoBetrieb, demoEmail, demoPasswort } from '../out/demoBetriebe.js';
import { zeilenSichern, neuerKontext, kontextErgaenzen, loeschPlan } from '../out/musterbetriebXxl.js';
import { verkaufsZeilen, filterZeitraum, zeitraum, kennzahlen, monatsReihe, rangliste } from '../out/kfzChefBlick.js';

const WURZEL = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');
const UID = '22222222-2222-4222-8222-222222222222';
const HEUTE = '2026-10-10';
const FIN = /^[A-HJ-NPR-Z0-9]{17}$/;

function simuliere(heute = HEUTE) {
  const ctx = neuerKontext(UID, heute);
  const z = {};
  let n = 0;
  for (const s of PREMIUM_SEEDER) {
    const zeilen = zeilenSichern(s.baue(ctx), UID);
    z[s.key] = zeilen;
    if (!zeilen.length || s.ohneId) continue;
    kontextErgaenzen(ctx, s.tabelle, zeilen.map(() => `${s.tabelle}-${++n}`), zeilen);
  }
  return { ctx, z };
}
const SIM = simuliere();

test('Jede Tabelle bekommt Zeilen, alles gehört dem Vorführ-Konto, keine echte Adresse, unter 1.000 Zeilen je Tabelle', () => {
  const { z } = SIM;
  for (const s of PREMIUM_SEEDER) {
    assert.ok(z[s.key].length > 0, `${s.key} leer`);
    // Supabase liefert je Abfrage höchstens 1.000 Zeilen — darüber sähe die Vorführung Lücken
    assert.ok(z[s.key].length < 1000, `${s.key}: ${z[s.key].length} Zeilen`);
    for (const r of z[s.key]) {
      assert.equal(r.owner_user_id, UID, s.key);
      for (const v of Object.values(r)) if (typeof v === 'string' && v.includes('@')) assert.match(v, /@example\.com$/, s.key);
    }
  }
  const tabellen = PREMIUM_SEEDER.map((s) => s.tabelle);
  for (const nein of ['rechnungen', 'partner_auftrag', 'partner_eintrag', 'kfz_boerse', 'fahrtenbuch', 'kfz_bestand_medien', 'social_video']) assert.ok(!tabellen.includes(nein), nein);
  assert.equal(Object.values(z).reduce((a, l) => a + l.length, 0), 5162, 'Gesamtumfang');
});

test('Gleiche Daten bei jedem Lauf (fester Zufall), Zeit nur über heute', () => {
  assert.equal(JSON.stringify(simuliere().z), JSON.stringify(SIM.z));
  const a = zufall(1), b = zufall(1);
  assert.equal(a(), b());
  assert.equal(wochentag('2026-10-11'), 0);
  assert.equal(wochentag('2026-10-10'), 6);
  // an einem anderen Tag rutscht alles mit: kein Verkauf in der Zukunft, kein Sonntag
  const p = fahrzeugPlan('2026-03-02');
  assert.ok(p.every((f) => !f.verkauft || (f.verkauft < '2026-03-02' && wochentag(f.verkauft) !== 0)));
});

test('Team: 50 Personen, zwei Geschäftsführer, Vertrieb 15, Media mit zwei Videocuttern, Werkstatt 14', () => {
  assert.equal(TEAM.length, 50);
  const je = {};
  for (const m of TEAM) je[m.abteilung] = (je[m.abteilung] || 0) + 1;
  assert.deepEqual(je, {
    'Geschäftsführung': 2, Vertrieb: 15, Media: 5, Werkstatt: 14, Aufbereitung: 4, 'Teile und Lager': 3,
    'Zulassung und Disposition': 3, 'Buchhaltung und Verwaltung': 3, Empfang: 1,
  });
  assert.equal(TEAM.filter((m) => m.position.startsWith('Videocutter')).length, 2);
  assert.equal(new Set(TEAM.map((m) => `${m.vorname} ${m.nachname}`)).size, 50, 'keine Doppelten');
  assert.equal(VERKAEUFER_IDX.length, 12);
  const ma = SIM.z.team;
  assert.ok(ma.every((m) => m.abteilung && m.position && m.status === 'aktiv' && m.eintrittsdatum < HEUTE));
  assert.equal(new Set(ma.map((m) => m.email)).size, 50);
});

test('Bestand: rund 120 Premium-Fahrzeuge in jedem Status, gültige eindeutige FIN, Langsteher', () => {
  const b = SIM.z.kfz_bestand;
  const st = {};
  for (const r of b) st[r.status] = (st[r.status] || 0) + 1;
  assert.deepEqual(st, { verkauft: 515, zulauf: 10, aufbereitung: 12, reserviert: 13, bestand: 85 });
  for (const r of b) {
    assert.match(r.fin, FIN, r.interne_nr);
    assert.ok(r.vk_brutto > r.ek_netto && r.ek_netto > 0, r.interne_nr);
    assert.ok(['25a', 'regel'].includes(r.besteuerung));
    assert.ok(r.erstzulassung <= HEUTE && r.erstzulassung.endsWith('-01'));
    assert.equal(r.eingang_am === null, r.status === 'zulauf', r.interne_nr);
    assert.equal(r.verkauft_am !== null, r.status === 'verkauft');
    if (r.verkauft_am) assert.ok(r.eingang_am <= r.verkauft_am && r.verkauft_am < HEUTE);
    assert.ok(!r.inseriert || r.status === 'bestand' || r.status === 'reserviert');
  }
  assert.equal(new Set(b.map((r) => r.fin)).size, b.length);
  assert.equal(new Set(b.map((r) => r.interne_nr)).size, b.length);
  const marken = new Set(b.map((r) => r.marke));
  for (const m of ['Porsche', 'Mercedes-AMG', 'BMW', 'Audi', 'Bentley', 'Land Rover', 'Lamborghini', 'Ferrari', 'Aston Martin', 'Maserati']) assert.ok(marken.has(m), m);
  const lang = b.filter((r) => r.status === 'bestand' && r.eingang_am < '2026-06-12').length;
  assert.equal(lang, 12, 'Langsteher über 120 Tage');
  assert.equal(premiumFin('WP0', 0), 'WP0ZZZVALT2000001');
});

test('Chef-Blick: 269 Verkäufe dieses Jahr gegen 181 im Vorjahr, jeder Monat befüllt, 12 Verkäufer in der Rangliste, kein Verlustgeschäft', () => {
  const { z, ctx } = SIM;
  const fz = z.kfz_bestand.map((r, i) => ({ id: ctx.ids.kfz_bestand[i], interne_nr: r.interne_nr, marke: r.marke, modell: r.modell, status: r.status, eingang_am: r.eingang_am, verkauft_am: r.verkauft_am, ek_netto: r.ek_netto, vk_brutto: r.vk_brutto, besteuerung: r.besteuerung }));
  const zeilen = verkaufsZeilen({ fahrzeuge: fz, kalk: z.kfz_bestand_kalk, verkaeufe: z.kfz_verkauf, kosten: z.kfz_bestand_kosten, einst: { standkostenTag: 12, gemeinkostenProzent: 5 } });
  const zr = zeitraum('jahr', HEUTE);
  const jetzt = kennzahlen(filterZeitraum(zeilen, zr.von, zr.bis));
  const vj = kennzahlen(filterZeitraum(zeilen, zr.vjVon, zr.vjBis));
  assert.equal(jetzt.anzahl, 269);
  assert.equal(vj.anzahl, 181);
  assert.equal(jetzt.eingerechnet, 269, 'jede Kalkulation vollständig');
  for (const m of monatsReihe(zeilen, HEUTE)) {
    if (m.zukunft) continue;
    assert.ok(m.anzahl > 0 && m.vjAnzahl > 0, m.monat);
  }
  const rl = rangliste(filterZeitraum(zeilen, zr.von, zr.bis)).filter((g) => g.platz !== null);
  assert.equal(rl.length, 12);
  for (const x of zeilen) assert.ok(x.k.rohertrag > 0, `${x.nr} Rohertrag ${x.k.rohertrag}`);
  assert.ok(jetzt.standtageSchnitt > 30 && jetzt.standtageSchnitt < 90, `Standtage ${jetzt.standtageSchnitt}`);
  assert.equal(z.kfz_bestand_kalk.filter((k) => k.vk_erzielt).length, 515, 'jeder Verkauf mit erzieltem Preis');
  assert.deepEqual(z.modul_einstellung.map((e) => e.modul), ['kfz-kalk', 'kfz-chef']);
  assert.equal(z.modul_einstellung[1].einstellung.rangliste, true);
});

test('Vertrieb: Anfragen, Probefahrten, Verträge, Ankauf, Tresor, Zulassung nach den Prüfregeln', () => {
  const { z, ctx } = SIM;
  const a = z.kfz_anfrage;
  assert.equal(new Set(a.map((x) => x.nr)).size, a.length);
  const ast = {};
  for (const x of a) {
    ast[x.status] = (ast[x.status] || 0) + 1;
    assert.ok(['telefon', 'mail', 'laden', 'website', 'boerse', 'empfehlung', 'sonstiges'].includes(x.quelle));
    const zu = x.status === 'gewonnen' || x.status === 'verloren';
    assert.equal(x.abgeschlossen_am !== null, zu);
    assert.equal(x.faellig_am === null, zu);
    assert.ok(x.verantwortlich_id && x.verantwortlich_name);
  }
  assert.deepEqual(ast, { gewonnen: 174, verloren: 50, neu: 9, in_arbeit: 13, termin: 8, angebot: 8 });

  const p = z.kfz_probefahrt;
  assert.equal(new Set(p.map((x) => x.nr)).size, p.length);
  for (const x of p) {
    assert.ok(['geplant', 'unterwegs', 'zurueck'].includes(x.status));
    assert.ok(['BB-06401', 'BB-06402', 'BB-06403', 'BB-06404'].includes(x.kennzeichen) && x.kennzeichen_art === 'rot');
    if (x.status === 'geplant') assert.ok(x.start_am > `${HEUTE}T23` && !x.fs_geprueft);
    if (x.status === 'zurueck') assert.ok(x.km_ende >= x.km_start && x.rueck_am && x.start_am < `${HEUTE}T00`);
    assert.ok(x.ergebnis === null || ['offen', 'interesse', 'kauf', 'kein_interesse'].includes(x.ergebnis));
  }
  assert.equal(p.filter((x) => x.status === 'unterwegs').length, 1);

  const v = z.kfz_verkauf;
  assert.equal(new Set(v.map((x) => x.nr)).size, v.length);
  assert.equal(new Set(v.map((x) => x.bestand_id)).size, v.length, 'ein Vorgang je Fahrzeug');
  const vst = {};
  for (const x of v) {
    vst[x.status] = (vst[x.status] || 0) + 1;
    assert.ok(['verbraucher', 'unternehmer'].includes(x.kaeufer_art));
    // Gewährleistung: ausgeschlossen nur beim Unternehmer, Verkürzung beim Verbraucher nur gesondert vereinbart
    if (x.gewaehr === 'ausgeschlossen') assert.equal(x.kaeufer_art, 'unternehmer');
    if (x.gewaehr === 'ein_jahr') assert.ok(x.kaeufer_art === 'verbraucher' && x.gewaehr_gesondert === true);
    if (x.status === 'uebergeben') assert.ok(x.vertrag_am <= x.uebergabe_am && x.uebergabe_am < HEUTE && x.ausweis_geprueft);
    assert.ok(x.preis_brutto > 0);
  }
  assert.deepEqual(vst, { uebergeben: 113, vertrag: 3, reserviert: 10, angebot: 8 });
  const nrs = v.map((x) => x.nr);
  assert.deepEqual([...nrs].sort(), nrs, 'Vorgangsnummern in Datumsreihenfolge');

  // Tresor: je Fahrzeug im Haus genau ein Brief, Verkaufte der letzten 100 Tage beim Käufer
  const imHaus = z.kfz_bestand.map((r, i) => [r, ctx.ids.kfz_bestand[i]]).filter(([r]) => r.status !== 'verkauft' && r.status !== 'zulauf');
  for (const [, id] of imHaus) assert.equal(z.kfz_tresor.filter((t) => t.bestand_id === id && t.art === 'zb2').length, 1);
  for (const t of z.kfz_tresor) assert.ok(['zb2', 'schluessel'].includes(t.art) && ['im_haus', 'bei_zulassung', 'beim_kaeufer'].includes(t.status));

  for (const x of z.kfz_zulassung) assert.ok(['offen', 'beim_amt', 'erledigt'].includes(x.status) && (x.evb === null || /^[A-Z0-9]{7}$/.test(x.evb)));
  for (const x of z.kfz_ankauf) {
    assert.ok(['offen', 'angeboten', 'angekauft', 'abgelehnt'].includes(x.status));
    assert.match(x.fin, FIN);
    if (x.status === 'angekauft') assert.ok(x.bestand_id && x.ankaufpreis > 0 && x.angekauft_am);
  }
  const fins = new Set(z.kfz_bestand.map((r) => r.fin));
  assert.equal(z.kfz_ankauf.filter((x) => x.status === 'angekauft' && fins.has(x.fin)).length, 30, 'Ankauf und Bestand teilen die FIN');
  for (const k of z.kfz_bestand_kosten) assert.ok(['aufbereitung', 'reparatur', 'teile', 'lack', 'reifen', 'hu', 'transport', 'zulassung', 'werbung', 'fremd', 'sonstiges'].includes(k.art));
});

test('Werkstatt: Kundenfahrzeuge aus dem eigenen Verkauf, volles Board, interne Aufbereitung', () => {
  const { z } = SIM;
  const fins = new Set(z.kfz_bestand.filter((r) => r.status === 'verkauft').map((r) => r.fin));
  assert.ok(z.werkstatt_fahrzeuge.every((w) => fins.has(w.fin)), 'Werkstattkunden haben bei uns gekauft');
  const wa = z.werkstatt_auftraege;
  assert.equal(new Set(wa.map((w) => w.nummer)).size, wa.length);
  const st = {};
  for (const w of wa) st[w.status] = (st[w.status] || 0) + 1;
  assert.equal(st.angenommen + st.in_arbeit + st.wartet + st.fertig, 38, 'auf dem Board');
  for (const w of wa) {
    assert.ok(['angenommen', 'in_arbeit', 'wartet', 'fertig', 'abgeholt'].includes(w.status));
    assert.equal(w.fertig_am !== null, w.status === 'fertig' || w.status === 'abgeholt', w.nummer);
    assert.ok(w.zustaendig_mitarbeiter_id);
    if (w.kunde_name === 'Autohaus intern') assert.ok(w.kfz_bestand_id && !w.fahrzeug_id);
    else assert.ok(w.fahrzeug_id && w.kontakt_id && !w.kfz_bestand_id);
    if (w.archiviert) assert.equal(w.status, 'abgeholt');
  }
  assert.equal(wa.filter((w) => w.kunde_name === 'Autohaus intern').length, 12);
  assert.equal(werkstattPlan(HEUTE).length, wa.length);
  // Hochvolt-Arbeiten nur an Elektro- und Plug-in-Fahrzeugen, Räderwechsel nie am Motorrad
  const fzVon = new Map(z.werkstatt_fahrzeuge.map((w, i) => [SIM.ctx.ids.werkstatt_fahrzeuge[i], w]));
  for (const w of wa) {
    const fz = fzVon.get(w.fahrzeug_id);
    if (!fz) continue;
    if (w.titel.startsWith('Hochvolt')) assert.ok(fz.kraftstoff === 'Elektro' || fz.kraftstoff.includes('Plug-in'), `${w.nummer} ${fz.kraftstoff}`);
    if (['Ducati', 'BMW'].includes(fz.hersteller) && /Panigale|M 1000/.test(fz.modell)) assert.ok(!/Räder|Keramik|Software/.test(w.titel), w.titel);
  }
  assert.equal(z.werkstatt_positionen.length, 620);
});

test('Vermietung und Termine: nur Zukunft, keine Überschneidung je Fahrzeug, nie sonntags', () => {
  const { z } = SIM;
  for (const m of MIETFLOTTE) assert.ok(['pkw', 'transporter', 'luxus'].includes(m.art) && m.kaution > 0);
  const je = {};
  for (const b of z.miet_buchung) {
    assert.ok(b.abholung > `${HEUTE}T23` && b.rueckgabe_plan > b.abholung && b.status === 'reserviert');
    (je[b.fahrzeug_id] ||= []).push(b);
  }
  for (const l of Object.values(je)) {
    l.sort((a, b) => (a.abholung < b.abholung ? -1 : 1));
    for (let i = 1; i < l.length; i++) assert.ok(l[i].abholung >= l[i - 1].rueckgabe_plan, 'Überschneidung');
  }
  for (const t of z.termine) {
    assert.ok(t.beginn_am < t.ende_am && t.beginn_am > `${HEUTE}T23` && t.status === 'geplant');
    assert.notEqual(wochentag(t.beginn_am.slice(0, 10)), 0);
  }
  for (const u of z.hr_abwesenheiten) assert.ok(u.typ === 'urlaub' && u.bis >= u.von && !u.au_vorhanden, 'nur Urlaub, keine Krankmeldung');
});

test('Media-Abteilung: Kampagnen, Bibliothek mit Werten der Seite, Redaktionskalender, Social ohne Pflicht-Medien, Schnitt-Aufgaben bei den Videocuttern', () => {
  const { z, ctx } = SIM;
  assert.equal(z.marketing_kampagnen.length, KAMPAGNEN.length);
  const seite = lies('app/dashboard/marketing/bibliothek/page.tsx');
  const werte = (name) => [...seite.slice(seite.indexOf(name)).split('];')[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const typen = werte('const TYP_OPTS'), kanaele = werte('const KANAL_OPTS'), stati = werte('const STATUS_OPTS');
  assert.ok(typen.includes('post') && kanaele.includes('instagram') && stati.includes('veroeffentlicht'));
  for (const i of z.marketing_inhalte) {
    assert.ok(typen.includes(i.typ), i.typ);
    assert.ok(kanaele.includes(i.kanal), i.kanal);
    assert.ok(stati.includes(i.status), i.status);
  }
  assert.ok(z.marketing_inhalte.filter((i) => i.titel.startsWith('Walkaround-Video')).length >= 10);
  for (const k of z.marketing_kalender) {
    assert.ok(['veroeffentlicht', 'geplant', 'entwurf'].includes(k.status));
    if (k.status === 'veroeffentlicht') assert.ok(k.geplant_am < `${HEUTE}T00`);
    if (k.status === 'geplant') assert.ok(k.geplant_am > `${HEUTE}T00`);
  }
  for (const s of z.social_beitrag) {
    assert.ok(['entwurf', 'gesendet'].includes(s.status), 'nie „geplant" — kein Posting-Job fasst die Vorführung an');
    assert.ok(s.kanaele.every((k) => ['facebook', 'linkedin', 'google_business'].includes(k)), 'nur Kanäle ohne Bild-/Video-Pflicht');
    assert.deepEqual(s.medien_urls, []);
    assert.ok([...s.text].length <= 1500);
  }
  const cutter = TEAM.map((m, i) => [m, i]).filter(([m]) => m.position.startsWith('Videocutter')).map(([, i]) => ctx.ids.mitarbeiter[i]);
  const schnitt = z.aufgaben.filter((a) => a.titel.startsWith('Walkaround-Video schneiden'));
  assert.ok(schnitt.length >= 5 && schnitt.every((a) => cutter.includes(a.mitarbeiter_id)));
  for (const a of z.aufgaben) assert.ok(a.projekt_id && ['todo', 'in_arbeit', 'review', 'fertig'].includes(a.status) && a.erledigt === (a.status === 'fertig'));
});

test('Löschen: jede Tabelle in der Reihenfolge, Kinder vor Eltern, Besitzer-Tabellen ohne id', () => {
  for (const s of PREMIUM_SEEDER) {
    if (s.ohneId) continue;
    assert.ok(PREMIUM_LOESCH_ORDER.includes(s.tabelle) || s.tabelle === 'kontakte', s.tabelle);
  }
  const o = (t) => PREMIUM_LOESCH_ORDER.indexOf(t);
  for (const [kind, eltern] of [
    ['miet_buchung', 'miet_fahrzeug'], ['werkstatt_positionen', 'werkstatt_auftraege'], ['werkstatt_auftraege', 'werkstatt_fahrzeuge'], ['werkstatt_auftraege', 'mitarbeiter'],
    ['werkstatt_auftraege', 'kfz_bestand'], ['kfz_verkauf', 'kfz_bestand'], ['kfz_ankauf', 'kfz_bestand'], ['kfz_tresor', 'kfz_bestand'], ['kfz_anfrage', 'mitarbeiter'],
    ['aufgaben', 'projekte'], ['aufgaben', 'mitarbeiter'], ['hr_abwesenheiten', 'mitarbeiter'], ['marketing_inhalte', 'marketing_kampagnen'], ['marketing_kalender', 'marketing_kampagnen'],
  ]) assert.ok(o(kind) >= 0 && o(kind) < o(eltern), `${kind} vor ${eltern}`);
  assert.deepEqual(PREMIUM_BESITZER_TABELLEN, ['miet_einstellung']);
  assert.ok(PREMIUM_SEEDER.filter((s) => s.ohneId).every((s) => ['kfz_bestand_kalk', 'miet_einstellung'].includes(s.tabelle)));
  const plan = loeschPlan([{ tabelle: 'kontakte', datensatz_id: 'k' }, { tabelle: 'projekte', datensatz_id: 'p' }, { tabelle: 'aufgaben', datensatz_id: 'a' }], [...PREMIUM_LOESCH_ORDER, 'kontakte']);
  assert.deepEqual(plan.map((p) => p.tabelle), ['aufgaben', 'projekte', 'kontakte']);
  assert.ok(PREMIUM_NOTIZ.includes('Beispiel'));
  assert.equal(INTERESSENTEN, 60);
  assert.equal(MODELLE.length, 37);
});

test('Vorführ-Betrieb „premium": Stammdaten mit gültiger IBAN und USt-IdNr., verdrahtet in Route und Seite', () => {
  const b = demoBetrieb('premium');
  assert.ok(b);
  assert.ok(DEMO_BETRIEBE.length >= 23, 'P299/P300: dazu die Zeitreise-Stufen');
  assert.equal(b.kategorie, demoBetrieb('autohaus').kategorie);
  assert.equal(demoEmail('premium'), 'premium@demo.argonaut-os.com');
  assert.equal(demoPasswort('premium'), 'premium2026');
  // IBAN-Prüfziffer (mod 97)
  const iban = b.iban;
  const umgestellt = (iban.slice(4) + iban.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  assert.equal(BigInt(umgestellt) % 97n, 1n);
  // USt-IdNr. DE: ISO 7064 MOD 11,10
  let p = 10;
  for (const c of b.ustId.slice(2, 10)) { let s = (+c + p) % 10; if (s === 0) s = 10; p = (2 * s) % 11; }
  let pz = 11 - p; if (pz === 10) pz = 0;
  assert.equal(String(pz), b.ustId.slice(10));
  assert.equal(new Set(DEMO_BETRIEBE.map((x) => x.iban)).size, DEMO_BETRIEBE.length);
  assert.equal(new Set(DEMO_BETRIEBE.map((x) => x.slug)).size, DEMO_BETRIEBE.length);

  assert.deepEqual(FACHDATEN.premium.seeder.map((x) => x.key), PREMIUM_SEEDER.map((x) => x.key));
  assert.deepEqual(FACHDATEN.premium.loeschOrder, PREMIUM_LOESCH_ORDER);
  assert.equal(FACH_LEITTABELLE.premium, 'kfz_bestand');
  const r = lies('app/api/admin/demo-betriebe/route.ts');
  assert.ok(r.includes('for (let i = 0; i < zeilen.length; i += BLOCK) {'), 'in Blöcken schreiben');
  assert.ok(r.includes('const BLOCK = 500;'));
  assert.ok(r.includes("kontextErgaenzen(ctx, s.tabelle, ids, teil);"), 'Verweise je Block');
  assert.ok(r.includes("if (error || !data) { hinweise.push(`${s.key}: ${error?.message || 'keine Daten'}`); break; }"), 'Abbruch statt falscher Verweise');
  const seite = lies('app/admin/demo-betriebe/page.tsx');
  assert.ok(seite.includes("anlegen(['premium'])"));
});
