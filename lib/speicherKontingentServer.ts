// ============================================================================
// ARGONAUT OS · lib/speicherKontingentServer.ts — Paket 258 (07.10.2026)
//
// Kontingent eines Kunden nach AGB § 9a.1: 100 GB je Mitarbeiter, gepoolt im
// Betrieb, nie unter der alten Grenze der Tarif-Stufe (lib/speicher.ts).
//
// Ablauf:
//   1. Betrieb bestimmen: Ist die angemeldete Person Mitarbeiter, zählt der
//      Betrieb ihres Chefs, sonst sie selbst.
//   2. Nutzer zählen: Chef + angelegte Mitarbeiter des Betriebs.
//   3. Profil des Betriebs lesen (select('*'), damit eine fehlende Spalte
//      stufe/plan nicht die ganze Abfrage scheitern lässt).
//
// Fällt eine Abfrage aus, gilt der sichere Rest: 1 Nutzer = 100 GB, das ist
// mehr als die alte Standard-Grenze von 25 GB. Ein kaputter Wächter darf
// niemanden aussperren.
// ============================================================================

import { limitBytesAgb } from './speicher';

type Antwort = PromiseLike<{ data: unknown; error: unknown }>;
type Db = {
  from: (t: string) => {
    select: (s: string) => {
      eq: (k: string, v: string) => Antwort & { maybeSingle: () => Antwort };
    };
  };
};

export type Kontingent = { betrieb: string; nutzer: number; stufe: string | null; zusatzGb: number; limit: number };

// db als unknown: der volle Supabase-Typ gegen Db zu pruefen sprengt tsc (TS2589).
export async function speicherKontingent(dbRoh: unknown, userId: string): Promise<Kontingent> {
  const db = dbRoh as Db;
  let betrieb = userId;
  let nutzer = 1;
  let stufe: string | null = null;
  let zusatzGb = 0;

  try {
    const { data } = await db.from('mitarbeiter').select('owner_user_id').eq('auth_user_id', userId).maybeSingle();
    const chef = (data as { owner_user_id?: string | null } | null)?.owner_user_id;
    if (chef) betrieb = String(chef);
  } catch { /* Betrieb = angemeldete Person */ }

  try {
    const { data, error } = await db.from('mitarbeiter').select('id').eq('owner_user_id', betrieb);
    if (!error && Array.isArray(data)) nutzer = 1 + data.length;
  } catch { /* 1 Nutzer */ }

  try {
    const { data } = await db.from('profiles').select('*').eq('id', betrieb).maybeSingle();
    const p = (data ?? {}) as { stufe?: string | null; plan?: string | null; zusatz_speicher_gb?: number | null };
    stufe = (p.stufe || p.plan || null) as string | null;
    zusatzGb = Number(p.zusatz_speicher_gb) || 0;
  } catch { /* Stufe unbekannt, kein Zusatz */ }

  return { betrieb, nutzer, stufe, zusatzGb, limit: limitBytesAgb(stufe, nutzer, zusatzGb) };
}
