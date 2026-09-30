// ============================================================================
// ARGONAUT OS · lib/angebotZusage.ts — Online-Zusage für Angebote, die Regeln (Paket 182)
//
// Claude-Befund (Rundumschlag 29.09.2026, P161): Ein Angebot im Status
// „Entwurf" war über den Link annehmbar, das Kundenportal zeigte Entwürfe,
// und die Annahme speicherte nur einen Zeitpunkt (kein Name, kein Wortlaut).
//
// Jetzt:
//   · Link und Portal zeigen ein Angebot erst ab „gesendet". Ein Entwurf
//     verrät über den Link nichts (auch nicht den Inhalt).
//   · Entscheiden (annehmen/ablehnen) nur im Status „gesendet" und — beim
//     Annehmen — nicht nach Ablauf.
//   · Annehmen nur mit Namen der Person; gespeichert werden Name, Zeitpunkt
//     und der genaue Wortlaut der Erklärung.
//   · Kopiert der Betrieb den Link eines Entwurfs, wird das Angebot vorher
//     (nach Rückfrage) auf „gesendet" gesetzt — der Link funktioniert also.
// Rein, ohne Importe, node-getestet.
// ============================================================================

export const ZUSAGE_ERKLAERUNG =
  'Mit „Angebot annehmen" erklären Sie verbindlich Ihr Einverständnis mit den oben genannten Leistungen und Preisen.';

/** Darf der Link / das Portal das Angebot überhaupt zeigen? */
export function perLinkSichtbar(status: unknown): boolean {
  return status === 'gesendet' || status === 'angenommen' || status === 'abgelehnt';
}

/** Ist das Angebot bis einschließlich gueltig_bis abgelaufen? (ohne Datum: nie) */
export function abgelaufen(gueltigBis: unknown, jetzt: Date): boolean {
  if (!gueltigBis) return false;
  const t = new Date(String(gueltigBis).slice(0, 10) + 'T23:59:59').getTime();
  return Number.isFinite(t) && t < jetzt.getTime();
}

export type Entscheidung = 'annehmen' | 'ablehnen';

/** Darf jetzt entschieden werden? Grund, wenn nicht. */
export function entscheidbar(
  a: { status: unknown; gueltig_bis?: unknown },
  entscheidung: Entscheidung,
  jetzt: Date,
): { ja: true } | { ja: false; grund: string; code: number } {
  if (a.status === 'angenommen' || a.status === 'abgelehnt') return { ja: false, grund: 'Dieses Angebot wurde bereits entschieden.', code: 409 };
  if (a.status !== 'gesendet') return { ja: false, grund: 'Dieses Angebot ist noch nicht freigegeben.', code: 404 };
  if (entscheidung === 'annehmen' && abgelaufen(a.gueltig_bis, jetzt)) {
    return { ja: false, grund: 'Das Angebot ist leider abgelaufen. Bitte fragen Sie ein neues an.', code: 409 };
  }
  return { ja: true };
}

/** Name der annehmenden Person: getrimmt, 3–120 Zeichen, mindestens zwei Buchstaben. Sonst null. */
export function zusageName(roh: unknown): string | null {
  const s = String(roh ?? '').replace(/\s+/g, ' ').trim();
  if (s.length < 3 || s.length > 120) return null;
  if ((s.match(/\p{L}/gu) ?? []).length < 2) return null;
  return s;
}
