import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import LeadDetailClient, { type LeadDetail } from './LeadDetailClient'
import AblaufKnoepfe from '../../_components/AblaufKnoepfe'
import ZustaendigBox from './ZustaendigBox'
import QualiBox from './QualiBox'
import AnrufVerlauf from '../../_components/AnrufVerlauf'
import { ladeVerkaufsteam, ladeZustaendige } from '@/lib/verkaufsteamLaden'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data } = await supabase
    .from('leads')
    .select('id, created_at, name, telefon, email, dienstleistung, menge, einheit, wunschtermin, nachricht, status, score, ki_intent, ki_zusammenfassung, ki_naechster_schritt, quelle, kampagne_id, kontakt_id, ist_bestand, angebot_entwurf, angebot_status, angebot_erstellt_am, angebot_versendet_am, stufe, stufe_geaendert_am, termin_gebucht_am, termin_gehalten_am, kunde_seit, nachfass_status, nachfass_schritt, nachfass_faellig_am')
    .eq('id', id)
    .single()

  if (!data) notFound()

  // Paket 358: Zuständige + Team. Freie Setter sehen den Angebotsentwurf nicht
  // (Preise) — er wird gar nicht erst an den Browser gegeben.
  const [stand, zust] = await Promise.all([ladeVerkaufsteam(supabase), ladeZustaendige(supabase, id)])
  const z = zust.get(id) ?? { setter_user_id: null, closer_user_id: null }
  const lead = (stand.frei ? { ...data, angebot_entwurf: null, angebot_status: null } : data) as LeadDetail

  return (
    <div style={{ background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <a href="/dashboard/leads" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: 'clamp(13px, 1.13vw, 18px)', color: 'rgba(255,255,255,0.55)', textDecoration: 'none', marginBottom: '24px' }}>
          {'\u2190'} {'Zur\u00fcck zur \u00dcbersicht'}
        </a>
        {/* Paket 168: Ablauf-Knöpfe (nur Geschäftsleitung, nur eingeschaltete) */}
        <AblaufKnoepfe modul="leads" vorgangId={lead.id} />
        {stand.bereit ? <ZustaendigBox leadId={lead.id} team={stand.team} setter={z.setter_user_id} closer={z.closer_user_id} frei={stand.frei} ich={stand.ich} /> : null}
        {/* Paket 361: Anrufe mit Ergebnis, Nummer zum Antippen, Zeit bis zum ersten Anruf */}
        <AnrufVerlauf leadId={lead.id} telefon={lead.telefon} angelegt={lead.created_at} />
        {/* Paket VK2: Qualifizierungsbogen, Übergabe an den Closer, „Passt nicht" mit Grund */}
        <QualiBox leadId={lead.id} team={stand.bereit ? stand.team : []} ich={stand.ich} nachfassAktiv={lead.nachfass_status === 'aktiv'} />
        {/* key: nach „Passt nicht" (Stufe → verloren) neu aufbauen, damit die Stufen-Anzeige stimmt */}
        <LeadDetailClient key={String(lead.stufe ?? '')} lead={lead} ohneAngebot={stand.frei} />
      </main>
    </div>
  )
}
