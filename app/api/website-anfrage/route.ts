// app/api/website-anfrage/route.ts
// ARGONAUT OS — Anfrage-Intake der NEUEN Website (/vorschau).
// -----------------------------------------------------------------------------
// EIGENE, saubere Route für ARGONAUT-Verkaufs-Leads. Bewusst NICHT /api/leads
// (die ist fest auf Kunde Schäfer + Forst-Felder verdrahtet). Leitet die Anfrage
// serverseitig an den eigenen n8n-Kontakt-Webhook weiter (kein Fremd-CRM, kein
// CORS-Problem, kein Lead landet beim Kunden).
// -----------------------------------------------------------------------------
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const N8N_KONTAKT_WEBHOOK = 'https://n8n.srv1133627.hstgr.cloud/webhook/kontaktformular'

function clean(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t.slice(0, max)
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ungültige Anfrage.' }, { status: 400 })
    }

    const name = clean((body as any).name, 200)
    const email = clean((body as any).email, 200)
    const telefon = clean((body as any).telefon, 60)

    if (!name || (!email && !telefon)) {
      return NextResponse.json({ error: 'Name und E-Mail oder Telefon erforderlich.' }, { status: 400 })
    }
    if ((body as any).privacy !== true) {
      return NextResponse.json({ error: 'Zustimmung zur Datenschutzerklärung erforderlich.' }, { status: 400 })
    }

    const payload = {
      name,
      email,
      telefon,
      unternehmen: clean((body as any).unternehmen, 200),
      mitarbeiter: clean((body as any).mitarbeiter, 40),
      nachricht: clean((body as any).nachricht, 5000),
      source: 'argonaut-website-vorschau',
      timestamp: new Date().toISOString(),
    }

    const res = await fetch(N8N_KONTAKT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      console.error('n8n Kontakt-Webhook antwortete mit', res.status)
      return NextResponse.json({ error: 'Zustellung fehlgeschlagen.' }, { status: 502 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('website-anfrage Fehler:', err)
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 })
  }
}
