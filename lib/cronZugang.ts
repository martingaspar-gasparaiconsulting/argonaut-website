// ============================================================================
// ARGONAUT OS · lib/cronZugang.ts — wer einen Hintergrundlauf auslösen darf
//
// ▄▄▄ WARUM ES DIESE DATEI GIBT (Punkt 69, 21.09.2026) ▄▄▄
// In vercel.json stehen 18 Zeitpläne. Die zugehörigen Endpunkte prüfen bis
// heute jeder für sich, ob ein Aufruf erlaubt ist — in DREI verschiedenen
// Bauarten, wortgleich kopiert. Eine Sicherheitsprüfung, die es achtzehnmal
// gibt, ist eine Sicherheitsprüfung, die auseinanderläuft. Ab jetzt steht sie
// hier, einmal.
//
// ▄▄▄ DER BEFUND, DER DEN ANLASS GAB ▄▄▄
// Neun Endpunkte sind so gebaut:
//
//     const secret = process.env.CRON_SECRET;
//     if (secret) { ...Bearer prüfen, bei Treffer durchlassen... }
//     // und wenn KEIN Geheimnis gesetzt ist, geht es hier einfach weiter:
//     ...profiles.role === 'admin'
//
// Zwei Dinge sind daran falsch:
//
//   1. EINZELSCHLOSS. Eine versehentlich auf 'admin' gesetzte Zeile in
//      `profiles` genügt, um fremde Betriebe anzuschreiben. Genau dieses
//      Schloss wurde am 15.09.2026 bei den vier Admin-Wegen durch ein
//      Doppelschloss ersetzt (lib/betreiberGuard.ts) — die Hintergrundläufe
//      blieben übrig.
//
//   2. STILLER RÜCKFALL. Ist CRON_SECRET nicht gesetzt, wird nicht etwa
//      abgebrochen, sondern der Anmelde-Weg versucht. Eine vergessene
//      Umgebungsvariable macht den Weg also nicht ZU, sondern WEITER auf.
//      lib/betreiberGuard.ts schreibt dazu im Kopf: „eine vergessene Variable
//      ist hier kein Grund zum Durchlassen, sondern einer zum Zumachen.“
//      app/api/cron/webinar macht es bereits richtig (`if (!secret) return
//      false`) — diese Datei macht es für alle richtig.
//
// ▄▄▄ WAS HIER BEWUSST ERLAUBT BLEIBT ▄▄▄
// Das Geheimnis in der Adresse (?secret=…) wird weiterhin akzeptiert, aber als
// eigener Weg zurückgemeldet. Grund: Martin löst Läufe zum Prüfen von Hand über
// den Browser aus. Ihm diesen Weg ohne Vorwarnung wegzunehmen hieße, ihn
// auszusperren. Der Rückgabewert `weg: 'adresse'` macht sichtbar, wann es
// passiert — abschalten lässt es sich später mit einem Schalter, an einer
// Stelle, für alle achtzehn.
//
// REIN UND NODE-TESTBAR: keine Importe, kein Netz, keine Hooks.
// ============================================================================

/** Welcher Weg den Zugang geöffnet hat — oder warum keiner. */
export type CronWeg = 'bearer' | 'adresse' | 'alt-bearer' | 'alt-header';

export type CronZugangErgebnis =
  | { frei: true; weg: CronWeg }
  | { frei: false; grund: 'kein-geheimnis' | 'kein-treffer' };

/** Was zur Prüfung hereingereicht wird. Alles darf fehlen. */
export type CronZugangEingabe = {
  /** process.env.CRON_SECRET */
  geheimnis?: string | null;
  /** process.env.TERMIN_CRON_GEHEIM — nur die drei n8n-Altwege nutzen das. */
  altGeheimnis?: string | null;
  /** Der Authorization-Kopf des Aufrufs. */
  authKopf?: string | null;
  /** Der x-cron-secret-Kopf (Altweg). */
  altKopf?: string | null;
  /** Der Wert von ?secret= aus der Adresse. */
  adresse?: string | null;
  /** false schaltet den Adress-Weg ab. Voreinstellung: erlaubt. */
  adresseErlaubt?: boolean;
};

/**
 * Ein Geheimnis gilt nur als gesetzt, wenn wirklich etwas darin steht.
 *
 * Warum das eine eigene Funktion ist: `if (secret)` in den bestehenden
 * Endpunkten lässt ein Geheimnis aus einem einzigen Leerzeichen durchgehen.
 * Wer dann ?secret=%20 anhängt, ist drin. Ein leerer oder blanker Wert ist
 * kein Geheimnis, sondern ein Versehen.
 */
export function istGesetzt(wert: string | null | undefined): boolean {
  return typeof wert === 'string' && wert.trim().length > 0;
}

/**
 * Zwei Zeichenketten vergleichen, ohne durch die Laufzeit zu verraten, ab
 * welcher Stelle sie sich unterscheiden.
 *
 * Ein gewöhnliches === bricht beim ersten falschen Zeichen ab. Wer denselben
 * Endpunkt oft genug aufruft und die Antwortzeiten misst, kann ein Geheimnis
 * daran Zeichen für Zeichen abtasten. Der Unterschied ist winzig und über das
 * Netz schwer auszunutzen — aber er kostet nichts, ihn zu vermeiden.
 *
 * Auch die LÄNGE darf den Vergleich nicht abkürzen: deshalb wird über die
 * längere der beiden gelaufen und der Unterschied mitgezählt, statt vorher mit
 * false herauszuspringen.
 */
export function gleichOhneZeitverrat(a: string, b: string): boolean {
  const laenge = Math.max(a.length, b.length);
  let abweichung = a.length ^ b.length;
  for (let i = 0; i < laenge; i++) {
    abweichung |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return abweichung === 0;
}

/** Aus "Bearer xyz" wird "xyz". Alles andere bleibt, wie es ist. */
function ohneBearer(kopf: string): string {
  const treffer = /^Bearer\s+(.*)$/i.exec(kopf.trim());
  return treffer ? treffer[1].trim() : kopf.trim();
}

/**
 * Darf dieser Aufruf einen Hintergrundlauf auslösen?
 *
 * Die Reihenfolge ist Absicht: Erst wird geprüft, ob überhaupt ein Geheimnis
 * hinterlegt ist. Ist keines da, ist der Weg ZU — ohne Ausnahme und ohne
 * Rückfall auf irgendeinen anderen Weg. Das ist der Kern der Reparatur.
 */
export function cronZugang(ein: CronZugangEingabe): CronZugangErgebnis {
  const haupt = istGesetzt(ein.geheimnis) ? (ein.geheimnis as string).trim() : null;
  const alt = istGesetzt(ein.altGeheimnis) ? (ein.altGeheimnis as string).trim() : null;

  // 1. Ohne hinterlegtes Geheimnis kommt niemand durch. Nie.
  if (!haupt && !alt) return { frei: false, grund: 'kein-geheimnis' };

  const authKopf = typeof ein.authKopf === 'string' ? ein.authKopf : '';
  const altKopf = typeof ein.altKopf === 'string' ? ein.altKopf.trim() : '';
  const adresse = typeof ein.adresse === 'string' ? ein.adresse : '';
  const adresseErlaubt = ein.adresseErlaubt !== false;

  // 2. Der Weg, den Vercel geht: Authorization: Bearer <CRON_SECRET>
  if (haupt && authKopf && gleichOhneZeitverrat(ohneBearer(authKopf), haupt)) {
    return { frei: true, weg: 'bearer' };
  }

  // 3. Der Alt-Weg für die drei n8n-Endpunkte (termin-erinnerung,
  //    wartung-erinnerung, rechnungen-ueberfaellig). Bleibt bestehen, damit
  //    kein bestehender Ablauf stehen bleibt.
  if (alt && authKopf && gleichOhneZeitverrat(ohneBearer(authKopf), alt)) {
    return { frei: true, weg: 'alt-bearer' };
  }
  if (alt && altKopf && gleichOhneZeitverrat(altKopf, alt)) {
    return { frei: true, weg: 'alt-header' };
  }

  // 4. Das Geheimnis in der Adresse — Martins Weg zum Prüfen von Hand.
  //    Steht bewusst ZULETZT und wird eigens benannt.
  if (adresseErlaubt && adresse) {
    if (haupt && gleichOhneZeitverrat(adresse.trim(), haupt)) {
      return { frei: true, weg: 'adresse' };
    }
    if (alt && gleichOhneZeitverrat(adresse.trim(), alt)) {
      return { frei: true, weg: 'adresse' };
    }
  }

  return { frei: false, grund: 'kein-treffer' };
}

/**
 * Klartext für das Protokoll. Kein Geheimnis, keine Länge, kein Anfangsstück —
 * nur der Weg. Was in ein Protokoll gerät, kann auch aus ihm heraus.
 */
export function cronZugangKlartext(e: CronZugangErgebnis): string {
  if (e.frei) {
    switch (e.weg) {
      case 'bearer': return 'Zeitplan (Kopfzeile)';
      case 'alt-bearer': return 'Altweg (Kopfzeile)';
      case 'alt-header': return 'Altweg (x-cron-secret)';
      case 'adresse': return 'von Hand ueber die Adresse';
    }
  }
  return e.grund === 'kein-geheimnis'
    ? 'abgewiesen: es ist gar kein Geheimnis hinterlegt'
    : 'abgewiesen: das Geheimnis stimmt nicht';
}
