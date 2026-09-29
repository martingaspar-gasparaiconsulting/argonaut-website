// ============================================================================
// ARGONAUT OS · lib/kontoSchutz.ts  (Paket 169 · Konto-Schutz)
//
// ▄▄▄ WARUM ▄▄▄
// Drei Server-Wege fassen fremde Login-Konten mit dem Service-Schluessel an:
//   /api/hr/mitarbeiter-einladen  (legt Zugang an)
//   /api/hr/zugang-reset          (setzt Passwort neu)
//   /api/zwei-faktor/team         (loescht die Zwei-Faktor-Anmeldung)
// Bis Paket 169 vertrauten sie der Spalte mitarbeiter.auth_user_id bzw. der
// E-Mail-Adresse. Beides kann der Chef selbst eintragen. Wer dort die Kennung
// oder Adresse einer FREMDEN Person eintrug, bekam deren Passwort bzw. schaltete
// deren Zwei-Faktor ab (Claude-Befund K1/K2, Pruefung 29.09.2026).
//
// Diese Datei entscheidet rein und node-testbar, ob ein Ziel-Konto zu genau
// diesem Mitarbeiter dieses Betriebs gehoert. Die Daten sammelt
// lib/kontoSchutzServer.ts — immer mit dem Service-Schluessel, nie vom Browser.
//
// Kennzeichen: Jedes Konto, das ARGONAUT fuer einen Mitarbeiter anlegt, bekommt
// app_metadata.argonaut_mitarbeiter_von = <Betrieb>. app_metadata kann nur der
// Server schreiben (der Nutzer selbst nicht). Alte Konten ohne Kennzeichen
// gelten nur, wenn ALLES andere passt, und bekommen es beim ersten sauberen
// Zuruecksetzen nachgetragen.
// ============================================================================

export const KONTO_KENNZEICHEN = 'argonaut_mitarbeiter_von';

export type KontoZiel = {
  /** Kennung des Ziel-Kontos (auth.users.id). */
  zielId: string;
  /** Betrieb des Aufrufers (Chef-Kennung). */
  betrieb: string;
  /** Betreiber-Kennung aus ANALYSE_BETREIBER_ID (leer = nicht gesetzt). */
  betreiberId?: string | null;
  /** E-Mail des Ziel-Kontos laut Anmelde-Dienst. */
  zielEmail?: string | null;
  /** E-Mail in der Mitarbeiter-Zeile. */
  maEmail?: string | null;
  /** app_metadata[KONTO_KENNZEICHEN] des Ziel-Kontos. */
  kennzeichen?: string | null;
  /** Adresse steht in customers (= Chef-/Kunden-Konto). */
  istKunde: boolean;
  /** profiles.role des Ziel-Kontos. */
  rolle?: string | null;
  /** Anzahl Mitarbeiter-Zeilen ANDERER Betriebe mit dieser Kennung. */
  fremdVerknuepft: number;
  /** Anzahl Mitarbeiter-Zeilen DIESES Betriebs mit dieser Kennung. */
  eigeneVerknuepft: number;
};

export type KontoUrteil = { ja: true; kennzeichenNachtragen: boolean } | { ja: false; grund: string };

const NEIN = (grund: string): KontoUrteil => ({ ja: false, grund });

export function normMail(m: string | null | undefined): string {
  return typeof m === 'string' ? m.trim().toLowerCase() : '';
}

export function istKennung(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Darf der Server dieses Konto fuer diesen Mitarbeiter anfassen
 * (Passwort neu setzen, Zwei-Faktor loeschen)?
 * Reihenfolge: harte Verbote zuerst, dann Zugehoerigkeit.
 */
export function kontoGehoertZumMitarbeiter(z: KontoZiel): KontoUrteil {
  if (!istKennung(z.zielId) || !istKennung(z.betrieb)) return NEIN('Zugang nicht eindeutig zuzuordnen.');
  if (z.zielId === z.betrieb) return NEIN('Das Konto der Geschäftsleitung wird hier nicht verändert.');
  if (z.betreiberId && z.zielId === z.betreiberId) return NEIN('Dieses Konto wird hier nicht verändert.');
  const rolle = (z.rolle ?? '').toLowerCase();
  if (rolle === 'admin' || rolle === 'betreiber') return NEIN('Dieses Konto wird hier nicht verändert.');
  if (z.istKunde) return NEIN('Diese E-Mail gehört zu einem Chef-/Kunden-Konto und wird hier nicht verändert.');
  if (z.fremdVerknuepft > 0) return NEIN('Dieser Zugang gehört zu einem anderen Betrieb.');
  if (z.eigeneVerknuepft !== 1) return NEIN('Zugang nicht eindeutig zuzuordnen.');

  if (z.kennzeichen) {
    if (z.kennzeichen !== z.betrieb) return NEIN('Dieser Zugang gehört zu einem anderen Betrieb.');
    return { ja: true, kennzeichenNachtragen: false };
  }
  // Altes Konto ohne Kennzeichen: nur wenn die Adresse genau passt.
  const a = normMail(z.zielEmail);
  if (!a || a !== normMail(z.maEmail)) return NEIN('Die E-Mail des Zugangs passt nicht zum Mitarbeiter.');
  return { ja: true, kennzeichenNachtragen: true };
}

/** Freitext fuer customers-Abgleich per ilike: % und _ maskieren. */
export function ilikeGenau(mail: string): string {
  return normMail(mail).replace(/[\\%_]/g, (c) => '\\' + c);
}
