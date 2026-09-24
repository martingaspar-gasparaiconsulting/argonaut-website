// ============================================================================
// ARGONAUT OS · app/api/text-motor/pdf/route.ts — Text als PDF (Paket PC)
//
//   POST { titel, untertitel?, kapitel: [{ titel, text }] }  -> application/pdf
//
// Das HTML baut lib/textMotor.dokumentHtml (maskiert alles), das PDF rendert
// Gotenberg (lib/textPdf). Farbe und Firmenname kommen aus dem eigenen CI.
// Kein KI-Aufruf, keine Speicherung. Nur eingeloggt.
// ============================================================================
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase-server';
import { dokumentHtml, pdfName, type Kapitel } from '@/lib/textMotor';
import { textPdf } from '@/lib/textPdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Grenzen gegen versehentlich riesige Anfragen. */
const MAX_KAPITEL = 12;
const MAX_ZEICHEN = 60_000;

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'Ungültige Anfrage.' }, { status: 400 }); }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Nicht eingeloggt.' }, { status: 401 });

  const titel = String(body.titel ?? '').trim().slice(0, 160);
  const untertitel = String(body.untertitel ?? '').trim().slice(0, 240);
  const kapitel: Kapitel[] = (Array.isArray(body.kapitel) ? body.kapitel : [])
    .slice(0, MAX_KAPITEL)
    .map((k) => {
      const kk = (k ?? {}) as Record<string, unknown>;
      return { titel: String(kk.titel ?? '').slice(0, 160), text: String(kk.text ?? '').slice(0, MAX_ZEICHEN) };
    })
    .filter((k) => k.titel || k.text);
  if (!titel || kapitel.length === 0) {
    return NextResponse.json({ ok: false, error: 'Titel oder Inhalt fehlt.' }, { status: 400 });
  }

  let firma = '';
  let farbe: string | null = null;
  try {
    const { data: ci } = await supabase.from('web_ci').select('*').eq('owner_user_id', user.id).maybeSingle();
    const c = (ci ?? {}) as Record<string, unknown>;
    firma = String(c.firma ?? '').trim();
    farbe = typeof c.farbe_primaer === 'string' ? c.farbe_primaer : null;
  } catch { /* egal */ }

  const html = dokumentHtml({ titel, untertitel, firma, farbe, kapitel });
  const pdf = await textPdf(html);
  if (!pdf) return NextResponse.json({ ok: false, error: 'Das PDF konnte gerade nicht erzeugt werden. Bitte später erneut versuchen.' }, { status: 502 });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${pdfName(titel)}"`,
      'cache-control': 'no-store',
    },
  });
}
