import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import DocumentsClient from './DocumentsClient'

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
    <div style={{ background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>
      <DocumentsClient
        userId={user.id}
        paket={rawPaket}
        initialDocuments={documents || []}
        initialDocumentAgents={documentAgents || []}
      />
    </div>
  )
}
