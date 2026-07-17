// app/api/website-anfrage/route.ts
// ARGONAUT OS — Anfrage-Intake der NEUEN Website (/vorschau).
// -----------------------------------------------------------------------------
// EIGENE, saubere Route für ARGONAUT-Verkaufs-Leads. Bewusst NICHT /api/leads
// (die ist fest auf Kunde Schäfer + Forst-Felder verdrahtet).
// Ablauf pro Anfrage:
//   1. (falls Wunschtermin) Slot in website_termine reservieren — UNIQUE-Sperre
//      verhindert Doppelbuchung -> 409 "vergeben".
//   2. Komplette Anfrage in website_anfragen speichern (eigene DB, kein Lead
//      geht verloren; das spätere Command Center liest genau diese Tabelle).
//   3. An den eigenen n8n-Webhook weiterleiten (Bestätigungsmail / weitere Autom.).
// Antwort ok, sobald die Anfrage entweder in der DB liegt ODER n8n sie annahm.
// -----------------------------------------------------------------------------
import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const N8N_KONTAKT_WEBHOOK = 'https://n8n.srv1133627.hstgr.cloud/webhook/kontaktformular'

function clean(v: unknown, max = 2000): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t.slice(0, max)
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey)
}

// Reserviert den Slot. 'ok' | 'taken' | 'skip' (kein/ungültiger Termin) | 'error'.
async function reserviereSlot(supabase: SupabaseClient | null, key: string | null, ref: Record<string, string | null>) {
  if (!key || key.length < 12) return 'skip' as const
  const slot_date = key.slice(0, 10)
  const slot_time = key.slice(11).trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(slot_date) || !/^\d{2}:\d{2}$/.test(slot_time)) return 'skip' as const
  if (!supabase) return 'skip' as const

  const { error } = await supabase.from('website_termine').insert({
    slot_date, slot_time,
    name: ref.name, email: ref.email, telefon: ref.telefon, unternehmen: ref.unternehmen, branche: ref.branche,
  })
  if (!error) return 'ok' as const
  if ((error as { code?: string }).code === '23505') return 'taken' as const
  console.error('Slot-Reservierung fehlgeschlagen:', error)
  return 'error' as const
}

// Speichert die komplette Anfrage in der eigenen DB. true = gespeichert.
async function speichereAnfrage(supabase: SupabaseClient | null, payload: Record<string, string | null>) {
  if (!supabase) return false
  const { error } = await supabase.from('website_anfragen').insert(payload)
  if (error) { console.error('Anfrage speichern fehlgeschlagen:', error); return false }
  return true
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

    const supabase = getSupabase()

    // 1. Wunschtermin reservieren (falls gewählt). Doppelbuchung -> 409.
    const slotKey = clean((body as any).wunschterminKey, 30)
    const reserv = await reserviereSlot(supabase, slotKey, { name, email, telefon, unternehmen, branche })
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
    }

    // 2. In eigener DB speichern (kein Lead geht verloren).
    const dbOk = await speichereAnfrage(supabase, payload)

    // 3. An n8n weiterleiten (Bestätigungsmail / weitere Automatisierung).
    let n8nOk = false
    try {
      const res = await fetch(N8N_KONTAKT_WEBHOOK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
      })
      n8nOk = res.ok
      if (!res.ok) console.error('n8n Kontakt-Webhook antwortete mit', res.status)
    } catch (e) {
      console.error('n8n nicht erreichbar:', e)
    }

    if (!dbOk && !n8nOk) {
      return NextResponse.json({ error: 'Zustellung fehlgeschlagen.' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('website-anfrage Fehler:', err)
    return NextResponse.json({ error: 'Interner Fehler.' }, { status: 500 })
  }
}
