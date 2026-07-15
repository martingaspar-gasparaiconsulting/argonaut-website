import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import LeadsClient, { type Lead } from './LeadsClient'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data } = await supabase
    .from('leads')
    .select('id, created_at, name, telefon, email, dienstleistung, menge, einheit, wunschtermin, nachricht, status, score, ki_intent, ki_zusammenfassung, ki_naechster_schritt, quelle, ist_bestand')
    .order('created_at', { ascending: false })

  const leads = (data ?? []) as Lead[]

  return (
    <div style={{ background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <section style={{ marginBottom: '28px' }}>
          <p style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 600 }}>Vertrieb</p>
          <h1 style={{ fontSize: 'clamp(22px, 4vw, 34px)', fontWeight: 900, margin: '0 0 10px' }}>{'Anfragen & Leads'}</h1>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(15px, 1.31vw, 21px)', margin: 0 }}>Alle eingehenden Anfragen und Ihr Bestand an einem Ort - vom ersten Kontakt bis zum gewonnenen Auftrag.</p>
        </section>

        <LeadsClient leads={leads} />
      </main>
    </div>
  )
}
