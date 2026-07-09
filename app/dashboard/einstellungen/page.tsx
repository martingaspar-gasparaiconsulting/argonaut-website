import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import EinstellungenClient, { type FirmaProfil } from './EinstellungenClient'
import ModulFreischaltung from './ModulFreischaltung'
import AnfahrtEinstellungen from './AnfahrtEinstellungen'
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
    <div style={{ background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px 80px' }}>
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 900, margin: '0 0 8px' }}>Firmenprofil</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', margin: 0, lineHeight: 1.6, maxWidth: '640px' }}>
            Diese Daten erscheinen im Briefkopf Ihrer Angebote, Rechnungen und weiterer Dokumente. Einmal ausfüllen – ARGONAUT verwendet sie automatisch für alle erzeugten Dokumente.
          </p>
        </div>
        <EinstellungenClient profil={profil} />
        <AnfahrtEinstellungen />
        <ModulFreischaltung />
      </main>
    </div>
  )
}
