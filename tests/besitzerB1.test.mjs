// Paket B1 (25.09.2026) — Eintraege gehoeren dem Betrieb, nicht dem Mitarbeiter.
// Waechter: In diesen Dateien darf beim Anlegen in den genannten Tabellen nie mehr die
// Kennung der angemeldeten Person als owner_user_id stehen. Grundlage: Supabase-Befund
// 25.09.2026 (docs/b1-befund.csv) — fuer alle diese Tabellen erlauben die Regeln dem
// Mitarbeiter das Anlegen mit der Chef-Kennung (mein_chef_id()).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const DATEIEN = {
 "app/dashboard/kfz/page.tsx": [
  "kfz_fahrzeuge",
  "kfz_reifeneinlagerung"
 ],
 "app/dashboard/betriebskosten/page.tsx": [
  "bk_abrechnung",
  "bk_einheit",
  "bk_kostenart"
 ],
 "app/dashboard/dsgvo/page.tsx": [
  "dsgvo_anfragen",
  "dsgvo_verfahren"
 ],
 "app/dashboard/immobilien/page.tsx": [
  "immo_zahlungen"
 ],
 "app/dashboard/forst/page.tsx": [
  "forst_baeume",
  "forst_objekte"
 ],
 "app/dashboard/forst/verkehrssicherung/page.tsx": [
  "forst_gutachten"
 ],
 "app/dashboard/forst/auftraege/page.tsx": [
  "forst_auftrag",
  "forst_auftrag_position"
 ],
 "app/dashboard/bde/page.tsx": [
  "bde_buchung",
  "bde_maschine",
  "bde_stoerung"
 ],
 "app/dashboard/veranstaltungen/page.tsx": [
  "event_anmeldung",
  "event_veranstaltung"
 ],
 "app/dashboard/schlagkartei/page.tsx": [
  "schlag",
  "schlag_bedarf",
  "schlag_duengung",
  "schlag_psm"
 ],
 "app/dashboard/ertraege/page.tsx": [
  "ertrag_ablesung",
  "ertrag_anlage"
 ],
 "app/dashboard/agentur/page.tsx": [
  "agentur_retainer",
  "agentur_zeiten"
 ],
 "app/dashboard/compliance/page.tsx": [
  "freistellungen",
  "pruefpflichten",
  "sofortmeldungen"
 ],
 "app/dashboard/dispo/page.tsx": [
  "einsaetze"
 ],
 "app/dashboard/_components/MaterialEntnahme.tsx": [
  "werkstatt_material_buchungen"
 ],
 "app/dashboard/_components/AnhaengeBox.tsx": [
  "werkstatt_anhaenge"
 ],
 "app/dashboard/landwirtschaft/page.tsx": [
  "agrar_massnahmen",
  "agrar_schlaege"
 ],
 "app/dashboard/signaturen/page.tsx": [
  "signatur_anfragen"
 ],
 "app/dashboard/objekte/page.tsx": [
  "asset_gruppen"
 ],
 "app/dashboard/reservierung/page.tsx": [
  "reservierung_platz",
  "reservierung_vorgang"
 ],
 "app/dashboard/pipeline/page.tsx": [
  "crm_deal"
 ],
 "app/dashboard/zuschnitt/page.tsx": [
  "zuschnitt_projekt",
  "zuschnitt_teil"
 ],
 "app/dashboard/wellness/page.tsx": [
  "wellness_behandlungen",
  "wellness_kunden"
 ],
 "app/dashboard/erinnerungen/page.tsx": [
  "erinnerung"
 ],
 "app/dashboard/tier/erinnerung/page.tsx": [
  "erinnerung"
 ],
 "app/dashboard/itassets/page.tsx": [
  "it_asset",
  "it_lizenz",
  "it_sla"
 ],
 "app/dashboard/gutachten/page.tsx": [
  "gutachten",
  "gutachten_position"
 ],
 "app/dashboard/bildung/page.tsx": [
  "bildung_anmeldungen",
  "bildung_anwesenheit",
  "bildung_kurse",
  "bildung_termine"
 ],
 "app/dashboard/freigaben/page.tsx": [
  "proof_asset",
  "proof_feedback",
  "proof_version"
 ],
 "app/dashboard/spenden/page.tsx": [
  "spende",
  "spende_einstellung"
 ],
 "app/dashboard/expose/page.tsx": [
  "expose",
  "expose_interessent"
 ],
 "app/dashboard/it-msp/page.tsx": [
  "it_assets",
  "it_vertraege"
 ],
 "app/dashboard/energie/page.tsx": [
  "energie_ablesungen",
  "energie_anlagen"
 ],
 "app/dashboard/gutscheine/page.tsx": [
  "gutschein",
  "gutschein_einloesung"
 ],
 "app/dashboard/varianten/page.tsx": [
  "variante_artikel",
  "variante_gruppe"
 ],
 "app/dashboard/lebensmittel/page.tsx": [
  "lm_chargen",
  "lm_haccp",
  "lm_haccp_plan"
 ],
 "app/dashboard/rezeptur/page.tsx": [
  "lm_chargen",
  "rezeptur_zutaten",
  "rezepturen"
 ],
 "app/dashboard/pruefprotokolle/page.tsx": [
  "pruef_protokoll"
 ],
 "app/dashboard/chargen/page.tsx": [
  "charge_los",
  "charge_pruefung",
  "charge_verwendung"
 ],
 "app/dashboard/fertigung/page.tsx": [
  "fertigung_auftraege",
  "fertigung_stueckliste_positionen",
  "fertigung_stuecklisten"
 ],
 "app/dashboard/verein/page.tsx": [
  "verein_mitglieder",
  "verein_veranstaltungen"
 ],
 "app/dashboard/einkauf/page.tsx": [
  "bestellung",
  "lieferant"
 ],
 "app/dashboard/fristen/page.tsx": [
  "kanzlei_akte",
  "kanzlei_frist"
 ],
 "app/dashboard/verleih/page.tsx": [
  "verleih_artikel",
  "verleih_vorgang"
 ],
 "app/dashboard/tour/page.tsx": [
  "tour",
  "tour_stopp"
 ],
 "app/dashboard/onboarding/page.tsx": [
  "onboarding_schritte"
 ],
 "app/dashboard/tier/page.tsx": [
  "tier_behandlungen",
  "tier_tiere"
 ],
 "app/dashboard/gastro/page.tsx": [
  "gastro_reservierungen",
  "hotel_belegungen"
 ],
 "app/dashboard/belegung/page.tsx": [
  "belegung_einheit",
  "belegung_vorgang"
 ],
 "app/dashboard/hilfsmittel/page.tsx": [
  "hilfsmittel_position",
  "hilfsmittel_versorgung"
 ],
 "app/dashboard/tierbestand/page.tsx": [
  "tier_bewegung",
  "tier_gruppe",
  "tier_stichtag"
 ],
 "app/dashboard/lager-scanner/page.tsx": [
  "artikel"
 ],
 "app/dashboard/erp/preisliste/import/page.tsx": [
  "artikel"
 ],
 "app/dashboard/kanzlei/page.tsx": [
  "kanzlei_fristen",
  "kanzlei_mandate"
 ],
 "app/dashboard/bau-lv/page.tsx": [
  "bau_abnahmen",
  "bau_lv",
  "bau_lv_positionen"
 ],
 "app/dashboard/versand/page.tsx": [
  "versand_sendung"
 ],
 "app/dashboard/erp/bestellungen/page.tsx": [
  "bestellungen"
 ],
 "app/dashboard/erp/bestellungen/[id]/page.tsx": [
  "wareneingang",
  "wareneingang_positionen"
 ],
 "app/dashboard/erp/inventur/page.tsx": [
  "inventur_zaehlung"
 ],
 "app/dashboard/erp/lieferanten/import/page.tsx": [
  "lieferanten"
 ],
 "app/dashboard/logistik/page.tsx": [
  "logistik_sendungen",
  "logistik_touren"
 ],
 "app/api/leads/manuell/route.ts": [
  "leads"
 ],
 "app/api/marketing/whatsapp-kontakte/route.ts": [
  "whatsapp_kontakt"
 ],
 "app/api/marketing/freebie/route.ts": [
  "freebie"
 ],
 "app/api/marketing/social-kanaele/route.ts": [
  "social_kanal"
 ],
 "app/api/marketing/zielgruppe/route.ts": [
  "zielgruppe"
 ],
 "app/api/marketing/social-video/eintrag/route.ts": [
  "social_video"
 ],
 "app/api/marketing/landingpages/route.ts": [
  "landingpages"
 ],
 "app/api/marketing/whatsapp-vorlagen/route.ts": [
  "whatsapp_vorlage"
 ],
 "app/api/marketing/social-beitraege/route.ts": [
  "social_beitrag"
 ]
};

const ROH = /^(uid|userId|user\.id|user\?\.id|userData\.user\.id)$/;

function schreibstellen(src, tabelle) {
  const aus = [];
  const re = new RegExp(`from\\(['"]${tabelle}['"]\\)\\s*\\.(insert|upsert)\\(`, 'g');
  let m;
  while ((m = re.exec(src))) {
    let stueck = src.slice(m.index + m[0].length, m.index + m[0].length + 1500);
    const naechste = stueck.search(/\.from\(/);
    if (naechste > 0) stueck = stueck.slice(0, naechste);
    const o = stueck.match(/owner_user_id\s*:\s*([A-Za-z0-9_.?]+)/);
    if (o) aus.push(o[1]);
  }
  return aus;
}

test('B1: Anlegen speichert den Betrieb als Besitzer, nie die angemeldete Person', () => {
  let geprueft = 0;
  for (const [datei, tabellen] of Object.entries(DATEIEN)) {
    const src = fs.readFileSync(new URL('../' + datei, import.meta.url), 'utf8');
    assert.match(src, /rpc\(['"]mein_chef_id['"]\)/, `${datei}: Besitzer wird nicht ueber mein_chef_id bestimmt`);
    for (const t of tabellen) {
      for (const wert of schreibstellen(src, t)) {
        assert.doesNotMatch(wert, ROH, `${datei} -> ${t}: owner_user_id ist noch die eigene Kennung (${wert})`);
        geprueft++;
      }
    }
  }
  assert.ok(geprueft >= 100, `nur ${geprueft} Schreibstellen geprueft`);
});

test('B1: Anhaenge der Werkstatt — Mitarbeiter sehen die Anhaenge des Betriebs', () => {
  const src = fs.readFileSync(new URL('../app/dashboard/_components/AnhaengeBox.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\.eq\('owner_user_id', uid\)/);
  assert.match(src, /\$\{uid\}\//, 'Speicherpfad bleibt je Person (Speicher-Regeln)');
});

test('B1: Social-Verbindungen (Zugangsdaten) bleiben unangetastet — Entscheidung bei Martin', () => {
  const src = fs.readFileSync(new URL('../app/api/marketing/social-verbindung/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /mein_chef_id/);
});

// B1b (25.09.2026): Arbeitsseiten, fuer die supabase-sql/b1b-mitarbeiter-arbeitsseiten.sql die
// Mitarbeiter-Regeln (lesen, anlegen, aendern — nicht loeschen) nachruestet.
const B1B = {
  'app/dashboard/aufmass/page.tsx': ['aufmasse', 'aufmass_positionen'],
  'app/dashboard/nachweise/page.tsx': ['nachweis'],
  'app/dashboard/objektzeiten/page.tsx': ['objekt_zeiten'],
  'app/dashboard/service/[id]/page.tsx': ['ticket_verlauf'],
  'app/dashboard/gastro/page.tsx': ['hotel_zimmer'],
  'app/dashboard/immobilien/page.tsx': ['immo_einheiten', 'immo_mietvertraege'],
  'app/dashboard/objekte/page.tsx': ['wartungsvertraege'],
};

test('B1b: Arbeitsseiten speichern ebenfalls den Betrieb', () => {
  let geprueft = 0;
  for (const [datei, tabellen] of Object.entries(B1B)) {
    const src = fs.readFileSync(new URL('../' + datei, import.meta.url), 'utf8');
    assert.match(src, /rpc\(['"]mein_chef_id['"]\)/, datei);
    for (const t of tabellen) for (const wert of schreibstellen(src, t)) {
      assert.doesNotMatch(wert, ROH, `${datei} -> ${t}: ${wert}`);
      geprueft++;
    }
  }
  assert.ok(geprueft >= 9, `nur ${geprueft}`);
});

test('B1b: SQL ist additiv — kein Loeschrecht fuer Mitarbeiter, alle Tabellen der Seiten enthalten', () => {
  const sql = fs.readFileSync(new URL('../supabase-sql/b1b-mitarbeiter-arbeitsseiten.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(sql, /for delete/i);
  assert.doesNotMatch(sql, /drop policy if exists (?!b1_ma_)/i, 'nur eigene b1-Regeln werden neu gesetzt');
  const liste = sql.slice(sql.indexOf('tabellen text[] := array['), sql.indexOf('];'));
  for (const t of Object.values(B1B).flat()) assert.match(liste, new RegExp(`'${t}'`), t);
});
