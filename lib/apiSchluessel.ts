// ============================================================================
// ARGONAUT OS · lib/apiSchluessel.ts
// Block 2 · Welle 1 · C4-3b — API-Schlüssel je Betrieb
//
// ⚠️ NUR SERVERSEITIG. Diese Datei erzeugt und prüft Geheimnisse.
//    Niemals in eine Client-Komponente importieren.
//
// DREI GRUNDSÄTZE
//
// 1. GEHASHT, NICHT VERSCHLÜSSELT.
//    In der Datenbank liegt nur der SHA-256-Hash. Der Klartext existiert
//    genau einmal: in der Antwort auf das Erzeugen. Danach ist er weg —
//    auch für ARGONAUT. Wer die Datenbank kompromittiert, hat Hashes,
//    keine Schlüssel.
//
// 2. DER SCHLÜSSEL IST DIE ZUORDNUNG.
//    Der Betrieb wird aus dem Schlüssel abgeleitet, nicht aus dem Anfrage-
//    Körper. n8n kann keine fremde owner_user_id eintippen, weil es kein
//    Feld dafür gibt. Ein Leck betrifft genau einen Betrieb.
//
// 3. PRÄFIX `argo_`.
//    Macht den Schlüssel in Logs und Repos als Geheimnis erkennbar und
//    maschinell scannbar.
//
// WARUM SHA-256 UND NICHT bcrypt?
//    bcrypt ist für PASSWÖRTER richtig: Menschen wählen schwache, also muss
//    Raten teuer sein. Ein API-Schlüssel hat 256 Bit Zufall — Raten ist
//    ohnehin aussichtslos. Ein schneller Hash ist hier korrekt und nötig,
//    denn er läuft bei JEDEM Aufruf.
// ============================================================================

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

const PRAEFIX = 'argo_';

/** 32 Byte Zufall = 256 Bit. base64url, damit er in URLs und Headern lebt. */
const ZUFALL_BYTES = 32;

export interface NeuerSchluessel {
  /** Der Klartext. Wird GENAU EINMAL zurückgegeben und nie gespeichert. */
  klartext: string;
  /** Was in die Datenbank geht. */
  hash: string;
  /** Harmloser Wiedererkennungs-Hinweis: "argo_a1b2…9f3c". */
  hinweis: string;
}

// ----------------------------------------------------------------------------
// 1. ERZEUGEN
// ----------------------------------------------------------------------------

export function erzeugeSchluessel(): NeuerSchluessel {
  const roh = randomBytes(ZUFALL_BYTES).toString('base64url');
  const klartext = `${PRAEFIX}${roh}`;
  return {
    klartext,
    hash: hasheSchluessel(klartext),
    hinweis: schluesselHinweis(klartext),
  };
}

/**
 * SHA-256, hexadezimal. Deterministisch — derselbe Schlüssel ergibt immer
 * denselben Hash, sonst könnte man ihn nicht wiederfinden.
 */
export function hasheSchluessel(klartext: string): string {
  return createHash('sha256').update(klartext.trim(), 'utf8').digest('hex');
}

/** "argo_a1b2…9f3c" — genug zum Wiedererkennen, zu wenig zum Missbrauchen. */
export function schluesselHinweis(klartext: string): string {
  const k = klartext.trim();
  if (k.length <= 16) return `${PRAEFIX}…`;
  return `${k.slice(0, 10)}…${k.slice(-4)}`;
}

// ----------------------------------------------------------------------------
// 2. PRÜFEN
// ----------------------------------------------------------------------------

/** Sieht das überhaupt wie ein ARGONAUT-Schlüssel aus? Spart eine DB-Abfrage. */
export function schluesselPlausibel(wert: unknown): wert is string {
  if (typeof wert !== 'string') return false;
  const k = wert.trim();
  return k.startsWith(PRAEFIX) && k.length >= PRAEFIX.length + 32 && !/\s/.test(k);
}

/**
 * Vergleicht zwei Hashes in konstanter Zeit.
 *
 * Ein normaler Vergleich bricht beim ersten abweichenden Zeichen ab. Aus den
 * Zeitunterschieden lässt sich ein Geheimnis Zeichen für Zeichen erraten.
 * Hier nicht: die Prüfung dauert immer gleich lang.
 */
export function hashGleich(a: string, b: string): boolean {
  const pa = Buffer.from(a, 'utf8');
  const pb = Buffer.from(b, 'utf8');
  if (pa.length !== pb.length) return false;
  return timingSafeEqual(pa, pb);
}

// ----------------------------------------------------------------------------
// 3. AUS DEM HEADER LESEN
// ----------------------------------------------------------------------------

/**
 * Holt den Schlüssel aus `Authorization: Bearer argo_…` oder `x-argonaut-key`.
 * Bewusst NICHT aus der Query — URLs landen in Server-Logs und Verläufen.
 */
export function schluesselAusAnfrage(req: Request): string | null {
  const auth = req.headers.get('authorization');
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && schluesselPlausibel(m[1])) return m[1].trim();
  }
  const eigen = req.headers.get('x-argonaut-key');
  if (eigen && schluesselPlausibel(eigen)) return eigen.trim();
  return null;
}
