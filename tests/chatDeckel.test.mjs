import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CHAT_STUFEN, WARN_AB_PROZENT, BESUCHER_PRO_MINUTE,
  stufeAngabe, pruefeDeckel, monatsSchluessel,
} from '../out/chatDeckel.js'

// ===========================================================================
// DIE STUFEN — Martins Entscheidung vom 11.09.2026
// ===========================================================================
test('die beschlossenen Stufen stehen so im Code', () => {
  assert.equal(CHAT_STUFEN.klein.preis, 49)
  assert.equal(CHAT_STUFEN.klein.grenze, 1000)
  assert.equal(CHAT_STUFEN.gross.preis, 99)
  assert.equal(CHAT_STUFEN.gross.grenze, 3000)
  assert.equal(CHAT_STUFEN.individuell.grenze, null, 'individuell hat keine feste Grenze')
})

test('unbekannte oder fehlende Stufe faellt auf die kleine zurueck', () => {
  for (const eingabe of [null, undefined, '', '  ', 'quatsch', 'KLEIN']) {
    assert.equal(stufeAngabe(eingabe).grenze, 1000, `bei ${JSON.stringify(eingabe)}`)
  }
})

test('gross wird auch mit Umlaut erkannt', () => {
  assert.equal(stufeAngabe('groß').grenze, 3000)
  assert.equal(stufeAngabe('gross').grenze, 3000)
  assert.equal(stufeAngabe(' GROSS ').grenze, 3000)
})

// ===========================================================================
// DIE ENTSCHEIDUNG
// ===========================================================================
test('unter der Grenze laeuft alles normal', () => {
  const d = pruefeDeckel(120, 'klein')
  assert.equal(d.erlaubt, true)
  assert.equal(d.warnen, false)
  assert.equal(d.rest, 880)
  assert.equal(d.prozent, 12)
  assert.equal(d.besucherText, '')
  assert.equal(d.betreiberText, '')
})

test('ab 80 Prozent wird der Betreiber gewarnt — der Besucher merkt nichts', () => {
  const d = pruefeDeckel(800, 'klein')
  assert.equal(d.erlaubt, true, 'die KI antwortet weiter')
  assert.equal(d.warnen, true)
  assert.equal(d.besucherText, '', 'der Besucher bekommt KEINEN Hinweis')
  assert.match(d.betreiberText, /80 %/)
})

test('die Warnschwelle sitzt exakt, nicht eine Rundung zu frueh', () => {
  // 799 von 1000 sind 79,9 % — das wird als „80 %" ANGEZEIGT, ist aber noch
  // nicht die Schwelle. Wer auf den gerundeten Wert prueft, warnt zu frueh.
  const knapp = pruefeDeckel(799, 'klein')
  assert.equal(knapp.warnen, false, '79,9 % ist noch keine Warnung')
  assert.equal(knapp.prozent, 80, 'angezeigt wird trotzdem 80 %')

  const genau = pruefeDeckel(800, 'klein')
  assert.equal(genau.warnen, true, '80,0 % ist die Schwelle')
  assert.equal(WARN_AB_PROZENT, 80)
})

test('genau AUF der Grenze ist Schluss — nicht erst darueber', () => {
  const knapp = pruefeDeckel(999, 'klein')
  assert.equal(knapp.erlaubt, true, '999 von 1000 geht noch')

  const voll = pruefeDeckel(1000, 'klein')
  assert.equal(voll.erlaubt, false, '1000 von 1000 ist erreicht')
  assert.equal(voll.rest, 0)
})

test('die grosse Stufe laesst dreimal so viel durch', () => {
  assert.equal(pruefeDeckel(2999, 'gross').erlaubt, true)
  assert.equal(pruefeDeckel(3000, 'gross').erlaubt, false)
  // Dieselbe Zahl, die bei klein schon Schluss war, ist bei gross unauffaellig:
  assert.equal(pruefeDeckel(1000, 'gross').erlaubt, true)
  assert.equal(pruefeDeckel(1000, 'gross').warnen, false)
})

test('individuell hat keine technische Grenze', () => {
  const d = pruefeDeckel(50_000, 'individuell')
  assert.equal(d.erlaubt, true)
  assert.equal(d.warnen, false)
  assert.equal(d.rest, null)
  assert.equal(d.prozent, null)
})

// ===========================================================================
// DIE TEXTE — was Besucher und Betreiber lesen
// ===========================================================================
test('der Besucher erfaehrt NIE etwas von Kontingenten oder Grenzen', () => {
  // Er ist Kunde des Betriebs, nicht unser Abrechnungsfall. Ein Hinweis auf
  // ein aufgebrauchtes Kontingent laesst den Betrieb schlecht aussehen.
  const d = pruefeDeckel(5000, 'klein')
  assert.equal(d.erlaubt, false)
  assert.doesNotMatch(d.besucherText, /Grenze|Kontingent|aufgebraucht|Limit|Stufe|Gespräche/i)
  assert.match(d.besucherText, /Kontaktformular|rufen Sie an/i)
})

test('der Betreiber-Text nennt Zahl, Grenze und den naechsten Schritt', () => {
  const d = pruefeDeckel(1000, 'klein')
  assert.match(d.betreiberText, /1000 von 1000/)
  assert.match(d.betreiberText, /nächste Stufe/)
})

test('kein Text ist je leer, wenn er gebraucht wird', () => {
  const gesperrt = pruefeDeckel(2000, 'klein')
  assert.ok(gesperrt.besucherText.trim().length > 20)
  assert.ok(gesperrt.betreiberText.trim().length > 20)
})

// ===========================================================================
// ROBUSTHEIT
// ===========================================================================
test('unsinnige Verbrauchswerte stuerzen nicht', () => {
  for (const v of [null, undefined, NaN, -5, 'viel', {}]) {
    const d = pruefeDeckel(v, 'klein')
    assert.equal(d.erlaubt, true, `bei ${JSON.stringify(v)} muss der Chat laufen`)
    assert.equal(d.rest, 1000)
  }
})

test('Kommazahlen werden abgerundet, nicht aufgerundet', () => {
  assert.equal(pruefeDeckel(999.9, 'klein').erlaubt, true, '999,9 ist noch nicht 1000')
})

test('im Zweifel laeuft der Chat weiter — eine kaputte Zaehlung sperrt keinen Kunden aus', () => {
  assert.equal(pruefeDeckel(0, null).erlaubt, true)
  assert.equal(pruefeDeckel(NaN, undefined).erlaubt, true)
})

// ===========================================================================
// MONATSSCHLÜSSEL
// ===========================================================================
test('der Monatsschluessel ist immer der Monatserste', () => {
  assert.equal(monatsSchluessel(new Date('2026-09-11T10:00:00')), '2026-09-01')
  assert.equal(monatsSchluessel(new Date('2026-01-31T23:59:00')), '2026-01-01')
  assert.equal(monatsSchluessel(new Date('2026-12-01T00:00:00')), '2026-12-01')
})

test('der Monatswechsel setzt die Zaehlung zurueck', () => {
  const ende = monatsSchluessel(new Date('2026-09-30T23:59:00'))
  const anfang = monatsSchluessel(new Date('2026-10-01T00:01:00'))
  assert.notEqual(ende, anfang, 'anderer Monat = anderer Schlüssel = Zählung beginnt neu')
})

test('das Besucher-Rate-Limit ist gesetzt und plausibel', () => {
  assert.ok(BESUCHER_PRO_MINUTE >= 3, 'ein echter Mensch schreibt auch mal schnell')
  assert.ok(BESUCHER_PRO_MINUTE <= 20, 'darüber ist es kein Schutz mehr')
})

// ===========================================================================
// WIRTSCHAFTLICHKEIT — die Grenzen müssen zum Preis passen
// ===========================================================================
test('jede Stufe traegt sich bei vollem Verbrauch', () => {
  // Gerechnet mit den echten Werten: claude-haiku-4-5 (1 $/5 $ je Mio Token),
  // max_tokens 500, rund 5 Aufrufe je Gespräch -> ca. 1,85 Cent je Gespräch.
  const KOSTEN_JE_GESPRAECH_EUR = 0.0185 * 0.92 * 5 / 5 * 5 / 5 // ~1,7 Cent
  for (const key of ['klein', 'gross']) {
    const s = CHAT_STUFEN[key]
    const kosten = s.grenze * 0.017
    assert.ok(
      kosten < s.preis * 0.6,
      `Stufe ${key}: ${s.grenze} Gespräche kosten ~${kosten.toFixed(2)} € bei ${s.preis} € Preis — ` +
      `das lässt weniger als 40 % Marge. Grenze senken oder Preis anheben.`,
    )
  }
  assert.ok(KOSTEN_JE_GESPRAECH_EUR > 0)
})
