// ============================================================================
// ARGONAUT OS · lib/ablaufRobust.ts — Paket 186 „Abläufe-Rest"
//
// Drei Lücken aus der Prüfung vom 29.09.2026:
//   1. LÖSCHEN: Abläufe ließen sich nicht löschen. Ein echtes Löschen würde
//      wegen „on delete cascade" alle Läufe und das Protokoll mitreißen —
//      der Nachweis wäre weg. Deshalb: ausblenden (geloescht_am), Ablauf aus,
//      offene Läufe enden, Protokoll bleibt. Echtes Löschen sperrt SQL p186.
//   2. HÄNGENDE LÄUFE: Stürzt ein Durchgang mitten im Lauf ab, blieb der Lauf
//      ewig auf „läuft". Nach 2 Stunden ohne Fortschritt -> „Fehler" + Glocke.
//   3. WEBHOOK-NEUVERSUCH: War der Empfänger kurz nicht erreichbar, stoppte
//      der Lauf sofort. Jetzt 3 Neuversuche (nach 1, 6 und 24 Stunden), am
//      selben Schritt — erst danach „Fehler" + Glocke.
//
// Reine Funktionen (kein Netz, keine Datenbank) -> node --test.
// ============================================================================

export const HAENGT_NACH_STUNDEN = 2;

/** Abstände der Neuversuche in Stunden, gezählt ab dem vorigen Versuch (1 h, 6 h, 24 h nach dem ersten Fehler). */
export const NEUVERSUCH_ABSTAENDE_STUNDEN = [1, 5, 18] as const;
export const MAX_NEUVERSUCHE = NEUVERSUCH_ABSTAENDE_STUNDEN.length;

/** Status, die beim Löschen eines Ablaufs beendet werden (laufende enden von selbst). */
export const OFFENE_STATUS_BEIM_LOESCHEN = ['wartet', 'freigabe'] as const;

const STUNDE = 3600 * 1000;

function zeit(iso: string | null | undefined): number | null {
  const s = String(iso ?? '').trim();
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Ab wann gilt ein „läuft" als hängend? (ISO-Grenze für die Abfrage) */
export function haengtGrenze(jetzt: Date): string {
  return new Date(jetzt.getTime() - HAENGT_NACH_STUNDEN * STUNDE).toISOString();
}

/**
 * Hängt der Lauf? Nur „läuft" kann hängen. Maßgeblich ist, seit wann er
 * läuft (laeuft_seit, gesetzt beim Start und bei jedem Fortsetzen); fehlt
 * das, zählt der Start.
 */
export function laufHaengt(
  lauf: { status?: string | null; laeuft_seit?: string | null; gestartet_am?: string | null },
  jetzt: Date,
): boolean {
  if (lauf?.status !== 'laeuft') return false;
  const seit = zeit(lauf.laeuft_seit) ?? zeit(lauf.gestartet_am);
  if (seit === null) return false;
  return jetzt.getTime() - seit >= HAENGT_NACH_STUNDEN * STUNDE;
}

export const HAENGT_MELDUNG = `Lauf hing länger als ${HAENGT_NACH_STUNDEN} Stunden (z. B. Server-Abbruch) — beendet, bitte prüfen.`;

/**
 * Lohnt ein Neuversuch? Ja bei Netzfehlern, Zeitlimit, 408, 429 und 5xx.
 * Nein, wenn die Adresse selbst falsch oder gesperrt ist oder der Empfänger
 * die Daten ablehnt (übrige 4xx) — das wird durch Warten nicht besser.
 */
export function webhookWiederholbar(r: { ok: boolean; status: number | null; meldung?: string | null }): boolean {
  if (r.ok) return false;
  const m = String(r.meldung ?? '');
  if (r.status === null) {
    if (/Nur https|unlesbar|internes? Netz|Geheimnis fehlt/i.test(m)) return false;
    return true;
  }
  if (r.status === 408 || r.status === 429) return true;
  return r.status >= 500 && r.status <= 599;
}

export type NeuversuchStand = { neuversuch_pfad?: string | null; neuversuche?: number | null };
export type NeuversuchPlan =
  | { art: 'neuversuch'; nr: number; weiter_am: string; meldung: string }
  | { art: 'aufgeben'; meldung: string };

/**
 * Nächster Neuversuch für den Schritt `pfad`? Die Zählung gilt je Schritt:
 * Hat der Lauf zuletzt an einem ANDEREN Schritt wiederholt, beginnt sie neu.
 */
export function neuversuchPlanen(stand: NeuversuchStand | null | undefined, pfad: string, jetzt: Date): NeuversuchPlan {
  const bisher = stand && stand.neuversuch_pfad === pfad ? Math.max(0, Math.trunc(Number(stand.neuversuche) || 0)) : 0;
  if (bisher >= MAX_NEUVERSUCHE) {
    return { art: 'aufgeben', meldung: `Empfänger auch nach ${MAX_NEUVERSUCHE} Neuversuchen nicht erreichbar — Lauf beendet.` };
  }
  const nr = bisher + 1;
  const weiter = new Date(jetzt.getTime() + NEUVERSUCH_ABSTAENDE_STUNDEN[bisher] * STUNDE);
  const um = weiter.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return { art: 'neuversuch', nr, weiter_am: weiter.toISOString(), meldung: `Empfänger nicht erreichbar — Neuversuch ${nr} von ${MAX_NEUVERSUCHE} am ${um} Uhr` };
}

/** Gelöschte Abläufe sind unsichtbar und laufen nie. */
export function ablaufSichtbar(a: { geloescht_am?: string | null } | null | undefined): boolean {
  return !!a && !a.geloescht_am;
}

export function loeschFrage(name: string, offeneLaeufe: number): string {
  const n = String(name || 'Ablauf').trim();
  const teil = offeneLaeufe > 0
    ? ` ${offeneLaeufe} wartende${offeneLaeufe === 1 ? 'r Lauf endet' : ' Läufe enden'} dabei.`
    : '';
  return `„${n}" wirklich löschen? Der Ablauf wird ausgeschaltet und verschwindet aus der Liste.${teil} Bisherige Läufe und das Protokoll bleiben als Nachweis gespeichert.`;
}
