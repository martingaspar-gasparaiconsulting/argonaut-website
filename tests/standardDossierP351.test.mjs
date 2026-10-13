// ARGONAUT OS · Paket 351 (A3) · Standard-Dossier für 10 Branchen ohne Fachmodule
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baueDossier, dossierFertig, dossierStand, fachText, textVerstoesse, FACH_TEXTE } from '../out/fachdossier.js';
import { STANDARD_DOSSIER, istStandardBranche } from '../out/standardDossier.js';

const lies = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const ZEHN = {
  universitaeten: 'Bildung & Wissenschaft',
  'energieversorger-stadtwerke': 'Energie & Umwelt',
  'stromnetze-netzbetrieb': 'Energie & Umwelt',
  'flugzeugwartung-luftfahrttechnik': 'Fahrzeuge & Mobilität',
  bergbau: 'Industrie & Produktion',
  'halbleiter-mikroelektronik': 'Industrie & Produktion',
  'luft-raumfahrt': 'Industrie & Produktion',
  stadtverwaltungen: 'Kultur, Soziales & Öffentliches',
  'standesaemter-buergerbueros': 'Kultur, Soziales & Öffentliches',
  'verkehrsbetriebe-kommunale-betriebe': 'Kultur, Soziales & Öffentliches',
};

test('Genau die zehn Branchen aus dem Ampel-Beschluss, keine eigene Fachtext-Konkurrenz', () => {
  assert.deepEqual(Object.keys(STANDARD_DOSSIER).sort(), Object.keys(ZEHN).sort());
  for (const s of Object.keys(ZEHN)) {
    assert.equal(FACH_TEXTE[s], undefined, s + ' hat schon einen eigenen Text');
    assert.ok(istStandardBranche(s));
  }
  assert.equal(istStandardBranche('elektriker'), false);
  assert.equal(istStandardBranche('toString'), false);
});

test('Standard-Dossier: fertig, ohne Fachpaket, ohne Lücken, mit Seite „Dafür nicht gedacht"', () => {
  for (const [slug, kategorie] of Object.entries(ZEHN)) {
    const b = { slug, name: slug, kategorie };
    const d = baueDossier(b);
    assert.equal(d.standard, true, slug);
    assert.equal(d.paket.length, 0, slug + ': kein Fachpaket');
    assert.equal(d.entwurf, false, slug + ': ' + d.luecken.join(' / '));
    assert.equal(dossierFertig(b), true, slug);
    const f = d.text.fachseite;
    assert.equal(f.gruppen[1].titel, 'Dafür ist es nicht gedacht');
    assert.ok(f.gruppen[1].punkte.length >= 3 && f.gruppen[0].punkte.length >= 3, slug);
    assert.equal(f.partner.length, 0);
    assert.deepEqual(textVerstoesse(JSON.stringify(d.text)), [], slug);
    assert.equal(d.text.ablauf.length, 5);
  }
  // Die Flugzeugwartung bekam vorher das KFZ-Fachpaket ins Dossier
  assert.ok(!baueDossier({ slug: 'flugzeugwartung-luftfahrttechnik', name: 'x', kategorie: 'Fahrzeuge & Mobilität' }).paket.some((m) => /kfz/i.test(m.key)));
});

test('Andere Branchen unverändert: eigenes Paket, Elektro bleibt Elektro', () => {
  const e = baueDossier({ slug: 'elektriker', name: 'Elektriker', kategorie: 'Handwerk & Bau' });
  assert.equal(e.standard, false);
  assert.equal(e.text, FACH_TEXTE.elektriker);
  const ohne = baueDossier({ slug: 'gibt-es-nicht', name: 'X', kategorie: 'Handwerk & Bau' });
  assert.equal(ohne.text, null);
  assert.equal(ohne.entwurf, true);
  assert.equal(fachText('gibt-es-nicht'), null);
});

test('Öffentliche Stellen: Anliegen statt Auftrag, eigene Kacheln; Firmen nicht', () => {
  for (const s of ['stadtverwaltungen', 'standesaemter-buergerbueros', 'verkehrsbetriebe-kommunale-betriebe']) {
    const t = fachText(s);
    assert.equal(t.oeffentlich, true, s);
    assert.equal(t.kundeMerkt.length, 3);
    assert.ok(!/Angebot|Rechnung/.test(t.ablauf.map((a) => a.titel + a.text).join(' ')), s + ': keine Angebote bei Behörden');
  }
  assert.equal(fachText('bergbau').oeffentlich, false);
  assert.equal(fachText('bergbau').kundeMerkt, undefined);
  const html = lies('lib/fachdossierHtml.ts');
  assert.match(html, /t\?\.oeffentlich \? 'So läuft ein Anliegen'/);
  assert.match(html, /Bis zur Erledigung durchgereicht/);
  assert.match(html, /f\.eyebrow \?\? 'Ihr Fachpaket'/);
});

test('Nur Gebautes: keine Versprechen, die die Grundausstattung nicht hält', () => {
  const alles = JSON.stringify(STANDARD_DOSSIER);
  // Service-Tickets haben kein Zuständigkeitsfeld, das Objekt-Register keinen Verlauf
  assert.ok(!/Zuständigkeit\b(?! stehen)/.test(alles.replace('Zuständigkeiten stehen', '')), 'keine „Zuständigkeit" am Ticket');
  assert.ok(!/Wiedervorlage/.test(alles), 'Wiedervorlagen-Cockpit kennt keine freien Erinnerungen');
  assert.ok(!/Rechenzentr|zertifiziert(?!er)|garantiert|rechtssicher/i.test(alles.replace('zertifizierter Luftfahrtteile', '')));
  for (const e of Object.values(STANDARD_DOSSIER)) {
    for (const n of e.nicht) assert.ok(n.length > 10);
  }
});

test('Routen nutzen fachText (Admin-Übersicht und öffentliches PDF)', () => {
  assert.match(lies('app/api/admin/fachdossier/route.ts'), /fertig: !!fachText\(b\.slug\) && r\.frei/);
  assert.match(lies('app/api/oeffentlich/dossier-pdf/route.ts'), /JSON\.stringify\(fachText\(fach\.slug\)\)/);
  const st = dossierStand(Object.entries(ZEHN).map(([slug, kategorie]) => ({ slug, name: slug, kategorie })));
  assert.equal(st.fertig, 10);
});
