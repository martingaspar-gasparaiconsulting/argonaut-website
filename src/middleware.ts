import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Pfade, die ein eingeladener Mitarbeiter (Self-Service) IMMER erreichen darf.
// Additiv erweiterbar — neue Mitarbeiter-Seiten hier eintragen.
const MITARBEITER_ERLAUBT = ['/dashboard/mein-bereich', '/dashboard/zeiterfassung', '/dashboard/einstellungen']

// Modul-Schlüssel (aus /dashboard/rechte) -> Pfad. Identisch mit der Navigation.
// Ein Mitarbeiter erreicht zusätzlich die Module, die der Chef freigeschaltet hat.
const MODUL_PFAD: Record<string, string> = {
  agenten: '/dashboard/agenten',
  academy: '/dashboard/academy',
  leads: '/dashboard/leads',
  chat: '/dashboard/chat',
  'team-chat': '/dashboard/team-chat',
  dokumente: '/dashboard/documents',
  korrespondenz: '/dashboard/korrespondenz',
  personal: '/dashboard/personal',
  schichtplan: '/dashboard/schichtplan',
  projekte: '/dashboard/projekte',
  marketing: '/dashboard/marketing',
  crm: '/dashboard/crm',
  auftraege: '/dashboard/auftraege',
  rechnungen: '/dashboard/rechnungen',
  mahnwesen: '/dashboard/mahnwesen',
  finanzen: '/dashboard/finanzen',
  erp: '/dashboard/erp',
  vertraege: '/dashboard/vertraege',
  service: '/dashboard/service',
  analytics: '/dashboard/analytics',
  automatisierungen: '/dashboard/automatisierungen',
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return req.cookies.get(name)?.value },
        set(name: string, value: string, options: any) { res.cookies.set({ name, value, ...options }) },
        remove(name: string, options: any) { res.cookies.set({ name, value: '', ...options }) },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!session) {
      return NextResponse.redirect(new URL('/auth/login', req.url))
    }

    // --- Rollen-Weiche -------------------------------------------------------
    // Kunde (Chef) = hat eine customers-Zeile. Mitarbeiter (Self-Service) =
    // kein Kunde, aber ein mitarbeiter-Datensatz mit auth_user_id = Login.
    const { data: customer } = await supabase
      .from('customers')
      .select('status')
      .eq('email', session.user.email)
      .single()

    if (customer) {
      // CHEF: bestehendes Verhalten unveraendert
      if (customer.status === 'gesperrt') {
        return NextResponse.redirect(new URL('/dashboard/upgrade', req.url))
      }
    } else {
      // KEIN Kunde -> pruefen, ob es ein eingeladener Mitarbeiter ist
      const { data: mitarbeiter } = await supabase
        .from('mitarbeiter')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()

      if (mitarbeiter) {
        // MITARBEITER: Basis-Bereiche + die vom Chef freigeschalteten Module
        const { data: recht } = await supabase
          .from('mitarbeiter_rechte')
          .select('module')
          .eq('mitarbeiter_id', mitarbeiter.id)
          .maybeSingle()

        const module: string[] = (recht?.module as string[]) || []
        const erlaubtePfade = [
          ...MITARBEITER_ERLAUBT,
          ...module.map((k) => MODUL_PFAD[k]).filter(Boolean),
        ]

        const p = req.nextUrl.pathname
        const erlaubt = erlaubtePfade.some((pf) => p === pf || p.startsWith(pf + '/'))

        if (!erlaubt) {
          return NextResponse.redirect(new URL('/dashboard/mein-bereich', req.url))
        }
      }
      // weder Kunde noch Mitarbeiter: unveraendert durchlassen
    }
  }

  return res
}

export const config = {
  matcher: ['/dashboard/:path*']
}
