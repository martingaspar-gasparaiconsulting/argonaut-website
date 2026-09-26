// ============================================================================
// ARGONAUT OS · lib/objektzeitRechnung.ts — Paket G, Punkt G11 (26.09.2026)
//
// ▄▄▄ DIE ZWEI FEHLER ▄▄▄
//  1. Doppel-Abrechnung: /api/rechnung-aus-objektzeit las die offenen Zeiten,
//     legte die Rechnung an und markierte die Zeiten ERST DANACH. Zwei Klicks
//     kurz hintereinander (oder zwei Tabs) ergaben zwei Rechnungen über
//     dieselben Stunden. Schlug das Markieren fehl, wurde der Fehler nur ins
//     Log geschrieben — beim nächsten Klick kamen dieselben Zeiten wieder.
//  2. Die Rechnung entstand sofort als „offen", aber OHNE Empfänger — ein
//     Beleg, den man so nicht verschicken darf (§ 14 Abs. 4 UStG verlangt
//     Name und Anschrift des Leistungsempfängers).
//
// ▄▄▄ DIE LÖSUNG ▄▄▄
//  · Erst RESERVIEREN, dann abrechnen: Die Zeiten werden in einem Schritt
//    von abgerechnet=false auf true gesetzt — nur die, die dabei wirklich
//    umspringen, kommen auf die Rechnung. Ein zweiter Klick findet nichts mehr.
//    Scheitert danach etwas, werden genau diese Zeiten wieder freigegeben.
//  · Ohne Empfänger keine Rechnung: Kontakt aus der Liste oder ein Name.
//
// Reine Funktionen. Node-getestet: tests/gPaketG9G14.test.mjs
// ============================================================================

export type EmpfaengerEingabe = { kontaktId?: unknown; empfaengerName?: unknown };
export type EmpfaengerErgebnis =
  | { ok: true; kontaktId: string | null; name: string | null }
  | { ok: false; fehler: string };

/** Prüft den Empfänger: ein Kontakt ODER ein Name ist Pflicht. */
export function pruefeEmpfaenger(e: EmpfaengerEingabe): EmpfaengerErgebnis {
  const kontaktId = typeof e.kontaktId === 'string' && e.kontaktId.trim() ? e.kontaktId.trim() : null;
  const name = typeof e.empfaengerName === 'string' && e.empfaengerName.trim() ? e.empfaengerName.trim().slice(0, 200) : null;
  if (!kontaktId && !name) return { ok: false, fehler: 'Bitte einen Empfänger wählen oder eintragen — eine Rechnung ohne Empfänger darf nicht raus.' };
  return { ok: true, kontaktId, name };
}

/** Nur die Zeiten, die beim Reservieren wirklich umgesprungen sind. */
export function reservierteZeiten<T extends { id: string }>(kandidaten: T[], umgesprungen: { id: string }[] | null | undefined): T[] {
  const ids = new Set((umgesprungen ?? []).map((z) => z.id));
  return kandidaten.filter((z) => ids.has(z.id));
}
