// ============================================================================
// ARGONAUT OS · lib/speicher.ts — Speicher-Grenzen je Tarif (reine Logik)
//
// KEINE Supabase-Aufrufe, KEINE React-Hooks — nur pure Funktionen, node-testbar.
// Der Speicher-Wächter (in den Upload-Routen) misst die aktuelle Belegung eines
// Kunden und vergleicht sie mit seinem Kontingent = Tarif-Grundmenge + optional
// dazugebuchtes Speicher-Paket (profiles.zusatz_speicher_gb).
//
// >>> HIER die Grenzen anpassen <<< — das sind bewusst großzügige Platzhalter,
// damit heute niemand ausgesperrt wird. Martin setzt später echte Werte.
// ============================================================================

const GB = 1024 * 1024 * 1024;

// AGB § 9a.1 (Paket 258, 07.10.2026): 100 GB je Mitarbeiter, gepoolt im Betrieb,
// dazu Zusatzbloecke. Gleicher Wert wie lib/tarif.ts SPEICHER_INKL_PRO_MA_GB —
// tests/speicherAgbP258 wacht, dass beide gleich bleiben (hier kein Import,
// damit die Datei ohne Abhaengigkeiten bleibt).
export const AGB_GB_JE_NUTZER = 100;

// Grundmenge je Tarif-Stufe in GB. Enterprise = 1 TB (1024 GB).
export const SPEICHER_LIMIT_GB: Record<string, number> = {
  solo: 5,
  mini: 15,
  klein: 50,
  mittel: 150,
  gross: 500,
  enterprise: 1024,
};

// Fallback für unbekannte/leere Stufe — großzügig, damit nichts bricht.
export const STANDARD_LIMIT_GB = 25;

/** Kontingent in Bytes = Tarif-Grundmenge (+ dazugebuchtes Speicher-Paket in GB). */
export function limitBytes(stufe?: string | null, zusatzGb?: number | null): number {
  const basis = SPEICHER_LIMIT_GB[(stufe || '').trim().toLowerCase()] ?? STANDARD_LIMIT_GB;
  const zusatzRaw = Number(zusatzGb);
  const zusatz = Number.isFinite(zusatzRaw) && zusatzRaw > 0 ? zusatzRaw : 0;
  return Math.round((basis + zusatz) * GB);
}

/** Passt eine neue Datei (neueBytes) noch ins Kontingent? */
export function passtNochRein(genutztBytes: number, limit: number, neueBytes: number): boolean {
  const g = Math.max(0, Number(genutztBytes) || 0);
  const n = Math.max(0, Number(neueBytes) || 0);
  return g + n <= Math.max(0, Number(limit) || 0);
}

/** Statuswerte fürs Anzeigen (Balken, Prozent, voll?). */
export function speicherStatus(genutztBytes: number, limit: number): {
  genutzt: number; limit: number; frei: number; prozent: number; voll: boolean;
} {
  const genutzt = Math.max(0, Math.round(Number(genutztBytes) || 0));
  const lim = Math.max(0, Math.round(Number(limit) || 0));
  const frei = Math.max(0, lim - genutzt);
  const prozent = lim > 0 ? Math.min(100, Math.round((genutzt / lim) * 100)) : 100;
  return { genutzt, limit: lim, frei, prozent, voll: genutzt >= lim };
}

/** Menschlich lesbare Größe (KB/MB/GB). */
export function formatBytes(bytes: number): string {
  const b = Math.max(0, Number(bytes) || 0);
  const MB = 1024 * 1024;
  if (b >= GB) return (b / GB).toFixed(b >= 10 * GB ? 0 : 1) + ' GB';
  if (b >= MB) return (b / MB).toFixed(0) + ' MB';
  return Math.max(0, Math.round(b / 1024)) + ' KB';
}

// ============================================================================
// Paket 258 · Kontingent nach AGB-Formel
//
// Claude-Befund 07.10.2026: Die Upload-Routen lasen die Tarif-Stufe aus
// profiles.stufe bzw. profiles.plan. Passt der Wert zu keiner Stufe (oder fehlt
// die Spalte), griff STANDARD_LIMIT_GB = 25 GB — fuer praktisch jeden Betrieb.
// Die AGB versprechen aber 100 GB je Mitarbeiter (gepoolt).
//
// Neue Regel:  Kontingent = max(alte Grenze der Stufe, Nutzer x 100 GB) + Zusatz
//   · Nutzer = Chef + angelegte Mitarbeiter des Betriebs, mindestens 1.
//   · NIE unter der alten Grenze — niemand bekommt weniger als vorher.
//   · Kaputte Eingaben (NaN, negativ) zaehlen als 1 Nutzer bzw. 0 Zusatz.
// ============================================================================

/** Nutzerzahl sauber machen: ganze Zahl, mindestens 1. */
export function nutzerZahl(n?: number | null): number {
  const x = Math.floor(Number(n));
  return Number.isFinite(x) && x >= 1 ? x : 1;
}

/** Kontingent in GB nach AGB-Formel (ohne Zusatz). */
export function agbGrundGb(stufe: string | null | undefined, nutzer?: number | null): number {
  const alt = SPEICHER_LIMIT_GB[(stufe || '').trim().toLowerCase()] ?? STANDARD_LIMIT_GB;
  return Math.max(alt, nutzerZahl(nutzer) * AGB_GB_JE_NUTZER);
}

/** Kontingent in Bytes nach AGB-Formel: max(alte Grenze, Nutzer x 100 GB) + Zusatz. */
export function limitBytesAgb(stufe: string | null | undefined, nutzer?: number | null, zusatzGb?: number | null): number {
  const zusatzRaw = Number(zusatzGb);
  const zusatz = Number.isFinite(zusatzRaw) && zusatzRaw > 0 ? zusatzRaw : 0;
  return Math.round((agbGrundGb(stufe, nutzer) + zusatz) * GB);
}
