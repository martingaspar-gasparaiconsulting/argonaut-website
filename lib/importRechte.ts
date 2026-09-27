// ============================================================================
// ARGONAUT OS · lib/importRechte.ts — Wer darf was importieren?
// (Paket 137, 27.09.2026)
//
// Martins Vorgabe: Mitarbeiter duerfen je nach Freigabe arbeiten. Das
// Import-Center fragte bisher nur „Chef oder nicht" — ein Mitarbeiter, der
// das Lager nur ANSEHEN darf, haette per Datei Bestaende setzen koennen.
//
// Ab hier gilt dieselbe Wahrheit wie ueberall (lib/rechte.ts, Seite /rechte):
//   · Chef (keine mitarbeiter-Zeile)            -> alles
//   · Ziel nur fuer die Geschaeftsleitung      -> nur Chef
//   · Bereich des Ziels nur fuer den Chef      -> nur Chef
//   · Mitarbeiter braucht den Bereich (module) UND „darf ändern"
//     (schreib_module). Ein Import legt an UND aendert — beides ist „ändern".
//   · Fehlt die Spalte schreib_module (altes Datenbank-Update), gilt wie
//     bisher der Bereich allein — niemand wird durch ein Update ausgesperrt.
//
// Der Bereich eines Ziels ergibt sich aus dem Pfad, auf den das Ziel nach
// dem Import fuehrt (ergebnisHref, sonst die Karte im Katalog), und dem
// laengsten passenden Menuepunkt mit Modul-Schluessel.
//
// Reine Funktionen — node-testbar. Die Datenbank-Regeln (RLS) bleiben
// zusaetzlich die harte Grenze.
// ============================================================================

import { zielDef } from './importParser';
import { importQuellen } from './importKatalog';
import { NAV_LINKS, ALLE_MODULE, istNurChefPfad, pfadPasst } from './rechte';

/** Pfad, auf den ein Import-Ziel fuehrt — daran haengt sein Bereich. */
export function zielPfad(zielKey: string): string | null {
  const z = zielDef(zielKey);
  if (!z) return null;
  if (z.ergebnisHref) return z.ergebnisHref;
  return importQuellen().find((q) => q.motor === zielKey)?.zielHref ?? null;
}

/** Modul-Schluessel des Bereichs (laengster passender Menuepunkt). */
export function zielModul(zielKey: string): string | null {
  const pfad = zielPfad(zielKey);
  if (!pfad) return null;
  const treffer = NAV_LINKS
    .filter((l) => l.modul && pfadPasst(pfad, l.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return treffer?.modul ?? null;
}

export function modulLabel(modul: string): string {
  return ALLE_MODULE.find((m) => m.key === modul)?.label ?? modul;
}

export type RechtStand = {
  /** true = Chef/Inhaber (keine mitarbeiter-Zeile). */
  chef: boolean;
  /** Bereiche, die der Mitarbeiter sehen darf. */
  module: readonly string[];
  /** Bereiche mit „darf ändern" — null = Spalte fehlt in der Datenbank. */
  schreibModule: readonly string[] | null;
};

export type RechtErgebnis = { ok: true } | { ok: false; grund: string };

export function importErlaubt(zielKey: string, stand: RechtStand | null | undefined): RechtErgebnis {
  const z = zielDef(zielKey);
  if (!z) return { ok: false, grund: 'Unbekanntes Import-Ziel.' };
  // Solange die Rechte nicht geladen sind: nichts freigeben.
  if (!stand) return { ok: false, grund: 'Ihre Rechte werden noch geladen …' };
  if (stand.chef) return { ok: true };
  if (z.nurChef) return { ok: false, grund: 'Diese Daten importiert nur die Geschäftsleitung.' };
  const pfad = zielPfad(zielKey);
  if (pfad && istNurChefPfad(pfad)) return { ok: false, grund: 'Dieser Bereich ist der Geschäftsleitung vorbehalten.' };
  const modul = zielModul(zielKey);
  if (!modul) return { ok: false, grund: 'Dieses Ziel ist noch keinem Bereich zugeordnet — den Import macht die Geschäftsleitung.' };
  const name = modulLabel(modul);
  if (!stand.module.includes(modul)) {
    return { ok: false, grund: `Sie haben keinen Zugriff auf „${name}". Die Geschäftsleitung kann ihn unter Rechte freigeben.` };
  }
  if (stand.schreibModule !== null && !stand.schreibModule.includes(modul)) {
    return { ok: false, grund: `In „${name}" dürfen Sie nur ansehen. Für den Import braucht es „darf ändern" — das gibt die Geschäftsleitung unter Rechte frei.` };
  }
  return { ok: true };
}

/** Liest die Zeile aus mitarbeiter_rechte vorsichtig ein. */
export function leseRechtStand(zeile: unknown, mitSchreibSpalte: boolean): RechtStand {
  const o = (zeile && typeof zeile === 'object' ? zeile : {}) as Record<string, unknown>;
  const liste = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { chef: false, module: liste(o.module), schreibModule: mitSchreibSpalte ? liste(o.schreib_module) : null };
}
