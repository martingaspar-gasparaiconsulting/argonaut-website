import test from 'node:test'
import assert from 'node:assert/strict'
import { zaehleTermine, zaehleZahlungen, zaehleEingangsbelege, tageDazwischen } from '../out/augeZaehler.js'
import { augeTermine, augeZahlungen, augeEingangsbelege } from '../out/auge.js'

// Fester Bezugspunkt: Mittwoch, 11.09.2026, 10:00 Ortszeit.
const JETZT = new Date('2026-09-11T10:00:00')
const iso = (s) => new Date(s).toISOString()

// ===========================================================================
// TAGE DAZWISCHEN
// ===========================================================================
test('tageDazwischen rechnet kalendarisch, nicht auf die Stunde', () => {
  // 23:00 gestern bis 10:00 heute sind 11 Stunden — aber ein Kalendertag.
  assert.equal(tageDazwischen('2026-09-10T23:00:00', JETZT), 1)
  assert.equal(tageDazwischen('2026-09-11T00:01:00', JETZT), 0)
  assert.equal(tageDazwischen('2026-08-12T12:00:00', JETZT), 30)
})

test('tageDazwischen verkraftet Unsinn ohne Absturz', () => {
  assert.equal(tageDazwischen(null, JETZT), null)
  assert.equal(tageDazwischen('kein Datum', JETZT), null)
  assert.equal(tageDazwischen(undefined, JETZT), null)
})

// ===========================================================================
// TERMINE
// ===========================================================================
test('leere Terminliste ergibt lauter Nullen', () => {
  const z = zaehleTermine([], JETZT)
  assert.equal(z.heute, 0); assert.equal(z.dieseWoche, 0)
  assert.equal(z.vergangenOffen, 0); assert.equal(z.naechsterInStunden, null)
})

test('heute, morgen und diese Woche werden getrennt gezaehlt', () => {
  const z = zaehleTermine([
    { beginn_am: iso('2026-09-11T14:00:00'), titel: 'Heute A' },
    { beginn_am: iso('2026-09-11T16:00:00'), titel: 'Heute B' },
    { beginn_am: iso('2026-09-12T09:00:00'), titel: 'Morgen' },
    { beginn_am: iso('2026-09-15T09:00:00'), titel: 'Naechste Woche' },
    { beginn_am: iso('2026-10-01T09:00:00'), titel: 'Weit weg' },
  ], JETZT)
  assert.equal(z.heute, 2)
  assert.equal(z.morgen, 1)
  assert.equal(z.dieseWoche, 4)   // die naechsten 7 Tage ab heute
})

test('abgesagte Termine zaehlen nirgends mit', () => {
  const z = zaehleTermine([
    { beginn_am: iso('2026-09-11T14:00:00'), status: 'abgesagt' },
    { beginn_am: iso('2026-09-11T15:00:00'), status: 'geplant' },
  ], JETZT)
  assert.equal(z.heute, 1)
})

test('vergangene Termine auf geplant sind die eigentliche Nachlaessigkeit', () => {
  const z = zaehleTermine([
    { beginn_am: iso('2026-09-09T09:00:00'), status: 'geplant' },
    { beginn_am: iso('2026-09-10T09:00:00'), status: 'geplant' },
    { beginn_am: iso('2026-09-08T09:00:00'), status: 'erledigt' },
  ], JETZT)
  assert.equal(z.vergangenOffen, 2)
})

test('ohne Status gilt geplant — sonst faellt Liegengebliebenes durchs Raster', () => {
  const z = zaehleTermine([{ beginn_am: iso('2026-09-09T09:00:00') }], JETZT)
  assert.equal(z.vergangenOffen, 1)
})

test('der naechste Termin ist der frueheste in der Zukunft, nicht der erste in der Liste', () => {
  const z = zaehleTermine([
    { beginn_am: iso('2026-09-14T09:00:00'), titel: 'Spaeter' },
    { beginn_am: iso('2026-09-11T12:00:00'), titel: 'Gleich' },
  ], JETZT)
  assert.equal(z.naechsterTitel, 'Gleich')
  assert.equal(z.naechsterInStunden, 2)
})

test('kaputte Datumsangaben werden uebersprungen statt zu stuerzen', () => {
  const z = zaehleTermine([
    { beginn_am: 'Unsinn' }, { beginn_am: null }, null,
    { beginn_am: iso('2026-09-11T14:00:00') },
  ], JETZT)
  assert.equal(z.heute, 1)
})

test('Text: liegengebliebene Termine schlagen Alarm', () => {
  const a = augeTermine(zaehleTermine([{ beginn_am: iso('2026-09-09T09:00:00'), status: 'geplant' }], JETZT))
  assert.equal(a.stimmung, 'achtung')
  assert.match(a.klartext, /nie abgeschlossen/)
})

test('Text: leere Woche ist kein Alarm, sondern ein Hinweis', () => {
  const a = augeTermine(zaehleTermine([], JETZT))
  assert.equal(a.stimmung, 'neutral')
  assert.match(a.klartext, /kein Termin/)
})

test('Text siezt und spricht nie in der Ich-Form', () => {
  for (const a of [
    augeTermine(zaehleTermine([{ beginn_am: iso('2026-09-11T14:00:00') }], JETZT)),
    augeTermine(zaehleTermine([], JETZT)),
  ]) {
    const alles = a.klartext + ' ' + a.punkte.join(' ')
    assert.doesNotMatch(alles, /\b(du|dich|dir|dein|deine|deinen)\b/i)
    assert.doesNotMatch(alles, /\b(rechne ich|behalte ich|zeige ich)\b/i)
  }
})

// ===========================================================================
// ZAHLUNGEN
// ===========================================================================
test('gemeldete Zahlungen zaehlen auch als offene Rechnungen', () => {
  const z = zaehleZahlungen([
    { brutto_summe: 1000, zahlung_gemeldet_am: '2026-09-10' },
    { brutto_summe: 500 },
  ], [], JETZT)
  assert.equal(z.gemeldetOffen, 1)
  assert.equal(z.gemeldetBetrag, 1000)
  assert.equal(z.offeneRechnungen, 2)
  assert.equal(z.offenerBetrag, 1500)
})

test('bezahlte Rechnungen zaehlen nirgends mit', () => {
  const z = zaehleZahlungen([
    { brutto_summe: 1000, bezahlt_am: '2026-09-01' },
    { brutto_summe: 1000, bezahlt_am: '2026-09-01', zahlung_gemeldet_am: '2026-08-30' },
  ], [], JETZT)
  assert.equal(z.offeneRechnungen, 0)
  assert.equal(z.gemeldetOffen, 0)
})

test('stornierte Rechnungen bleiben draussen', () => {
  const z = zaehleZahlungen([{ brutto_summe: 9999, zahlungsstatus: 'storniert' }], [], JETZT)
  assert.equal(z.offeneRechnungen, 0)
  assert.equal(z.offenerBetrag, 0)
})

test('offene eigene Belege mit Alter des aeltesten', () => {
  const z = zaehleZahlungen([], [
    { brutto: 200, belegdatum: '2026-08-01' },
    { brutto: 50, belegdatum: '2026-09-09' },
    { brutto: 999, belegdatum: '2026-07-01', bezahlt_am: '2026-07-15' },
  ], JETZT)
  assert.equal(z.offeneBelege, 2)
  assert.equal(z.offenerBelegBetrag, 250)
  assert.equal(z.aeltesterBelegTage, 41)
})

test('Betraege werden kaufmaennisch auf zwei Stellen gerundet', () => {
  const z = zaehleZahlungen([{ brutto_summe: 33.335 }, { brutto_summe: 0.005 }], [], JETZT)
  assert.equal(z.offenerBetrag, 33.34)
})

test('fehlende oder unsinnige Betraege zaehlen als null, nicht als NaN', () => {
  const z = zaehleZahlungen([{ brutto_summe: null }, { brutto_summe: 'viel' }, {}], [], JETZT)
  assert.equal(z.offenerBetrag, 0)
  assert.equal(Number.isNaN(z.offenerBetrag), false)
})

test('Text: eine gemeldete Zahlung ist der schnellste Handgriff', () => {
  const a = augeZahlungen(zaehleZahlungen([{ brutto_summe: 1000, zahlung_gemeldet_am: '2026-09-10' }], [], JETZT))
  assert.equal(a.stimmung, 'achtung')
  assert.match(a.klartext, /wartet auf Ihre Bestätigung/)
})

test('Text: nichts offen ist gute Stimmung', () => {
  const a = augeZahlungen(zaehleZahlungen([], [], JETZT))
  assert.equal(a.stimmung, 'gut')
})

// ===========================================================================
// EINGANGSBELEGE
// ===========================================================================
test('ohne Belege kommt ein Einstiegshinweis, kein Alarm', () => {
  const a = augeEingangsbelege(zaehleEingangsbelege([], JETZT))
  assert.equal(a.stimmung, 'neutral')
  assert.match(a.klartext, /Noch keine Eingangsbelege/)
})

test('Belege ohne Datei und ohne Konto werden getrennt gezaehlt', () => {
  const z = zaehleEingangsbelege([
    { datei_pfad: 'x.pdf', datev_konto: '3400', bezahlt_am: '2026-09-01' },
    { datei_pfad: '', datev_konto: '3400', bezahlt_am: '2026-09-01' },
    { datei_pfad: 'y.pdf', datev_konto: null, bezahlt_am: '2026-09-01' },
    { datei_pfad: '   ', datev_konto: '  ' },
  ], JETZT)
  assert.equal(z.gesamt, 4)
  assert.equal(z.ohneDatei, 2)   // leer und nur Leerzeichen
  assert.equal(z.ohneKonto, 2)
  assert.equal(z.unbezahlt, 1)
})

test('fehlende Datei wiegt schwerer als fehlendes Konto', () => {
  const a = augeEingangsbelege(zaehleEingangsbelege([
    { datei_pfad: '', datev_konto: '' },
  ], JETZT))
  assert.equal(a.stimmung, 'achtung')
  assert.match(a.klartext, /keine Datei/)
})

test('alles vollstaendig ergibt gute Stimmung', () => {
  const a = augeEingangsbelege(zaehleEingangsbelege([
    { datei_pfad: 'a.pdf', datev_konto: '3400', bezahlt_am: '2026-09-01' },
  ], JETZT))
  assert.equal(a.stimmung, 'gut')
})

test('ein alter unbezahlter Beleg wird benannt', () => {
  const z = zaehleEingangsbelege([
    { datei_pfad: 'a.pdf', datev_konto: '3400', belegdatum: '2026-07-01' },
  ], JETZT)
  assert.equal(z.aeltesterUnbezahltTage, 72)
  const a = augeEingangsbelege(z)
  assert.equal(a.stimmung, 'achtung')
  assert.match(a.klartext, /72 Tagen offen/)
})

test('alle drei Texte siezen und sprechen nie in der Ich-Form', () => {
  const faelle = [
    augeEingangsbelege(zaehleEingangsbelege([{ datei_pfad: '', datev_konto: '' }], JETZT)),
    augeEingangsbelege(zaehleEingangsbelege([], JETZT)),
    augeZahlungen(zaehleZahlungen([{ brutto_summe: 100 }], [{ brutto: 50 }], JETZT)),
    augeZahlungen(zaehleZahlungen([], [], JETZT)),
    augeTermine(zaehleTermine([{ beginn_am: iso('2026-09-09T09:00:00') }], JETZT)),
  ]
  for (const a of faelle) {
    const alles = a.klartext + ' ' + a.punkte.join(' ')
    assert.doesNotMatch(alles, /\b(du|dich|dir|dein|deine|deinen|deinem)\b/i)
    assert.doesNotMatch(alles, /\b(rechne ich|behalte ich|zeige ich|sage ich)\b/i)
    assert.ok(a.klartext.length > 0, 'Klartext darf nie leer sein')
    assert.ok(['gut', 'neutral', 'achtung'].includes(a.stimmung))
  }
})
