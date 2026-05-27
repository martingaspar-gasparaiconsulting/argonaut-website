import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })
    }

    const { error } = await supabase.from('profiles').update({
      onboarding_completed: true,
      onboarding_status: 'setup',
      onboarding_data: data,
      company_name: data.firmenname,
      industry: data.branche,
      standorte: data.standorte,
      mitarbeiter: data.mitarbeiter,
      website: data.website,
      digitalisierung: data.digitalisierung,
      tools: data.tools,
      full_name: data.ansprechpartner,
    }).eq('id', user.id)

    if (error) {
      console.error('Supabase update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Onboarding save error:', error)
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  }
}
