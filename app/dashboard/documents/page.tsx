import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import { STANDORT_COOKIE } from '@/lib/aktiverStandort'
import { konkreterStandort } from '@/lib/standortDaten'
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

  // Filialen (Block D): aktive Standorte des Betriebs + Dokument-Filial-Zuordnungen.
  const { data: standorte } = await supabase
    .from('standorte')
    .select('id, name, ist_hauptsitz')
    .eq('aktiv', true)
    .order('ist_hauptsitz', { ascending: false })
    .order('name', { ascending: true })

  // Zuordnungen laden — falls die Tabelle noch nicht migriert ist, bleibt es leer
  // (dann ist alles global sichtbar). Nichts bricht.
  const { data: docStandorte } = await supabase
    .from('document_standorte')
    .select('document_id, standort_id')
  const zuord = (docStandorte ?? []) as { document_id: string; standort_id: string }[]

  // Fail-open-Zuschnitt: bei aktivem Standort werden globale Dokumente (ohne
  // Zuordnung) PLUS die diesem Standort zugeordneten gezeigt. „Alle" = kein Filter.
  const standortId = konkreterStandort((await cookies()).get(STANDORT_COOKIE)?.value)
  const proDoc = new Map<string, Set<string>>()
  for (const z of zuord) {
    const set = proDoc.get(z.document_id) ?? new Set<string>()
    set.add(z.standort_id)
    proDoc.set(z.document_id, set)
  }

  let sichtbar = documents ?? []
  if (standortId) {
    sichtbar = sichtbar.filter((d) => {
      const set = proDoc.get(d.id)
      return !set || set.size === 0 || set.has(standortId)
    })
  }

  const rawPaket = customerData?.paket?.toLowerCase() || 'solo'

  return (
    <div style={{ background: '#0A1628', fontFamily: 'var(--font-dm-sans), sans-serif', color: '#FFFFFF' }}>
      <DocumentsClient
        userId={user.id}
        paket={rawPaket}
        initialDocuments={sichtbar}
        initialDocumentAgents={documentAgents || []}
        standorte={standorte || []}
        initialDocumentStandorte={zuord}
      />
    </div>
  )
}
