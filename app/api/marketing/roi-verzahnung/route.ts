import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { verzahneKampagnen } from '@/lib/marketingRoi';
import { kiFetch } from '@/lib/ki';

// ============================================================================
// ARGONAUT OS · app/api/marketing/roi-verzahnung/route.ts
// (Marketing-Ausbau · Punkt 5 — Werbe-Ausgaben ↔ Website-Leads ↔ echter Umsatz)
//
// Liest RLS-scoped die Kampagnen (Budget = Kosten), die Leads (Attribution über
// leads.kampagne_id) und die verknüpften Rechnungen (echter Umsatz), verzahnt
// beides (lib/marketingRoi) und lässt die KI daraus einen kurzen Klartext-Rat
// formulieren (haiku; erfindet keine Zahlen). Für Kunde UND Betreiber.
// GET -> { ok, summe, zeilen, klartext }
// ============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;
type Row = Record<string, unknown>;

async function hole(sb: Sb, tabelle: string, spalten: string): Promise<Row[]> {
  try {
    const { data, error } = await sb.from(tabelle).select(spalten).limit(5000);
    if (error) return [];
    return (data ?? []) as Row[];
  } catch {
    return [];
  }
}

function euro(n: number): string {
  return (n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  // Kampagnen + Leads RLS-scoped.
  const [kampagnen, leadsRoh] = await Promise.all([
    hole(supabase, 'marketing_kampagnen', 'id, name, status, budget, rechnung_id'),
    hole(supabase, 'leads', 'kampagne_id'),
  ]);

  // Nur die tatsächlich verknüpften Rechnungen laden (RLS-scoped, defensiv).
  const rechnungIds = Array.from(new Set(
    kampagnen.map((k) => (typeof k.rechnung_id === 'string' ? k.rechnung_id : '')).filter(Boolean),
  ));
  let rechnungen: Row[] = [];
  if (rechnungIds.length) {
    try {
      const { data } = await supabase
        .from('rechnungen')
        .select('id, brutto_summe, bezahlter_betrag, zahlungsstatus')
        .in('id', rechnungIds);
      rechnungen = (data ?? []) as Row[];
    } catch { rechnungen = []; }
  }

  const { zeilen, summe } = verzahneKampagnen({ kampagnen, leads: leadsRoh, rechnungen });

  // KI-Klartext (best effort — nutzt nur die berechneten Zahlen).
  let klartext = '';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && summe.kampagnen > 0) {
    try {
      const sys = `Du bist ein nüchterner, ermutigender Marketing-Berater für einen deutschen Mittelstandsbetrieb. Erkläre in 3–5 Sätzen Klartext, was die ROI-Zahlen bedeuten und was als Nächstes zu tun ist (z. B. gut laufende Kampagnen ausbauen, teure mit hohem Kosten-je-Lead prüfen). Sie-Ansprache, konkret, ohne Floskeln. ERFINDE KEINE Zahlen — nutze nur die genannten. Kein Markdown, nur Fließtext.`;
      const fakten = [
        `Kampagnen: ${summe.kampagnen} (davon ${summe.kampagnenMitUmsatz} mit zugeordnetem Umsatz).`,
        `Kosten/Budget gesamt: ${euro(summe.budgetGesamt)}.`,
        `Website-Leads gesamt: ${summe.leadsGesamt} (${summe.leadsAttribuiert} einer Kampagne zugeordnet, ${summe.leadsOrganisch} organisch/direkt).`,
        summe.kostenJeLeadGesamt != null ? `Kosten je zugeordnetem Lead: ${euro(summe.kostenJeLeadGesamt)}.` : 'Kosten je Lead noch nicht berechenbar.',
        summe.roiGesamt != null ? `Belegter Umsatz: ${euro(summe.umsatzBelegt)}, ROI gesamt: ${Math.round(summe.roiGesamt * 100)} %.` : 'Noch kein Umsatz mit einer Kampagne verknüpft — echter ROI daher offen.',
      ].join('\n');
      const kiRes = await kiFetch('marketing-roi-verzahnung', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 400, system: sys, messages: [{ role: 'user', content: [{ type: 'text', text: 'Zahlen:\n' + fakten }] }] }),
      });
      if (kiRes.ok) {
        const d = await kiRes.json();
        const blocks: Array<{ type?: string; text?: string }> = Array.isArray(d.content) ? d.content : [];
        klartext = blocks.filter((x) => x.type === 'text').map((x) => x.text || '').join('').trim();
      }
    } catch { /* KI optional — Zahlen stehen auch ohne Klartext */ }
  }

  return NextResponse.json({ ok: true, summe, zeilen, klartext });
}
