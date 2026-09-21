// ============================================================================
// ARGONAUT OS · lib/cronGuard.ts — das Schloss vor den Hintergrundläufen
//
// Die dünne Hülle um lib/cronZugang.ts: Sie liest die Umgebungsvariablen und
// den Aufruf aus, gibt beides an die reine Logik weiter und macht aus dem
// Ergebnis eine fertige Absage.
//
// ▄▄▄ WARUM DIE TEILUNG ▄▄▄
// Die Entscheidung „darf dieser Aufruf?" ist reine Rechnerei und steckt in
// lib/cronZugang.ts — dort ist sie node-testbar, und dort liegen die 26 Tests.
// Alles, was NextResponse und Supabase braucht, steht hier und bleibt so dünn,
// dass nichts darin schiefgehen kann, was ein Test fangen müsste.
//
// ▄▄▄ DIE ZWEI WEGE HINEIN ▄▄▄
//   1. Das Zeitplan-Geheimnis (CRON_SECRET, bei drei Alt-Endpunkten zusätzlich
//      TERMIN_CRON_GEHEIM). Den geht Vercel — und Martin von Hand.
//   2. Der Betreiber persönlich, geprüft mit dem DOPPELSCHLOSS aus
//      lib/betreiberGuard.ts (Rolle UND hinterlegte Kennung). Dieser Weg ist
//      voreingestellt ZU und muss je Endpunkt ausdrücklich erlaubt werden.
//
// Warum Weg 2 nicht überall aufgeht: Neun Endpunkte haben heute einen
// Anmelde-Rückfall, neun nicht. Wer den fehlenden nachrüstet, öffnet einen Weg,
// den es vorher nicht gab — und das gehört entschieden, nicht nebenbei gemacht.
// Deshalb: `betreiberErlaubt: true` nur dort, wo heute schon ein Anmeldeweg ist.
// ============================================================================

import { NextResponse } from 'next/server';
import { betreiberPruefung } from './betreiberGuard';
import { cronZugang, cronZugangKlartext, type CronWeg } from './cronZugang';

/** Wie der Aufruf hereinkam — oder die fertige Absage. */
export type CronPruefungErgebnis =
  | { absage: NextResponse; weg: null }
  | { absage: null; weg: CronWeg | 'betreiber' };

export type CronGuardOptionen = {
  /**
   * Darf sich stattdessen der angemeldete Betreiber ausweisen (Doppelschloss)?
   * Voreinstellung: nein. Nur die Endpunkte setzen das auf true, die heute
   * schon einen Anmelde-Rückfall haben.
   */
  betreiberErlaubt?: boolean;
  /**
   * Zusätzliches Alt-Geheimnis aus der n8n-Zeit (TERMIN_CRON_GEHEIM).
   * Nur die drei Endpunkte außerhalb von /api/cron brauchen das.
   */
  altGeheimnisNutzen?: boolean;
  /**
   * Das Geheimnis in der Adresse (?secret=…) zulassen. Voreinstellung: ja —
   * weil Martin Läufe so von Hand auslöst. Ein späteres Abschalten ist
   * hiermit eine einzige Änderung, an einer Stelle, für alle Endpunkte.
   */
  adresseErlaubt?: boolean;
};

function adressGeheimnis(req: Request): string | null {
  try {
    return new URL(req.url).searchParams.get('secret');
  } catch {
    // Kein gültiger Aufruf-Pfad? Dann gibt es eben kein Adress-Geheimnis.
    return null;
  }
}

/**
 * Prüfen und mitteilen, WIE der Aufruf hereinkam.
 *
 * Der Weg ist für das Protokoll gedacht: Ein Lauf, der plötzlich über die
 * Adresse statt über den Zeitplan kommt, ist einen Blick wert.
 */
export async function cronPruefung(
  req: Request,
  opt: CronGuardOptionen = {},
): Promise<CronPruefungErgebnis> {
  const ergebnis = cronZugang({
    geheimnis: process.env.CRON_SECRET,
    altGeheimnis: opt.altGeheimnisNutzen ? process.env.TERMIN_CRON_GEHEIM : null,
    authKopf: req.headers.get('authorization'),
    altKopf: req.headers.get('x-cron-secret'),
    adresse: adressGeheimnis(req),
    adresseErlaubt: opt.adresseErlaubt,
  });

  if (ergebnis.frei) return { absage: null, weg: ergebnis.weg };

  // Zweiter Weg: der Betreiber persönlich — aber nur, wo ausdrücklich erlaubt.
  if (opt.betreiberErlaubt) {
    const { absage } = await betreiberPruefung();
    if (!absage) return { absage: null, weg: 'betreiber' };
  }

  // Die Absage nennt den Grund im Klartext, aber niemals das Geheimnis.
  // 401 statt 403: Es fehlt ein Ausweis, nicht die Berechtigung.
  return {
    absage: NextResponse.json(
      { ok: false, error: 'Kein Zugriff.', grund: cronZugangKlartext(ergebnis) },
      { status: 401 },
    ),
    weg: null,
  };
}

/**
 * Dieselbe Prüfung, kurz: `null` heißt frei, alles andere ist die Absage.
 * Die meisten Endpunkte brauchen nur das.
 */
export async function cronGuard(
  req: Request,
  opt: CronGuardOptionen = {},
): Promise<NextResponse | null> {
  const { absage } = await cronPruefung(req, opt);
  return absage;
}
