import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

// ============================================================
// ARGONAUT OS · ACADEMY (/dashboard/academy)
// Liest Schulungskurse LIVE aus academy_kurse, gruppiert nach
// Kategorie. Video-ready: sobald video_url gefuellt ist, wird
// der Kurs als abspielbar markiert (Player folgt spaeter).
// ============================================================

type Kurs = {
  id: string
  slug: string
  titel: string
  beschreibung: string | null
  kategorie: string
  video_url: string | null
  dauer_minuten: number | null
  icon: string | null
  sortierung: number
  aktiv: boolean
}

// Reihenfolge der Kategorien (nicht gelistete kommen hinten dran)
const KAT_ORDER = ['Erste Schritte', 'Agenten meistern', 'Vertrieb & CRM', 'Automatisierungen']
const KAT_FARBE: Record<string, string> = {
  'Erste Schritte': '#00e5ff',
  'Agenten meistern': '#A98CE0',
  'Vertrieb & CRM': '#4f94e8',
  'Automatisierungen': '#C9A84C',
}

export default async function AcademyPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data } = await supabase
    .from('academy_kurse')
    .select('id, slug, titel, beschreibung, kategorie, video_url, dauer_minuten, icon, sortierung, aktiv')
    .eq('aktiv', true)
    .order('sortierung')

  const kurse = (data || []) as Kurs[]

  // Nach Kategorie gruppieren
  const grouped: Record<string, Kurs[]> = {}
  for (const k of kurse) {
    if (!grouped[k.kategorie]) grouped[k.kategorie] = []
    grouped[k.kategorie].push(k)
  }
  const bekannte = KAT_ORDER.filter((k) => grouped[k]?.length)
  const rest = Object.keys(grouped).filter((k) => !KAT_ORDER.includes(k)).sort()
  const alleKats = [...bekannte, ...rest]

  const gesamt = kurse.length
  const verfuegbar = kurse.filter((k) => k.video_url && k.video_url.length > 0).length

  const SHELL_MAX = '1600px'
  const SHELL_PAD = 'clamp(16px, 3vw, 48px)'

  return (
    <main style={{ maxWidth: SHELL_MAX, margin: '0 auto', padding: `clamp(32px, 4vw, 56px) ${SHELL_PAD} 80px` }}>

      {/* Kopf */}
      <section style={{ marginBottom: '40px' }}>
        <p style={{ fontSize: '13px', color: '#C9A84C', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px', fontWeight: 600 }}>ARGONAUT Academy</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
          <h1 style={{ fontSize: 'clamp(24px, 3.4vw, 46px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>Schulungen & Erklärvideos</h1>
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.1em', color: '#C9A84C', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: '999px', padding: '4px 12px' }}>{gesamt} KURSE</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 'clamp(15px, 1.1vw, 18px)', margin: 0, maxWidth: '720px' }}>Lernen Sie ARGONAUT Schritt für Schritt kennen — kurze Erklärvideos zu jedem Bereich. So holen Sie das Maximum aus Ihrem KI-Betriebssystem.</p>
      </section>

      {gesamt === 0 ? (
        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '48px 24px', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          <div style={{ fontSize: '34px', marginBottom: '12px' }}>🎓</div>
          Kurse werden gerade vorbereitet.
        </div>
      ) : (
        alleKats.map((kat) => {
          const farbe = KAT_FARBE[kat] || '#C9A84C'
          const list = grouped[kat]
          return (
            <section key={kat} style={{ marginBottom: '44px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: farbe, boxShadow: `0 0 8px ${farbe}`, flexShrink: 0 }} />
                <h2 style={{ fontSize: 'clamp(17px, 1.8vw, 24px)', fontWeight: 900, margin: 0, fontFamily: 'var(--font-dm-sans), DM Sans, sans-serif' }}>{kat}</h2>
                <span style={{ fontSize: '12px', fontWeight: 700, color: farbe, background: `${farbe}1e`, border: `1px solid ${farbe}55`, borderRadius: '999px', padding: '2px 10px' }}>{list.length}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {list.map((k) => {
                  const spielbar = !!(k.video_url && k.video_url.length > 0)
                  return (
                    <div key={k.id} style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(201,168,76,0.15)',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                    }}>
                      {/* Video-Vorschau-Flaeche */}
                      <div style={{
                        position: 'relative',
                        height: '132px',
                        background: `linear-gradient(135deg, ${farbe}22 0%, rgba(10,22,40,0.6) 100%)`,
                        borderBottom: '1px solid rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: '40px', opacity: 0.9 }}>{k.icon || '🎬'}</span>
                        <span style={{
                          position: 'absolute', top: '10px', right: '10px',
                          fontSize: '11px', fontWeight: 700,
                          color: spielbar ? '#4CAF7D' : 'rgba(255,255,255,0.55)',
                          background: spielbar ? 'rgba(76,175,125,0.15)' : 'rgba(255,255,255,0.08)',
                          border: `1px solid ${spielbar ? 'rgba(76,175,125,0.4)' : 'rgba(255,255,255,0.15)'}`,
                          borderRadius: '999px', padding: '3px 10px',
                        }}>
                          {spielbar ? '▶ Ansehen' : 'Bald verfügbar'}
                        </span>
                        {k.dauer_minuten ? (
                          <span style={{ position: 'absolute', bottom: '10px', right: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.5)', borderRadius: '6px', padding: '2px 8px' }}>
                            {k.dauer_minuten} Min
                          </span>
                        ) : null}
                      </div>

                      {/* Text */}
                      <div style={{ padding: '16px 18px 18px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <p style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 6px', fontFamily: 'var(--font-dm-sans), sans-serif' }}>{k.titel}</p>
                        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.6 }}>{k.beschreibung || ''}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })
      )}

      {/* Hinweis-Streifen */}
      <section style={{ marginTop: '8px' }}>
        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: '14px', padding: '18px 22px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '22px' }}>🎥</span>
          <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.55)' }}>
            Die Erklärvideos werden laufend ergänzt. {verfuegbar > 0 ? `${verfuegbar} von ${gesamt} Kursen sind bereits abrufbar.` : 'In Kürze stehen die ersten Videos bereit.'}
          </p>
        </div>
      </section>

    </main>
  )
}
