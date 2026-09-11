// ============================================================================
// ARGONAUT OS · tests/agbPreise.test.mjs
//
// WOGEGEN DIESER TEST LÄUFT
// lib/tarif.ts ist die Quelle der Wahrheit für alle Preise — aber die AGB
// (app/agb/page.tsx) führt dieselben Zahlen noch einmal im Text. Das ist
// Absicht: Ein Rechtstext wird nicht zur Laufzeit aus Code zusammengesetzt,
// sonst steht im Vertrag etwas anderes als beim Abschluss.
//
// Der Preis dafür ist, dass beide Stellen auseinanderlaufen können. Genau das
// verhindert dieser Test: Wer eine Zahl in tarif.ts ändert und die AGB
// vergisst, bekommt hier einen roten Test — nicht erst eine Beschwerde vom
// Kunden, der im Vertrag einen anderen Preis liest als im Angebot.
//
// Gefunden am 11.09.2026: Die AGB importiert tarif.ts NICHT, obwohl der
// Kopfkommentar dort das Gegenteil behauptete.
// ============================================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  STUFEN, SITZ, LAUFZEIT_RABATT, SPEICHER_BLOCK_GB, SPEICHER_BLOCK_PREIS,
  SPEICHER_INKL_PRO_MA_GB,
} from '../out/tarif.js'

const AGB = readFileSync(new URL('../app/agb/page.tsx', import.meta.url), 'utf8')

/** Deutsche Tausendertrennung: 1290 -> "1.290" */
const de = (n) => n.toLocaleString('de-DE')

/** Steht die Zahl als Euro-Betrag irgendwo in der AGB? */
function stehtInAgb(betrag) {
  const formen = [`${de(betrag)} €`, `${de(betrag)}&nbsp;€`, `${betrag} €`]
  return formen.some((f) => AGB.includes(f))
}

test('die AGB-Datei wurde überhaupt gefunden', () => {
  assert.ok(AGB.length > 1000, 'app/agb/page.tsx ist leer oder fehlt')
  assert.match(AGB, /Allgemeine Geschäftsbedingungen|AGB/i)
})

test('jede Grundgebühr aus tarif.ts steht auch in der AGB', () => {
  for (const s of STUFEN) {
    assert.ok(
      stehtInAgb(s.grundgebuehr),
      `Grundgebühr ${s.name}: ${de(s.grundgebuehr)} € steht in lib/tarif.ts, aber NICHT in der AGB. ` +
      `Wurde der Preis geändert und die AGB vergessen?`,
    )
  }
})

test('jede Einrichtungsgebühr aus tarif.ts steht auch in der AGB', () => {
  for (const s of STUFEN) {
    assert.ok(
      stehtInAgb(s.onboarding),
      `Einrichtung ${s.name}: ${de(s.onboarding)} € fehlt in der AGB.`,
    )
  }
})

test('jeder Sitzpreis aus tarif.ts steht auch in der AGB', () => {
  for (const [typ, eintrag] of Object.entries(SITZ)) {
    for (const preis of eintrag.preise) {
      assert.ok(
        stehtInAgb(preis),
        `Sitzpreis ${typ} (${eintrag.name}): ${preis} € fehlt in der AGB.`,
      )
    }
  }
})

test('die Laufzeit-Rabatte stimmen mit der AGB überein', () => {
  for (const r of LAUFZEIT_RABATT) {
    assert.ok(
      AGB.includes(`${r.monate} Monaten`) || AGB.includes(`${r.monate} Monate`),
      `Laufzeit ${r.monate} Monate fehlt in der AGB.`,
    )
    assert.ok(
      AGB.includes(`${r.prozent} %`) || AGB.includes(`${r.prozent}%`),
      `Rabatt ${r.prozent} % (für ${r.monate} Monate) fehlt in der AGB.`,
    )
  }
})

test('die Speicher-Angaben stimmen mit der AGB überein', () => {
  assert.ok(AGB.includes(`${SPEICHER_INKL_PRO_MA_GB} GB`), `${SPEICHER_INKL_PRO_MA_GB} GB inklusive fehlt in der AGB.`)
  assert.ok(AGB.includes(`${SPEICHER_BLOCK_GB} GB`), `Blockgröße ${SPEICHER_BLOCK_GB} GB fehlt in der AGB.`)
  assert.ok(stehtInAgb(SPEICHER_BLOCK_PREIS), `Blockpreis ${SPEICHER_BLOCK_PREIS} € fehlt in der AGB.`)
})

test('GEGENPROBE: eine erfundene Zahl steht NICHT in der AGB', () => {
  // Ohne diesen Test wäre nicht bewiesen, dass die Prüfung überhaupt etwas
  // findet — eine Suche, die immer „ja" sagt, sichert nichts ab.
  assert.equal(stehtInAgb(1234567), false)
  assert.equal(stehtInAgb(777), false)
})

test('die AGB nennt keine Zahl, die es in tarif.ts gar nicht gibt', () => {
  // Umgekehrte Richtung: In der Preis-TABELLE der AGB (die beiden Listen ganz
  // oben) darf kein Betrag stehen, den tarif.ts nicht kennt. Sonst hat jemand
  // eine Zahl von Hand eingetragen, die nirgends gepflegt wird.
  const bekannt = new Set([
    ...STUFEN.map((s) => s.grundgebuehr),
    ...STUFEN.map((s) => s.onboarding),
    ...Object.values(SITZ).flatMap((e) => e.preise),
    SPEICHER_BLOCK_PREIS,
  ])

  const tabelle = AGB.slice(0, AGB.indexOf('export default'))
  const gefunden = [...tabelle.matchAll(/([0-9][0-9.]*)\s*€/g)]
    .map((m) => Number(m[1].replace(/\./g, '')))
    .filter((n) => Number.isFinite(n))

  const fremde = [...new Set(gefunden)].filter((n) => !bekannt.has(n))
  assert.deepEqual(
    fremde, [],
    `Diese Beträge stehen in der AGB-Preistabelle, aber nicht in lib/tarif.ts: ${fremde.join(', ')} €`,
  )
})
