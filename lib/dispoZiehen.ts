// ============================================================================
// ARGONAUT OS · lib/dispoZiehen.ts — Paket 212 (05.10.2026) · Stufe 3 B6
// Plantafel per Ziehen und Ablegen (Drag & Drop)
//
// Mitbewerber-Abgleich (B6): Eine Plantafel, auf der man Einsätze mit der
// Maus auf einen anderen Monteur oder Tag zieht, gehört bei führenden
// Mitbewerbern zum Standard. Das Dispo-Board ging bisher nur über Klick →
// Fenster → Datum und Monteur ändern → Speichern.
//
// REGELN (hier, damit die Seite nichts falsch machen kann):
//  · Erledigte und abgesagte Einsätze bleiben, wo sie sind.
//  · „Unterwegs" und „Vor Ort" werden nicht umgeplant — der Monteur ist schon
//    los; das bleibt eine bewusste Entscheidung im Fenster.
//  · Beim Wechsel des Tages bleiben Uhrzeit und Dauer gleich (Ortszeit).
//  · Ein Einsatz ohne Zeit bekommt 08:00–09:00 am Zieltag.
//  · Ablegen auf „Unzugeordnet" nimmt nur den Monteur weg, die Zeit bleibt.
//  · Ablegen auf derselben Stelle ändert nichts.
//
// Rein, ohne Datenbank — node-testbar.
// ============================================================================

export const CHEF_ZEILE = '__chef__';
export const UNZUGEORDNET = '__unzugeordnet__';

export type ZiehEinsatz = {
  id: string;
  mitarbeiter_id: string | null;
  inhaber_einsatz?: boolean | null;
  beginn_am: string | null;
  ende_am: string | null;
  status: string | null;
};

export type ZiehZiel = { zeile: string; datum?: string | null };

export type ZiehPatch = {
  mitarbeiter_id: string | null;
  inhaber_einsatz: boolean;
  beginn_am?: string;
  ende_am?: string;
};

export type ZiehErgebnis =
  | { ok: true; patch: ZiehPatch; aenderung: string }
  | { ok: false; grund: string; nichts?: boolean };

const GESPERRT: Record<string, string> = {
  erledigt: 'Erledigte Einsätze werden nicht mehr verschoben.',
  abgesagt: 'Abgesagte Einsätze werden nicht verschoben.',
  unterwegs: 'Der Monteur ist schon unterwegs — bitte im Fenster bewusst umplanen.',
  vor_ort: 'Der Monteur ist schon vor Ort — bitte im Fenster bewusst umplanen.',
};

function pad(n: number) { return n < 10 ? '0' + n : String(n); }
export function tagIso(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/** Zeile des Boards, in der ein Einsatz heute steht. */
export function zeileVon(e: ZiehEinsatz): string {
  if (e.mitarbeiter_id) return e.mitarbeiter_id;
  return e.inhaber_einsatz ? CHEF_ZEILE : UNZUGEORDNET;
}

function datumGueltig(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00').getTime());
}

/** Was passiert, wenn der Einsatz auf dieses Ziel gezogen wird? */
export function verschiebePlan(e: ZiehEinsatz, ziel: ZiehZiel): ZiehErgebnis {
  const status = String(e.status ?? 'geplant').toLowerCase();
  if (GESPERRT[status]) return { ok: false, grund: GESPERRT[status] };
  if (!ziel || !ziel.zeile) return { ok: false, grund: 'Kein Ziel.' };

  const zuUnzugeordnet = ziel.zeile === UNZUGEORDNET;
  const patch: ZiehPatch = zuUnzugeordnet
    ? { mitarbeiter_id: null, inhaber_einsatz: false }
    : ziel.zeile === CHEF_ZEILE
      ? { mitarbeiter_id: null, inhaber_einsatz: true }
      : { mitarbeiter_id: ziel.zeile, inhaber_einsatz: false };

  const teile: string[] = [];
  if (zeileVon(e) !== ziel.zeile) teile.push('Zuständigkeit');

  if (!zuUnzugeordnet) {
    if (!datumGueltig(ziel.datum)) return { ok: false, grund: 'Ungültiger Zieltag.' };
    const [j, m, t] = ziel.datum.split('-').map(Number);
    const b = e.beginn_am ? new Date(e.beginn_am) : null;
    const en = e.ende_am ? new Date(e.ende_am) : null;
    if (b && !isNaN(b.getTime())) {
      if (tagIso(b) !== ziel.datum) {
        const dauer = en && !isNaN(en.getTime()) && en > b ? en.getTime() - b.getTime() : 60 * 60000;
        const neu = new Date(j, m - 1, t, b.getHours(), b.getMinutes(), 0, 0);
        patch.beginn_am = neu.toISOString();
        patch.ende_am = new Date(neu.getTime() + dauer).toISOString();
        teile.push('Tag');
      }
    } else {
      const neu = new Date(j, m - 1, t, 8, 0, 0, 0);
      patch.beginn_am = neu.toISOString();
      patch.ende_am = new Date(neu.getTime() + 60 * 60000).toISOString();
      teile.push('Tag');
    }
  }

  if (teile.length === 0) return { ok: false, grund: 'Keine Änderung.', nichts: true };
  return { ok: true, patch, aenderung: teile.join(' und ') };
}
