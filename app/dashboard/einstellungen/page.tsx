import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from '../LogoutButton'
import EinstellungenClient, { type FirmaProfil } from './EinstellungenClient'

const navLink = { padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', background: 'rgba(255,255,255,0.06)' }
const navLinkAktiv = { padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#C9A84C', textDecoration: 'none', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)' }

export default async function EinstellungenPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data } = await supabase
    .from('profiles')
    .select('firma_name, firma_strasse, firma_plz, firma_ort, firma_telefon, firma_email, firma_website, firma_rechtsform, firma_registergericht, firma_hrb, firma_geschaeftsfuehrer, firma_ust_id, firma_steuernummer, firma_iban, firma_bank, firma_bic, firma_akzentfarbe')
    .eq('id', user.id)
    .single()

  const profil = (data ?? {}) as FirmaProfil

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>
      <header style={{ borderBottom: '1px solid rgba(201,168,76,0.15)', background: 'rgba(10,22,40,0.95)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 24px', height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              <Image src="/images/ARGONAUT_HELM_SPARTAN .png" alt="ARGONAUT" width={36} height={36} style={{ objectFit: 'contain' }} />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '0.15em' }}>ARGONAUT</span>
                <span style={{ fontSize: '10px', color: '#C9A84C', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '2px' }}>Dashboard</span>
              </div>
            </div>
            <nav style={{ display: 'flex', gap: '4px' }}>
              <a href="/dashboard" style={navLink}>Übersicht</a>
              <a href="/dashboard/leads" style={navLink}>Leads</a>
              <a href="/dashboard/chat" style={navLink}>Chat</a>
              <a href="/dashboard/documents" style={navLink}>Dokumente</a>
              <a href="/dashboard/automatisierungen" style={navLink}>Automatisierungen</a>
              <a href="/dashboard/einstellungen" style={navLinkAktiv}>Einstellungen</a>
            </nav>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}>{user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 8px' }}>Firmenprofil</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6, maxWidth: '640px' }}>
            Diese Daten erscheinen im Briefkopf Ihrer Angebote, Rechnungen und weiterer Dokumente. Einmal ausfüllen – ARGONAUT verwendet sie automatisch für alle erzeugten Dokumente.
          </p>
        </div>
        <EinstellungenClient profil={profil} />
      </main>
    </div>
  )
}
