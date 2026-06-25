import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase-server'
import LogoutButton from '../LogoutButton'
import DocumentsClient from './DocumentsClient'

const navLink = { padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.7)', textDecoration: 'none', background: 'rgba(255,255,255,0.06)' }
const navLinkAktiv = { padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, color: '#C9A84C', textDecoration: 'none', background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.25)' }

export default async function DocumentsPage() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (!user || userError) redirect('/auth/login')

  const { data: customerData } = await supabase
    .from('customers')
    .select('paket')
    .eq('email', user.email)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: documentAgents } = await supabase
    .from('document_agents')
    .select('*')
    .eq('user_id', user.id)

  const rawPaket = customerData?.paket?.toLowerCase() || 'solo'

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
              <a href="/dashboard/documents" style={navLinkAktiv}>Dokumente</a>
              <a href="/dashboard/automatisierungen" style={navLink}>Automatisierungen</a>
              <a href="/dashboard/einstellungen" style={navLink}>Einstellungen</a>
            </nav>
          </div>
          <LogoutButton />
        </div>
      </header>

      <DocumentsClient
        userId={user.id}
        paket={rawPaket}
        initialDocuments={documents || []}
        initialDocumentAgents={documentAgents || []}
      />
    </div>
  )
}
