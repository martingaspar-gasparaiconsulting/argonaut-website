// ============================================================================
// ARGONAUT OS · lib/ors.ts
// Block 2 · Welle 1 · B1-3b — Anbindung an OpenRouteService
//
// ⚠️ NUR SERVERSEITIG. Diese Datei fasst API-Schlüssel an und darf niemals
//    in eine Client-Komponente importiert werden.
//
// SICHERHEITSREGEL, DIE HIER DURCHGEHALTEN WIRD:
//   ORS gibt bei einem falschen Schlüssel eine Fehlermeldung zurück, die den
//   Schlüssel enthalten kann. Deshalb wird der Antworttext NIE roh geloggt und
//   NIE an den Client durchgereicht. Nach außen gehen nur Statuscode und eine
//   eigene, saubere Meldung. Ein Schlüssel im Log ist ein geleakter Schlüssel.
//
// KONTINGENT (Standard-Plan, Stand der Doku):
//   ~2.000 Anfragen/Tag, 40/Minute im gleitenden Fenster.
//   403 = Tageslimit erschöpft · 429 = Minutenlimit · 401 = Schlüssel ungültig.
//   Die Header x-ratelimit-remaining / -reset verraten den Reststand.
// ============================================================================

const ORS_BASIS = 'https://api.openrouteservice.org';

/** Wie lange darf eine ORS-Anfrage dauern, bevor wir abbrechen? */
const TIMEOUT_MS = 8000;

// ----------------------------------------------------------------------------
// 1. TYPEN
// ----------------------------------------------------------------------------

export type OrsStatus = 'ok' | 'ungueltig' | 'kontingent' | 'unbekannt';

export interface OrsPruefung {
  ok: boolean;
  status: OrsStatus;
  meldung: string;
  /** Reststand aus dem Antwort-Header, falls ORS ihn mitschickt. */
  kontingentRest: number | null;
}

export type GeocodeGenauigkeit = 'ok' | 'ungenau';

/** Ein Punkt auf der Karte. Reihenfolge wie ueberall sonst: erst Breite. */
export interface Punkt {
  lat: number;
  lon: number;
}

export interface RouteTreffer {
  /** Fahrstrecke in Metern. */
  distanzMeter: number;
  /** Fahrzeit in Sekunden. Kann fehlen. */
  dauerSekunden: number | null;
  kontingentRest: number | null;
}

export interface RouteErgebnis {
  ok: boolean;
  status: OrsStatus;
  meldung: string;
  treffer: RouteTreffer | null;
}

export interface GeocodeTreffer {
  lat: number;
  lon: number;
  genauigkeit: GeocodeGenauigkeit;
  /** Die Adresse, wie ORS sie verstanden hat — zum Gegenlesen. */
  label: string;
  kontingentRest: number | null;
}

export interface GeocodeErgebnis {
  ok: boolean;
  status: OrsStatus;
  meldung: string;
  treffer: GeocodeTreffer | null;
}

// ----------------------------------------------------------------------------
// 2. SCHLUESSEL-HILFEN
// ----------------------------------------------------------------------------

/**
 * Der harmlose Wiedererkennungs-Hinweis: "eyJvcmc…4f3a".
 * Genug, um zu erkennen "ist das noch der von damals?" — zu wenig, um damit
 * irgendetwas anzufangen.
 */
export function schluesselHinweis(schluessel: string): string {
  const k = schluessel.trim();
  if (k.length <= 12) return '…';
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

/**
 * Grobe Formprüfung, bevor wir überhaupt eine Anfrage verschwenden.
 * ORS-Schlüssel sind entweder alte Hex-Ketten oder neuerdings JWTs (eyJ…).
 * Beides ist lang und enthält keine Leerzeichen.
 */
export function schluesselPlausibel(schluessel: string): boolean {
  const k = schluessel.trim();
  return k.length >= 20 && k.length <= 2048 && !/\s/.test(k);
}

/** Zentraler ARGONAUT-Schlüssel als Notnagel. Kann fehlen — dann null. */
export function zentralerSchluessel(): string | null {
  const k = process.env.ORS_API_KEY;
  return k && schluesselPlausibel(k) ? k.trim() : null;
}

// ----------------------------------------------------------------------------
// 3. INTERNER FETCH
// ----------------------------------------------------------------------------

function kontingentAus(res: Response): number | null {
  const roh = res.headers.get('x-ratelimit-remaining');
  if (!roh) return null;
  const n = Number(roh);
  return Number.isFinite(n) ? n : null;
}

/** Statuscode -> unser Status. Der Antworttext wird bewusst nicht gelesen. */
function statusAus(code: number): OrsStatus {
  if (code === 200) return 'ok';
  if (code === 401) return 'ungueltig';
  if (code === 403 || code === 429) return 'kontingent';
  return 'unbekannt';
}

function meldungAus(status: OrsStatus, code: number): string {
  switch (status) {
    case 'ok':
      return 'Verbindung steht.';
    case 'ungueltig':
      return 'Der Schlüssel wurde von OpenRouteService abgelehnt. Bitte prüfen und neu eintragen.';
    case 'kontingent':
      return code === 429
        ? 'Zu viele Anfragen in kurzer Zeit. Bitte eine Minute warten.'
        : 'Das Tageskontingent ist erschöpft. Es füllt sich 24 Stunden nach der ersten Anfrage wieder auf.';
    default:
      return `OpenRouteService antwortet nicht wie erwartet (Status ${code}).`;
  }
}

/**
 * Eine Geocode-Anfrage. Der Schlüssel geht als Query-Parameter mit, so wie ORS
 * es für diesen Endpunkt vorsieht.
 *
 * WICHTIG: Die URL wird NIE geloggt — sie enthält den Schlüssel.
 */
async function geocodeRoh(
  schluessel: string,
  text: string,
  size = 1,
): Promise<{ res: Response | null; fehler: 'timeout' | 'netz' | null }> {
  const url = new URL(`${ORS_BASIS}/geocode/search`);
  url.searchParams.set('api_key', schluessel);
  url.searchParams.set('text', text);
  url.searchParams.set('size', String(size));
  url.searchParams.set('boundary.country', 'DE');

  const abbruch = new AbortController();
  const uhr = setTimeout(() => abbruch.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: abbruch.signal,
      cache: 'no-store',
    });
    return { res, fehler: null };
  } catch (e: unknown) {
    const abgebrochen = e instanceof Error && e.name === 'AbortError';
    return { res: null, fehler: abgebrochen ? 'timeout' : 'netz' };
  } finally {
    clearTimeout(uhr);
  }
}

// ----------------------------------------------------------------------------
// 4. SCHLUESSEL PRUEFEN
// ----------------------------------------------------------------------------

/**
 * Testet einen Schlüssel mit einer echten, winzigen Anfrage.
 * Wird aufgerufen, BEVOR der Schlüssel gespeichert wird — ein ungültiger
 * Schlüssel landet gar nicht erst in der Datenbank.
 */
export async function pruefeSchluessel(schluessel: string): Promise<OrsPruefung> {
  if (!schluesselPlausibel(schluessel)) {
    return {
      ok: false,
      status: 'ungueltig',
      meldung: 'Der Schlüssel sieht nicht wie ein OpenRouteService-Schlüssel aus.',
      kontingentRest: null,
    };
  }

  const { res, fehler } = await geocodeRoh(schluessel, 'Ergenzingen', 1);

  if (fehler === 'timeout') {
    return { ok: false, status: 'unbekannt', meldung: 'OpenRouteService antwortet nicht (Zeitüberschreitung).', kontingentRest: null };
  }
  if (fehler !== null || !res) {
    return { ok: false, status: 'unbekannt', meldung: 'OpenRouteService ist nicht erreichbar.', kontingentRest: null };
  }

  const status = statusAus(res.status);
  // Statuscode loggen ist unbedenklich. Der Antworttext waere es NICHT.
  if (status !== 'ok') console.error('[ORS] Schluesselpruefung, Status:', res.status);

  return {
    // "kontingent" heisst: der Schluessel ist gueltig, nur gerade leer.
    ok: status === 'ok' || status === 'kontingent',
    status,
    meldung: meldungAus(status, res.status),
    kontingentRest: kontingentAus(res),
  };
}

// ----------------------------------------------------------------------------
// 5. ADRESSE VERORTEN
// ----------------------------------------------------------------------------

/** Ein Datensatz aus der ORS-Antwort. Bewusst eng typisiert. */
interface PeliasFeature {
  geometry?: { coordinates?: unknown };
  properties?: { label?: unknown; layer?: unknown; confidence?: unknown };
}

/**
 * Wie genau ist der Treffer?
 *   'ok'      = ORS hat eine Hausnummer/Adresse gefunden
 *   'ungenau' = nur Straße, Ort oder PLZ — die Entfernung wird ein Näherungswert
 *
 * Das ist wichtig: eine ungenaue Verortung darf dem Kunden nicht als exakte
 * Anfahrt verkauft werden.
 */
function genauigkeitAus(layer: unknown, confidence: unknown): GeocodeGenauigkeit {
  const c = typeof confidence === 'number' ? confidence : 0;
  return layer === 'address' && c >= 0.8 ? 'ok' : 'ungenau';
}

/**
 * Sucht Koordinaten zu einem Adress-Freitext.
 * Rückgabe `treffer = null` bedeutet: Anfrage lief, aber nichts gefunden.
 */
export async function geocodeAdresse(schluessel: string, suchtext: string): Promise<GeocodeErgebnis> {
  const text = suchtext.trim();
  if (!text) {
    return { ok: false, status: 'unbekannt', meldung: 'Kein Suchtext übergeben.', treffer: null };
  }

  const { res, fehler } = await geocodeRoh(schluessel, text, 1);

  if (fehler === 'timeout') {
    return { ok: false, status: 'unbekannt', meldung: 'OpenRouteService antwortet nicht (Zeitüberschreitung).', treffer: null };
  }
  if (fehler !== null || !res) {
    return { ok: false, status: 'unbekannt', meldung: 'OpenRouteService ist nicht erreichbar.', treffer: null };
  }

  const status = statusAus(res.status);
  if (status !== 'ok') {
    console.error('[ORS] Geocoding, Status:', res.status);
    return { ok: false, status, meldung: meldungAus(status, res.status), treffer: null };
  }

  const rest = kontingentAus(res);

  let daten: { features?: unknown };
  try {
    daten = (await res.json()) as { features?: unknown };
  } catch {
    return { ok: false, status: 'unbekannt', meldung: 'Antwort von OpenRouteService war nicht lesbar.', treffer: null };
  }

  const features = Array.isArray(daten.features) ? (daten.features as PeliasFeature[]) : [];
  const f = features[0];
  const koord = f?.geometry?.coordinates;

  if (!Array.isArray(koord) || koord.length < 2) {
    return {
      ok: true, // Anfrage war erfolgreich, nur ohne Treffer
      status: 'ok',
      meldung: 'Zu dieser Adresse wurde nichts gefunden. Bitte Schreibweise prüfen.',
      treffer: null,
    };
  }

  // ⚠️ Pelias liefert [Längengrad, Breitengrad] — genau andersherum als üblich.
  const lon = Number(koord[0]);
  const lat = Number(koord[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { ok: false, status: 'unbekannt', meldung: 'Ungültige Koordinaten erhalten.', treffer: null };
  }

  const label = typeof f?.properties?.label === 'string' ? f.properties.label : text;

  return {
    ok: true,
    status: 'ok',
    meldung: 'Adresse verortet.',
    treffer: {
      lat,
      lon,
      genauigkeit: genauigkeitAus(f?.properties?.layer, f?.properties?.confidence),
      label,
      kontingentRest: rest,
    },
  };
}

// ----------------------------------------------------------------------------
// 6. ROUTE — die echte Fahrstrecke
// ----------------------------------------------------------------------------

/** Fahrzeugprofil. Fuer Brennholzlieferung und Werkstattfahrten: Auto. */
export const STANDARD_PROFIL = 'driving-car';

interface DirectionsFeature {
  properties?: { summary?: { distance?: unknown; duration?: unknown } };
}

/**
 * Fragt die Fahrstrecke zwischen zwei Punkten ab.
 *
 * ⚠️ ORS erwartet die Koordinaten als "lon,lat" — Laenge zuerst. Vertauscht
 * kommt eine Route durch den Indischen Ozean zurueck, oder gar keine.
 *
 * Die URL enthaelt den Schluessel und wird deshalb NIE geloggt.
 */
export async function routeEntfernung(
  schluessel: string,
  start: Punkt,
  ziel: Punkt,
  profil: string = STANDARD_PROFIL,
): Promise<RouteErgebnis> {
  if (!schluesselPlausibel(schluessel)) {
    return { ok: false, status: 'ungueltig', meldung: 'Der Schlüssel ist ungültig.', treffer: null };
  }
  for (const p of [start, ziel]) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) {
      return { ok: false, status: 'unbekannt', meldung: 'Ungültige Koordinaten übergeben.', treffer: null };
    }
  }

  const url = new URL(`${ORS_BASIS}/v2/directions/${profil}`);
  url.searchParams.set('api_key', schluessel);
  url.searchParams.set('start', `${start.lon},${start.lat}`);
  url.searchParams.set('end', `${ziel.lon},${ziel.lat}`);

  const abbruch = new AbortController();
  const uhr = setTimeout(() => abbruch.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json, application/geo+json' },
      signal: abbruch.signal,
      cache: 'no-store',
    });
  } catch (e: unknown) {
    const abgebrochen = e instanceof Error && e.name === 'AbortError';
    return {
      ok: false, status: 'unbekannt', treffer: null,
      meldung: abgebrochen
        ? 'OpenRouteService antwortet nicht (Zeitüberschreitung).'
        : 'OpenRouteService ist nicht erreichbar.',
    };
  } finally {
    clearTimeout(uhr);
  }

  const status = statusAus(res.status);
  if (status !== 'ok') {
    console.error('[ORS] Route, Status:', res.status);
    // 404 heisst hier meist: kein Weg gefunden (z. B. Punkt im Wasser).
    const meldung = res.status === 404
      ? 'Zwischen diesen Punkten wurde keine Straßenverbindung gefunden.'
      : meldungAus(status, res.status);
    return { ok: false, status, meldung, treffer: null };
  }

  const rest = kontingentAus(res);

  let daten: { features?: unknown };
  try {
    daten = (await res.json()) as { features?: unknown };
  } catch {
    return { ok: false, status: 'unbekannt', meldung: 'Antwort von OpenRouteService war nicht lesbar.', treffer: null };
  }

  const features = Array.isArray(daten.features) ? (daten.features as DirectionsFeature[]) : [];
  const summary = features[0]?.properties?.summary;
  const distanz = typeof summary?.distance === 'number' ? summary.distance : NaN;

  if (!Number.isFinite(distanz) || distanz < 0) {
    return { ok: false, status: 'unbekannt', meldung: 'Keine Streckenlänge in der Antwort.', treffer: null };
  }

  const dauer = typeof summary?.duration === 'number' ? summary.duration : null;

  return {
    ok: true,
    status: 'ok',
    meldung: 'Route berechnet.',
    treffer: { distanzMeter: distanz, dauerSekunden: dauer, kontingentRest: rest },
  };
}

// ----------------------------------------------------------------------------
// 7. LUFTLINIE — der Notnagel, wenn gar nichts geht
// ----------------------------------------------------------------------------

/**
 * Haversine. Liefert Meter.
 *
 * ⚠️ Eine Luftlinie ist KEINE Fahrstrecke. Im Schwarzwald liegt sie 20–30 %
 * unter der echten Route. Wird sie verwendet, muss die Oberfläche das sagen
 * ("geschätzte Entfernung") — der Kunde darf nicht glauben, es sei gemessen.
 */
export function luftlinieMeter(
  start: { lat: number; lon: number },
  ziel: { lat: number; lon: number },
): number {
  const R = 6371000;
  const bog = (g: number) => (g * Math.PI) / 180;
  const dLat = bog(ziel.lat - start.lat);
  const dLon = bog(ziel.lon - start.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(bog(start.lat)) * Math.cos(bog(ziel.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
