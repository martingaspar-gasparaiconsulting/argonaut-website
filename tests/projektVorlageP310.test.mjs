// ============================================================================
// tests/projektVorlageP310.test.mjs — Paket 310 (11.10.2026) · BV2a
// Projekte nach Branchen-Vorlage: Wörter je Branche, Status-Schlüssel fest,
// Ampel mit einstellbaren Schwellen, gespeicherte Suchen, Kunde gewinnt.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { vorlageFuer, mitKunde, feinschliffName, bekannteModule } from '../out/branchenVorlage.js';
import { projektAmpel, suchePasst, tageBis, fortschritt } from '../out/projektVorlage.js';

const lies = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const H = '2026-10-11';

test('Projekte-Vorlage: Grund für alle, Status-Schlüssel in jeder Branche gleich', () => {
  assert.ok(bekannteModule().includes('projekte'));
  assert.ok(bekannteModule().includes('kfz-bestand'));
  const g = vorlageFuer('projekte', '');
  assert.equal(g.einheit, 'Projekt');
  assert.equal(g.warnTage, 14);
  assert.equal(g.warnProzent, 70);
  for (const b of ['', 'Maler und Lackierer', 'Kanzlei und Steuerberatung', 'Eventmanagement', 'Agentur und Medien', 'Bäckerei']) {
    assert.deepEqual(vorlageFuer('projekte', b).status.map((s) => s.key), ['aktiv', 'pausiert', 'abgeschlossen', 'abgebrochen'], b);
  }
});

test('Feinschliff: Handwerk und Bau heißt Baustelle, ohne Fehltreffer', () => {
  for (const b of ['Elektriker & Elektrobetriebe', 'Sanitär, Heizung, Klima', 'Maler & Lackierer', 'Dachdecker', 'Estrich & Fliesen', 'Gartengestaltung', 'Kälte- & Klimaanlagenbau', 'SHK-Betrieb', 'Bau', 'Energie und Solar']) {
    assert.equal(feinschliffName('projekte', b), 'Handwerk und Bau', b);
  }
  const v = vorlageFuer('projekte', 'Maler und Lackierer');
  assert.equal(v.einheit, 'Baustelle');
  assert.equal(v.status[0].label, 'In Ausführung');
  assert.equal(v.suchen.find((s) => s.key === 'ohneVerantwortlich').name, 'Ohne Bauleiter');
  for (const b of ['Gebäudereinigung', 'Elektronikhandel', 'Immobilienentwicklung', 'Messtechnik & Prüfgeräte', 'Qualitätsmanagement', 'Mobilität', 'Bäckerei', 'Architekten', 'Telekommunikation']) {
    assert.notEqual(feinschliffName('projekte', b), 'Handwerk und Bau', b);
    assert.notEqual(feinschliffName('projekte', b), 'Agentur, IT und Beratung', b);
  }
  assert.equal(vorlageFuer('projekte', 'Rechtsanwälte').einheit, 'Mandat');
  assert.equal(vorlageFuer('projekte', 'Eventmanagement').status[2].label, 'Durchgeführt');
  assert.equal(vorlageFuer('projekte', 'IT und Systemhaus').einheit, 'Kundenprojekt');
  assert.equal(vorlageFuer('projekte', 'PR-Agenturen').einheit, 'Kundenprojekt');
});

test('Kunde gewinnt: Status umbenennen, Felder ausblenden, Schwellen begrenzt', () => {
  const v = mitKunde(vorlageFuer('projekte', 'Dachdecker'), {
    statusLabels: { aktiv: 'Auf dem Dach', pausiert: '  ' }, spaltenSichtbar: { budget: false, unbekannt: false }, warnTage: 999, warnProzent: 150,
  });
  assert.equal(v.status[0].label, 'Auf dem Dach');
  assert.equal(v.status[1].label, 'Ruht');
  assert.equal(v.spalten.find((s) => s.key === 'budget').sichtbar, false);
  assert.equal(v.spalten.some((s) => s.key === 'unbekannt'), false);
  assert.equal(v.warnTage, 365);
  assert.equal(v.warnProzent, 100);
  assert.equal(mitKunde(vorlageFuer('projekte', ''), { warnTage: -3 }).warnTage, 14);
  // Kfz-Vorlage bekommt keine Projekt-Schwellen
  assert.equal(mitKunde(vorlageFuer('kfz-bestand', ''), { warnTage: 5 }).warnTage, undefined);
});

test('Ampel: wie bisher, aber mit Kalendertagen und einstellbaren Schwellen', () => {
  assert.equal(tageBis('2026-10-25', H), 14);
  assert.equal(tageBis('2026-10-10', H), -1);
  assert.equal(projektAmpel({ status: 'abgeschlossen', end_datum: '2020-01-01' }, [], H), 'neutral');
  assert.equal(projektAmpel({ status: 'aktiv', end_datum: '2026-10-10' }, [], H), 'rot');
  assert.equal(projektAmpel({ status: 'aktiv' }, [{ erledigt: false, faellig_am: '2026-10-10' }], H), 'rot');
  assert.equal(projektAmpel({ status: 'aktiv' }, [{ erledigt: true, faellig_am: '2026-10-10' }], H), 'gruen');
  assert.equal(projektAmpel({ status: 'pausiert' }, [], H), 'gelb');
  const a = [{ erledigt: true }, { erledigt: false }, { erledigt: false }];
  assert.equal(projektAmpel({ status: 'aktiv', end_datum: '2026-10-25' }, a, H), 'gelb');
  assert.equal(projektAmpel({ status: 'aktiv', end_datum: '2026-10-26' }, a, H), 'gruen');
  assert.equal(projektAmpel({ status: 'aktiv', end_datum: '2026-10-26' }, a, H, 20, 70), 'gelb');
  assert.equal(projektAmpel({ status: 'aktiv', end_datum: '2026-10-25' }, a, H, 14, 30), 'gruen');
  assert.equal(projektAmpel({ status: 'aktiv', end_datum: '2026-10-11' }, a, H), 'gelb');
  assert.deepEqual(fortschritt(a), { erledigt: 1, gesamt: 3, pct: 33 });
});

test('Suchen: bekannte Regeln, Fertiges fällt raus, Unbekanntes trifft nichts', () => {
  assert.equal(suchePasst('ampel=rot', {}, 'rot', H), true);
  assert.equal(suchePasst('ampel=gelb', {}, 'rot', H), false);
  assert.equal(suchePasst('ende<=14', { end_datum: '2026-10-20' }, 'gruen', H), true);
  assert.equal(suchePasst('ende<=14', { end_datum: '2026-10-30' }, 'gruen', H), false);
  assert.equal(suchePasst('ende<=14', { end_datum: '2026-10-01' }, 'rot', H), false);
  assert.equal(suchePasst('ende<=14', { end_datum: '2026-10-20' }, 'neutral', H), false);
  assert.equal(suchePasst('prio=hoch', { prioritaet: 'dringend' }, 'gruen', H), true);
  assert.equal(suchePasst('prio=hoch', { prioritaet: 'normal' }, 'gruen', H), false);
  assert.equal(suchePasst('verantwortlich=leer', { verantwortlich: '  ' }, 'gelb', H), true);
  assert.equal(suchePasst('verantwortlich=leer', { verantwortlich: 'Hans' }, 'gelb', H), false);
  assert.equal(suchePasst('irgendwas', {}, 'rot', H), false);
  for (const v of ['', 'Maler', 'Notare', 'Eventmanagement']) for (const s of vorlageFuer('projekte', v).suchen) {
    assert.ok(/^(ampel=(rot|gelb|gruen)|ende<=\d+|prio=hoch|verantwortlich=leer)$/.test(s.regel), s.regel);
  }
});

test('Code-Wächter: Projektseite nutzt Vorlage, Aufgaben mit Fälligkeit, Ansicht speichert für den Betrieb', () => {
  const seite = lies('app/dashboard/projekte/page.tsx');
  assert.match(seite, /select\('id,projekt_id,erledigt,status,faellig_am'\)/);
  assert.match(seite, /vorlageFuer\(MODUL, branche\)/);
  assert.match(seite, /projektAmpel\(/);
  assert.doesNotMatch(seite, /new Date\(projekt\.end_datum\)/);
  assert.match(seite, /\+ \{einheit\} anlegen/);
  const ansicht = lies('app/dashboard/projekte/ProjektAnsicht.tsx');
  assert.match(ansicht, /owner_user_id: betrieb, modul: MODUL/);
  assert.equal((ansicht.match(/disabled=\{!istChef\}/g) || []).length, 4); // Status, Felder, Tage, Prozent
});
