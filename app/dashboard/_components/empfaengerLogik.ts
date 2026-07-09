// ============================================================================
// ARGONAUT OS · empfaengerLogik.ts
// Block 2 · Welle 1 · B1-2 — Ein Auflöser für Privat- UND Firmenkunden
//
// Reine Funktionen. Kein DB-Zugriff, kein React, keine Seiteneffekte.
// BRANCHENNEUTRAL: hängt bewusst NICHT an holzLogik oder sortimentLogik.
// Dieselbe Datei trägt später Werkstatt, Aufmaß, Rechnung und Lieferschein.
//
// DAS PROBLEM, DAS SIE LÖST
//   Ein Brennholzkunde ist meist eine Privatperson (Tabelle `kontakte`),
//   ein Forstauftraggeber eine Firma oder Kommune (Tabelle `firmen`).
//   Beide brauchen Anschrift, Koordinaten, Anrede und einen Namen auf dem
//   Beleg. Ohne gemeinsamen Auflöser macht jedes Modul die Fallunterscheidung
//   selbst — vier Module, vier Gelegenheiten für vier verschiedene Fehler.
//
//   Hier ist EIN Ort für die Wahrheit.
//
// DOCK-POINT: `firma_id` bleibt im Datensatz durchgereicht, wird aber noch
// nicht ausgewertet. Erweiterung bleibt additiv.
// ============================================================================

// ----------------------------------------------------------------------------
// 0. GEMEINSAME PRUEF-FORM
// ----------------------------------------------------------------------------

/**
 * Strukturell identisch mit dem PruefErgebnis aus holzLogik — bewusst hier
 * neu deklariert, damit diese Datei keine Abhaengigkeit auf die Holz-Module
 * bekommt. TypeScript prueft strukturell, beide sind austauschbar.
 */
export interface PruefErgebnis {
  ok: boolean;
  fehler: string[];
  hinweise: string[];
}

// ----------------------------------------------------------------------------
// 1. TYPEN
// ----------------------------------------------------------------------------

export type EmpfaengerTyp = 'privat' | 'firma';

export type GeocodeStatus = 'ok' | 'ungenau' | 'fehlgeschlagen' | 'manuell';

/** Die Felder aus public.kontakte, die uns interessieren. */
export interface KontaktQuelle {
  id: string;
  vorname: string | null;
  nachname: string | null;
  firma: string | null;
  firma_id: string | null;
  email: string | null;
  telefon: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  geo_lat: number | null;
  geo_lon: number | null;
  geocode_am: string | null;
  geocode_status: string | null;
  geocode_adresse?: string | null;
}

/** Die Felder aus public.firmen, die uns interessieren. */
export interface FirmaQuelle {
  id: string;
  name: string | null;
  email: string | null;
  telefon: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  geo_lat: number | null;
  geo_lon: number | null;
  geocode_am: string | null;
  geocode_status: string | null;
  geocode_adresse?: string | null;
}

/** Der Betriebsstandort (Startpunkt jeder Anfahrt). */
export interface StandortQuelle {
  id: string;
  bezeichnung: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  geo_lat: number | null;
  geo_lon: number | null;
  geocode_adresse?: string | null;
  ist_standard: boolean;
  aktiv: boolean;
}

/** Die einheitliche Sicht. Alles, was ein Beleg oder eine Route braucht. */
export interface Empfaenger {
  typ: EmpfaengerTyp;
  id: string;
  /** Was auf dem Beleg steht. */
  name: string;
  /** Bei Firmen optional der Ansprechpartner. */
  ansprechpartner: string | null;
  email: string | null;
  telefon: string | null;

  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string;

  geoLat: number | null;
  geoLon: number | null;
  geocodeAm: string | null;
  geocodeStatus: GeocodeStatus | null;
  /**
   * Die Anschrift, die tatsaechlich verortet wurde — als Freitext, so wie sie
   * an den Kartendienst ging. Weicht sie von der heutigen Anschrift ab, zeigen
   * die Koordinaten auf das alte Haus.
   *
   * null bedeutet: unbekannt (Altdatenbestand). Dann wird NICHT gewarnt —
   * ein Fehlalarm waere schlimmer als gar keine Warnung.
   */
  geocodeAdresse: string | null;
}

/** Ein Punkt auf der Karte — Ein- und Ausgabe der Routenberechnung. */
export interface GeoPunkt {
  lat: number;
  lon: number;
}

// ----------------------------------------------------------------------------
// 2. HILFSFUNKTIONEN
// ----------------------------------------------------------------------------

const STANDARD_LAND = 'DE';

function trimOderNull(s: string | null | undefined): string | null {
  const t = (s ?? '').trim();
  return t === '' ? null : t;
}

function alsStatus(s: string | null): GeocodeStatus | null {
  return s === 'ok' || s === 'ungenau' || s === 'fehlgeschlagen' || s === 'manuell' ? s : null;
}

// ----------------------------------------------------------------------------
// 3. AUFLOESEN
// ----------------------------------------------------------------------------

/** Privatkunde aus `kontakte`. */
export function ausKontakt(k: KontaktQuelle): Empfaenger {
  const vor = trimOderNull(k.vorname);
  const nach = trimOderNull(k.nachname);
  const voll = [vor, nach].filter(Boolean).join(' ');
  const firma = trimOderNull(k.firma);

  return {
    typ: 'privat',
    id: k.id,
    // Ohne Namen fällt das System auf die Firmenbezeichnung zurück,
    // statt einen leeren Beleg zu erzeugen.
    name: voll || firma || 'Unbenannter Kontakt',
    ansprechpartner: null,
    email: trimOderNull(k.email),
    telefon: trimOderNull(k.telefon),
    strasse: trimOderNull(k.strasse),
    plz: trimOderNull(k.plz),
    ort: trimOderNull(k.ort),
    land: trimOderNull(k.land) ?? STANDARD_LAND,
    geoLat: k.geo_lat,
    geoLon: k.geo_lon,
    geocodeAm: k.geocode_am,
    geocodeStatus: alsStatus(k.geocode_status),
    geocodeAdresse: trimOderNull(k.geocode_adresse ?? null),
  };
}

/** Firmenkunde aus `firmen`. Optional mit Ansprechpartner aus `kontakte`. */
export function ausFirma(f: FirmaQuelle, ansprechpartner?: KontaktQuelle | null): Empfaenger {
  const ap = ansprechpartner
    ? [trimOderNull(ansprechpartner.vorname), trimOderNull(ansprechpartner.nachname)].filter(Boolean).join(' ')
    : '';

  return {
    typ: 'firma',
    id: f.id,
    name: trimOderNull(f.name) ?? 'Unbenannte Firma',
    ansprechpartner: ap || null,
    email: trimOderNull(f.email) ?? trimOderNull(ansprechpartner?.email ?? null),
    telefon: trimOderNull(f.telefon) ?? trimOderNull(ansprechpartner?.telefon ?? null),
    strasse: trimOderNull(f.strasse),
    plz: trimOderNull(f.plz),
    ort: trimOderNull(f.ort),
    land: trimOderNull(f.land) ?? STANDARD_LAND,
    geoLat: f.geo_lat,
    geoLon: f.geo_lon,
    geocodeAm: f.geocode_am,
    geocodeStatus: alsStatus(f.geocode_status),
    geocodeAdresse: trimOderNull(f.geocode_adresse ?? null),
  };
}

/** Der eigene Betriebsstandort als Empfänger-Form (für die Routenrichtung). */
export function ausStandort(s: StandortQuelle): Empfaenger {
  return {
    typ: 'firma',
    id: s.id,
    name: trimOderNull(s.bezeichnung) ?? 'Betriebssitz',
    ansprechpartner: null,
    email: null,
    telefon: null,
    strasse: trimOderNull(s.strasse),
    plz: trimOderNull(s.plz),
    ort: trimOderNull(s.ort),
    land: trimOderNull(s.land) ?? STANDARD_LAND,
    geoLat: s.geo_lat,
    geoLon: s.geo_lon,
    geocodeAm: null,
    geocodeStatus: null,
    geocodeAdresse: trimOderNull(s.geocode_adresse ?? null),
  };
}

/** Der aktive Standard-Standort. Ohne ihn kann keine Anfahrt berechnet werden. */
export function standardStandort(liste: readonly StandortQuelle[]): StandortQuelle | null {
  return liste.find((s) => s.aktiv && s.ist_standard) ?? liste.find((s) => s.aktiv) ?? null;
}

// ----------------------------------------------------------------------------
// 4. ADRESSE
// ----------------------------------------------------------------------------

/** Reicht die Anschrift für einen Beleg und für die Adresssuche? */
export function adresseVollstaendig(e: Empfaenger): boolean {
  return Boolean(e.strasse && e.plz && e.ort);
}

/** "Starenweg 1, 72108 Rottenburg" */
export function adresseEinzeilig(e: Empfaenger): string {
  const ortZeile = [e.plz, e.ort].filter(Boolean).join(' ');
  return [e.strasse, ortZeile].filter(Boolean).join(', ');
}

/** Anschriftenblock für PDF und Brief. */
export function anschriftBlock(e: Empfaenger): string[] {
  const zeilen: string[] = [e.name];
  if (e.typ === 'firma' && e.ansprechpartner) zeilen.push(e.ansprechpartner);
  if (e.strasse) zeilen.push(e.strasse);
  const ortZeile = [e.plz, e.ort].filter(Boolean).join(' ');
  if (ortZeile) zeilen.push(ortZeile);
  if (e.land && e.land !== STANDARD_LAND) zeilen.push(e.land);
  return zeilen;
}

/**
 * Der Suchtext für die Adresssuche (Geocoding).
 * Bewusst als ein Freitext — der Dienst kommt damit besser zurecht als mit
 * zerlegten Feldern, wenn eine Angabe fehlt.
 */
export function geocodeSuchtext(e: Empfaenger): string | null {
  if (!e.plz && !e.ort) return null; // ohne Ort ist jede Suche Raten
  const ortZeile = [e.plz, e.ort].filter(Boolean).join(' ');
  return [e.strasse, ortZeile, e.land].filter(Boolean).join(', ');
}

/** Deutsche PLZ = genau fünf Ziffern. Andere Länder werden nicht geprüft. */
export function plzPlausibel(e: Empfaenger): boolean {
  if (!e.plz) return false;
  if (e.land !== 'DE') return true;
  return /^\d{5}$/.test(e.plz);
}

// ----------------------------------------------------------------------------
// 5. KOORDINATEN
// ----------------------------------------------------------------------------

export function hatKoordinaten(e: Empfaenger): boolean {
  return (
    typeof e.geoLat === 'number' && Number.isFinite(e.geoLat) &&
    typeof e.geoLon === 'number' && Number.isFinite(e.geoLon)
  );
}

/** Der Punkt für die Routenberechnung — oder null. */
export function alsPunkt(e: Empfaenger): GeoPunkt | null {
  return hatKoordinaten(e) ? { lat: e.geoLat as number, lon: e.geoLon as number } : null;
}

/** Kann für diesen Empfänger eine Anfahrt berechnet werden? */
export function routeBereit(e: Empfaenger): boolean {
  return hatKoordinaten(e) && e.geocodeStatus !== 'fehlgeschlagen' && !verortungVeraltet(e);
}

/**
 * Wurde die Adresse seit dem letzten Geocoding geändert?
 * Vergleicht die Anschrift, nicht den Namen — ein umbenannter Kunde muss
 * nicht neu verortet werden.
 */
export function adresseGeaendert(alt: Empfaenger, neu: Empfaenger): boolean {
  const k = (e: Empfaenger) => `${e.strasse ?? ''}|${e.plz ?? ''}|${e.ort ?? ''}|${e.land}`.toLowerCase();
  return k(alt) !== k(neu);
}

/**
 * Vergleichsform einer Anschrift: klein, ohne Doppelleerzeichen, ohne
 * Satzzeichen-Rauschen. "Lindenweg 4, 72108 Rottenburg" und
 * "lindenweg 4 · 72108  rottenburg" gelten damit als gleich.
 */
function anschriftSchluessel(text: string | null): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,;·\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Zeigen die gespeicherten Koordinaten noch auf die heutige Anschrift?
 *
 * Das ist der wichtigste Wächter der ganzen Anfahrtsberechnung. Ohne ihn
 * rechnet das System nach einem Umzug still die Entfernung zum alten Haus —
 * mit einem gruenen Haken daneben. Ein Fehler, der erst beim Kunden auffaellt.
 *
 * Rueckgabe false, wenn:
 *   - keine Koordinaten da sind (dann gibt es nichts zu entwerten)
 *   - `geocodeAdresse` unbekannt ist (Altdaten -> kein Fehlalarm)
 */
export function verortungVeraltet(e: Empfaenger): boolean {
  if (!hatKoordinaten(e)) return false;
  if (!e.geocodeAdresse) return false;

  const heute = anschriftSchluessel(geocodeSuchtext(e));
  const damals = anschriftSchluessel(e.geocodeAdresse);
  if (!heute || !damals) return false;

  return heute !== damals;
}

/** Liegt das Geocoding lange zurück? Standard: ein Jahr. */
export function geocodeVeraltet(e: Empfaenger, tage = 365, jetzt: Date = new Date()): boolean {
  if (!e.geocodeAm) return hatKoordinaten(e) ? false : true;
  const dann = new Date(e.geocodeAm).getTime();
  if (!Number.isFinite(dann)) return true;
  return (jetzt.getTime() - dann) / 86400000 > tage;
}

// ----------------------------------------------------------------------------
// 6. GESCHAEFTSART
// ----------------------------------------------------------------------------

/** Firmenkunde = B2B. Relevant für E-Rechnung und Steuerausweis. */
export function istB2B(e: Empfaenger): boolean {
  return e.typ === 'firma';
}

/**
 * Klartext-Anrede für Kundennachrichten.
 * Bewusst konservativ (Sie-Form, geschlechtsneutral) — lieber korrekt und
 * unpersönlich als falsch und vertraulich.
 */
export function anrede(e: Empfaenger): string {
  if (e.typ === 'firma') {
    return e.ansprechpartner ? `Guten Tag ${e.ansprechpartner},` : 'Sehr geehrte Damen und Herren,';
  }
  return `Guten Tag ${e.name},`;
}

// ----------------------------------------------------------------------------
// 7. PRUEFUNG
// ----------------------------------------------------------------------------

/**
 * Prüft, ob ein Empfänger belegtauglich und routenfähig ist.
 *
 * Fehler   = Beleg wäre unbrauchbar (kein Name, keine Anschrift).
 * Hinweise = Beleg geht, aber die Anfahrt lässt sich nicht rechnen.
 */
export function pruefeEmpfaenger(e: Empfaenger): PruefErgebnis {
  const fehler: string[] = [];
  const hinweise: string[] = [];

  if (!e.name || e.name.startsWith('Unbenannte')) {
    fehler.push('Der Empfänger hat keinen Namen.');
  }

  if (!adresseVollstaendig(e)) {
    const fehlt = [
      !e.strasse ? 'Straße' : null,
      !e.plz ? 'PLZ' : null,
      !e.ort ? 'Ort' : null,
    ].filter(Boolean).join(', ');
    fehler.push(`Die Anschrift ist unvollständig — es fehlt: ${fehlt}.`);
  } else if (!plzPlausibel(e)) {
    hinweise.push(`Die PLZ „${e.plz}" sieht für Deutschland ungewöhnlich aus (erwartet: fünf Ziffern).`);
  }

  if (!hatKoordinaten(e)) {
    hinweise.push('Noch keine Koordinaten hinterlegt — die Anfahrt kann nicht berechnet werden.');
  } else if (verortungVeraltet(e)) {
    hinweise.push(
      'Die Anschrift wurde geändert, seit die Koordinaten ermittelt wurden. ' +
        'Sie zeigen noch auf die alte Adresse — bitte neu verorten.',
    );
  } else if (e.geocodeStatus === 'ungenau') {
    hinweise.push('Die Adresse konnte nur ungenau verortet werden — die Entfernung ist ein Näherungswert.');
  } else if (e.geocodeStatus === 'fehlgeschlagen') {
    hinweise.push('Die Adresssuche ist fehlgeschlagen. Koordinaten bitte von Hand setzen.');
  } else if (geocodeVeraltet(e)) {
    hinweise.push('Die Verortung ist über ein Jahr alt — bei Zweifeln neu ermitteln.');
  }

  return { ok: fehler.length === 0, fehler, hinweise };
}

/** Ein Satz für die Oberfläche, z. B. neben dem Kundenfeld. */
export function empfaengerKlartext(e: Empfaenger): string {
  const teile: string[] = [`${e.name} (${e.typ === 'firma' ? 'Firmenkunde' : 'Privatkunde'})`];
  teile.push(adresseVollstaendig(e) ? adresseEinzeilig(e) : 'Anschrift unvollständig');
  if (!hatKoordinaten(e)) {
    teile.push('nicht verortet');
  } else if (verortungVeraltet(e)) {
    teile.push('Adresse geändert — Koordinaten veraltet');
  } else {
    teile.push(e.geocodeStatus === 'ungenau' ? 'ungenau verortet' : 'verortet — Anfahrt berechenbar');
  }
  return teile.join(' · ');
}
