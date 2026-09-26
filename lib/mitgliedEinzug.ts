// ============================================================================
// ARGONAUT OS · lib/mitgliedEinzug.ts — Paket G, Punkt G9 (26.09.2026)
//
// ▄▄▄ DER FEHLER ▄▄▄
// Die Mitglieder-Seite zog per SEPA nur Mitglieder mit Status „aktiv" ein.
// Die Kündigung (Verträge-Seite) setzt den Status sofort auf „gekuendigt" —
// auch wenn der Vertrag erst in drei Monaten endet. Folge: Ab dem Tag der
// Kündigung fiel das Mitglied aus dem Einzug, obwohl es bis zum Vertragsende
// zahlen muss. Dem Betrieb fehlen die Beiträge der Kündigungsfrist.
//
// ▄▄▄ DIE REGEL ▄▄▄
//   aktiv                         -> im Einzug
//   gekuendigt, Ende >= Stichtag  -> im Einzug (Vertrag läuft noch)
//   gekuendigt, Ende <  Stichtag  -> nicht mehr
//   gekuendigt ohne Enddatum      -> nicht (lieber kein Einzug als ein falscher)
//   pausiert und alles andere     -> nicht
// Stichtag ist der Ausführungstag der SEPA-Datei, nicht heute.
//
// Reine Funktionen, keine Hooks/Supabase. Node-getestet: tests/gPaketG9G14.test.mjs
// ============================================================================

export type MitgliedEinzugLite = { status?: string | null; kuendigung_zum?: string | null };

function isoTag(s: string | null | undefined): string | null {
  const t = String(s ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Läuft der Beitrag dieses Mitglieds am Stichtag (YYYY-MM-DD) noch? */
export function imEinzug(m: MitgliedEinzugLite, stichtag: string): boolean {
  const st = String(m.status ?? '').trim().toLowerCase();
  if (st === 'aktiv') return true;
  if (st !== 'gekuendigt') return false;
  const ende = isoTag(m.kuendigung_zum);
  const tag = isoTag(stichtag);
  if (!ende || !tag) return false;
  return ende >= tag;
}

/** Gekündigt, aber noch zahlend — für den Hinweis in der Liste. */
export function laeuftAus(m: MitgliedEinzugLite, stichtag: string): boolean {
  return String(m.status ?? '').trim().toLowerCase() === 'gekuendigt' && imEinzug(m, stichtag);
}
