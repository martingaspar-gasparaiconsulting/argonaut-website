import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AcademyClient, { type Kurs } from './AcademyClient'

// ============================================================
// ARGONAUT OS · ACADEMY (/dashboard/academy)
//
// Liest die GLOBALEN Schulungskurse aus academy_kurse — die sind fuer alle
// Betriebe gleich und per RLS nur lesbar, deshalb bleiben sie hier auf dem
// Server. Alles Betriebseigene (eigene Kurse, Lernfortschritt, Medaillen)
// haengt an der Anmeldung des Nutzers und wird in AcademyClient geladen.
//
// 15.08.26: Aus dem Schaufenster wird eine Academy — mit Player, Fortschritt
// und Wiedereinstieg an der richtigen Stelle. Der frueher hier stehende
// Vermerk "Player folgt spaeter" ist damit erledigt.
// ============================================================

export default async function AcademyPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data } = await supabase
    .from('academy_kurse')
    .select('id, slug, titel, beschreibung, kategorie, video_url, dauer_minuten, icon, sortierung, aktiv')
    .eq('aktiv', true)
    .order('sortierung')

  const globaleKurse: Kurs[] = ((data || []) as Array<Omit<Kurs, 'quelle'>>).map((k) => ({
    ...k,
    quelle: 'global' as const,
  }))

  const SHELL_MAX = '1600px'
  const SHELL_PAD = 'clamp(16px, 3vw, 48px)'

  return (
    <main style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `clamp(32px, 4vw, 56px) ${SHELL_PAD} 80px` }}>

      {/* Kopf */}
      <section style={{ marginBottom: '32px' }}>
        <p style={{ fontSize: 'clamp(13px, 1.13vw, 18px)', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 600 }}>ARGONAUT Academy</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
          <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 46px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Schulungen &amp; Erklärvideos</h1>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(15px, 1.1vw, 18px)', margin: 0, maxWidth: '720px' }}>
          Lernen Sie ARGONAUT Schritt für Schritt kennen — kurze Erklärvideos zu jedem Bereich.
          Wo Sie aufhören, geht es beim nächsten Mal weiter.
        </p>
      </section>

      <AcademyClient globaleKurse={globaleKurse} />
    </main>
  )
}
