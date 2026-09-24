// Paket PI (24.09.2026) — Bau-Ablaeufe: Nachtraege, Gewaehrleistung, Musterschreiben.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NACHTRAG_ARTEN, naechsteNummer, nachtragBetrag, pruefeNachtrag, naechsterSchritt, nachtragZahlen,
  sortiereNachtraege, lvUebernahmeMoeglich, REGELWERKE, gewaehrleistungsEnde, sicherheitRueckgabeAb,
  gewaehrleistungStatus, pruefeGewaehrleistung, ruegeFristEnde, pruefeRuege, gewaehrleistungZahlen,
  MUSTER, musterschreiben, offenePlatzhalter, HINWEIS_ANWALT,
} from '../out/bauAblaeufe.js';

const HEUTE = '2026-09-24';

test('Nachtragsnummern: fortlaufend, Luecken werden nicht aufgefuellt', () => {
  assert.equal(naechsteNummer([]), 'N01');
  assert.equal(naechsteNummer(['N01', 'N02']), 'N03');
  assert.equal(naechsteNummer(['N01', 'N04', null, 'x', 'n09']), 'N10');
  assert.equal(naechsteNummer(['N99']), 'N100');
});

test('Nachtragssumme: nie eine Teilsumme, wenn ein Preis fehlt', () => {
  assert.deepEqual(nachtragBetrag([{ kurztext: 'Mauerwerk', menge: '12,5', einheit: 'm²', einzelpreis: '48,20' }, { kurztext: 'Sturz', menge: 2, einzelpreis: 85 }]),
    { betrag: 772.5, fehlend: 0, anzahl: 2 });
  const halb = nachtragBetrag([{ kurztext: 'A', menge: 1, einzelpreis: 10 }, { kurztext: 'B', menge: 3, einzelpreis: '' }]);
  assert.equal(halb.betrag, null);
  assert.equal(halb.fehlend, 1);
  assert.deepEqual(nachtragBetrag([]), { betrag: null, fehlend: 0, anzahl: 0 });
  assert.deepEqual(nachtragBetrag([{ kurztext: '  ', menge: 1, einzelpreis: 1 }]), { betrag: null, fehlend: 0, anzahl: 0 });
  // Rundung je Position auf Cent
  assert.equal(nachtragBetrag([{ kurztext: 'x', menge: 3, einzelpreis: 0.335 }]).betrag, 1.01);
});

test('Zusaetzliche Leistung: Ausfuehrung vor Ankuendigung ist rot', () => {
  const n = { art: 'zusaetzlich', vertragsart: 'vob', status: 'entdeckt', ausfuehrung_ab: '2026-09-20', angekuendigt_am: null };
  const h = pruefeNachtrag(n, HEUTE);
  assert.equal(h[0].stufe, 'rot');
  assert.match(h[0].text, /§ 2 Abs\. 6 VOB\/B/);
  // Ankuendigung NACH Beginn zaehlt nicht
  assert.equal(pruefeNachtrag({ ...n, angekuendigt_am: '2026-09-21' }, HEUTE)[0].stufe, 'rot');
  // rechtzeitig angekuendigt: kein Rot mehr
  assert.ok(!pruefeNachtrag({ ...n, status: 'angekuendigt', angekuendigt_am: '2026-09-19' }, HEUTE).some((x) => x.stufe === 'rot'));
  // nach Beauftragung erledigt
  assert.ok(!pruefeNachtrag({ ...n, status: 'beauftragt', beauftragt_am: '2026-09-22', beauftragt_durch: 'Herr A', betrag_netto: 100 }, HEUTE).some((x) => x.stufe === 'rot'));
});

test('Behinderung ohne Anzeige ist rot, Antwortfrist wird ueberwacht', () => {
  assert.equal(pruefeNachtrag({ art: 'behinderung', vertragsart: 'vob', status: 'entdeckt' }, HEUTE)[0].stufe, 'rot');
  const angeboten = { art: 'geaendert', vertragsart: 'bgb', status: 'angeboten', angekuendigt_am: '2026-09-01', betrag_netto: 500 };
  assert.match(pruefeNachtrag({ ...angeboten, antwort_bis: '2026-09-22' }, HEUTE)[0].text, /seit 2 Tagen abgelaufen/);
  assert.equal(pruefeNachtrag({ ...angeboten, antwort_bis: '2026-09-26' }, HEUTE)[0].stufe, 'gelb');
  assert.equal(pruefeNachtrag({ ...angeboten, antwort_bis: '2026-09-24' }, HEUTE)[0].text, 'Antwortfrist endet heute.');
  assert.equal(pruefeNachtrag({ ...angeboten, betrag_netto: null, antwort_bis: '2026-10-30' }, HEUTE)[0].stufe, 'rot');
});

test('Beauftragt ohne Beweis und ohne LV-Uebernahme wird gemeldet', () => {
  const h = pruefeNachtrag({ art: 'geaendert', vertragsart: 'vob', status: 'beauftragt', betrag_netto: 100, lv_id: 'lv1' }, HEUTE);
  assert.ok(h.some((x) => /Beauftragung festhalten/.test(x.text)));
  assert.ok(h.some((x) => /Leistungsverzeichnis/.test(x.text)));
  assert.equal(naechsterSchritt({ status: 'beauftragt', art: 'geaendert' }), 'Ins LV übernehmen und abrechnen');
  assert.equal(naechsterSchritt({ status: 'entdeckt', art: 'behinderung' }), 'Behinderung schriftlich anzeigen');
});

test('Kennzahlen: offene Summe ehrlich, Quote nach Anzahl', () => {
  const liste = [
    { art: 'geaendert', vertragsart: 'vob', status: 'angeboten', betrag_netto: 1000, angekuendigt_am: '2026-09-01', antwort_bis: '2026-10-30' },
    { art: 'geaendert', vertragsart: 'vob', status: 'entdeckt', betrag_netto: null },
    { art: 'geaendert', vertragsart: 'vob', status: 'beauftragt', betrag_netto: '2.500,00' },
    { art: 'geaendert', vertragsart: 'vob', status: 'abgerechnet', betrag_netto: 300 },
    { art: 'geaendert', vertragsart: 'vob', status: 'abgelehnt', betrag_netto: 700 },
  ];
  const z = nachtragZahlen(liste, HEUTE);
  assert.equal(z.anzahl, 5);
  assert.equal(z.offenAnzahl, 2);
  assert.equal(z.offenBetrag, 1000);
  assert.equal(z.offenOhneBetrag, 1);
  assert.equal(z.beauftragtBetrag, 2800);
  assert.equal(z.abgelehntBetrag, 700);
  assert.equal(z.quote, 67);
  assert.equal(nachtragZahlen([], HEUTE).quote, null);
  const s = sortiereNachtraege([{ nummer: 'N02', art: 'geaendert', vertragsart: 'vob', status: 'abgerechnet' }, { nummer: 'N01', art: 'behinderung', vertragsart: 'vob', status: 'entdeckt' }], HEUTE);
  assert.equal(s[0].nummer, 'N01');
});

test('LV-Uebernahme nur beauftragt, vollstaendig, einmal, nicht in abgerechnetes LV', () => {
  const n = { status: 'beauftragt', art: 'zusaetzlich', lv_id: 'lv1', in_lv_uebernommen: false, positionen: [{ kurztext: 'A', menge: 1, einzelpreis: 10 }] };
  assert.equal(lvUebernahmeMoeglich(n, 'beauftragt').ok, true);
  assert.equal(lvUebernahmeMoeglich({ ...n, status: 'angeboten' }, 'beauftragt').ok, false);
  assert.equal(lvUebernahmeMoeglich({ ...n, in_lv_uebernommen: true }, 'beauftragt').ok, false);
  assert.match(lvUebernahmeMoeglich(n, 'abgerechnet').grund, /gesondert/);
  assert.equal(lvUebernahmeMoeglich({ ...n, lv_id: null }, 'beauftragt').ok, false);
  assert.match(lvUebernahmeMoeglich({ ...n, positionen: [{ kurztext: 'A', menge: 1, einzelpreis: null }] }, 'beauftragt').grund, /Position fehlt/);
});

test('Gewaehrleistungsende: Monate ohne Ueberlauf, 29.02., ohne Frist null', () => {
  assert.equal(gewaehrleistungsEnde({ abnahme_am: '2026-03-15', monate: 48 }), '2030-03-15');
  assert.equal(gewaehrleistungsEnde({ abnahme_am: '2028-02-29', monate: 60 }), '2033-02-28');
  assert.equal(gewaehrleistungsEnde({ abnahme_am: '2026-03-15', monate: null }), null);
  assert.equal(gewaehrleistungsEnde({ abnahme_am: '', monate: 48 }), null);
  assert.equal(gewaehrleistungsEnde({ abnahme_am: '2026-03-15', monate: 0 }), null);
  const vob = REGELWERKE.find((r) => r.key === 'vob_bauwerk');
  const bgb = REGELWERKE.find((r) => r.key === 'bgb_bauwerk');
  assert.equal(vob.monate, 48);
  assert.equal(bgb.monate, 60);
  assert.equal(REGELWERKE.find((r) => r.key === 'individuell').monate, null);
});

test('Sicherheit: Vertrag vor VOB-2-Jahre vor Ende', () => {
  const g = { abnahme_am: '2024-06-10', regelwerk: 'vob_bauwerk', monate: 48, sicherheit_art: 'einbehalt', sicherheit_betrag: 2500 };
  assert.deepEqual(sicherheitRueckgabeAb(g), { datum: '2026-06-10', quelle: 'vob' });
  assert.deepEqual(sicherheitRueckgabeAb({ ...g, sicherheit_rueckgabe_am: '2027-01-01' }), { datum: '2027-01-01', quelle: 'vertrag' });
  assert.deepEqual(sicherheitRueckgabeAb({ ...g, regelwerk: 'bgb_bauwerk', monate: 60 }), { datum: '2029-06-10', quelle: 'ende' });
  assert.deepEqual(sicherheitRueckgabeAb({ ...g, sicherheit_art: 'keine' }), { datum: null, quelle: null });
  const h = pruefeGewaehrleistung(g, HEUTE);
  assert.equal(h[0].stufe, 'rot');
  assert.match(h[0].text, /2\.500,00/);
  assert.ok(!pruefeGewaehrleistung({ ...g, sicherheit_zurueck_am: '2026-07-01' }, HEUTE).some((x) => x.stufe === 'rot'));
});

test('Gewaehrleistungsstatus: laeuft, endet bald, abgelaufen, unvollstaendig', () => {
  assert.equal(gewaehrleistungStatus({ abnahme_am: '2025-01-01', monate: 48 }, HEUTE).status, 'laeuft');
  assert.equal(gewaehrleistungStatus({ abnahme_am: '2022-11-01', monate: 48 }, HEUTE).status, 'endet_bald');
  assert.equal(gewaehrleistungStatus({ abnahme_am: '2020-01-01', monate: 48 }, HEUTE).status, 'abgelaufen');
  assert.equal(gewaehrleistungStatus({ abnahme_am: '2025-01-01' }, HEUTE).status, 'unvollstaendig');
});

test('Maengelruege: VOB-Verlaengerung nur schriftlich, nie vor dem Regelende', () => {
  const g = { abnahme_am: '2023-01-10', regelwerk: 'vob_bauwerk', monate: 48 }; // Ende 2027-01-10
  assert.deepEqual(ruegeFristEnde({ status: 'gemeldet', eingang_am: '2026-09-01', schriftlich: true }, g), { ruege: '2028-09-01', nacharbeit: null });
  assert.deepEqual(ruegeFristEnde({ status: 'gemeldet', eingang_am: '2026-09-01', schriftlich: false }, g), { ruege: null, nacharbeit: null });
  // frueh geruegt: Regelende gilt
  assert.equal(ruegeFristEnde({ status: 'gemeldet', eingang_am: '2023-06-01', schriftlich: true }, g).ruege, '2027-01-10');
  assert.equal(ruegeFristEnde({ status: 'behoben', eingang_am: '2026-09-01', schriftlich: true, abgenommen_am: '2026-10-05' }, g).nacharbeit, '2028-10-05');
  // BGB: keine Verlaengerung
  assert.deepEqual(ruegeFristEnde({ status: 'gemeldet', eingang_am: '2026-09-01', schriftlich: true }, { ...g, regelwerk: 'bgb_bauwerk', monate: 60 }), { ruege: null, nacharbeit: null });
});

test('Maengelruege: Kundenfrist, spaete Ruege, fehlende Reaktion', () => {
  const g = { abnahme_am: '2023-01-10', regelwerk: 'vob_bauwerk', monate: 48 };
  assert.equal(pruefeRuege({ status: 'geprueft', eingang_am: '2026-09-01', frist_kunde: '2026-09-20' }, g, HEUTE)[0].stufe, 'rot');
  assert.ok(pruefeRuege({ status: 'gemeldet', eingang_am: '2026-09-15' }, g, HEUTE).some((x) => /ohne Reaktion/.test(x.text)));
  const spaet = pruefeRuege({ status: 'gemeldet', eingang_am: '2027-03-01' }, g, '2027-03-02');
  assert.ok(spaet.some((x) => /nach dem Ende der Gewährleistung/.test(x.text)));
  assert.deepEqual(pruefeRuege({ status: 'abgelehnt', eingang_am: '2026-09-01', frist_kunde: '2026-09-02' }, g, HEUTE).filter((x) => x.stufe === 'rot'), []);
});

test('Kennzahlen Gewaehrleistung', () => {
  const liste = [
    { id: 'a', abnahme_am: '2024-06-10', regelwerk: 'vob_bauwerk', monate: 48, sicherheit_art: 'buergschaft', sicherheit_betrag: 1200 },
    { id: 'b', abnahme_am: '2020-01-01', regelwerk: 'bgb_sonst', monate: 24 },
    { id: 'c', abnahme_am: '2022-11-01', regelwerk: 'vob_bauwerk', monate: 48, sicherheit_art: 'einbehalt', sicherheit_betrag: 800, sicherheit_zurueck_am: '2024-11-02' },
  ];
  const ruegen = [
    { gewaehrleistung_id: 'a', status: 'termin', eingang_am: '2026-09-01', frist_kunde: '2026-09-10', termin_am: '2026-09-30' },
    { gewaehrleistung_id: 'a', status: 'behoben', eingang_am: '2026-08-01', behoben_am: '2026-08-05' },
  ];
  const z = gewaehrleistungZahlen(liste, ruegen, HEUTE);
  assert.equal(z.laufend, 2);
  assert.equal(z.endetBald, 1);
  assert.equal(z.abgelaufen, 1);
  assert.equal(z.sicherheitFaellig, 1);
  assert.equal(z.sicherheitFaelligBetrag, 1200);
  assert.equal(z.offeneRuegen, 1);
  assert.equal(z.ruegenRot, 1);
});

test('Musterschreiben: Sie-Form, Platzhalter statt erfundener Daten, kein KI-Hinweis', () => {
  assert.equal(new Set(MUSTER.map((m) => m.key)).size, MUSTER.length);
  for (const m of MUSTER) {
    const leer = musterschreiben(m.key, {});
    assert.ok(leer.betreff.length > 10, m.key);
    assert.ok(offenePlatzhalter(leer.text + leer.betreff).length > 0, `${m.key} braucht Platzhalter, wenn nichts bekannt ist`);
    assert.doesNotMatch(leer.text, /\b(du|dich|dir|dein|deine)\b/i, m.key);
    assert.doesNotMatch(leer.text, /\bKI\b|künstliche Intelligenz/i, m.key);
    assert.match(leer.text, /Sehr geehrte Damen und Herren/);
  }
  const voll = musterschreiben('angebot', {
    firma: 'Muster Bau GmbH', kunde: 'Stadt X', bauvorhaben: 'Kita Nord', nummer: 'N03', titel: 'Zusatzwand',
    frist: '2026-10-08', positionen: [{ kurztext: 'Wand', menge: 2, einheit: 'm²', einzelpreis: 50 }], betrag: 100,
  });
  assert.deepEqual(offenePlatzhalter(voll.text + voll.betreff), []);
  assert.match(voll.text, /08\.10\.2026/);
  assert.match(voll.text, /100,00\s€/);
  assert.match(musterschreiben('mehrkosten', { vertragsart: 'vob' }).text, /§ 2 Abs\. 6 VOB\/B/);
  assert.match(musterschreiben('mehrkosten', { vertragsart: 'bgb' }).text, /§ 650b BGB/);
  assert.match(musterschreiben('mehrkosten', {}).text, /\[Rechtsgrundlage/);
  assert.match(HINWEIS_ANWALT, /Anwalt/);
  assert.equal(NACHTRAG_ARTEN.length, 5);
});
