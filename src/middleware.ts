import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Pfade, die ein eingeladener Mitarbeiter (Self-Service) erreichen darf.
// Additiv erweiterbar — neue Mitarbeiter-Seiten hier eintragen.
const MITARBEITER_ERLAUBT = ['/dashboard/mein-bereich', '/dashboard/zeiterfassung']

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
        // MITARBEITER: nur die freigeschalteten Self-Service-Bereiche sind erlaubt
        const erlaubt = MITARBEITER_ERLAUBT.some((p) => req.nextUrl.pathname.startsWith(p))
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
