import test from 'node:test'
import assert from 'node:assert/strict'
import { zaehlePosteingang, zaehleDispo, zaehleBanking } from '../out/augeZaehler.js'
import { augePosteingang, augeDispo, augeBanking } from '../out/auge.js'

const JETZT = new Date('2026-09-11T10:00:00')
const iso = (s) => new Date(s).toISOString()

// ===========================================================================
// POSTEINGANG
// ===========================================================================
test('leerer Posteingang gilt als nicht verbunden, nicht als sauber', () => {
  const a = augePosteingang(zaehlePosteingang([], JETZT))
  assert.equal(a.stimmung, 'neutral')
  assert.match(a.klartext, /leer oder noch nicht verbunden/)
})

test('alles gelesen ist gute Stimmung', () => {
  const a = augePosteingang(zaehlePosteingang([
    { datumIso: iso('2026-09-11T08:00:00'), gelesen: true },
    { datumIso: iso('2026-09-10T08:00:00'), gelesen: true },
  ], JETZT))
  assert.equal(a.stimmung, 'gut')
})

test('ungelesene werden gezaehlt, heutige getrennt', () => {
  const z = zaehlePosteingang([
    { datumIso: iso('2026-09-11T08:00:00'), gelesen: false },
    { datumIso: iso('2026-09-11T09:00:00'), gelesen: false },
    { datumIso: iso('2026-09-10T08:00:00'), gelesen: false },
    { datumIso: iso('2026-09-09T08:00:00'), gelesen: true },
  ], JETZT)
  assert.equal(z.gesamt, 4)
  assert.equal(z.ungelesen, 3)
  assert.equal(z.ungelesenHeute, 2)
  assert.equal(z.aeltesteUngeleseneTage, 1)
})

test('erst ab drei Tagen schlaegt der Posteingang Alarm', () => {
  const zwei = augePosteingang(zaehlePosteingang([{ datumIso: iso('2026-09-09T08:00:00'), gelesen: false }], JETZT))
  assert.equal(zwei.stimmung, 'neutral', 'zwei Tage sind noch kein Alarm')

  const drei = augePosteingang(zaehlePosteingang([{ datumIso: iso('2026-09-08T08:00:00'), gelesen: false }], JETZT))
  assert.equal(drei.stimmung, 'achtung')
  assert.match(drei.klartext, /seit 3 Tagen/)
})

test('das Auge behauptet NIE etwas ueber beantwortet — das Merkmal gibt es nicht', () => {
  for (const mails of [
    [{ datumIso: iso('2026-09-08T08:00:00'), gelesen: false }],
    [{ datumIso: iso('2026-09-11T08:00:00'), gelesen: true }],
    [],
  ]) {
    const a = augePosteingang(zaehlePosteingang(mails, JETZT))
    const alles = a.klartext + ' ' + a.punkte.join(' ')
    assert.doesNotMatch(alles, /unbeantwortet|nicht beantwortet/i)
  }
})

test('fehlendes Datum stuerzt nicht, zaehlt aber als ungelesen', () => {
  const z = zaehlePosteingang([{ gelesen: false }, { datumIso: null, gelesen: false }], JETZT)
  assert.equal(z.ungelesen, 2)
  assert.equal(z.aeltesteUngeleseneTage, null)
})

// ===========================================================================
// DISPO
// ===========================================================================
test('nichts unzugeordnet und nichts heute — alles gut', () => {
  const a = augeDispo(zaehleDispo([], [], JETZT))
  assert.equal(a.stimmung, 'gut')
  assert.match(a.klartext, /kein Einsatz/)
})

test('alle Einsaetze heute haben einen Monteur', () => {
  const a = augeDispo(zaehleDispo([], [
    { beginn_am: iso('2026-09-11T08:00:00') },
    { beginn_am: iso('2026-09-11T13:00:00') },
  ], JETZT))
  assert.equal(a.stimmung, 'gut')
  assert.match(a.klartext, /alle haben einen Monteur/)
})

test('ein Einsatz HEUTE ohne Monteur ist Alarm', () => {
  const unzu = [{ beginn_am: iso('2026-09-11T14:00:00'), titel: 'Heizung Meier' }]
  const z = zaehleDispo(unzu, unzu, JETZT)
  assert.equal(z.unzugeordnetHeute, 1)
  assert.equal(z.naechsterOhneMonteur, 'Heizung Meier')

  const a = augeDispo(z)
  assert.equal(a.stimmung, 'achtung')
  assert.match(a.klartext, /dort fährt sonst niemand hin/)
})

test('unzugeordnet in der Zukunft ist ein Hinweis, kein Alarm', () => {
  const unzu = [{ beginn_am: iso('2026-09-14T08:00:00'), titel: 'Wartung' }]
  const a = augeDispo(zaehleDispo(unzu, unzu, JETZT))
  assert.equal(a.stimmung, 'neutral')
})

test('die Gesamtzahl kommt aus der Liste der Seite, nicht aus eigener Filterung', () => {
  // Die Seite reicht ihre schon gefilterte Liste herein. Auch Eintraege ohne
  // Datum muessen in der Gesamtzahl auftauchen — sonst zeigt das Auge eine
  // andere Zahl als das Panel daneben.
  const unzu = [{ beginn_am: null }, { beginn_am: 'kaputt' }, { beginn_am: iso('2026-09-14T08:00:00') }]
  const z = zaehleDispo(unzu, [], JETZT)
  assert.equal(z.unzugeordnetGesamt, 3, 'muss der Laenge der uebergebenen Liste entsprechen')
  assert.equal(z.unzugeordnetHeute, 0)
})

test('ohne Titel wird der Einsatzort genommen', () => {
  const z = zaehleDispo([{ beginn_am: iso('2026-09-11T14:00:00'), titel: '  ', einsatzort: 'Stuttgart' }], [], JETZT)
  assert.equal(z.naechsterOhneMonteur, 'Stuttgart')
})

test('heute und morgen werden getrennt gezaehlt', () => {
  const unzu = [
    { beginn_am: iso('2026-09-11T14:00:00') },
    { beginn_am: iso('2026-09-12T08:00:00') },
    { beginn_am: iso('2026-09-12T15:00:00') },
    { beginn_am: iso('2026-09-20T08:00:00') },
  ]
  const z = zaehleDispo(unzu, [], JETZT)
  assert.equal(z.unzugeordnetHeute, 1)
  assert.equal(z.unzugeordnetMorgen, 2)
  assert.equal(z.unzugeordnetGesamt, 4)
})

// ===========================================================================
// BANKING
// ===========================================================================
test('keine offenen Rechnungen — nichts abzugleichen', () => {
  const a = augeBanking(zaehleBanking([], []))
  assert.equal(a.stimmung, 'gut')
})

test('offene Rechnungen stossen den Abgleich an, ohne Alarm zu schlagen', () => {
  const z = zaehleBanking([{ brutto: 1200 }, { brutto: 800.5 }], [])
  assert.equal(z.offeneRechnungen, 2)
  assert.equal(z.offenerBetrag, 2000.5)

  const a = augeBanking(z)
  assert.equal(a.stimmung, 'neutral', 'Banking meldet keinen Missstand, es stoesst eine Handlung an')
  assert.match(a.klartext, /Kontoabgleich/)
})

test('ohne verbundene Bank wird der Dateiweg genannt', () => {
  const a = augeBanking(zaehleBanking([{ brutto: 100 }], []))
  assert.match(a.punkte.join(' '), /Umsatz-Export als Datei/)
})

test('verbundene Banken werden gezaehlt, nicht verbundene nicht', () => {
  const z = zaehleBanking([{ brutto: 100 }], [{ verbunden: true }, { verbunden: false }, {}])
  assert.equal(z.bankenVerbunden, 1)
})

test('unsinnige Betraege ergeben null statt NaN', () => {
  const z = zaehleBanking([{ brutto: null }, { brutto: 'viel' }, {}], [])
  assert.equal(z.offenerBetrag, 0)
  assert.equal(Number.isNaN(z.offenerBetrag), false)
})

// ===========================================================================
// QUER ÜBER ALLE DREI
// ===========================================================================
test('alle Texte siezen, sprechen nie in der Ich-Form und sind nie leer', () => {
  const faelle = [
    augePosteingang(zaehlePosteingang([{ datumIso: iso('2026-09-08T08:00:00'), gelesen: false }], JETZT)),
    augePosteingang(zaehlePosteingang([], JETZT)),
    augePosteingang(zaehlePosteingang([{ datumIso: iso('2026-09-11T08:00:00'), gelesen: true }], JETZT)),
    augeDispo(zaehleDispo([{ beginn_am: iso('2026-09-11T14:00:00') }], [], JETZT)),
    augeDispo(zaehleDispo([], [], JETZT)),
    augeBanking(zaehleBanking([{ brutto: 500 }], [])),
    augeBanking(zaehleBanking([], [])),
  ]
  for (const a of faelle) {
    const alles = a.klartext + ' ' + a.punkte.join(' ')
    assert.doesNotMatch(alles, /\b(du|dich|dir|dein|deine|deinen|deinem)\b/i)
    assert.doesNotMatch(alles, /\b(rechne ich|behalte ich|zeige ich|sage ich)\b/i)
    assert.ok(a.klartext.trim().length > 0)
    assert.ok(['gut', 'neutral', 'achtung'].includes(a.stimmung))
  }
})

test('keine Person wird je namentlich genannt — auch nicht bei Dispo', () => {
  // Dispo nennt Einsaetze, nie Monteure. Waere das anders, waere es
  // Leistungskontrolle nach § 87 Abs. 1 Nr. 6 BetrVG.
  const z = zaehleDispo([{ beginn_am: iso('2026-09-11T14:00:00'), titel: 'Heizung Meier' }], [], JETZT)
  const a = augeDispo(z)
  const alles = a.klartext + ' ' + a.punkte.join(' ')
  assert.doesNotMatch(alles, /Monteur \w+ hat|Mitarbeiter \w+ hat/)
  assert.ok(!('mitarbeiterName' in z), 'der Zaehler darf gar keinen Personennamen fuehren')
})
