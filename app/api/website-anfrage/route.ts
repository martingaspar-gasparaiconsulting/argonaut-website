// app/api/website-anfrage/route.ts
// ARGONAUT OS — Anfrage-Intake der NEUEN Website (/vorschau).
// -----------------------------------------------------------------------------
// EIGENE, saubere Route für ARGONAUT-Verkaufs-Leads. Bewusst NICHT /api/leads
// (die ist fest auf Kunde Schäfer + Forst-Felder verdrahtet). Leitet die Anfrage
// serverseitig an den eigenen n8n-Kontakt-Webhook weiter (kein Fremd-CRM). n8n
// legt in eigenes CRM ab und verschickt die Eingangsbestätigung.
// Zusätzlich: reserviert (falls Wunschtermin gewählt) den Slot in website_termine.
// Die UNIQUE-Sperre (slot_date, slot_time) verhindert Doppelbuchung -> 409.
// -----------------------------------------------------------------------------
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const N8N_KONTAKT_WEBHOOK = 'https://n8n.srv1133627.hstgr.cloud/webhook/kontaktformular'

function clean(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t.slice(0, max)
}

// Reserviert den Slot. Rückgabe: 'ok' | 'taken' | 'skip' (kein Termin) | 'error'.
async function reserviereSlot(key: string | null, ref: { name: string | null; email: string | null; telefon: string | null; unternehmen: string | null; branche: string | null }) {
  if (!key || key.length < 12) return 'skip' as const
  const slot_date = key.slice(0, 10)
  const slot_time = key.slice(11).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot_date) || !/^\d{2}:\d{2}$/.test(slot_time)) return 'skip' as const

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return 'skip' as const // ohne DB einfach ohne Sperre weiter

  const supabase = createClient(url, serviceKey)
  const { error } = await supabase.from('website_termine').insert({
    slot_date, slot_time,
    name: ref.name, email: ref.email, telefon: ref.telefon, unternehmen: ref.unternehmen, branche: ref.branche,
  })
  if (!error) return 'ok' as const
  if ((error as { code?: string }).code === '23505') return 'taken' as const // UNIQUE-Verletzung = schon vergeben
  console.error('Slot-Reservierung fehlgeschlagen:', error)
  return 'error' as const
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
    const unternehmen = clean((body as any).unternehmen, 200)
    const branche = clean((body as any).branche, 120)

    if (!name || (!email && !telefon)) {
      return NextResponse.json({ error: 'Name und E-Mail oder Telefon erforderlich.' }, { status: 400 })
    }
    if ((body as any).privacy !== true) {
      return NextResponse.json({ error: 'Zustimmung zur Datenschutzerklärung erforderlich.' }, { status: 400 })
    }
    if ((body as any).agb !== true) {
      return NextResponse.json({ error: 'Zustimmung zu den AGB erforderlich.' }, { status: 400 })
    }

    // Zuerst den Wunschtermin reservieren (falls gewählt). Doppelbuchung -> 409.
    const slotKey = clean((body as any).wunschterminKey, 30)
    const reserv = await reserviereSlot(slotKey, { name, email, telefon, unternehmen, branche })
    if (reserv === 'taken') {
      return NextResponse.json({ error: 'Der gewählte Termin ist gerade vergeben. Bitte einen anderen Termin wählen.', code: 'slot_taken' }, { status: 409 })
    }

    const payload = {
      name,
      email,
      telefon,
      unternehmen,
      mitarbeiter: clean((body as any).mitarbeiter, 40),
      branche,
      kontaktwunsch: clean((body as any).kontaktwunsch, 20),
      wunschtermin: clean((body as any).wunschtermin, 120),
      angebot: clean((body as any).angebot, 300),
      preis: clean((body as any).preis, 40),
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
