import { kiFetch } from '@/lib/ki';
import { createClient } from '@/lib/supabase-server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// ============================================================
// ARGONAUT OS · Website-Analyse · app/api/analyse-ki/route.ts
// „Das KI-Auge" fürs Analyse-Dashboard. Liest die echten Kennzahlen aus
// web_ereignisse (über die security-definer-Funktionen, Service-Role), fasst
// sie zusammen und lässt die KI eine Lagebewertung + genau 3 konkrete
// Handlungsempfehlungen erstellen. Nur eingeloggt. Modell claude-haiku-4-5,
// Kosten über kiFetch protokolliert. Body: { tage?: number, seite?: string }
// Antwort: { bewertung, empfehlungen[] } | { error }
// ============================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false } },
  );
}

const SYSTEM = `Du bist „das KI-Auge" von ARGONAUT OS — der KI-Analyst für die Website eines deutschen Mittelstands-Betriebs.
Du bekommst echte, anonyme Website-Kennzahlen. Deute sie nüchtern und gib klare, umsetzbare Empfehlungen.
Regeln:
- Sprache: Deutsch, Sie-Ansprache, konkret und ehrlich, keine Floskeln, kein Marketing-Sprech.
- ERFINDE KEINE Zahlen. Nutze nur die gelieferten Werte. Sind zu wenige Daten da, sag das offen.
- Antworte AUSSCHLIESSLICH als reines JSON in genau dieser Form:
  {"bewertung":"2-3 Sätze Lagebild","empfehlungen":["Handlung 1","Handlung 2","Handlung 3"]}
- Genau 3 Empfehlungen, jede eine konkrete Handlung (was tun + kurz warum). Kein Markdown, keine Erklärung außerhalb des JSON.`;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const tage = Math.min(Math.max(parseInt(String(body?.tage ?? 7), 10) || 7, 1), 365);
    const seite = typeof body?.seite === 'string' && body.seite ? body.seite.slice(0, 100) : 'argonaut-os';

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'KI nicht konfiguriert.' }, { status: 500 });

    const db = admin();
    const seit = new Date(Date.now() - tage * 86400000).toISOString();
    const p = { seit, p_seite: seite };
    const call = (fn: string) => db.rpc(fn, p);
    const [ov, ex, kn, ts, kl, vs] = await Promise.all([
      call('web_stats_uebersicht'), call('web_stats_erweitert'), call('web_nach_kanal'),
      call('web_top_seiten'), call('web_top_klicks'), call('web_verweil_je_seite'),
    ]);
    const u = ((ov.data as Array<{ aufrufe: number; besucher: number; klicks: number }>) || [])[0] || { aufrufe: 0, besucher: 0, klicks: 0 };
    const e = ((ex.data as Array<Record<string, number>>) || [])[0] || {};
    const kanaele = (kn.data as Array<{ kanal: string; aufrufe: number }>) || [];
    const topSeiten = (ts.data as Array<{ pfad: string; aufrufe: number }>) || [];
    const klicks = (kl.data as Array<{ ziel: string; anzahl: number }>) || [];
    const verweil = (vs.data as Array<{ pfad: string; avg_sek: number }>) || [];

    if ((u.aufrufe || 0) === 0) {
      return NextResponse.json({
        bewertung: 'Für diesen Zeitraum liegen noch keine Besuche vor. Sobald erste Besucher kommen, bewerte ich die Lage hier automatisch.',
        empfehlungen: [
          'Teile den Link zu deiner Seite aktiv — E-Mail-Signatur, Visitenkarte, QR-Code auf Flyern.',
          'Setze bei Anzeigen und Newslettern UTM-Parameter, damit die Herkunft sauber erfasst wird.',
          'Schau in 1–2 Tagen wieder rein — dann sind genug Daten für eine echte Bewertung da.',
        ],
      });
    }

    const zusammenfassung = [
      `Zeitraum: letzte ${tage} Tage`,
      `Besucher: ${u.besucher} · Seitenaufrufe: ${u.aufrufe} · erfasste Klicks: ${u.klicks}`,
      `Ø Verweildauer: ${e.avg_verweil_sek ?? '?'} Sekunden · Absprungrate: ${e.absprungrate ?? '?'} % · Seiten je Besuch: ${e.seiten_pro_sitzung ?? '?'}`,
      `Kanäle (Herkunft): ${kanaele.map((k) => `${k.kanal}: ${k.aufrufe}`).join(', ') || '—'}`,
      `Top-Seiten: ${topSeiten.slice(0, 6).map((s) => `${s.pfad} (${s.aufrufe})`).join(', ') || '—'}`,
      `Ø Verweildauer je Seite: ${verweil.slice(0, 6).map((v) => `${v.pfad}: ${v.avg_sek}s`).join(', ') || '—'}`,
      `Meist geklickt: ${klicks.slice(0, 8).map((c) => `${c.ziel} (${c.anzahl})`).join(', ') || '—'}`,
    ].join('\n');

    const kiRes = await kiFetch('analyse-ki', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 900,
        system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: `Hier sind die echten Website-Zahlen:\n\n${zusammenfassung}\n\nBewerte die Lage und gib genau 3 konkrete Empfehlungen. Antworte NUR als JSON.` }] }],
      }),
    });

    if (!kiRes.ok) {
      const t = await kiRes.text();
      console.error('analyse-ki Fehler:', kiRes.status, t.slice(0, 200));
      return NextResponse.json({ error: 'Das KI-Auge ist gerade nicht erreichbar. Bitte kurz später erneut.' }, { status: 502 });
    }

    const kiData = await kiRes.json();
    const blocks: Array<{ type?: string; text?: string }> = Array.isArray(kiData.content) ? kiData.content : [];
    let roh = blocks.filter((b) => b.type === 'text').map((b) => b.text || '').join('').trim();
    const m = roh.match(/\{[\s\S]*\}/); // JSON aus evtl. Code-Fences schälen
    if (m) roh = m[0];

    let out: { bewertung?: unknown; empfehlungen?: unknown } | null = null;
    try {
      out = JSON.parse(roh);
    } catch {
      out = null;
    }
    if (!out || typeof out.bewertung !== 'string') {
      return NextResponse.json({ bewertung: roh.slice(0, 600) || 'Keine Auswertung möglich.', empfehlungen: [] });
    }
    const empfehlungen = Array.isArray(out.empfehlungen)
      ? (out.empfehlungen as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 3)
      : [];
    return NextResponse.json({ bewertung: String(out.bewertung).slice(0, 800), empfehlungen });
  } catch (e: unknown) {
    console.error('analyse-ki interner Fehler:', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 });
  }
}
