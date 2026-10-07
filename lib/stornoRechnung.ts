// ============================================================================
// ARGONAUT OS · lib/stornoRechnung.ts — Paket 267 (07.10.2026) · Stornorechnung als Beleg
//
// BEFUND: „Stornieren" setzte nur den Status. Eine Rechnung, die schon beim
// Kunden ist, braucht einen eigenen Beleg mit eigener Nummer, der auf das
// Original verweist (GoBD; Berichtigung nach § 14 / § 17 UStG). Den gab es nur
// als freies Dokument ohne Nummernkreis und ohne Ablage.
//
// JETZT: Die Datenbank-Funktion p267_storno_erstellen legt die Stornorechnung
// in einem Schritt an (eigene Nummer, alle Positionen mit negativer Menge,
// festgeschrieben) und setzt das Original auf „storniert". Beide bleiben
// „storniert" und zählen damit — wie bisher — nicht als Umsatz.
//
// Diese Datei: Regeln für die Knöpfe, Titel und Texte. Reine Logik, node-testbar.
// ============================================================================

export type StornoLage = {
  status: string | null | undefined;     // zahlungsstatus
  festgeschrieben: boolean;              // verschickt / abgelegt
  istStorno: boolean;                    // diese Rechnung IST eine Stornorechnung
  hatStorno: boolean;                    // zu dieser Rechnung gibt es eine Stornorechnung
  istChef: boolean;
};

export type StornoKnoepfe = {
  stornorechnung: boolean;   // „Stornorechnung erstellen"
  nurStatus: boolean;        // „Stornieren" ohne Beleg (nur nie verschickte Rechnungen)
  reaktivieren: boolean;
  hinweis: string | null;
};

/**
 * Welche Knöpfe zeigt die Rechnung?
 * - Verschickte (festgeschriebene) Rechnungen: nur noch per Stornorechnung.
 * - Nie verschickte: Status „storniert" genügt, Stornorechnung geht auch.
 * - Schon (nur per Status) storniert: Stornorechnung nachträglich möglich.
 * - Mit Stornorechnung: nichts mehr — kein Reaktivieren.
 * - Mitarbeiter: keine Knöpfe (wie bisher: Stornieren nur Geschäftsleitung).
 */
export function stornoKnoepfe(l: StornoLage): StornoKnoepfe {
  const aus: StornoKnoepfe = { stornorechnung: false, nurStatus: false, reaktivieren: false, hinweis: null };
  if (l.istStorno) return { ...aus, hinweis: 'Dies ist eine Stornorechnung. Sie bleibt unverändert erhalten.' };
  if (l.hatStorno) return { ...aus, hinweis: 'Diese Rechnung ist durch eine Stornorechnung aufgehoben. Für eine Korrektur erstellen Sie eine neue Rechnung.' };
  if (!l.istChef) return aus;
  const storniert = l.status === 'storniert';
  if (storniert) {
    return { stornorechnung: true, nurStatus: false, reaktivieren: true, hinweis: l.festgeschrieben ? 'Storniert, aber ohne Stornorechnung. War die Rechnung beim Kunden, erstellen Sie die Stornorechnung nachträglich.' : null };
  }
  return { stornorechnung: true, nurStatus: !l.festgeschrieben, reaktivieren: false, hinweis: null };
}

/** Überschrift auf dem PDF. */
export function dokumentTitel(rechnungsart: string | null | undefined, istStorno: boolean): string {
  if (istStorno) return 'Stornorechnung';
  if (rechnungsart === 'schluss') return 'Schlussrechnung';
  if (rechnungsart === 'abschlag') return 'Abschlagsrechnung';
  return 'Rechnung';
}

function deDatum(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
}

/** Pflichtverweis der Stornorechnung auf das Original. */
export function stornoBezugText(nummer: string | null | undefined, datum: string | null | undefined): string {
  return `Storno zur Rechnung Nr. ${nummer || '—'} vom ${deDatum(datum)}. Alle Positionen und Beträge der ursprünglichen Rechnung werden hiermit mit umgekehrtem Vorzeichen aufgehoben.`;
}

/** Zahlungsblock der Stornorechnung: nie eine Zahlungsaufforderung. */
export function stornoZahlungText(bezahltOriginal: number | null | undefined): string {
  const b = Number(bezahltOriginal);
  if (Number.isFinite(b) && b > 0) {
    return `Auf die ursprüngliche Rechnung haben Sie bereits ${b.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € gezahlt. Diesen Betrag erstatten wir Ihnen.`;
  }
  return 'Die ursprüngliche Rechnung ist damit aufgehoben. Sie müssen nichts zahlen.';
}

/** Rückfrage vor dem Anlegen. */
export function stornoFrage(nummer: string | null | undefined, bezahlt: number | null | undefined): string {
  const b = Number(bezahlt);
  return `Stornorechnung zu ${nummer || 'dieser Rechnung'} erstellen?\n\n`
    + 'Es entsteht ein eigener Beleg mit neuer Nummer, der alle Positionen mit umgekehrtem Vorzeichen aufhebt. '
    + 'Er wird sofort festgeschrieben, die Rechnung wird „storniert". Das lässt sich nicht rückgängig machen.'
    + (Number.isFinite(b) && b > 0 ? `\n\nAchtung: Auf diese Rechnung sind schon ${b.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € eingegangen — die Erstattung an den Kunden veranlassen Sie selbst.` : '');
}

/** Fehlermeldung der Datenbank in Klartext (fehlendes SQL erkennen). */
export function stornoFehlerText(msg: string | null | undefined): string {
  const m = String(msg || '');
  if (/p267_storno_erstellen|Could not find the function|PGRST202|does not exist/i.test(m)) return 'Stornorechnungen gehen erst, wenn SQL Paket 267 ausgeführt ist.';
  if (/Geschäftsleitung|42501/i.test(m) && /Storno/i.test(m)) return 'Stornorechnungen erstellt nur die Geschäftsleitung.';
  const klar = m.replace(/^.*?ERROR:\s*/i, '').trim();
  return klar ? `Stornorechnung nicht erstellt: ${klar}` : 'Stornorechnung nicht erstellt.';
}

/** Grund bereinigen (höchstens 300 Zeichen, ohne Steuerzeichen) — leer = null. */
export function grundBereinigen(roh: unknown): string | null {
  if (typeof roh !== 'string') return null;
  const t = roh.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
  return t || null;
}

/** Spiegel der Datenbank-Regel für Positionen (für Tests und Vorschau): Menge und Netto negativ. */
export function stornoPositionen<T extends { menge?: number | null; gesamt_netto?: number | null }>(pos: readonly T[]): T[] {
  return (pos || []).map((p) => ({ ...p, menge: -(Number(p.menge) || 0) || 0, gesamt_netto: -(Number(p.gesamt_netto) || 0) || 0 }));
}
