import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { VERKAUF, DEFAULT_VERKAUF } from '@/app/vorschau/_lib/branchen-verkauf';

// ============================================================================
// ARGONAUT OS · app/api/marketing/lp-vorschlag/route.ts  (LP Paket 1b)
//
// Liefert einen branchenspezifischen Text-Vorschlag fuer eine Landingpage,
// aus der vorhandenen Verkaufs-Copy (branchen-verkauf.ts, dieselbe Quelle wie
// die 698 Website-Branchenseiten). Der Nutzer waehlt seine Kategorie im Editor,
// dieser Endpunkt fuellt Untertitel + Nutzen-Punkte vor (frei ueberschreibbar).
//
//   GET ?kategorie=<eine der 19>&typ=<newsletter|beratung|freebie|aktion>
//   -> { ok, untertitel, nutzen[] }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const url = new URL(req.url);
  const kategorie = (url.searchParams.get('kategorie') || '').trim();
  const pack = (kategorie && VERKAUF[kategorie]) || DEFAULT_VERKAUF;
  const label = kategorie || 'Ihr Betrieb';
  const fuellen = (s: string) => (s || '').replace(/\{branche\}/g, label).replace(/\{kategorie\}/g, label);

  const untertitel = fuellen(pack.heroSub);
  const nutzen = (pack.beweis || []).map((b) => `${b.titel} — ${fuellen(b.text)}`);

  return NextResponse.json({ ok: true, untertitel, nutzen });
}
