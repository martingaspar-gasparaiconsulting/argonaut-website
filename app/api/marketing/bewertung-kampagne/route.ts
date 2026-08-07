import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { sendeMail, kundenMailLayout, absenderBranding } from '@/lib/mail';
import {
  empfaengerPool, bereinigeEmpfaenger, kampagneKennzahlen, bewertungsLink,
} from '@/lib/bewertungKampagne';

// ============================================================================
// ARGONAUT OS · app/api/marketing/bewertung-kampagne/route.ts
// (Marketing-Ausbau · Punkt 7 — Reputation: Bewertungs-Kampagne)
//
// Baut auf dem bestehenden Bewertungs-Modul auf (Tabelle bewertungsanfragen,
// öffentliche Abgabe /bewerten/<token>). NEU: viele Kunden auf einmal einladen.
//   GET  -> { ok, pool, kennzahlen, firma }   (Empfänger + Antwortquote)
//   POST { empfaenger:[{name,email}] } -> { ok, gesendet, fehler, uebersprungen }
// Alles RLS-scoped / owner-hart. Kein SQL nötig.
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

function escapeHtml(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const [kontakte, anfragen] = await Promise.all([
    hole(supabase, 'kontakte', 'vorname, nachname, email'),
    hole(supabase, 'bewertungsanfragen', 'kunde_email, status, sterne, veroeffentlicht'),
  ]);

  const pool = empfaengerPool(kontakte, anfragen);
  const kennzahlen = kampagneKennzahlen(anfragen);
  const brand = await absenderBranding(supabase, user.id);

  return NextResponse.json({ ok: true, pool, kennzahlen, firma: brand.firma });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const empfaenger = bereinigeEmpfaenger((body as Record<string, unknown> | null)?.empfaenger, 50);
  if (empfaenger.length === 0) {
    return NextResponse.json({ ok: false, error: 'Bitte mindestens einen gültigen Empfänger auswählen (max. 50 pro Kampagne).' }, { status: 400 });
  }

  // Schon-Eingeladene serverseitig ausschließen (Doppel-Einladung vermeiden).
  const anfragen = await hole(supabase, 'bewertungsanfragen', 'kunde_email');
  const bereits = new Set(anfragen.map((a) => String(a.kunde_email ?? '').trim().toLowerCase()).filter(Boolean));
  const ziel = empfaenger.filter((e) => !bereits.has(e.email.toLowerCase()));
  const uebersprungen = empfaenger.length - ziel.length;

  const brand = await absenderBranding(supabase, user.id);
  const origin = req.headers.get('origin') || (() => { try { return new URL(req.url).origin; } catch { return ''; } })();

  let gesendet = 0;
  let fehler = 0;

  await Promise.all(ziel.map(async (e) => {
    try {
      const token = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      const { error } = await supabase.from('bewertungsanfragen').insert({
        owner_user_id: user.id,
        kunde_name: e.name || null,
        kunde_email: e.email,
        token,
        status: 'offen',
        quelle: 'kampagne',
      });
      if (error) { fehler++; return; }

      const link = bewertungsLink(origin, token);
      const anrede = e.name ? `Guten Tag ${escapeHtml(e.name)},` : 'Guten Tag,';
      const inhalt = `
        <p>${anrede}</p>
        <p>vielen Dank für Ihr Vertrauen in <b>${escapeHtml(brand.firma)}</b>. Über eine kurze Bewertung
           würden wir uns sehr freuen — sie dauert keine Minute:</p>
        <p style="margin:22px 0;">
          <a href="${escapeHtml(link)}" style="display:inline-block;background:${brand.akzent};color:#ffffff;font-weight:700;
             text-decoration:none;padding:13px 26px;border-radius:8px;">★ Jetzt bewerten</a>
        </p>
        <p style="color:#5b6b7d;font-size:13px;">Falls der Knopf nicht funktioniert: ${escapeHtml(link)}</p>`;
      const html = kundenMailLayout(brand.firma, brand.akzent, 'Ihre Meinung zählt', inhalt);

      const r = await sendeMail({
        an: e.email,
        betreff: `Wie war's bei ${brand.firma}? Ihre kurze Bewertung`,
        html,
        absenderName: brand.firma,
        antwortAn: brand.email,
      });
      if (r.ok) gesendet++; else fehler++;
    } catch {
      fehler++;
    }
  }));

  return NextResponse.json({ ok: true, gesendet, fehler, uebersprungen });
}
