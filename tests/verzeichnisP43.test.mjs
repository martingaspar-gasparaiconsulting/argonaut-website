// ARGONAUT OS · tests/verzeichnisP43.test.mjs — Punkt 43 (22.09.2026)
// Verarbeitungsverzeichnis: Vorschlaege aus den aktiven Modulen, Kopf nach
// Art. 30 Abs. 1 lit. a, Ausdruck mit Stand-Datum und ehrlicher Lueckenliste.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  VERFAHREN_KATALOG, PFLICHTFELDER,
  vorschlaegeFuer, vorschlaegeNachBuchung, verzeichnisKopf, kopfLuecken, hatDsb, verzeichnisDruckdaten,
} from '../out/verarbeitungsverzeichnis.js';

const HIER = dirname(fileURLToPath(import.meta.url));
const RECHTE_QUELLE = readFileSync(join(HIER, '..', 'lib', 'rechte.ts'), 'utf8');

// ---------------------------------------------------------------------------
// 1. DER WAECHTER UEBER DEN KATALOG
// ---------------------------------------------------------------------------

test('WAECHTER: jeder Vorschlag traegt ALLE neun Pflichtangaben', () => {
  for (const v of VERFAHREN_KATALOG) {
    for (const f of PFLICHTFELDER) {
      assert.ok(
        typeof v[f] === 'string' && v[f].trim().length > 10,
        `"${v.name}": das Feld ${f} fehlt oder ist zu duenn — Art. 30 Abs. 1 verlangt es.`,
      );
    }
  }
});

test('WAECHTER: kein Vorschlag haengt an einem erfundenen Modul-Schluessel', () => {
  // Gemessen gegen lib/rechte.ts — dort stehen die echten Schluessel.
  for (const v of VERFAHREN_KATALOG) {
    if (v.wenn === 'immer') continue;
    assert.ok(
      RECHTE_QUELLE.includes(`modul: '${v.wenn}'`),
      `"${v.name}" haengt am Modul "${v.wenn}" — das gibt es in lib/rechte.ts nicht, `
      + 'der Vorschlag wuerde NIE erscheinen.',
    );
  }
});

test('jede Rechtsgrundlage nennt einen Artikel oder Paragrafen', () => {
  for (const v of VERFAHREN_KATALOG) {
    assert.match(v.rechtsgrundlage, /Art\.|§/, `"${v.name}": Rechtsgrundlage ohne Fundstelle`);
  }
});

test('jede Loeschfrist nennt eine Dauer — "wird geloescht" reicht nicht', () => {
  // Gemessen am 22.09.: Ein einfaches /\d+\s*Jahr/ war zu leichtglaeubig — es
  // fand die Ziffer in "(§ 16 Abs. 2 ArbZG)" und liess "Zwei Jahre" als Dauer
  // durchgehen, obwohl dort gar keine Ziffer stand. Deshalb fliegen erst alle
  // Fundstellen raus, dann wird gesucht.
  const ohneFundstellen = (t) => t
    .replace(/\([^)]*\)/g, ' ')
    .replace(/(§+|Art\.)\s*\d+[^,;.]*/g, ' ');
  for (const v of VERFAHREN_KATALOG) {
    const rein = ohneFundstellen(v.loeschfrist);
    assert.match(
      rein, /\d+\s*(Jahr|Monat|Tag|Woche)/i,
      `"${v.name}": die Loeschfrist nennt keine Dauer in Ziffern — "${v.loeschfrist}"`,
    );
  }
});

test('die Namen sind eindeutig — kein Eintrag doppelt im Verzeichnis', () => {
  const namen = VERFAHREN_KATALOG.map((v) => v.name);
  assert.equal(new Set(namen).size, namen.length);
});

// ---------------------------------------------------------------------------
// 2. DIE VORSCHLAEGE
// ---------------------------------------------------------------------------

test('ein Betrieb ohne jedes Modul bekommt trotzdem die Grundverfahren', () => {
  const v = vorschlaegeFuer([]);
  const namen = v.map((x) => x.name);
  assert.ok(namen.includes('Kundenverwaltung und Geschaeftsanbahnung'));
  assert.ok(namen.includes('Website und Kontaktformular'));
  assert.equal(v.every((x) => x.wenn === 'immer'), true);
});

test('DER WICHTIGSTE TEST: Lohn NUR mit Personal-Modul', () => {
  const ohne = vorschlaegeFuer(['rechnungen', 'termine']).map((v) => v.name);
  assert.ok(!ohne.includes('Personalverwaltung und Entgeltabrechnung'));
  assert.ok(!ohne.includes('Bewerbermanagement'));

  const mit = vorschlaegeFuer(['personal']).map((v) => v.name);
  assert.ok(mit.includes('Personalverwaltung und Entgeltabrechnung'));
  assert.ok(mit.includes('Bewerbermanagement'));
});

test('die Module ziehen genau ihre eigenen Vorschlaege nach', () => {
  assert.ok(vorschlaegeFuer(['rechnungen']).some((v) => v.name.startsWith('Rechnungsstellung')));
  assert.ok(vorschlaegeFuer(['marketing']).some((v) => v.name.startsWith('Newsletter')));
  assert.ok(vorschlaegeFuer(['kasse']).some((v) => v.name.startsWith('Kassenfuehrung')));
  assert.ok(!vorschlaegeFuer(['rechnungen']).some((v) => v.name.startsWith('Kassenfuehrung')));
});

test('Unsinn als Modulliste stuerzt nicht ab', () => {
  assert.ok(vorschlaegeFuer(null).length > 0);
  assert.ok(vorschlaegeFuer(undefined).length > 0);
  assert.ok(vorschlaegeFuer(['', '   ']).length > 0);
});

// ---------------------------------------------------------------------------
// 3. DER KOPF (Art. 30 Abs. 1 lit. a)
// ---------------------------------------------------------------------------

test('der Kopf entsteht aus dem Betriebsprofil', () => {
  const k = verzeichnisKopf({
    firma_name: ' Muster GmbH ', firma_strasse: 'Musterweg 1',
    firma_plz: '71032', firma_ort: 'Böblingen',
    firma_email: 'info@muster.de', firma_telefon: '07031 123',
    dsb_name: 'Frau Beispiel', dsb_kontakt: 'datenschutz@muster.de',
  });
  assert.equal(k.verantwortlicher, 'Muster GmbH');
  assert.equal(k.anschrift, 'Musterweg 1, 71032 Böblingen');
  assert.equal(hatDsb(k), true);
  assert.deepEqual(kopfLuecken(k), []);
});

test('fehlende Angaben werden benannt, nicht erfunden', () => {
  const k = verzeichnisKopf({});
  assert.equal(k.verantwortlicher, '');
  assert.equal(k.anschrift, '');
  assert.equal(hatDsb(k), false);
  const fehlt = kopfLuecken(k);
  assert.equal(fehlt.length, 3);
  assert.ok(fehlt.some((f) => /Verantwortlichen/.test(f)));
});

test('ein fehlender Datenschutzbeauftragter ist KEINE Luecke', () => {
  // § 38 BDSG: nicht jeder Betrieb braucht einen. Ein Pflicht-Alarm waere
  // ein Fehlalarm fuer den kleinen Handwerksbetrieb.
  const k = verzeichnisKopf({ firma_name: 'X', firma_strasse: 'Y', firma_ort: 'Z', firma_email: 'a@b.de' });
  assert.equal(hatDsb(k), false);
  assert.deepEqual(kopfLuecken(k), []);
});

test('Telefon ODER E-Mail genuegt als Kontakt', () => {
  const nurTel = verzeichnisKopf({ firma_name: 'X', firma_strasse: 'Y', firma_ort: 'Z', firma_telefon: '0700' });
  assert.deepEqual(kopfLuecken(nurTel), []);
  const keins = verzeichnisKopf({ firma_name: 'X', firma_strasse: 'Y', firma_ort: 'Z' });
  assert.equal(keins.email, '');
  assert.ok(kopfLuecken(keins).some((f) => /Kontaktdaten/.test(f)));
});

// ---------------------------------------------------------------------------
// 4. DER AUSDRUCK (Art. 30 Abs. 4)
// ---------------------------------------------------------------------------

test('der Ausdruck traegt das Stand-Datum und alle acht Feldzeilen je Eintrag', () => {
  const k = verzeichnisKopf({ firma_name: 'Muster GmbH', firma_strasse: 'Weg 1', firma_ort: 'Ort', firma_email: 'a@b.de' });
  const d = verzeichnisDruckdaten(k, [VERFAHREN_KATALOG[0]], '2026-09-22');
  assert.equal(d.stand, '2026-09-22');
  assert.equal(d.eintraege.length, 1);
  assert.equal(d.eintraege[0].zeilen.length, 8);
  assert.deepEqual(d.luecken, []);
});

test('DER WICHTIGSTE TEST: eine fehlende Angabe steht als Luecke DRIN, nicht leer da', () => {
  // Ein Verzeichnis, das Luecken verschweigt, ist gefaehrlicher als ein
  // luecklichaftes: die Behoerde findet sie ohnehin.
  const k = verzeichnisKopf({ firma_name: 'X', firma_strasse: 'Y', firma_ort: 'Z', firma_email: 'a@b.de' });
  const d = verzeichnisDruckdaten(k, [{ name: 'Halbes Verfahren', zweck: 'Etwas tun' }], '2026-09-22');
  assert.equal(d.eintraege[0].zeilen[0].wert, 'Etwas tun');
  assert.equal(d.eintraege[0].zeilen[1].wert, '— nicht ausgefuellt —');
  assert.equal(d.luecken.length, 7, 'sieben von acht Feldern fehlen');
  assert.ok(d.luecken.every((l) => l.startsWith('Halbes Verfahren: ')));
});

test('Luecken im Kopf stehen ebenfalls im Ausdruck', () => {
  const d = verzeichnisDruckdaten(verzeichnisKopf({}), [], '2026-09-22');
  assert.ok(d.luecken.some((l) => l.startsWith('Kopf: ')));
  assert.ok(d.luecken.some((l) => /noch keine Verarbeitungstaetigkeit/.test(l)));
});

test('ein Eintrag ohne Namen bekommt einen erkennbaren Platzhalter', () => {
  const d = verzeichnisDruckdaten(verzeichnisKopf({}), [{ name: '  ' }], '2026-09-22');
  assert.equal(d.eintraege[0].name, 'Eintrag ohne Namen');
});

test('alle Katalog-Verfahren gehen lueckenlos durch den Ausdruck', () => {
  const k = verzeichnisKopf({ firma_name: 'X', firma_strasse: 'Y', firma_ort: 'Z', firma_email: 'a@b.de' });
  const d = verzeichnisDruckdaten(k, VERFAHREN_KATALOG, '2026-09-22');
  assert.deepEqual(d.luecken, [], 'ein Vorschlag aus dem Katalog darf nie eine Luecke erzeugen');
  assert.equal(d.eintraege.length, VERFAHREN_KATALOG.length);
});

// ---------------------------------------------------------------------------
// 5. FAIL-OPEN — am echten Verhalten von lib/tenantModule.ts geprueft
// ---------------------------------------------------------------------------

test('DER FAIL-OPEN-FALL: "nie scharf konfiguriert" schlaegt ALLES vor', () => {
  // gebuchteModulKeys() gibt null zurueck, wenn der Betrieb keine aktive
  // Buchungszeile hat — dann ist im Menue alles sichtbar. Nur die zwei
  // Grundverfahren vorzuschlagen waere hier zu wenig.
  const alle = vorschlaegeNachBuchung(null);
  assert.equal(alle.length, VERFAHREN_KATALOG.length);
  assert.ok(alle.some((v) => v.name.startsWith('Personalverwaltung')));
  assert.equal(vorschlaegeNachBuchung(undefined).length, VERFAHREN_KATALOG.length);
});

test('mit echten Buchungen wird wieder streng ausgewaehlt', () => {
  const nurRechnungen = vorschlaegeNachBuchung(new Set(['rechnungen']));
  assert.ok(nurRechnungen.some((v) => v.name.startsWith('Rechnungsstellung')));
  assert.ok(!nurRechnungen.some((v) => v.name.startsWith('Personalverwaltung')));
  // Die Grundverfahren bleiben immer dabei.
  assert.ok(nurRechnungen.some((v) => v.wenn === 'immer'));
});

test('eine leere Menge ist NICHT dasselbe wie null', () => {
  // Leere Menge = scharf konfiguriert, aber nichts gebucht.
  const leer = vorschlaegeNachBuchung(new Set());
  assert.ok(leer.every((v) => v.wenn === 'immer'));
  assert.ok(leer.length < VERFAHREN_KATALOG.length);
});
