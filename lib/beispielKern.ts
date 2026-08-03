// ============================================================================
// ARGONAUT OS · lib/beispielKern.ts — Übungswelt-Daten für die KERN-Ketten
//
// Reine Seeder-Bausteine (KEINE Imports, KEINE Hooks, node-testbar) für die
// wichtigsten Demo-Bildschirme: Angebote, Rechnungen, Pipeline-Deals,
// Versand-Sendungen und die externen Anschlüsse (als „verbunden", mit klar
// erkennbaren Beispiel-Konten). Jede Funktion baut fertige DB-Zeilen für EINE
// Tabelle; die Übungswelt-Route legt sie an und merkt sich die IDs zum sauberen
// Entfernen. kontakt_id bleibt null (Seeder können keine frischen IDs
// referenzieren) — die Namen stehen als Text drin, die Listen sehen voll aus.
// ============================================================================

type Zeile = Record<string, unknown>;

const KUNDEN = ['Bäckerei Sonnenschein', 'Müller Metallbau GmbH', 'Praxis Dr. Wagner', 'Hotel Bergblick', 'Autohaus Keller'];

/** Angebote in verschiedenen Status (inkl. „angenommen" für die Rechnungs-Kette). */
export function baueAngebote(_kat: string | null | undefined, uid: string, heute: string): Zeile[] {
  const S = [
    { k: 'Bäckerei Sonnenschein', t: 'Wartungsvertrag Kälteanlage', st: 'angenommen', n: 1800 },
    { k: 'Müller Metallbau GmbH', t: 'Geländer & Montage', st: 'gesendet', n: 4200 },
    { k: 'Praxis Dr. Wagner', t: 'Praxis-Einrichtung', st: 'angenommen', n: 9600 },
    { k: 'Hotel Bergblick', t: 'Renovierung Empfang', st: 'entwurf', n: 2750 },
  ];
  return S.map((x) => {
    const mwst = Math.round(x.n * 0.19 * 100) / 100;
    return {
      owner_user_id: uid, kontakt_id: null, kunde_name: x.k, kunde_email: null,
      titel: x.t, status: x.st, gueltig_bis: heute,
      netto_summe: x.n, mwst_summe: mwst, brutto_summe: Math.round((x.n + mwst) * 100) / 100,
      notiz: 'Beispiel-Angebot (Übungswelt)',
    };
  });
}

/** Rechnungen — Mischung aus bezahlt / offen / teilbezahlt. */
export function baueRechnungen(_kat: string | null | undefined, uid: string, heute: string): Zeile[] {
  const S = [
    { e: 'Bäckerei Sonnenschein', t: 'Wartung Kälteanlage', st: 'bezahlt', n: 1800 },
    { e: 'Praxis Dr. Wagner', t: 'Praxis-Einrichtung Teil 1', st: 'bezahlt', n: 4800 },
    { e: 'Müller Metallbau GmbH', t: 'Geländer Vorschuss', st: 'teilbezahlt', n: 2100 },
    { e: 'Hotel Bergblick', t: 'Renovierung Empfang', st: 'offen', n: 2750 },
    { e: 'Autohaus Keller', t: 'Service-Pauschale', st: 'offen', n: 640 },
  ];
  return S.map((x) => {
    const mwst = Math.round(x.n * 0.19 * 100) / 100;
    const brutto = Math.round((x.n + mwst) * 100) / 100;
    const bezahlt = x.st === 'bezahlt';
    return {
      owner_user_id: uid, kontakt_id: null, titel: x.t, empfaenger_name: x.e,
      zahlungsstatus: x.st, rechnungsdatum: heute, leistungsdatum: heute, faelligkeitsdatum: heute,
      zahlungsziel_tage: 14, netto_summe: x.n, mwst_summe: mwst, brutto_summe: brutto, waehrung: 'EUR',
      bezahlt_am: bezahlt ? heute : null,
      bezahlter_betrag: bezahlt ? brutto : (x.st === 'teilbezahlt' ? Math.round(brutto / 2 * 100) / 100 : 0),
    };
  });
}

/** Pipeline-Deals über alle Stufen (für den gewichteten Forecast). */
export function baueDeals(_kat: string | null | undefined, uid: string, heute: string): Zeile[] {
  const S = [
    { t: 'Rahmenvertrag Autohaus Keller', f: 'Autohaus Keller', w: 24000, s: 'verhandlung', p: 75 },
    { t: 'Neubau Praxis Dr. Wagner', f: 'Praxis Dr. Wagner', w: 18500, s: 'angebot', p: 50 },
    { t: 'Hotelkette Bergblick — 3 Häuser', f: 'Hotel Bergblick', w: 61000, s: 'qualifiziert', p: 30 },
    { t: 'Wartung Müller Metallbau', f: 'Müller Metallbau GmbH', w: 7200, s: 'gewonnen', p: 100 },
    { t: 'Erstkontakt Bäckerei-Filialen', f: 'Bäckerei Sonnenschein', w: 9800, s: 'lead', p: 10 },
  ];
  return S.map((x) => ({
    owner_user_id: uid, titel: x.t, kontakt_id: null, firma: x.f,
    wert_netto: x.w, stufe: x.s, wahrscheinlichkeit: x.p, erwartetes_datum: heute,
    notiz: 'Beispiel-Deal (Übungswelt)',
  }));
}

/** Versand-Sendungen — ausgehend + eine Retoure. */
export function baueSendungen(_kat: string | null | undefined, uid: string, _heute: string): Zeile[] {
  const S = [
    { n: 'Bäckerei Sonnenschein', s: 'Hauptstraße 12', p: '70173', o: 'Stuttgart', c: 'dhl', r: 'ausgehend', g: 'Paket 2 kg' },
    { n: 'Autohaus Keller', s: 'Industrieweg 4', p: '71065', o: 'Sindelfingen', c: 'dpd', r: 'ausgehend', g: 'Ersatzteil' },
    { n: 'Hotel Bergblick', s: 'Gipfelstraße 1', p: '87561', o: 'Oberstdorf', c: 'gls', r: 'retoure', g: 'Rücksendung' },
  ];
  return S.map((x) => ({
    owner_user_id: uid, kontakt_id: null, empfaenger_name: x.n, empfaenger_firma: null,
    strasse: x.s, plz: x.p, ort: x.o, land: 'DE',
    gewicht_kg: 2, laenge_cm: null, breite_cm: null, hoehe_cm: null,
    carrier: x.c, service: 'standard', status: 'entwurf', kosten: null,
    referenz: x.g, notiz: 'Beispiel-Sendung (Übungswelt)',
    richtung: x.r, retoure_grund: x.r === 'retoure' ? 'defekt' : null,
  }));
}

/** Eingangsbelege (für Vorsteuer / EÜR / Beleg-Inbox). */
export function baueBelege(_kat: string | null | undefined, uid: string, heute: string): Zeile[] {
  const S = [
    { l: 'Bürobedarf Meier', n: 120, k: 'Bürobedarf' },
    { l: 'Tankstelle Aral', n: 85, k: 'Fahrzeugkosten' },
    { l: 'Großhandel Weber', n: 640, k: 'Wareneinkauf' },
    { l: 'Stadtwerke', n: 210, k: 'Nebenkosten' },
  ];
  return S.map((x) => {
    const ust = Math.round(x.n * 0.19 * 100) / 100;
    return {
      owner_user_id: uid, lieferant: x.l, belegnummer: null, belegdatum: heute,
      netto: x.n, ust_satz: 19, ust_betrag: ust, brutto: Math.round((x.n + ust) * 100) / 100,
      kategorie: x.k, notiz: 'Beispiel-Beleg (Übungswelt)', datev_konto: null, datev_rahmen: null, datei_pfad: null,
    };
  });
}

// --- Externe Anschlüsse als „verbunden" (klar erkennbare Beispiel-Konten) ---
// token_verschluesselt bekommt einen Demo-Platzhalter — er wird nie entschlüsselt,
// sorgt aber dafür, dass das Anschlüsse-Cockpit „✓ verbunden" zeigt.
// Exportiert, weil das Entfernen der Übungswelt genau an dieser Markierung
// erkennt, welche Zugänge Beispiel sind — fünf der sechs Tabellen haben keine
// Spalte `id` und können deshalb nicht über das Register geloescht werden.
export const DEMO_TOKEN = 'DEMO-UEBUNGSWELT';

export function baueMailZugang(_k: string | null | undefined, uid: string, heute: string): Zeile[] {
  return [{ owner_user_id: uid, anbieter: 'microsoft', konto_id: 'beispiel@ihre-firma.de', token_verschluesselt: DEMO_TOKEN, verbunden: true, geprueft_am: heute }];
}
export function baueMarktplatzZugang(_k: string | null | undefined, uid: string, heute: string): Zeile[] {
  return [{ owner_user_id: uid, plattform: 'amazon', konto_id: 'Beispiel-Verkäuferkonto', token_verschluesselt: DEMO_TOKEN, verbunden: true, geprueft_am: heute }];
}
export function baueElsterZugang(_k: string | null | undefined, uid: string, heute: string): Zeile[] {
  return [{ owner_user_id: uid, aggregator: 'elster', konto_id: '12345/67890 (Beispiel)', token_verschluesselt: DEMO_TOKEN, verbunden: true, geprueft_am: heute }];
}
export function baueVersandZugang(_k: string | null | undefined, uid: string, heute: string): Zeile[] {
  return [{ owner_user_id: uid, aggregator: 'shipcloud', konto_name: 'Beispiel-Versandkonto', token_verschluesselt: DEMO_TOKEN, verbunden: true, geprueft_am: heute }];
}
export function baueBankZugang(_k: string | null | undefined, uid: string, heute: string): Zeile[] {
  // `aggregator` ist in bank_zugang PFLICHTFELD (NOT NULL) und fehlte hier —
  // dadurch ist der Seeder jedes Mal gekippt. Gegen das echte Schema geprüft.
  return [{ owner_user_id: uid, aggregator: 'demo', bank_name: 'Beispiel-Bank (Demo)', konto_id: 'DE00 0000 0000 (Beispiel)', token_verschluesselt: DEMO_TOKEN, verbunden: true, geprueft_am: heute }];
}
export function baueAdsZugang(_k: string | null | undefined, uid: string, heute: string): Zeile[] {
  return [{ owner_user_id: uid, plattform: 'meta', konto_id: 'act_000000000 (Beispiel)', token_verschluesselt: DEMO_TOKEN, verbunden: true, geprueft_am: heute }];
}
