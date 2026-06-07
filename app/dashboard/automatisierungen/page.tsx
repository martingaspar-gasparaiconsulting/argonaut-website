import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AutomatisierungenClient from './AutomatisierungenClient'

export default async function AutomatisierungenPage() {
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const rawPaket = customerData?.paket?.toLowerCase() || 'solo'
  const userName = profile?.full_name || user.email?.split('@')[0] || 'Nutzer'

  return <AutomatisierungenClient paket={rawPaket} userName={userName} />
}
