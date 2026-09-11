import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STUFEN_REIHE, leseStufe, ampel, zahl, klartext, wechselHinweis, pruefeDomainWechsel,
} from '../out/chatVerwaltung.js'
import { pruefeDeckel } from '../out/chatDeckel.js'

// ===========================================================================
// DIE STRENGE LESUNG — hier darf NICHTS stillschweigend durchrutschen
// ===========================================================================
test('die drei Stufen werden erkannt', () => {
  assert.equal(leseStufe('klein'), 'klein')
  assert.equal(leseStufe('gross'), 'gross')
  assert.equal(leseStufe('individuell'), 'individuell')
})

test('groß mit Umlaut meint dieselbe Stufe, wird aber als gross gespeichert', () => {
  assert.equal(leseStufe('groß'), 'gross', 'Umlaut wird verstanden')
  assert.equal(leseStufe(' GROSS '), 'gross')
  assert.equal(leseStufe('Groß'), 'gross')
})

test('alles andere wird ABGELEHNT, nicht auf klein zurückgesetzt', () => {
  // Das ist der Unterschied zu stufeAngabe() in chatDeckel.ts. Würde hier
  // still „klein" herauskommen, hätte der Betreiber „groß" geklickt und
  // „klein" bekommen — und es erst gemerkt, wenn ein Kunde abgeschnitten wird.
  for (const eingabe of [null, undefined, '', '  ', 'mittel', 'XL', 'gros', 42, {}]) {
    assert.equal(leseStufe(eingabe), null, `bei ${JSON.stringify(eingabe)} muss null kommen`)
  }
})

test('die Reihenfolge im Command Center ist vollständig und ohne Doppel', () => {
  assert.deepEqual(STUFEN_REIHE, ['klein', 'gross', 'individuell'])
  assert.equal(new Set(STUFEN_REIHE).size, STUFEN_REIHE.length)
  for (const s of STUFEN_REIHE) assert.equal(leseStufe(s), s, `${s} muss auch streng lesbar sein`)
})

// ===========================================================================
// DIE AMPEL
// ===========================================================================
test('die Ampel bildet genau die drei Zustände des Deckels ab', () => {
  assert.equal(ampel(pruefeDeckel(120, 'klein')), 'gruen')
  assert.equal(ampel(pruefeDeckel(800, 'klein')), 'gelb')
  assert.equal(ampel(pruefeDeckel(1000, 'klein')), 'rot')
})

test('individuell ist immer grün — auch bei sehr vielen Gesprächen', () => {
  assert.equal(ampel(pruefeDeckel(90_000, 'individuell')), 'gruen')
})

test('rot schlägt gelb: bei erreichter Grenze wird nicht mehr gewarnt, sondern gesperrt', () => {
  const d = pruefeDeckel(1200, 'klein')
  assert.equal(d.warnen, true, 'der Deckel meldet beides')
  assert.equal(ampel(d), 'rot', 'die Ampel zeigt trotzdem rot, nicht gelb')
})

// ===========================================================================
// ZAHLEN UND KLARTEXT
// ===========================================================================
test('Tausenderpunkte nach deutscher Schreibweise', () => {
  assert.equal(zahl(0), '0')
  assert.equal(zahl(999), '999')
  assert.equal(zahl(1000), '1.000')
  assert.equal(zahl(12345), '12.345')
  assert.equal(zahl(1000000), '1.000.000')
})

test('unsinnige Zahlen werden zu 0, nicht zu NaN', () => {
  for (const v of [null, undefined, NaN, -7, 'viel', {}]) {
    assert.equal(zahl(v), '0', `bei ${JSON.stringify(v)}`)
  }
})

test('der Klartext nennt Stand, Grenze und Prozent', () => {
  assert.equal(klartext(312, 'klein'), '312 von 1.000 Gesprächen · 31 %')
  assert.equal(klartext(1500, 'gross'), '1.500 von 3.000 Gesprächen · 50 %')
})

test('bei individuell steht keine Grenze im Text', () => {
  const t = klartext(4200, 'individuell')
  assert.match(t, /4\.200/)
  assert.doesNotMatch(t, /von \d/, 'kein „x von y" — es gibt kein y')
  assert.match(t, /keine feste Grenze/)
})

test('Einzahl und Mehrzahl stimmen', () => {
  assert.match(klartext(1, 'individuell'), /^1 Gespräch diesen Monat/)
  assert.match(klartext(2, 'individuell'), /^2 Gespräche diesen Monat/)
})

// ===========================================================================
// DER WECHSELHINWEIS — die eigentliche Schutzfunktion
// ===========================================================================
test('ein unauffälliger Wechsel sagt nichts', () => {
  assert.equal(wechselHinweis(50, 'klein', 'gross'), '', 'hochstufen bei wenig Verbrauch ist harmlos')
})

test('dieselbe Stufe noch einmal wählen ist kein Wechsel', () => {
  assert.equal(wechselHinweis(2500, 'gross', 'gross'), '')
  assert.equal(wechselHinweis(2500, 'gross', 'groß'), '', 'auch mit Umlaut geschrieben')
})

test('HERUNTERstufen unter den laufenden Verbrauch wird deutlich gewarnt', () => {
  // Der gefährliche Fall: 1.800 Gespräche gelaufen, jetzt auf klein (1.000).
  // Der Berater wäre auf der Stelle zu — mitten im Monat, ohne Vorwarnung.
  const h = wechselHinweis(1800, 'gross', 'klein')
  assert.match(h, /Achtung/)
  assert.match(h, /1\.800/, 'nennt den echten Stand')
  assert.match(h, /1\.000/, 'nennt die neue Grenze')
  assert.match(h, /Kontaktformular/, 'sagt, was der Besucher dann sieht')
  assert.match(h, /Monatsersten/, 'sagt auch, wann es sich von selbst löst')
})

test('genau AUF der neuen Grenze wird ebenfalls gewarnt', () => {
  assert.match(wechselHinweis(1000, 'gross', 'klein'), /Achtung/)
})

test('knapp unter der neuen Grenze ist es ein Hinweis, keine Warnung', () => {
  const h = wechselHinweis(850, 'gross', 'klein')
  assert.doesNotMatch(h, /Achtung/)
  assert.match(h, /Hinweis/)
  assert.match(h, /80 %/)
})

test('der Wechsel auf individuell sagt, dass die Grenze wegfällt', () => {
  const h = wechselHinweis(2900, 'gross', 'individuell')
  assert.match(h, /keine technische Grenze/)
  assert.match(h, /Gezählt wird weiter/, 'die Zählung läuft — sonst gäbe es keine Rechnungsgrundlage')
})

test('eine ungültige Zielstufe erzeugt keinen Hinweis — sie wird ohnehin abgelehnt', () => {
  assert.equal(wechselHinweis(9999, 'klein', 'XXL'), '')
})

// ===========================================================================
// DOMAIN-WECHSEL — hier wird an einer LAUFENDEN Kundenwebsite gedreht
// ===========================================================================
test('neue Adressen werden sauber übernommen', () => {
  const w = pruefeDomainWechsel([], 'https://WWW.Muster-Bau.de/kontakt\nshop.muster-bau.de')
  assert.deepEqual(w.liste, ['muster-bau.de', 'shop.muster-bau.de'])
  assert.deepEqual(w.hinzu, ['muster-bau.de', 'shop.muster-bau.de'])
  assert.deepEqual(w.weg, [])
  assert.equal(w.warnung, '')
})

test('eine wegfallende Adresse wird NAMENTLICH gemeldet', () => {
  // Ohne diese Meldung schaltet der Betreiber einen laufenden Bot still ab.
  // Der Kunde sieht keinen Fehler — nur einen Bot, der nicht mehr antwortet.
  const w = pruefeDomainWechsel(['muster-bau.de', 'alt-bau.de'], 'muster-bau.de')
  assert.deepEqual(w.weg, ['alt-bau.de'])
  assert.match(w.warnung, /NICHT mehr/)
  assert.match(w.warnung, /alt-bau\.de/)
})

test('das Leeren der Liste wird gesondert gesagt', () => {
  const w = pruefeDomainWechsel(['muster-bau.de'], '')
  assert.deepEqual(w.liste, [])
  assert.match(w.warnung, /vollständig geleert/)
  assert.match(w.warnung, /ARGONAUT-Seite/, 'sagt, wo er weiterhin läuft')
})

test('eine leere Liste leer lassen ist kein Vorgang', () => {
  const w = pruefeDomainWechsel([], '')
  assert.deepEqual(w.liste, [])
  assert.equal(w.warnung, '', 'nichts weg, nichts dazu — nichts zu melden')
})

test('unbrauchbare Zeilen werden benannt, nicht still geschluckt', () => {
  const w = pruefeDomainWechsel([], 'muster-bau.de\nlocalhost\nkein eintrag hier')
  assert.deepEqual(w.liste, ['muster-bau.de'])
  assert.ok(w.verworfen.includes('localhost'), 'localhost hat keinen Punkt und ist keine Domain')
  assert.match(w.warnung, /Nicht übernommen/)
})

test('www. und Groß-/Kleinschreibung gelten als dieselbe Adresse — kein Scheinwechsel', () => {
  const w = pruefeDomainWechsel(['muster-bau.de'], 'WWW.Muster-Bau.DE')
  assert.deepEqual(w.weg, [], 'nichts fällt weg')
  assert.deepEqual(w.hinzu, [], 'nichts kommt dazu')
  assert.equal(w.warnung, '')
})

test('Doppeleinträge werden zusammengefasst', () => {
  const w = pruefeDomainWechsel([], 'muster-bau.de\nwww.muster-bau.de\nhttps://muster-bau.de/impressum')
  assert.deepEqual(w.liste, ['muster-bau.de'])
})

test('über zehn Adressen wird gekappt und gesagt', () => {
  const viele = Array.from({ length: 13 }, (_, i) => `nr${i}-firma.de`).join('\n')
  const w = pruefeDomainWechsel([], viele)
  assert.equal(w.liste.length, 10)
  assert.match(w.warnung, /Höchstens 10/)
})

test('null oder Unsinn als Altbestand stürzt nicht', () => {
  for (const alt of [null, undefined, 'kein array', 42]) {
    const w = pruefeDomainWechsel(alt, 'muster-bau.de')
    assert.deepEqual(w.liste, ['muster-bau.de'], `bei ${JSON.stringify(alt)}`)
    assert.deepEqual(w.weg, [])
  }
})

test('eine Domain-Liste bleibt in sich stabil: zweimal prüfen ändert nichts', () => {
  const erst = pruefeDomainWechsel([], 'WWW.Muster-Bau.de/kontakt')
  const nochmal = pruefeDomainWechsel(erst.liste, erst.liste.join('\n'))
  assert.deepEqual(nochmal.liste, erst.liste)
  assert.equal(nochmal.warnung, '', 'ein Speichern ohne Änderung darf nie warnen')
})
