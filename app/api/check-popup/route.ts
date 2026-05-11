import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ popup_aktiv: false })

  const { data: customer } = await supabase
    .from('customers')
    .select('popup_aktiv')
    .eq('supabase_user_id', user.id)
    .single()

  return NextResponse.json({ popup_aktiv: customer?.popup_aktiv ?? false })
}
