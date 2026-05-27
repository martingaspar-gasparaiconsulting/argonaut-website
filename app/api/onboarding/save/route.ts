import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const data = JSON.parse(body)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 })
    }

    const { error } = await supabase.from('profiles').update({
      onboarding_completed: true,
      onboarding_status: 'setup',
      onboarding_data: data,
      company_name: data.firmenname || null,
      industry: data.branche || null,
      standorte: data.standorte || null,
      mitarbeiter: data.mitarbeiter || null,
      website: data.website || null,
      digitalisierung: data.digitalisierung || null,
      tools: data.tools || null,
      full_name: data.ansprechpartner || null,
    }).eq('id', user.id)

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Onboarding save error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
