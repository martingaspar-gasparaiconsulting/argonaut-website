// app/api/termine/route.ts
// ARGONAUT OS — liefert die bereits BELEGTEN Termin-Slots der Website.
// Öffentlich lesbar (nur Datum + Uhrzeit, keine personenbezogenen Daten), damit
// der Kalender belegte Slots ausgrauen kann. Nutzt den Service-Role-Client
// serverseitig (RLS ist an, daher kommt nur der Server an die Tabelle).
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pad(n: number) { return n < 10 ? '0' + n : '' + n }

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceKey) return NextResponse.json({ belegt: [] })

    const supabase = createClient(url, serviceKey)
    const today = new Date()
    const heute = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

    const { data, error } = await supabase
      .from('website_termine')
      .select('slot_date, slot_time')
      .gte('slot_date', heute)

    if (error) return NextResponse.json({ belegt: [] })

    const belegt = (data ?? []).map((r: { slot_date: string; slot_time: string }) => `${r.slot_date} ${r.slot_time}`)
    return NextResponse.json({ belegt })
  } catch {
    return NextResponse.json({ belegt: [] })
  }
}
