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

    await supabase.from('profiles').update({
      onboarding_completed: true,
      onboarding_data: JSON.stringify(data),
      company_name: data.firmenname,
      industry: data.branche,
    }).eq('id', user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Onboarding save error:', error)
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 })
  }
}
