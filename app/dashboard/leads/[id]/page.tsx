import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import LeadDetailClient, { type LeadDetail } from './LeadDetailClient'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data } = await supabase
    .from('leads')
    .select('id, created_at, name, telefon, email, dienstleistung, menge, einheit, wunschtermin, nachricht, status, score, ki_intent, ki_zusammenfassung, ki_naechster_schritt, quelle, ist_bestand, angebot_entwurf, angebot_status, angebot_erstellt_am, angebot_versendet_am')
    .eq('id', id)
    .single()

  if (!data) notFound()

  const lead = data as LeadDetail

  return (
    <div style={{ background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <a href="/dashboard/leads" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'rgba(255,255,255,0.55)', textDecoration: 'none', marginBottom: '24px' }}>
          {'\u2190'} {'Zur\u00fcck zur \u00dcbersicht'}
        </a>
        <LeadDetailClient lead={lead} />
      </main>
    </div>
  )
}
