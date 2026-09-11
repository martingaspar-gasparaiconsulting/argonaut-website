import test from 'node:test'
import assert from 'node:assert/strict'
import { zaehleZeiterfassung, zaehleSchichtplan } from '../out/augeZaehler.js'
import { augeZeiterfassung, augeSchichtplan } from '../out/auge.js'

const JETZT = new Date('2026-09-11T10:00:00')
const iso = (s) => new Date(s).toISOString()

// ===========================================================================
// ZEITERFASSUNG — persoenliche Stempeluhr, Selbstauskunft
// ===========================================================================
test('nicht eingestempelt und nichts gebucht', () => {
  const a = augeZeiterfassung(zaehleZeiterfassung(null, [], JETZT))
  assert.equal(a.stimmung, 'neutral')
  assert.match(a.klartext, /noch nicht gestempelt/)
})

test('laufende Sitzung wird in Stunden und Minuten angesagt', () => {
  const z = zaehleZeiterfassung({ kommen_um: iso('2026-09-11T06:40:00'), gehen_um: null }, [], JETZT)
  assert.equal(z.eingestempelt, true)
  assert.equal(z.laufendMinuten, 200)

  const a = augeZeiterfassung(z)
  assert.equal(a.stimmung, 'gut')
  assert.match(a.klartext, /3 Std\. 20 Min\./)
})

test('das Auge sagt NICHTS ueber die Warteschlange — die Seite zeigt das schon selbst', () => {
  // Doppelte Aussagen auf derselben Seite sind schlimmer als eine,
  // spaetestens wenn sie sich einmal widersprechen.
  const a = augeZeiterfassung(zaehleZeiterfassung({ kommen_um: iso('2026-09-11T06:40:00') }, [], JETZT))
  const alles = a.klartext + ' ' + a.punkte.join(' ')
  assert.doesNotMatch(alles, /Warteschlange|übertragen|Empfang|Netz/i)
})

test('offene Pause ab 90 Minuten wird angesprochen', () => {
  const kurz = augeZeiterfassung(zaehleZeiterfassung(
    { kommen_um: iso('2026-09-11T08:00:00'), pause_offen_seit: iso('2026-09-11T09:30:00') }, [], JETZT))
  assert.equal(kurz.stimmung, 'gut', '30 Minuten Pause sind normal')

  const lang = augeZeiterfassung(zaehleZeiterfassung(
    { kommen_um: iso('2026-09-11T06:00:00'), pause_offen_seit: iso('2026-09-11T08:00:00') }, [], JETZT))
  assert.equal(lang.stimmung, 'achtung')
  assert.match(lang.klartext, /Pause läuft seit 2 Std\. 00 Min\./)
})

test('ueber zehn Stunden nennt das Arbeitszeitgesetz', () => {
  const z = zaehleZeiterfassung({ kommen_um: iso('2026-09-10T23:00:00'), gehen_um: null }, [], JETZT)
  assert.equal(z.laufendMinuten, 660)
  const a = augeZeiterfassung(z)
  assert.equal(a.stimmung, 'achtung')
  assert.match(a.klartext, /Arbeitszeitgesetz/)
})

test('beendete Sitzung zaehlt nicht als eingestempelt', () => {
  const z = zaehleZeiterfassung(
    { kommen_um: iso('2026-09-11T06:00:00'), gehen_um: iso('2026-09-11T09:00:00') },
    [{ kommen_um: iso('2026-09-11T06:00:00') }], JETZT)
  assert.equal(z.eingestempelt, false)
  assert.equal(z.laufendMinuten, null)
  const a = augeZeiterfassung(z)
  assert.match(a.klartext, /aktuell nicht eingestempelt/)
})

test('kaputte Zeitangaben stuerzen nicht', () => {
  const z = zaehleZeiterfassung({ kommen_um: 'Unsinn' }, [], JETZT)
  assert.equal(z.laufendMinuten, null)
  assert.ok(augeZeiterfassung(z).klartext.length > 0)
})

test('die Zeiterfassung bewertet NIE — kein zu spaet, kein zu wenig', () => {
  const faelle = [
    zaehleZeiterfassung(null, [], JETZT),
    zaehleZeiterfassung({ kommen_um: iso('2026-09-11T09:00:00') }, [], JETZT),
    zaehleZeiterfassung({ kommen_um: iso('2026-09-10T20:00:00') }, [], JETZT),
    zaehleZeiterfassung(null, [], JETZT),
  ]
  for (const z of faelle) {
    const a = augeZeiterfassung(z)
    const alles = a.klartext + ' ' + a.punkte.join(' ')
    assert.doesNotMatch(alles, /zu spät|zu wenig|zu kurz|unpünktlich|Verspätung/i)
  }
})

// ===========================================================================
// SCHICHTPLAN — Chef-Seite, ausschliesslich Summen
// ===========================================================================
test('sauberer Plan ist gute Stimmung', () => {
  const a = augeSchichtplan(zaehleSchichtplan([], {}, {}))
  assert.equal(a.stimmung, 'gut')
  assert.match(a.klartext, /sauber/)
})

test('gerissene Geringfuegigkeitsgrenze schlaegt alles andere', () => {
  const z = zaehleSchichtplan(
    [{ id: 'a' }, { id: 'b' }],
    { m1: { status: 'ueber' }, m2: { status: 'knapp' }, m3: { status: 'ok' } },
    { s1: { status: 'offen' } },
  )
  assert.equal(z.minijobUeber, 1)
  assert.equal(z.minijobKnapp, 1)
  assert.equal(z.offeneTauschantraege, 2)
  assert.equal(z.unbestaetigt, 1)

  const a = augeSchichtplan(z)
  assert.equal(a.stimmung, 'achtung')
  assert.match(a.klartext, /rückwirkend sozialversicherungspflichtig/)
})

test('Tauschantraege ohne Minijob-Problem sind neutral', () => {
  const a = augeSchichtplan(zaehleSchichtplan([{ id: 'a' }], {}, {}))
  assert.equal(a.stimmung, 'neutral')
  assert.match(a.klartext, /Tauschantrag/)
})

test('bestaetigte Schichten zaehlen nicht als unbestaetigt', () => {
  const z = zaehleSchichtplan([], {}, { s1: { status: 'bestaetigt' }, s2: { status: 'bestaetigt' } })
  assert.equal(z.unbestaetigt, 0)
})

test('leere oder fehlende Eingaben ergeben Nullen', () => {
  const z = zaehleSchichtplan(null, null, null)
  assert.deepEqual(z, { offeneTauschantraege: 0, minijobUeber: 0, minijobKnapp: 0, unbestaetigt: 0 })
})

test('DER ENTSCHEIDENDE TEST: der Schichtplan-Zaehler fuehrt keine Person', () => {
  // Wuerde hier ein Name oder eine Mitarbeiter-Kennung auftauchen, waere das
  // Leistungs- und Verhaltenskontrolle nach § 87 Abs. 1 Nr. 6 BetrVG.
  const z = zaehleSchichtplan(
    [{ id: 'a', von_mitarbeiter_id: 'ma-42', name: 'Franz Huber' }],
    { 'ma-42': { status: 'ueber', std: 55 } },
    { 'schicht-1': { status: 'offen' } },
  )
  const alsText = JSON.stringify(z)
  assert.doesNotMatch(alsText, /ma-42|Franz|Huber|schicht-1/)
  assert.deepEqual(Object.keys(z).sort(), ['minijobKnapp', 'minijobUeber', 'offeneTauschantraege', 'unbestaetigt'])

  const a = augeSchichtplan(z)
  const alles = a.klartext + ' ' + a.punkte.join(' ')
  assert.doesNotMatch(alles, /ma-42|Franz|Huber/)
})

test('alle Texte siezen und sind nie leer', () => {
  const faelle = [
    augeZeiterfassung(zaehleZeiterfassung(null, [], JETZT)),
    augeZeiterfassung(zaehleZeiterfassung(null, [], JETZT)),
    augeZeiterfassung(zaehleZeiterfassung({ kommen_um: iso('2026-09-11T08:00:00') }, [], JETZT)),
    augeSchichtplan(zaehleSchichtplan([], {}, {})),
    augeSchichtplan(zaehleSchichtplan([{}], { a: { status: 'ueber' } }, {})),
  ]
  for (const a of faelle) {
    const alles = a.klartext + ' ' + a.punkte.join(' ')
    assert.doesNotMatch(alles, /\b(du|dich|dir|dein|deine|deinen|deinem)\b/i)
    assert.doesNotMatch(alles, /\b(rechne ich|behalte ich|zeige ich)\b/i)
    assert.ok(a.klartext.trim().length > 0)
    assert.ok(['gut', 'neutral', 'achtung'].includes(a.stimmung))
  }
})
