// ============================================================================
// ARGONAUT OS · lib/rechnungAnschrift.ts — Paket 268 (07.10.2026)
//
// Anschrift eines Freitext-Empfängers (rechnungen.empfaenger_anschrift, z. B.
// aus dem Fahrzeugverkauf) in Straße / PLZ / Ort zerlegen — für die
// E-Rechnung, die die Teile getrennt braucht. Erwartet wird die übliche Form
// „Straße Nr.\n12345 Ort" (weitere Zeilen davor = Zusatz). Was sich nicht
// eindeutig lesen lässt, bleibt leer — lieber eine Warnung im XML als ein
// falscher Ort.
// ============================================================================

export type Anschrift = { strasse: string; plz: string; ort: string; land: string };

export function anschriftZerlegen(roh: string | null | undefined): Anschrift {
  const zeilen = String(roh ?? '').split(/\r?\n|,\s*/).map((z) => z.trim()).filter(Boolean);
  const leer: Anschrift = { strasse: '', plz: '', ort: '', land: 'DE' };
  if (!zeilen.length) return leer;
  let land = 'DE';
  let letzte = zeilen[zeilen.length - 1];
  // „AT-1010 Wien" / „A-1010 Wien" / „D-71032 Böblingen"
  const mitLand = letzte.match(/^([A-Z]{1,2})-(\d{4,5})\s+(.+)$/);
  if (mitLand) {
    const k = mitLand[1] === 'A' ? 'AT' : mitLand[1] === 'D' ? 'DE' : mitLand[1] === 'CH' ? 'CH' : mitLand[1];
    land = /^[A-Z]{2}$/.test(k) ? k : 'DE';
    letzte = `${mitLand[2]} ${mitLand[3]}`;
  }
  const m = letzte.match(/^(\d{4,5})\s+(.+)$/);
  if (!m) return { ...leer, strasse: zeilen.join(', ') };
  return { strasse: zeilen.slice(0, -1).join(', '), plz: m[1], ort: m[2], land };
}
