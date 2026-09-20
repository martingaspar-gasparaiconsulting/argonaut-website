// ============================================================================
// tests/holzSortimentP29.test.mjs
//
// PUNKT 29 (R2b) — Tests fuer die Branchen-Rechner, Gruppe 1:
//   app/dashboard/_components/holzLogik.ts      (Mengenumrechnung)
//   app/dashboard/_components/sortimentLogik.ts (Trocknungsgrad, 1. BImSchV)
//
// Beide Dateien sind fachlich gut gebaut — holzLogik ist die sauberste
// Umrechnung im Haus. Genau deshalb lohnt es sich, sie festzunageln: was
// hier verrutscht, verrutscht in Preisauskunft, Auftrag, Lieferschein und
// Rechnung gleichzeitig, weil alle vier ueber diese eine Datei rechnen.
//
// Zwei Befunde am 20.09.2026 am echten Code GEMESSEN und repariert:
//   · fmProSrm(NaN) lieferte den Faktor fuer 25 cm statt fuer 33 cm.
//   · runde() rundete negative Werte in die falsche Richtung.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runde, fmProSrm, holzartFaktor, brauchtScheitlaenge, istHolzEinheit,
  nachFestmeter, vonFestmeter, umrechnen, srmProFm, rmProFm, verwendeterFaktor,
  pruefeMenge, formatZahl, formatMenge, formatMengeMitHolz, umrechnungsHinweis,
  alleEinheiten, einheitKurz, einheitLang, holzartName,
  STANDARD_UMRECHNUNG, STANDARD_SCHEITLAENGE, STANDARD_HOLZART,
  SCHEITLAENGEN, EINHEITEN, HOLZARTEN, HOLZ_BASIS_EINHEIT,
} from '../out/holzLogik.js';
import {
  BRENNFERTIG_GRENZE_PROZENT, TROCKNUNGSGRADE, STANDARD_TROCKNUNGSGRAD,
  trocknungsgradInfo, trocknungsgradName, istTrocknungsgrad, istBrennfertig,
  trocknungsgradAusRestfeuchte, restfeuchtePasst, restfeuchteBereichText,
  neuerSortimentEntwurf, sortimentBezeichnung, sortimentBezeichnungPdf,
  anzeigeName, sortimentSuchtext, pruefeSortiment, sortimentKlartext,
  sortiereSortimente,
} from '../out/sortimentLogik.js';

/** Ein vollstaendiger Sortiment-Datensatz mit sinnvollen Vorgaben. */
function sort(ueber = {}) {
  return {
    id: 'x', owner_user_id: 'u', firma_id: null,
    holzart: 'buche', scheitlaenge_cm: 33, trocknungsgrad: 'lufttrocken',
    restfeuchte_prozent: null, bezeichnung: null, notiz: null, aktiv: true,
    erstellt_am: '2026-01-01', aktualisiert_am: '2026-01-01',
    ...ueber,
  };
}

// ===========================================================================
// TEIL 1 — holzLogik: DIE BEFUNDE
// ===========================================================================

test('BEFUND: eine Scheitlaenge, die keine ist, nimmt den Standard', () => {
  // GEMESSEN vorher: fmProSrm(NaN) ergab 0,42 — den Faktor fuer 25 cm.
  // `Math.abs(b - NaN) < Math.abs(a - NaN)` ist immer false, also blieb
  // reduce beim ersten Tabelleneintrag haengen. Fuenf Prozent mehr Holz
  // je Schuettraummeter, und niemand haette es bemerkt.
  const standard = STANDARD_UMRECHNUNG.fmProSrmNachLaenge[STANDARD_SCHEITLAENGE];
  assert.equal(standard, 0.4);
  assert.equal(fmProSrm(Number.NaN), standard, 'vorher 0,42');
  assert.equal(fmProSrm(0), standard, 'vorher 0,42');
  assert.equal(fmProSrm(-10), standard, 'vorher 0,42');
  assert.equal(fmProSrm(Infinity), standard);
  assert.equal(fmProSrm(undefined), standard, 'war schon richtig');
});

test('BEFUND: das faellt bis in die Umrechnung durch', () => {
  const mitNaN = umrechnen(10, 'srm', 'fm', { scheitlaenge: Number.NaN });
  const mitStandard = umrechnen(10, 'srm', 'fm', { scheitlaenge: 33 });
  assert.equal(mitNaN, mitStandard, 'vorher 4,2 FM statt 4,0 FM — 5 Prozent zu viel');
  assert.equal(runde(mitStandard, 4), 4);
});

test('BEFUND: runde() rundet symmetrisch um Null', () => {
  assert.equal(runde(2.345, 2), 2.35);
  assert.equal(runde(-2.345, 2), -2.35, 'vorher -2,34: eine Ruecknahme rundete anders als die Lieferung');
  assert.equal(runde(0), 0);
  assert.equal(runde(-0.0005, 3), -0.001);
});

test('BEFUND: eine Ruecknahme rechnet spiegelbildlich zur Lieferung', () => {
  // Der erste Entwurf dieses Tests nahm 8 SRM — und blieb GRUEN, auch mit der
  // kaputten Rundung: 8 x 0,38 x 0,94 trifft keine halbe Stelle. Die
  // Gegenprobe faerbte deshalb nur EINEN Test rot statt zwei, und genau
  // daran ist es aufgefallen.
  //
  // Die Mengen unten treffen die Rundungsgrenze wirklich. Sie sind nicht
  // ausgedacht, sondern durch Absuchen aller Viertel-SRM von 0,25 bis 100
  // gegen die alte Fassung GEMESSEN: bei 50-cm-Scheiten ergab eine
  // Ruecknahme von 0,25 SRM alt -0,09 FM statt -0,10 FM.
  const faelle = [
    [0.25, { scheitlaenge: 50 }],
    [0.75, { scheitlaenge: 50 }],
    [1.25, { scheitlaenge: 50 }],
    [8, { holzart: 'fichte', scheitlaenge: 50 }],
  ];
  for (const [menge, opt] of faelle) {
    const hin = alleEinheiten(menge, 'srm', opt);
    const zurueck = alleEinheiten(-menge, 'srm', opt);
    for (const k of ['fm', 'rm', 'srm', 'm3']) {
      assert.equal(zurueck[k], -hin[k], `${menge} SRM ${JSON.stringify(opt)}, Feld ${k}`);
    }
  }
});

test('BEFUND: 0,25 SRM bei 50 cm — der Fall, an dem es kippt', () => {
  assert.equal(alleEinheiten(-0.25, 'srm', { scheitlaenge: 50 }).fm, -0.1, 'vorher -0,09');
  assert.equal(alleEinheiten(0.25, 'srm', { scheitlaenge: 50 }).fm, 0.1);
});

test('runde() laesst Unsinn Unsinn bleiben, statt ihn zu 0 zu machen', () => {
  assert.ok(Number.isNaN(runde(Number.NaN)));
  assert.equal(runde(Infinity), Infinity);
});

// ===========================================================================
// TEIL 2 — holzLogik: die Umrechnung selbst
// ===========================================================================

test('die Faustregel stimmt: 1 FM sind rund 1,4 RM und 2,5 SRM', () => {
  assert.equal(runde(rmProFm(), 2), 1.43);
  assert.equal(runde(srmProFm(), 2), 2.5);
});

test('Festmeter und Kubikmeter sind rechnerisch dasselbe', () => {
  assert.equal(umrechnen(7.5, 'fm', 'm3'), 7.5);
  assert.equal(umrechnen(7.5, 'm3', 'fm'), 7.5);
  assert.equal(nachFestmeter(3, 'm3'), 3);
});

test('dieselbe Einheit bleibt unveraendert — ohne jede Rechnung', () => {
  for (const e of ['fm', 'rm', 'srm', 'm3']) {
    assert.equal(umrechnen(8.33, e, e), 8.33, e);
  }
});

test('DIE INVARIANTE: hin und zurueck ergibt wieder die Ausgangsmenge', () => {
  const kombis = [
    ['srm', 'fm'], ['srm', 'rm'], ['srm', 'm3'],
    ['rm', 'fm'], ['rm', 'srm'], ['fm', 'rm'], ['fm', 'srm'], ['m3', 'srm'],
  ];
  for (const holzart of ['buche', 'fichte', 'eiche']) {
    for (const scheitlaenge of [25, 33, 50, 100]) {
      for (const [von, nach] of kombis) {
        const hin = umrechnen(8, von, nach, { holzart, scheitlaenge });
        const zurueck = umrechnen(hin, nach, von, { holzart, scheitlaenge });
        assert.ok(
          Math.abs(zurueck - 8) < 1e-9,
          `${von}->${nach}->${von} (${holzart}, ${scheitlaenge} cm) ergibt ${zurueck}`,
        );
      }
    }
  }
});

test('laengere Scheite ergeben weniger Holz je Schuettraummeter', () => {
  // Lange Scheite verhaken und bruecken beim Schuetten staerker.
  let vorher = Infinity;
  for (const l of [25, 33, 50, 100]) {
    const fm = nachFestmeter(1, 'srm', { scheitlaenge: l });
    assert.ok(fm < vorher, `${l} cm ergibt nicht weniger als die kuerzere Laenge`);
    vorher = fm;
  }
});

test('eine nicht hinterlegte Laenge nimmt die naechstliegende', () => {
  assert.equal(fmProSrm(40), fmProSrm(33), '40 liegt naeher an 33 als an 50');
  assert.equal(fmProSrm(45), fmProSrm(50), '45 liegt naeher an 50');
  assert.equal(fmProSrm(200), fmProSrm(100));
  assert.equal(fmProSrm(1), fmProSrm(25));
});

test('bei genau gleichem Abstand gewinnt die kuerzere Laenge — festgehalten', () => {
  // 41,5 liegt exakt zwischen 33 und 50. Das Ergebnis haengt an der
  // Reihenfolge der Tabelle; der Test haelt fest, welches es ist.
  assert.equal(fmProSrm(41.5), fmProSrm(33));
});

test('Weichholz ergibt weniger Festmeter als Buche', () => {
  const buche = nachFestmeter(10, 'srm', { holzart: 'buche' });
  const fichte = nachFestmeter(10, 'srm', { holzart: 'fichte' });
  assert.ok(fichte < buche);
  assert.equal(runde(fichte / buche, 2), 0.94);
});

test('eine unbekannte Holzart korrigiert gar nicht, statt zu raten', () => {
  assert.equal(holzartFaktor('gibtsnicht'), 1);
  assert.equal(holzartFaktor(undefined), 1, 'Buche ist die Referenz mit 1,00');
  assert.equal(
    nachFestmeter(10, 'srm', { holzart: 'gibtsnicht' }),
    nachFestmeter(10, 'srm', { holzart: 'buche' }),
  );
});

test('die Holzart kuerzt sich zwischen SRM und RM heraus — Modellentscheidung', () => {
  // Beide Wege tragen denselben Korrekturfaktor, er hebt sich also auf.
  // Das ist so gebaut und keine Panne — der Test haelt es fest, damit eine
  // spaetere Aenderung (getrennte Faktoren je Schuettart) auffaellt.
  assert.equal(
    umrechnen(1, 'srm', 'rm', { holzart: 'buche' }),
    umrechnen(1, 'srm', 'rm', { holzart: 'fichte' }),
  );
  // Gegen FM kuerzt sie sich NICHT heraus:
  assert.notEqual(
    umrechnen(1, 'srm', 'fm', { holzart: 'buche' }),
    umrechnen(1, 'srm', 'fm', { holzart: 'fichte' }),
  );
});

test('eine eigene Konfiguration schlaegt den Standard vollstaendig', () => {
  const eigen = {
    fmProRm: 0.8,
    fmProSrmNachLaenge: { 33: 0.5 },
    holzartKorrektur: { ...STANDARD_UMRECHNUNG.holzartKorrektur, buche: 1 },
  };
  assert.equal(nachFestmeter(10, 'rm', { konfig: eigen }), 8);
  assert.equal(nachFestmeter(10, 'srm', { konfig: eigen }), 5);
  assert.equal(fmProSrm(100, eigen), 0.5, 'nur eine Laenge hinterlegt — die gewinnt immer');
});

test('eine leere Faktortabelle faellt auf den Standard zurueck, statt zu stuerzen', () => {
  const leer = {
    fmProRm: 0.7, fmProSrmNachLaenge: {},
    holzartKorrektur: STANDARD_UMRECHNUNG.holzartKorrektur,
  };
  assert.equal(fmProSrm(33, leer), 0.4);
});

test('WAECHTER: die Standardfaktoren stehen fest', () => {
  // Diese Zahlen stehen in jedem Angebot und auf jedem Lieferschein.
  // Wer sie aendert, aendert jeden Preis im Haus.
  assert.equal(STANDARD_UMRECHNUNG.fmProRm, 0.7);
  assert.deepEqual(STANDARD_UMRECHNUNG.fmProSrmNachLaenge, { 25: 0.42, 33: 0.4, 50: 0.38, 100: 0.36 });
  assert.equal(STANDARD_SCHEITLAENGE, 33);
  assert.equal(STANDARD_HOLZART, 'buche');
  assert.equal(HOLZ_BASIS_EINHEIT, 'fm');
  assert.deepEqual([...SCHEITLAENGEN], [25, 33, 50, 100]);
  assert.equal(EINHEITEN.length, 4);
  assert.equal(HOLZARTEN.length, 10);
});

test('unbrauchbare Eingaben werfen einen Fehler, statt still zu rechnen', () => {
  assert.throws(() => nachFestmeter(Number.NaN, 'srm'), /gültige Zahl/);
  assert.throws(() => nachFestmeter(10, 'kg'), /Unbekannte Einheit/);
  assert.throws(() => vonFestmeter(Infinity, 'rm'), /gültige Zahl/);
  assert.throws(() => vonFestmeter(10, 'liter'), /Unbekannte Einheit/);
});

test('ein Umrechnungsfaktor von 0 wirft, statt unendlich zu liefern', () => {
  const kaputt = {
    fmProRm: 0, fmProSrmNachLaenge: { 33: 0 },
    holzartKorrektur: STANDARD_UMRECHNUNG.holzartKorrektur,
  };
  assert.throws(() => vonFestmeter(10, 'rm', { konfig: kaputt }), /Ungültiger Umrechnungsfaktor/);
  assert.throws(() => vonFestmeter(10, 'srm', { konfig: kaputt }), /Ungültiger Umrechnungsfaktor/);
});

test('verwendeterFaktor ist die Umrechnung von genau 1', () => {
  assert.equal(verwendeterFaktor('srm', 'fm'), umrechnen(1, 'srm', 'fm'));
  assert.equal(verwendeterFaktor('fm', 'fm'), 1);
});

// ===========================================================================
// TEIL 3 — holzLogik: Pruefung und Klartext
// ===========================================================================

test('die Mengenpruefung blockiert nur, was wirklich falsch ist', () => {
  assert.equal(pruefeMenge(8, 'srm').ok, true);
  assert.equal(pruefeMenge(0, 'srm').ok, false);
  assert.equal(pruefeMenge(-1, 'srm').ok, false);
  assert.equal(pruefeMenge(Number.NaN, 'srm').ok, false);
  assert.equal(pruefeMenge(8, 'kg').ok, false);
});

test('eine sehr grosse Menge ist ein Hinweis, kein Fehler', () => {
  const p = pruefeMenge(20000, 'srm', { scheitlaenge: 33 });
  assert.equal(p.ok, true, 'ein Grosshaendler darf 20.000 SRM bestellen');
  assert.ok(p.hinweise.some((h) => /Ungewöhnlich große Menge/.test(h)));
});

test('fehlende Scheitlaenge wird gesagt, nicht verschwiegen', () => {
  const p = pruefeMenge(8, 'srm');
  assert.ok(p.hinweise.some((h) => /Ohne Scheitlänge/.test(h)));
  assert.ok(p.hinweise.some((h) => /33 cm/.test(h)));
  assert.equal(pruefeMenge(8, 'fm').hinweise.length, 0, 'Festmeter braucht keine Scheitlaenge');
});

test('eine ungewoehnliche Scheitlaenge wird gemeldet', () => {
  const p = pruefeMenge(8, 'srm', { scheitlaenge: 40 });
  assert.ok(p.hinweise.some((h) => /nächstliegenden Länge/.test(h)));
  assert.equal(p.ok, true, 'sie blockiert aber nicht');
});

test('brauchtScheitlaenge stimmt je Einheit', () => {
  assert.equal(brauchtScheitlaenge('srm'), true);
  assert.equal(brauchtScheitlaenge('rm'), true);
  assert.equal(brauchtScheitlaenge('fm'), false);
  assert.equal(brauchtScheitlaenge('m3'), false);
});

test('istHolzEinheit laesst nur die vier echten durch', () => {
  for (const e of ['fm', 'rm', 'srm', 'm3']) assert.equal(istHolzEinheit(e), true, e);
  for (const e of ['kg', 'SRM', '', null, 3]) assert.equal(istHolzEinheit(e), false, String(e));
});

test('Klartext und Formatierung bleiben deutsch und lesbar', () => {
  assert.equal(formatZahl(1234.5), '1.234,50');
  assert.equal(formatZahl(Number.NaN), '—');
  assert.equal(formatMenge(8, 'srm'), '8,00 SRM');
  assert.equal(formatMengeMitHolz(8, 'srm', { holzart: 'buche', scheitlaenge: 33 }), '8,00 SRM · Buche · 33 cm');
  assert.equal(formatMengeMitHolz(8, 'fm', { holzart: 'buche', scheitlaenge: 33 }), '8,00 FM · Buche',
    'Festmeter traegt keine Scheitlaenge');
  assert.equal(einheitKurz('srm'), 'SRM');
  assert.equal(einheitLang('rm'), 'Raummeter (Ster)');
  assert.equal(holzartName('laerche'), 'Lärche');
});

test('der Umrechnungshinweis nennt beide Richtungen', () => {
  const t = umrechnungsHinweis('srm', 'fm', { holzart: 'buche', scheitlaenge: 33 });
  assert.match(t, /1 SRM \(Buche, 33 cm\) entspricht 0,40 FM/);
  assert.match(t, /1 FM ≈ 2,50 SRM/);
  assert.match(umrechnungsHinweis('fm', 'fm'), /keine Umrechnung nötig/);
});

test('alleEinheiten zeigt dieselbe Menge viermal, nicht vier Mengen', () => {
  const a = alleEinheiten(8, 'srm', { scheitlaenge: 33 });
  assert.equal(a.fm, 3.2);
  assert.equal(a.m3, a.fm, 'Festmeter und Kubikmeter sind dasselbe');
  assert.equal(a.srm, 8);
  assert.equal(a.rm, 4.57);
});

// ===========================================================================
// TEIL 4 — sortimentLogik: die 1. BImSchV
// ===========================================================================

test('die Grenze der 1. BImSchV liegt bei 25 Prozent', () => {
  assert.equal(BRENNFERTIG_GRENZE_PROZENT, 25);
  assert.equal(istBrennfertig(25), true, 'genau 25 ist noch erlaubt');
  assert.equal(istBrennfertig(25.1), false);
  assert.equal(istBrennfertig(Number.NaN), false, 'ohne Messwert nicht behaupten, es sei brennfertig');
});

test('der Trocknungsgrad aus dem Messwert ist an den Grenzen eindeutig', () => {
  assert.equal(trocknungsgradAusRestfeuchte(0), 'kammergetrocknet');
  assert.equal(trocknungsgradAusRestfeuchte(15), 'kammergetrocknet', 'genau 15 gehoert nach oben');
  assert.equal(trocknungsgradAusRestfeuchte(15.1), 'lufttrocken');
  assert.equal(trocknungsgradAusRestfeuchte(25), 'lufttrocken', 'genau 25 ist noch lufttrocken');
  assert.equal(trocknungsgradAusRestfeuchte(25.1), 'frisch');
  assert.equal(trocknungsgradAusRestfeuchte(Number.NaN), STANDARD_TROCKNUNGSGRAD);
});

test('kein Messwert passt zu zwei Trocknungsgraden gleichzeitig', () => {
  for (let rf = 0; rf <= 60; rf += 0.5) {
    const treffer = TROCKNUNGSGRADE.filter((t) => restfeuchtePasst(t.schluessel, rf));
    assert.equal(treffer.length, 1, `${rf} % passt zu ${treffer.length} Graden`);
  }
});

test('restfeuchtePasst stimmt mit trocknungsgradAusRestfeuchte ueberein', () => {
  for (let rf = 0; rf <= 60; rf += 0.5) {
    const abgeleitet = trocknungsgradAusRestfeuchte(rf);
    assert.equal(restfeuchtePasst(abgeleitet, rf), true, `${rf} % -> ${abgeleitet}`);
  }
});

test('ohne Messwert passt gar nichts — statt alles', () => {
  assert.equal(restfeuchtePasst('lufttrocken', Number.NaN), false);
  assert.equal(restfeuchtePasst('gibtsnicht', 20), false);
});

test('die Bereichstexte lesen sich wie im Formular', () => {
  assert.equal(restfeuchteBereichText('kammergetrocknet'), '0–15 %');
  assert.equal(restfeuchteBereichText('lufttrocken'), '15–25 %');
  assert.equal(restfeuchteBereichText('frisch'), 'über 25 %');
  assert.equal(restfeuchteBereichText('gibtsnicht'), '—');
});

test('nur frisches Holz gilt als nicht brennfertig', () => {
  assert.equal(trocknungsgradInfo('kammergetrocknet').brennfertig, true);
  assert.equal(trocknungsgradInfo('lufttrocken').brennfertig, true);
  assert.equal(trocknungsgradInfo('frisch').brennfertig, false);
  assert.equal(istTrocknungsgrad('lufttrocken'), true);
  assert.equal(istTrocknungsgrad('halbtrocken'), false);
  assert.equal(trocknungsgradName('frisch'), 'Frisch (waldfrisch)');
});

// ===========================================================================
// TEIL 5 — sortimentLogik: Pruefung eines Entwurfs
// ===========================================================================

test('der leere Entwurf ist sofort speicherbar', () => {
  const e = neuerSortimentEntwurf();
  const p = pruefeSortiment(e);
  assert.equal(p.ok, true);
  assert.deepEqual(p.fehler, []);
  assert.equal(e.aktiv, true);
});

test('Holzart, Scheitlaenge und Trocknungsgrad sind Pflicht', () => {
  assert.equal(pruefeSortiment({ ...neuerSortimentEntwurf(), holzart: 'plastik' }).ok, false);
  assert.equal(pruefeSortiment({ ...neuerSortimentEntwurf(), trocknungsgrad: 'feucht' }).ok, false);
  assert.equal(pruefeSortiment({ ...neuerSortimentEntwurf(), scheitlaenge_cm: 0 }).ok, false);
  assert.equal(pruefeSortiment({ ...neuerSortimentEntwurf(), scheitlaenge_cm: Number.NaN }).ok, false);
  assert.equal(pruefeSortiment({ ...neuerSortimentEntwurf(), scheitlaenge_cm: 3 }).ok, false, 'unter 5 cm');
  assert.equal(pruefeSortiment({ ...neuerSortimentEntwurf(), scheitlaenge_cm: 250 }).ok, false, 'ueber 200 cm');
});

test('eine ungewoehnliche, aber moegliche Laenge wird nur angemerkt', () => {
  const p = pruefeSortiment({ ...neuerSortimentEntwurf(), scheitlaenge_cm: 40 });
  assert.equal(p.ok, true);
  assert.ok(p.hinweise.some((h) => /nächstliegenden Länge/.test(h)));
});

test('DER WICHTIGSTE HINWEIS: Messwert und Auswahl widersprechen sich', () => {
  const p = pruefeSortiment({
    ...neuerSortimentEntwurf(), trocknungsgrad: 'kammergetrocknet', restfeuchte_prozent: 28,
  });
  assert.equal(p.ok, true, 'es blockiert nicht — der Bediener entscheidet');
  assert.ok(p.hinweise.some((h) => /passt nicht/.test(h)));
  assert.ok(p.hinweise.some((h) => /0–15 %/.test(h)), 'der erwartete Bereich muss dastehen');
  assert.ok(p.hinweise.some((h) => /Frisch/.test(h)), 'und wozu der Wert wirklich passt');
});

test('zu feuchtes Holz darf nicht als ofenfertig angeboten werden', () => {
  const p = pruefeSortiment({
    ...neuerSortimentEntwurf(), trocknungsgrad: 'frisch', restfeuchte_prozent: 40,
  });
  assert.ok(p.hinweise.some((h) => /1\. BImSchV/.test(h)));
  assert.ok(p.hinweise.some((h) => /ofenfertig/.test(h)));
});

test('eine unmoegliche Restfeuchte blockiert', () => {
  assert.equal(pruefeSortiment({ ...neuerSortimentEntwurf(), restfeuchte_prozent: -1 }).ok, false);
  assert.equal(pruefeSortiment({ ...neuerSortimentEntwurf(), restfeuchte_prozent: 101 }).ok, false);
  assert.equal(pruefeSortiment({ ...neuerSortimentEntwurf(), restfeuchte_prozent: Number.NaN }).ok, false);
});

test('kammergetrocknet ohne Messwert bekommt einen freundlichen Anstoss', () => {
  const p = pruefeSortiment({
    ...neuerSortimentEntwurf(), trocknungsgrad: 'kammergetrocknet', restfeuchte_prozent: null,
  });
  assert.equal(p.ok, true);
  assert.ok(p.hinweise.some((h) => /rechtfertigt den Preis/.test(h)));
});

// ===========================================================================
// TEIL 6 — sortimentLogik: Bezeichnung, Klartext, Sortierung
// ===========================================================================

test('Bildschirm- und PDF-Bezeichnung stehen an einer Stelle', () => {
  assert.equal(sortimentBezeichnung('buche', 33, 'lufttrocken'), 'Buche · 33 cm · lufttrocken');
  assert.equal(sortimentBezeichnungPdf('eiche', 25, 'kammergetrocknet'), 'Eiche 25 cm, kammergetrocknet');
});

test('eine eigene Bezeichnung schlaegt die automatische', () => {
  assert.equal(anzeigeName(sort({ bezeichnung: 'Ofenholz Premium' })), 'Ofenholz Premium');
  assert.equal(anzeigeName(sort({ bezeichnung: '   ' })), 'Buche · 33 cm · lufttrocken', 'Leerzeichen zaehlen nicht');
  assert.equal(anzeigeName(sort({ bezeichnung: null })), 'Buche · 33 cm · lufttrocken');
});

test('der Suchtext findet ueber Holzart, Laenge und Notiz', () => {
  const t = sortimentSuchtext(sort({ notiz: 'Lager Halle B' }));
  for (const wort of ['buche', '33', 'lufttrocken', 'halle b']) {
    assert.ok(t.includes(wort), `"${wort}" fehlt im Suchtext`);
  }
  assert.equal(t, t.toLowerCase(), 'der Suchtext muss durchgehend klein sein');
});

test('der Klartext sagt beim Messwert auch, was er bedeutet', () => {
  assert.match(sortimentKlartext(sort({ restfeuchte_prozent: 18 })), /18,0 % — brennfertig/);
  assert.match(sortimentKlartext(sort({ restfeuchte_prozent: 35 })), /zu feucht/);
  assert.match(sortimentKlartext(sort({ aktiv: false })), /nicht im Verkauf/);
  assert.ok(!sortimentKlartext(sort()).includes('Restfeuchte'), 'ohne Messwert kein Satz darueber');
});

test('die Sortierung stellt aktive nach vorn, dann Hart- vor Weichholz', () => {
  const liste = [
    sort({ id: 'a', holzart: 'fichte', scheitlaenge_cm: 33 }),
    sort({ id: 'b', holzart: 'buche', scheitlaenge_cm: 50 }),
    sort({ id: 'c', holzart: 'buche', scheitlaenge_cm: 25 }),
    sort({ id: 'd', holzart: 'buche', scheitlaenge_cm: 25, aktiv: false }),
  ];
  assert.deepEqual(sortiereSortimente(liste).map((s) => s.id), ['c', 'b', 'a', 'd']);
});

test('die Sortierung veraendert die uebergebene Liste nicht', () => {
  const liste = [sort({ id: 'a', holzart: 'fichte' }), sort({ id: 'b', holzart: 'buche' })];
  const vorher = liste.map((s) => s.id);
  sortiereSortimente(liste);
  assert.deepEqual(liste.map((s) => s.id), vorher, 'sonst springt die Anzeige beim Neuzeichnen');
});
